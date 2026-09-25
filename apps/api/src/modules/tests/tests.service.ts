import { Injectable } from '@nestjs/common';
import type { CefrLevel, Exercise, Prisma, Skill, Test, TestAttempt } from '@prisma/client';
import {
  advanceAdaptive,
  emptyAdaptiveState,
  estimateLevel,
  shouldStop,
  skillOutcomes,
  type AdaptiveState,
} from '@sprout/scoring';
import { SKILL_LABEL_VI } from '@sprout/shared';
import type {
  TestCard,
  TestDetail,
  TestKind,
  TestListQuery,
  TestQuestion,
  TestResult,
  TestRunState,
  TestSubmitInput,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { gradeExercise } from '../learning/learning-engine.service';
import { toLessonExercise } from '../learning/exercise-mapper';

/**
 * §7 — placement and skill tests.
 *
 * A test question is an ordinary `Exercise`, graded by the same
 * `gradeExercise` the lessons use. What is different here is the walk: an
 * adaptive test picks the next question from the answer to the last one, and
 * the result writes a CEFR estimate onto the profile.
 */
@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async list(userId: string, query: TestListQuery): Promise<TestCard[]> {
    const where: Prisma.TestWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.skill) where.skill = query.skill;
    if (query.cefr) where.cefr = query.cefr;

    const tests = await this.prisma.test.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { title: 'asc' }],
      include: { sections: true },
    });

    const attempts = await this.prisma.testAttempt.findMany({
      where: { userId, testId: { in: tests.map((test) => test.id) }, submittedAt: { not: null } },
      orderBy: { submittedAt: 'desc' },
    });

    const latest = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      if (!latest.has(attempt.testId)) latest.set(attempt.testId, attempt);
    }

    return tests.map((test) => this.toCard(test, test.sections, latest.get(test.id) ?? null));
  }

  async detail(userId: string, slug: string): Promise<TestDetail> {
    const test = await this.prisma.test.findUnique({
      where: { slug },
      include: { sections: { orderBy: { order: 'asc' } } },
    });
    if (!test) throw AppException.notFound('Bài kiểm tra');

    const last = await this.prisma.testAttempt.findFirst({
      where: { userId, testId: test.id, submittedAt: { not: null } },
      orderBy: { submittedAt: 'desc' },
    });

    return {
      ...this.toCard(test, test.sections, last),
      sections: test.sections.map((section) => ({
        id: section.id,
        skill: section.skill,
        title: section.title,
        order: section.order,
        timeLimitMin: section.timeLimitMin,
        questionCount: section.questionIds.length,
      })),
    };
  }

  /**
   * Opens an attempt and hands back the first question. An attempt already in
   * flight is resumed rather than replaced, so a refreshed tab does not lose
   * the answers already given.
   */
  async start(userId: string, slug: string, now = new Date()): Promise<TestRunState> {
    const test = await this.requireTest(slug);

    const existing = await this.prisma.testAttempt.findFirst({
      where: { userId, testId: test.id, submittedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (existing) return this.runState(test, existing, now);

    const pool = await this.questionPool(test.id);
    const attempt = await this.prisma.testAttempt.create({
      data: {
        userId,
        testId: test.id,
        startedAt: now,
        maxScore: test.isAdaptive ? 0 : pool.length,
        adaptive: test.isAdaptive ? toJson(emptyAdaptiveState()) : undefined,
      },
    });

    return this.runState(test, attempt, now);
  }

  /**
   * Grades one or more answers and returns the next question, or null when the
   * test is over. The client never learns which answer was right until the
   * whole test is submitted.
   */
  async answer(
    userId: string,
    slug: string,
    input: TestSubmitInput,
    now = new Date(),
  ): Promise<TestRunState> {
    const test = await this.requireTest(slug);
    const attempt = await this.requireOpenAttempt(userId, test.id);

    const pool = await this.questionPool(test.id);
    const byId = new Map(pool.map((exercise): [string, Exercise] => [exercise.id, exercise]));
    let state = test.isAdaptive ? fromJson(attempt.adaptive) : null;

    for (const given of input.answers) {
      const exercise = byId.get(given.exerciseId);
      if (!exercise) continue;

      const graded = gradeExercise(exercise, given.answer);

      await this.prisma.testAnswer.upsert({
        where: {
          attemptId_exerciseId: { attemptId: attempt.id, exerciseId: exercise.id },
        },
        update: {
          answer: { value: given.answer },
          isCorrect: graded.isCorrect,
          score: graded.score,
          answeredAt: now,
        },
        create: {
          attemptId: attempt.id,
          exerciseId: exercise.id,
          answer: { value: given.answer },
          isCorrect: graded.isCorrect,
          score: graded.score,
          answeredAt: now,
        },
      });

      if (state) {
        state = advanceAdaptive(state, {
          exerciseId: exercise.id,
          level: exercise.cefr,
          isCorrect: graded.isCorrect,
        });
      }
    }

    const updated = state
      ? await this.prisma.testAttempt.update({
          where: { id: attempt.id },
          data: { adaptive: toJson(state) },
        })
      : attempt;

    return this.runState(test, updated, now);
  }

  /** Closes the attempt, scores it, and writes the level onto the profile. */
  async finish(userId: string, slug: string, now = new Date()): Promise<TestResult> {
    const test = await this.requireTest(slug);
    const attempt = await this.requireOpenAttempt(userId, test.id);

    const answers = await this.prisma.testAnswer.findMany({
      where: { attemptId: attempt.id },
      include: { exercise: { select: { skill: true, cefr: true } } },
    });
    if (answers.length === 0) {
      throw AppException.conflict('TEST_NOT_ANSWERED');
    }

    const outcomes = skillOutcomes(
      answers.map((answer) => ({
        skill: answer.exercise.skill,
        cefr: answer.exercise.cefr,
        isCorrect: answer.isCorrect === true,
      })),
    );

    const totalScore = answers.reduce((sum, answer) => sum + answer.score, 0);
    const maxScore = answers.length;
    const accuracy = maxScore === 0 ? 0 : totalScore / maxScore;

    const cefrResult = test.isAdaptive
      ? estimateLevel(fromJson(attempt.adaptive) ?? emptyAdaptiveState())
      : (outcomes[0]?.cefr ?? null);

    await this.prisma.testAttempt.update({
      where: { id: attempt.id },
      data: {
        submittedAt: now,
        totalScore,
        maxScore,
        skillScores: Object.fromEntries(outcomes.map((entry) => [entry.skill, entry.score])),
        cefrResult,
      },
    });

    // §9.7 — a test is the heaviest kind of observation, one per skill.
    for (const outcome of outcomes) {
      await this.gamification.observe(userId, outcome.skill, outcome.score, 'TEST');
    }

    const profileUpdated = await this.applyPlacement(userId, test.kind as TestKind, cefrResult);

    await this.gamification.award({
      userId,
      source: 'TEST',
      refType: 'test',
      refId: test.id,
      accuracy,
      testWeight: answers.length >= 25 ? 100 : 50,
      studySeconds: Math.max(1, Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000)),
      now,
    });

    return {
      attemptId: attempt.id,
      totalScore: Math.round(totalScore * 100) / 100,
      maxScore,
      accuracy: Math.round(accuracy * 1000) / 1000,
      passed: accuracy * 100 >= test.passScore,
      cefrResult,
      skills: outcomes,
      durationSec: Math.max(1, Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000)),
      adviceVi: adviceFor(outcomes),
      profileUpdated,
    };
  }

  /** The finished attempt, for the results screen after a reload. */
  async result(userId: string, attemptId: string): Promise<TestResult> {
    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: true,
        answers: { include: { exercise: { select: { skill: true, cefr: true } } } },
      },
    });
    if (!attempt || attempt.userId !== userId) throw AppException.notFound('Lượt kiểm tra');
    if (!attempt.submittedAt) {
      throw AppException.conflict('TEST_NOT_SUBMITTED');
    }

    const outcomes = skillOutcomes(
      attempt.answers.map((answer) => ({
        skill: answer.exercise.skill,
        cefr: answer.exercise.cefr,
        isCorrect: answer.isCorrect === true,
      })),
    );
    const maxScore = attempt.maxScore || attempt.answers.length;
    const accuracy = maxScore === 0 ? 0 : (attempt.totalScore ?? 0) / maxScore;

    return {
      attemptId: attempt.id,
      totalScore: attempt.totalScore ?? 0,
      maxScore,
      accuracy: Math.round(accuracy * 1000) / 1000,
      passed: accuracy * 100 >= attempt.test.passScore,
      cefrResult: attempt.cefrResult,
      skills: outcomes,
      durationSec: Math.max(
        1,
        Math.round((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
      ),
      adviceVi: adviceFor(outcomes),
      profileUpdated: attempt.test.kind === 'placement',
    };
  }

  private async requireTest(slug: string): Promise<Test> {
    const test = await this.prisma.test.findUnique({ where: { slug } });
    if (!test) throw AppException.notFound('Bài kiểm tra');
    return test;
  }

  private async requireOpenAttempt(userId: string, testId: string): Promise<TestAttempt> {
    const attempt = await this.prisma.testAttempt.findFirst({
      where: { userId, testId, submittedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!attempt) throw AppException.notFound('Lượt kiểm tra đang mở');
    return attempt;
  }

  private async questionPool(testId: string): Promise<Exercise[]> {
    const sections = await this.prisma.testSection.findMany({
      where: { testId },
      orderBy: { order: 'asc' },
    });
    const ids = sections.flatMap((section) => section.questionIds);
    if (ids.length === 0) return [];

    const rows = await this.prisma.exercise.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((row): [string, Exercise] => [row.id, row]));
    // Keep the section order rather than whatever order the database returns.
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  /**
   * Picks the question to show next: for an adaptive test the closest unasked
   * question to the current level, for a fixed test simply the next one.
   */
  private async runState(test: Test, attempt: TestAttempt, now: Date): Promise<TestRunState> {
    const pool = await this.questionPool(test.id);
    const answered = await this.prisma.testAnswer.findMany({
      where: { attemptId: attempt.id },
      select: { exerciseId: true },
    });
    const done = new Set(answered.map((row) => row.exerciseId));

    const secondsRemaining =
      test.durationMin > 0
        ? Math.max(
            0,
            test.durationMin * 60 -
              Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000),
          )
        : null;

    const state = test.isAdaptive ? fromJson(attempt.adaptive) : null;
    const finished = state ? shouldStop(state) : done.size >= pool.length;

    const next =
      finished || (secondsRemaining !== null && secondsRemaining === 0)
        ? null
        : state
          ? pickNearest(pool, done, state.level)
          : (pool.find((exercise) => !done.has(exercise.id)) ?? null);

    return {
      attemptId: attempt.id,
      isAdaptive: test.isAdaptive,
      next: next ? this.toQuestion(next, done.size + 1) : null,
      answered: done.size,
      total: test.isAdaptive ? null : pool.length,
      secondsRemaining,
    };
  }

  private toQuestion(exercise: Exercise, position: number): TestQuestion | null {
    const item = toLessonExercise(exercise, position);
    if (!item) return null;
    return { exercise: item, skill: exercise.skill, cefr: exercise.cefr, position };
  }

  /** §7 — a placement result becomes the profile's level. */
  private async applyPlacement(
    userId: string,
    kind: TestKind,
    cefr: CefrLevel | null,
  ): Promise<boolean> {
    if (kind !== 'placement' || cefr === null) return false;
    // When the placement was taken is already recorded by the attempt's
    // submittedAt, so the profile only needs the level itself.
    await this.prisma.profile.update({ where: { userId }, data: { currentLevel: cefr } });
    return true;
  }

  private toCard(
    test: Test,
    sections: { questionIds: string[] }[],
    attempt: TestAttempt | null,
  ): TestCard {
    return {
      slug: test.slug,
      kind: test.kind as TestKind,
      skill: test.skill,
      cefr: test.cefr,
      title: test.title,
      description: test.description,
      durationMin: test.durationMin,
      passScore: test.passScore,
      isAdaptive: test.isAdaptive,
      questionCount: sections.reduce((sum, section) => sum + section.questionIds.length, 0),
      lastAttempt:
        attempt && attempt.submittedAt
          ? {
              id: attempt.id,
              submittedAt: attempt.submittedAt.toISOString(),
              totalScore: attempt.totalScore ?? 0,
              maxScore: attempt.maxScore,
              cefrResult: attempt.cefrResult,
            }
          : null,
    };
  }
}

/**
 * The unasked question closest to the target level. Ties break downwards, so a
 * learner who has run out of questions at their level gets an easier one rather
 * than being pushed up on no evidence.
 */
function pickNearest(pool: Exercise[], done: Set<string>, level: CefrLevel): Exercise | null {
  const order: Record<CefrLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
  const target = order[level];

  let best: Exercise | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const exercise of pool) {
    if (done.has(exercise.id)) continue;
    const distance = Math.abs(order[exercise.cefr] - target);
    const preferLower = order[exercise.cefr] <= target;
    const rank = distance * 2 + (preferLower ? 0 : 1);
    if (rank < bestDistance) {
      best = exercise;
      bestDistance = rank;
    }
  }

  return best;
}

function adviceFor(outcomes: { skill: Skill; score: number; asked: number }[]): string[] {
  if (outcomes.length === 0) return [];
  const measured = outcomes.filter((entry) => entry.asked >= 2);
  if (measured.length === 0) return ['Bài kiểm tra quá ngắn để kết luận về kỹ năng nào.'];

  const sorted = [...measured].sort((a, b) => a.score - b.score);
  const weakest = sorted[0];
  const strongest = sorted.at(-1);
  const advice: string[] = [];

  if (weakest) {
    advice.push(
      `Yếu nhất là ${SKILL_LABEL_VI[weakest.skill]} (${weakest.score}/100 trên ${weakest.asked} câu). Sprout sẽ ưu tiên phần này.`,
    );
  }
  if (strongest && strongest.skill !== weakest?.skill) {
    advice.push(
      `Mạnh nhất là ${SKILL_LABEL_VI[strongest.skill]} (${strongest.score}/100) — có thể học ở mức cao hơn.`,
    );
  }
  if (measured.length < outcomes.length) {
    advice.push('Một vài kỹ năng chưa đủ câu hỏi để đánh giá; làm thêm bài kiểm tra kỹ năng riêng.');
  }
  return advice;
}

function toJson(state: AdaptiveState): Prisma.InputJsonValue {
  return state as unknown as Prisma.InputJsonValue;
}

function fromJson(value: Prisma.JsonValue | null): AdaptiveState | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as unknown as AdaptiveState;
}
