import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { EXAM_DEFINITIONS, examContentPackSchema, examIdSchema, examLevelIdSchema } from '@sprout/shared';
import type { ExamActivity, ExamAttemptSummary, ExamCatalog, ExamContentPack, ExamHistoryQuery, ExamPack, ExamResult, ExamSubmitInput } from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';

function findContentDirectory(): string {
  // Works from the monorepo root, apps/api, and compiled dist directories.
  for (const start of [process.cwd(), __dirname]) {
    let current = resolve(start);
    while (true) {
      const candidate = join(current, 'content', 'exams');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw new Error('Exam content directory was not found. Include content/exams when deploying the API.');
}

/** Keep meaningful punctuation (e.g. decimal points), tolerate presentation differences. */
function normalizeAnswer(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
}

@Injectable()
export class ExamPrepService {
  private readonly packs = new Map<string, ExamContentPack>();
  constructor(private readonly prisma: PrismaService) {}

  catalog(): ExamCatalog {
    return EXAM_DEFINITIONS.map((exam) => ({
      ...exam,
      levels: exam.levels.map((level) => {
        const pack = this.loadPack(exam.id, level.id);
        return {
          ...level,
          counts: {
            vocabulary: pack.vocabulary.length,
            reading: pack.activities.filter((activity) => activity.skill === 'reading').length,
            listening: pack.activities.filter((activity) => activity.skill === 'listening').length,
            writing: pack.activities.filter((activity) => activity.skill === 'writing').length,
            speaking: pack.activities.filter((activity) => activity.skill === 'speaking').length,
          },
        };
      }),
    }));
  }

  detail(exam: string, level: string): ExamPack {
    const pack = this.loadPack(exam, level);
    return {
      examId: pack.examId,
      levelId: pack.levelId,
      vocabulary: pack.vocabulary,
      activities: pack.activities.map((activity): ExamActivity => {
        const { sampleAnswer: _sampleAnswer, questions, ...publicFields } = activity;
        return {
          ...publicFields,
          ...(questions ? {
            questions: questions.map(({ answer: _answer, accepted: _accepted, explanationVi: _explanation, ...question }) => question),
          } : {}),
        };
      }),
    };
  }

  async submit(userId: string, exam: string, level: string, activityId: string, input: ExamSubmitInput): Promise<ExamResult> {
    const pack = this.loadPack(exam, level);
    const activity = pack.activities.find((candidate) => candidate.id === activityId);
    if (!activity) throw AppException.notFound('Bài ôn thi');
    const feedback: ExamResult['feedback'] = [];
    let correctCount: number | null = null;
    let total: number | null = null;
    if (activity.questions) {
      const answers = input.answers ?? [];
      const expected = new Set(activity.questions.map((question) => question.id));
      if (input.content !== undefined || answers.length !== expected.size
        || new Set(answers.map((answer) => answer.questionId)).size !== expected.size
        || answers.some((answer) => !expected.has(answer.questionId))) {
        throw AppException.validation([], 'Hãy trả lời mỗi câu hỏi đúng một lần trong bài này.');
      }
      const values = new Map(answers.map((answer) => [answer.questionId, answer.value]));
      for (const question of activity.questions) {
        const value = values.get(question.id)!;
        if (question.kind === 'mcq' && !question.options?.some((option) => option.id === value)) {
          throw AppException.validation([], 'Lựa chọn không thuộc câu hỏi này.');
        }
        const correct = question.kind === 'mcq'
          ? value === question.answer
          : [question.answer, ...(question.accepted ?? [])].some((accepted) => normalizeAnswer(accepted) === normalizeAnswer(value));
        feedback.push({ questionId: question.id, correct, answer: question.answer, explanationVi: question.explanationVi });
      }
      correctCount = feedback.filter((item) => item.correct).length;
      total = feedback.length;
    } else if (!input.content?.trim() || (input.answers?.length ?? 0) > 0) {
      throw AppException.validation([], 'Hãy nhập bài viết hoặc ghi chú/bản chép lời bài nói trước khi nộp.');
    }

    const saved = await this.prisma.examPrepAttempt.create({
      data: {
        userId, examId: pack.examId, levelId: pack.levelId, activityId: activity.id, skill: activity.skill,
        ...(input.answers ? { answersJson: input.answers } : {}),
        content: input.content ?? null, correctCount, total, elapsedSec: input.elapsedSec,
      },
    });
    return {
      activityId: activity.id, correctCount, total, feedback,
      ...(activity.sampleAnswer ? { sampleAnswer: activity.sampleAnswer } : {}),
      rubricVi: activity.rubricVi ?? [],
      // Speaking preparation is timed separately from the response.
      withinTime: input.elapsedSec <= activity.timeLimitSec,
      submittedAt: saved.completedAt.toISOString(),
    };
  }

  async history(userId: string, query: ExamHistoryQuery): Promise<ExamAttemptSummary[]> {
    const attempts = await this.prisma.examPrepAttempt.findMany({
      where: { userId, ...(query.examId ? { examId: query.examId } : {}), ...(query.levelId ? { levelId: query.levelId } : {}) },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        id: true, examId: true, levelId: true, activityId: true, skill: true,
        correctCount: true, total: true, elapsedSec: true, completedAt: true,
      },
    });
    return attempts.map((attempt) => ({
      ...attempt,
      examId: attempt.examId as ExamAttemptSummary['examId'],
      levelId: attempt.levelId as ExamAttemptSummary['levelId'],
      skill: attempt.skill as ExamAttemptSummary['skill'],
      completedAt: attempt.completedAt.toISOString(),
    }));
  }

  private loadPack(exam: string, level: string): ExamContentPack {
    if (!examIdSchema.safeParse(exam).success || !examLevelIdSchema.safeParse(level).success) {
      throw AppException.notFound('Mức ôn thi');
    }
    const key = `${exam}-${level}`;
    const cached = this.packs.get(key);
    if (cached) return cached;
    const path = join(findContentDirectory(), `${key}.json`);
    const pack = examContentPackSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    if (pack.examId !== exam || pack.levelId !== level) throw new Error(`Exam pack identity mismatch: ${key}`);
    this.packs.set(key, pack);
    return pack;
  }
}
