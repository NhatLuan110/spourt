import { Injectable } from '@nestjs/common';
import type { Prisma, WritingPrompt, WritingSubmission } from '@prisma/client';
import {
  countWords,
  writingFeedbackSchema,
  type CefrLevel,
  type WritingFeedback,
  type WritingIssue,
  type WritingKind,
  type WritingListQuery,
  type WritingPromptCard,
  type WritingStatus,
  type WritingSubmissionView,
  type WritingSubmitInput,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { GamificationService } from '../gamification/gamification.service';
import { buildGradingPrompt } from './writing.prompt';

@Injectable()
export class WritingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly gamification: GamificationService,
  ) {}

  async prompts(userId: string, query: WritingListQuery): Promise<WritingPromptCard[]> {
    const where: Prisma.WritingPromptWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.cefr) where.cefr = query.cefr;

    const prompts = await this.prisma.writingPrompt.findMany({
      where,
      orderBy: [{ cefr: 'asc' }, { title: 'asc' }],
    });

    const submissions = await this.prisma.writingSubmission.findMany({
      where: { userId, promptId: { in: prompts.map((prompt) => prompt.id) } },
      select: { promptId: true, overallScore: true },
    });

    const stats = new Map<string, { attempts: number; best: number | null }>();
    for (const submission of submissions) {
      if (!submission.promptId) continue;
      const entry = stats.get(submission.promptId) ?? { attempts: 0, best: null };
      entry.attempts += 1;
      if (submission.overallScore !== null) {
        entry.best = Math.max(entry.best ?? 0, submission.overallScore);
      }
      stats.set(submission.promptId, entry);
    }

    return prompts.map((prompt) => this.toCard(prompt, stats.get(prompt.id)));
  }

  async prompt(userId: string, slug: string): Promise<WritingPromptCard> {
    const prompt = await this.prisma.writingPrompt.findUnique({ where: { slug } });
    if (!prompt) throw AppException.notFound('Đề bài viết');

    const submissions = await this.prisma.writingSubmission.findMany({
      where: { userId, promptId: prompt.id },
      select: { overallScore: true },
    });

    return this.toCard(prompt, {
      attempts: submissions.length,
      best: submissions.reduce<number | null>(
        (best, row) => (row.overallScore === null ? best : Math.max(best ?? 0, row.overallScore)),
        null,
      ),
    });
  }

  /**
   * Grades a submission and stores the result.
   *
   * The row is written before the AI is called and updated after, so a call
   * that fails halfway leaves a `failed` submission the learner can see and
   * retry, rather than losing what they wrote.
   */
  async submit(
    userId: string,
    input: WritingSubmitInput,
    now = new Date(),
  ): Promise<WritingSubmissionView> {
    const prompt = input.promptSlug
      ? await this.prisma.writingPrompt.findUnique({ where: { slug: input.promptSlug } })
      : null;
    if (input.promptSlug && !prompt) throw AppException.notFound('Đề bài viết');

    const wordCount = countWords(input.content);
    const submission = await this.prisma.writingSubmission.create({
      data: {
        userId,
        promptId: prompt?.id ?? null,
        freeTopic: input.freeTopic ?? null,
        content: input.content,
        wordCount,
        status: 'grading',
        submittedAt: now,
      },
    });

    const level = await this.levelOf(userId);
    const task = prompt
      ? `${prompt.title}. ${prompt.instructionsEn}`
      : (input.freeTopic ?? 'Free writing');

    let feedback: WritingFeedback;
    try {
      feedback = await this.grade({
        userId,
        content: input.content,
        wordCount,
        cefr: prompt?.cefr ?? level,
        task,
        minWords: prompt?.minWords ?? 50,
        maxWords: prompt?.maxWords ?? 400,
      });
    } catch (error) {
      const message = error instanceof AppException ? error.message : 'Chấm bài không thành công.';
      await this.prisma.writingSubmission.update({
        where: { id: submission.id },
        data: { status: 'failed', errorMessage: message },
      });
      throw error;
    }

    const graded = await this.prisma.writingSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'graded',
        gradedAt: new Date(),
        overallScore: feedback.overallScore,
        cefrEstimate: feedback.cefrEstimate,
        criteriaScores: feedback.criteria as unknown as Prisma.InputJsonValue,
        issues: feedback.issues as unknown as Prisma.InputJsonValue,
        rewrite: feedback.rewrite,
        rewriteNotes: feedback.rewriteNotesVi as unknown as Prisma.InputJsonValue,
        strengths: feedback.strengths,
        nextSteps: feedback.nextSteps as unknown as Prisma.InputJsonValue,
      },
      include: { prompt: { select: { slug: true, title: true } } },
    });

    // §9.2 — writing XP scales with the score; §9.7 counts it as one observation.
    await this.gamification.award({
      userId,
      source: 'WRITING',
      skill: 'WRITING',
      refType: 'writing-submission',
      refId: submission.id,
      score: feedback.overallScore,
      observationScore: feedback.overallScore,
      // Reading and thinking time is not measured; the word count is the only
      // honest proxy, at roughly twenty words a minute of composition.
      studySeconds: Math.max(60, Math.round((wordCount / 20) * 60)),
      now,
    });

    for (const issue of feedback.issues) {
      await this.prisma.mistakeLog.create({
        data: {
          userId,
          skill: 'WRITING',
          category: `writing-${issue.category}`,
          detail: issue.original,
          sourceType: 'writing-submission',
          sourceId: submission.id,
          occurredAt: now,
        },
      });
    }

    return this.toView(graded, graded.prompt);
  }

  async history(userId: string, limit = 20): Promise<WritingSubmissionView[]> {
    const rows = await this.prisma.writingSubmission.findMany({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      include: { prompt: { select: { slug: true, title: true } } },
    });
    return rows.map((row) => this.toView(row, row.prompt));
  }

  async submission(userId: string, id: string): Promise<WritingSubmissionView> {
    const row = await this.prisma.writingSubmission.findUnique({
      where: { id },
      include: { prompt: { select: { slug: true, title: true } } },
    });
    if (!row || row.userId !== userId) throw AppException.notFound('Bài viết');
    return this.toView(row, row.prompt);
  }

  /** Calls the model, validates what comes back, and anchors every issue. */
  private async grade(params: {
    userId: string;
    content: string;
    wordCount: number;
    cefr: CefrLevel;
    task: string;
    minWords: number;
    maxWords: number;
  }): Promise<WritingFeedback> {
    const { value } = await this.ai.completeJson(
      { userId: params.userId, feature: 'writing' },
      {
        tier: 'deep',
        system: buildGradingPrompt({
          cefr: params.cefr,
          task: params.task,
          minWords: params.minWords,
          maxWords: params.maxWords,
          wordCount: params.wordCount,
        }),
        messages: [{ role: 'user', content: params.content }],
        maxOutputTokens: 8192,
        temperature: 0.3,
      },
      (raw) => writingFeedbackSchema.parse(normalizeFeedback(raw)),
    );

    return {
      overallScore: Math.round(value.overallScore),
      cefrEstimate: value.cefrEstimate,
      criteria: value.criteria.map((entry) => ({
        criterion: entry.criterion,
        score: Math.round(entry.score * 10) / 10,
        commentVi: entry.commentVi,
      })),
      issues: anchorIssues(params.content, value.issues),
      rewrite: value.rewrite,
      rewriteNotesVi: value.rewriteNotesVi,
      strengths: value.strengths,
      nextSteps: value.nextSteps.map((label) => ({ labelVi: label })),
    };
  }

  private async levelOf(userId: string): Promise<CefrLevel> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { currentLevel: true },
    });
    return profile?.currentLevel ?? 'A2';
  }

  private toCard(
    prompt: WritingPrompt,
    stats: { attempts: number; best: number | null } | undefined,
  ): WritingPromptCard {
    const attempts = stats?.attempts ?? 0;
    return {
      slug: prompt.slug,
      kind: prompt.kind as WritingKind,
      cefr: prompt.cefr,
      title: prompt.title,
      instructionsVi: prompt.instructionsVi,
      instructionsEn: prompt.instructionsEn,
      minWords: prompt.minWords,
      maxWords: prompt.maxWords,
      timeLimitMin: prompt.timeLimitMin,
      outlineVi: prompt.outlineVi,
      // Showing the model answer before they write turns the task into copying.
      sampleAnswer: attempts > 0 ? prompt.sampleAnswer : null,
      attempts,
      bestScore: stats?.best ?? null,
    };
  }

  private toView(
    row: WritingSubmission,
    prompt: { slug: string; title: string } | null,
  ): WritingSubmissionView {
    const graded = row.status === 'graded';
    return {
      id: row.id,
      promptSlug: prompt?.slug ?? null,
      promptTitle: prompt?.title ?? null,
      freeTopic: row.freeTopic,
      content: row.content,
      wordCount: row.wordCount,
      status: row.status as WritingStatus,
      submittedAt: row.submittedAt.toISOString(),
      gradedAt: row.gradedAt?.toISOString() ?? null,
      errorMessageVi: row.errorMessage,
      feedback: graded
        ? {
            overallScore: row.overallScore ?? 0,
            cefrEstimate: row.cefrEstimate ?? 'A1',
            criteria: readJsonArray<WritingFeedback['criteria'][number]>(row.criteriaScores),
            issues: readJsonArray<WritingIssue>(row.issues),
            rewrite: row.rewrite ?? '',
            rewriteNotesVi: readJsonArray<string>(row.rewriteNotes),
            strengths: row.strengths,
            nextSteps: readJsonArray<WritingFeedback['nextSteps'][number]>(row.nextSteps),
          }
        : null,
    };
  }
}

/**
 * Maps whatever the model called a criterion onto the four names §5.6 uses.
 *
 * Told to return "task", a model will still sometimes write "Task Achievement"
 * or "Ngữ pháp". Rejecting those would throw away a good piece of feedback over
 * a label, so the label is normalised and the schema stays strict about
 * everything else.
 */
const CRITERION_ALIASES: Record<string, string> = {
  task: "task",
  "task achievement": "task",
  "task response": "task",
  content: "task",
  "nội dung": "task",
  organization: "organization",
  organisation: "organization",
  coherence: "organization",
  "coherence and cohesion": "organization",
  structure: "organization",
  "bố cục": "organization",
  vocabulary: "vocabulary",
  lexis: "vocabulary",
  "lexical resource": "vocabulary",
  "từ vựng": "vocabulary",
  grammar: "grammar",
  "grammatical range": "grammar",
  "grammatical range and accuracy": "grammar",
  accuracy: "grammar",
  "ngữ pháp": "grammar",
};

export function normalizeFeedback(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value["criteria"])) return raw;

  const criteria = (value["criteria"] as unknown[]).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    const name = String(row["criterion"] ?? "").trim().toLowerCase();
    const mapped = CRITERION_ALIASES[name];
    // A criterion nobody recognises is dropped rather than guessed at.
    return mapped ? [{ ...row, criterion: mapped }] : [];
  });

  return { ...value, criteria };
}
/**
 * Prisma hands Json columns back as JsonValue. These arrays were written
 * through a Zod-validated shape, so the elements are trustworthy; what is not
 * guaranteed is that the column is an array at all — a null, or a row edited by
 * hand, would otherwise crash the results page.
 */
function readJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as unknown as T[]) : [];
}

/**
 * Turns each issue's quoted text into character offsets into the submission.
 *
 * The model is told to quote verbatim and mostly does, but "mostly" is not good
 * enough to highlight with: an issue whose text cannot be found is dropped
 * rather than pointed at the wrong words. Searching forward from the last match
 * keeps repeated phrases in the order the grader listed them.
 */
export function anchorIssues(
  content: string,
  issues: { original: string; suggestion: string; category: string; severity: 'minor' | 'major'; whyVi: string }[],
): WritingIssue[] {
  const anchored: WritingIssue[] = [];
  let cursor = 0;

  for (const issue of issues) {
    const needle = issue.original.trim();
    if (needle.length === 0) continue;

    let start = content.indexOf(needle, cursor);
    // Fall back to the whole text: the grader does not always report in order.
    if (start < 0) start = content.indexOf(needle);
    if (start < 0) {
      const insensitive = content.toLowerCase().indexOf(needle.toLowerCase());
      if (insensitive < 0) continue;
      start = insensitive;
    }

    anchored.push({
      start,
      end: start + needle.length,
      original: content.slice(start, start + needle.length),
      suggestion: issue.suggestion,
      category: issue.category,
      severity: issue.severity,
      whyVi: issue.whyVi,
    });
    cursor = start + needle.length;
  }

  return anchored.sort((a, b) => a.start - b.start);
}
