import { Injectable } from '@nestjs/common';
import type { Exercise, Prisma } from '@prisma/client';
import { gradeRewrite, type CueType } from '@sprout/scoring';
import { seededShuffle } from '@sprout/shared';
import type {
  RewriteFeedback,
  RewriteItem,
  RewriteCheckInput,
  RewriteQuery,
  RewriteResult,
  RewriteSet,
  RewriteSubmitInput,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

/**
 * §7 sentence transformation.
 *
 * The accepted answers never reach the client before submission, for the same
 * reason vocabulary practice withholds its options: the exercise is worthless
 * if the answer is in the network tab. What is served is the source sentence,
 * the cue, and an instruction.
 */
@Injectable()
export class SentenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async sets(userId: string): Promise<RewriteSet[]> {
    const rows = await this.prisma.exercise.findMany({
      where: { type: 'REWRITE' },
      orderBy: { order: 'asc' },
    });

    const solved = await this.prisma.exerciseAttempt.findMany({
      where: { userId, isCorrect: true, exercise: { type: 'REWRITE' } },
      select: { exerciseId: true },
      distinct: ['exerciseId'],
    });
    const solvedIds = new Set(solved.map((row) => row.exerciseId));

    const bySet = new Map<string, { rows: Exercise[]; solved: number }>();
    for (const row of rows) {
      const body = readBody(row);
      if (!body) continue;
      const entry = bySet.get(body.setSlug) ?? { rows: [], solved: 0 };
      entry.rows.push(row);
      if (solvedIds.has(row.id)) entry.solved += 1;
      bySet.set(body.setSlug, entry);
    }

    return [...bySet].map(([slug, entry]) => {
      const first = entry.rows[0];
      const body = first ? readBody(first) : null;
      return {
        slug,
        title: slug.replace(/-/g, ' '),
        titleVi: body?.setTitleVi ?? slug,
        cefr: first?.cefr ?? 'A2',
        // The set-level explanation lives on every item; the first one is
        // representative because the seeder writes the same text to all of them.
        explanationVi: first?.explanationVi ?? '',
        itemCount: entry.rows.length,
        solved: entry.solved,
      };
    });
  }

  async practice(userId: string, query: RewriteQuery, now = new Date()): Promise<RewriteItem[]> {
    const where: Prisma.ExerciseWhereInput = { type: 'REWRITE' };
    if (query.set) where.tags = { has: query.set };

    const rows = await this.prisma.exercise.findMany({ where, orderBy: { order: 'asc' } });
    if (rows.length === 0) throw AppException.notFound('Nhóm mẫu câu');

    // A whole set in order is a lesson; a mix should be shuffled. Seeded by the
    // minute so a refresh does not reshuffle mid-session.
    const ordered = query.set
      ? rows
      : seededShuffle(rows, Math.floor(now.getTime() / 60_000));

    // Items the learner has never got right come first. Re-practising what you
    // already know is the commonest way a drill stops teaching anything.
    const solved = await this.prisma.exerciseAttempt.findMany({
      where: { userId, isCorrect: true, exerciseId: { in: ordered.map((row) => row.id) } },
      select: { exerciseId: true },
      distinct: ['exerciseId'],
    });
    const solvedIds = new Set(solved.map((row) => row.exerciseId));
    const unsolvedFirst = [
      ...ordered.filter((row) => !solvedIds.has(row.id)),
      ...ordered.filter((row) => solvedIds.has(row.id)),
    ];

    return unsolvedFirst.slice(0, query.limit).flatMap((row) => {
      const item = this.toItem(row);
      return item ? [item] : [];
    });
  }

  /**
   * Grades one answer and returns feedback, without recording anything.
   *
   * No attempt row, no mistake log, no XP — those all belong to submit. A
   * learner checking their work as they go should not be able to earn ten
   * times the reward by submitting ten times.
   */
  async check(input: RewriteCheckInput): Promise<RewriteFeedback> {
    const row = await this.prisma.exercise.findUnique({ where: { id: input.itemId } });
    if (!row || row.type !== 'REWRITE') throw AppException.notFound('Câu viết lại');

    const body = readBody(row);
    const accepted = readAccepted(row);
    if (!body || accepted.length === 0) throw AppException.notFound('Câu viết lại');

    const outcome = gradeRewrite(
      { accepted, cue: body.cue, cueType: body.cueType as CueType, source: body.source },
      input.answer,
    );

    return {
      itemId: row.id,
      isCorrect: outcome.isCorrect,
      score: outcome.score,
      yourAnswer: input.answer,
      accepted,
      explanationVi: row.explanationVi,
      usedCue: outcome.usedCue,
      copiedSource: outcome.copiedSource === true,
      hintVi: outcome.hintVi,
    };
  }
  async submit(
    userId: string,
    input: RewriteSubmitInput,
    now = new Date(),
  ): Promise<RewriteResult> {
    const rows = await this.prisma.exercise.findMany({
      where: { id: { in: input.answers.map((answer) => answer.itemId) }, type: 'REWRITE' },
    });
    const byId = new Map(rows.map((row): [string, Exercise] => [row.id, row]));

    const feedback: RewriteFeedback[] = [];
    let correct = 0;
    let scoreSum = 0;

    for (const given of input.answers) {
      const row = byId.get(given.itemId);
      if (!row) continue;

      const body = readBody(row);
      const accepted = readAccepted(row);
      if (!body || accepted.length === 0) continue;

      const outcome = gradeRewrite(
        {
          accepted,
          cue: body.cue,
          cueType: body.cueType as CueType,
          source: body.source,
        },
        given.answer,
      );

      if (outcome.isCorrect) correct += 1;
      scoreSum += outcome.score;

      await this.prisma.exerciseAttempt.create({
        data: {
          userId,
          exerciseId: row.id,
          userAnswer: { value: given.answer } as unknown as Prisma.InputJsonValue,
          isCorrect: outcome.isCorrect,
          score: outcome.score,
          timeSpentMs: given.timeSpentMs,
          attemptedAt: now,
        },
      });

      if (!outcome.isCorrect) {
        await this.prisma.mistakeLog.create({
          data: {
            userId,
            skill: 'GRAMMAR',
            // The two failure modes are different lessons, so they are logged
            // apart: analytics can then say whether the learner keeps missing
            // the structure or keeps missing the meaning.
            category: outcome.usedCue ? 'rewrite-meaning' : 'rewrite-structure',
            detail: body.source,
            sourceType: 'sentence-rewrite',
            sourceId: row.id,
            occurredAt: now,
          },
        });
      }

      feedback.push({
        itemId: row.id,
        isCorrect: outcome.isCorrect,
        score: outcome.score,
        yourAnswer: given.answer,
        accepted,
        explanationVi: row.explanationVi,
        usedCue: outcome.usedCue,
        copiedSource: outcome.copiedSource === true,
        hintVi: outcome.hintVi,
      });
    }

    if (feedback.length === 0) {
      throw AppException.validation({ answers: 'unknown' }, 'Không tìm thấy câu nào để chấm.');
    }

    const accuracy = scoreSum / feedback.length;
    const reward = await this.gamification.award({
      userId,
      source: 'QUIZ',
      skill: 'GRAMMAR',
      refType: 'sentence-rewrite',
      refId: feedback[0]?.itemId ?? 'mixed',
      accuracy,
      observationScore: Math.round(accuracy * 100),
      studySeconds: Math.max(
        30,
        Math.round(input.answers.reduce((sum, a) => sum + a.timeSpentMs, 0) / 1000),
      ),
      now,
    });

    return {
      correctCount: correct,
      total: feedback.length,
      accuracy: Math.round(accuracy * 1000) / 1000,
      feedback,
      reward,
    };
  }

  private toItem(row: Exercise): RewriteItem | null {
    const body = readBody(row);
    if (!body) return null;
    return {
      id: row.id,
      source: body.source,
      cue: body.cue,
      cueType: body.cueType,
      instructionVi: row.promptVi ?? 'Viết lại câu sao cho nghĩa không đổi.',
      cefr: row.cefr,
      setSlug: body.setSlug,
      setTitleVi: body.setTitleVi,
    };
  }
}

interface RewriteBody {
  source: string;
  cue: string | null;
  cueType: 'start' | 'keyword' | 'none';
  setSlug: string;
  setTitleVi: string;
}

function readBody(row: Exercise): RewriteBody | null {
  const value = row.body;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body['source'] !== 'string' || typeof body['setSlug'] !== 'string') return null;
  return {
    source: body['source'],
    cue: typeof body['cue'] === 'string' ? body['cue'] : null,
    cueType: (body['cueType'] as RewriteBody['cueType']) ?? 'none',
    setSlug: body['setSlug'],
    setTitleVi: typeof body['setTitleVi'] === 'string' ? body['setTitleVi'] : body['setSlug'],
  };
}

function readAccepted(row: Exercise): string[] {
  const value = row.answer;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const accepted = (value as Record<string, unknown>)['accepted'];
  return Array.isArray(accepted) ? accepted.filter((item): item is string => typeof item === 'string') : [];
}
