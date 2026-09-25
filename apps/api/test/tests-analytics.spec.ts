import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { createTestApp, data, requester } from './harness';
import type { RequestOptions } from './harness';

let app: NestFastifyApplication;
let prisma: PrismaService;
let request: (options: RequestOptions) => ReturnType<ReturnType<typeof requester>>;
let token: string;

const LEARNER = {
  email: 'placement-learner@sprout.local',
  password: 'kiemTra2026',
  displayName: 'Người kiểm tra',
  timezone: 'Asia/Ho_Chi_Minh',
};

interface Question {
  exercise: { id: string; mode: string; prompt: string; options?: { id: string; text: string }[] };
  skill: string;
  cefr: string;
  position: number;
}

interface RunState {
  attemptId: string;
  isAdaptive: boolean;
  next: Question | null;
  answered: number;
  total: number | null;
  secondsRemaining: number | null;
}

interface TestResult {
  attemptId: string;
  totalScore: number;
  maxScore: number;
  accuracy: number;
  passed: boolean;
  cefrResult: string | null;
  skills: { skill: string; correct: number; asked: number; score: number; cefr: string }[];
  adviceVi: string[];
  profileUpdated: boolean;
}

beforeAll(async () => {
  const harness = await createTestApp();
  app = harness.app;
  prisma = harness.prisma;
  request = requester(app);
});

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });
  const registered = await request({ method: 'POST', url: '/api/v1/auth/register', body: LEARNER });
  token = data<{ accessToken: string }>(registered).accessToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });
  await app.close();
});

async function correctOptionFor(exerciseId: string): Promise<string> {
  const row = await prisma.exercise.findUniqueOrThrow({ where: { id: exerciseId } });
  const stored = row.answer as Record<string, unknown>;
  if (typeof stored['optionId'] === 'string') return stored['optionId'];
  if (typeof stored['value'] === 'boolean') return String(stored['value']);
  throw new Error(`Câu ${exerciseId} không phải trắc nghiệm`);
}

/** Plays the placement test through, deciding each answer with `decide`. */
async function playPlacement(
  decide: (question: Question) => Promise<boolean>,
): Promise<{ asked: Question[]; result: TestResult }> {
  let state = data<RunState>(
    await request({ method: 'POST', url: '/api/v1/tests/placement/start', token }),
  );
  const asked: Question[] = [];

  while (state.next) {
    const question = state.next;
    asked.push(question);
    const answerCorrectly = await decide(question);
    const answer = answerCorrectly
      ? await correctOptionFor(question.exercise.id)
      : 'chac chan sai';

    state = data<RunState>(
      await request({
        method: 'POST',
        url: '/api/v1/tests/placement/answer',
        token,
        body: { answers: [{ exerciseId: question.exercise.id, answer, timeSpentMs: 5000 }] },
      }),
    );
  }

  const result = data<TestResult>(
    await request({ method: 'POST', url: '/api/v1/tests/placement/finish', token }),
  );
  return { asked, result };
}

describe('placement test', () => {
  it('lists the seeded placement test', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/tests', token });
    expect(response.statusCode).toBe(200);
    const tests = data<{ slug: string; isAdaptive: boolean; questionCount: number }[]>(response);

    const placement = tests.find((test) => test.slug === 'placement');
    expect(placement?.isAdaptive).toBe(true);
    expect(placement?.questionCount).toBeGreaterThanOrEqual(25);
  });

  it('starts at A2 and never sends the answer with the question', async () => {
    const response = await request({ method: 'POST', url: '/api/v1/tests/placement/start', token });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('optionId');
    expect(response.body).not.toContain('"answer"');

    const state = data<RunState>(response);
    expect(state.isAdaptive).toBe(true);
    expect(state.total).toBeNull();
    expect(state.next?.cefr).toBe('A2');
    expect(state.secondsRemaining).toBeGreaterThan(0);
  });

  it('resumes the attempt in flight instead of starting a second one', async () => {
    const first = data<RunState>(
      await request({ method: 'POST', url: '/api/v1/tests/placement/start', token }),
    );
    const second = data<RunState>(
      await request({ method: 'POST', url: '/api/v1/tests/placement/start', token }),
    );
    expect(second.attemptId).toBe(first.attemptId);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: LEARNER.email } });
    const attempts = await prisma.testAttempt.count({ where: { userId: user.id } });
    expect(attempts).toBe(1);
  });

  it('climbs the levels for a strong learner and places them high', async () => {
    const { asked, result } = await playPlacement(async () => true);

    const levels = asked.map((question) => question.cefr);
    expect(levels[0]).toBe('A2');
    // Two right in a row moves up, so B1 must appear early.
    expect(levels.slice(0, 4)).toContain('B1');
    expect(result.cefrResult).not.toBe('A1');
    expect(result.accuracy).toBe(1);
    expect(result.profileUpdated).toBe(true);
  });

  it('drops the level for a learner who gets everything wrong, and places them at A1', async () => {
    const { asked, result } = await playPlacement(async () => false);

    expect(asked.map((question) => question.cefr)).toContain('A1');
    expect(result.cefrResult).toBe('A1');
    expect(result.accuracy).toBe(0);
  });

  it('writes the level onto the profile', async () => {
    const { result } = await playPlacement(async () => true);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: LEARNER.email },
      include: { profile: true },
    });
    expect(user.profile?.currentLevel).toBe(result.cefrResult);
  });

  it('never asks the same question twice', async () => {
    const { asked } = await playPlacement(async (question) => question.cefr <= 'B1');
    const ids = asked.map((question) => question.exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stops between the minimum and maximum question count', async () => {
    // Alternating answers keep the walk bouncing so it settles by reversals.
    let index = 0;
    const { asked } = await playPlacement(async () => {
      index += 1;
      return index % 4 < 2;
    });
    expect(asked.length).toBeGreaterThanOrEqual(12);
    expect(asked.length).toBeLessThanOrEqual(30);
  });

  it('reports a score per skill and says which is weakest', async () => {
    // Right on grammar, wrong on everything else.
    const { result } = await playPlacement(async (question) => question.skill === 'GRAMMAR');

    const grammar = result.skills.find((entry) => entry.skill === 'GRAMMAR');
    expect(grammar?.score).toBe(100);
    expect(result.skills.every((entry) => entry.asked > 0)).toBe(true);
    expect(result.adviceVi.length).toBeGreaterThan(0);
    expect(result.adviceVi.join(' ')).toContain('Ngữ pháp');
  });

  it('feeds the result into the §9.7 skill scores as a test observation', async () => {
    await playPlacement(async () => true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: LEARNER.email } });
    const scores = await prisma.skillScore.findMany({ where: { userId: user.id } });
    expect(scores.length).toBeGreaterThanOrEqual(2);
    expect(scores.every((score) => score.observations > 0)).toBe(true);
  });

  it('refuses to finish an attempt with no answers', async () => {
    await request({ method: 'POST', url: '/api/v1/tests/placement/start', token });
    const response = await request({
      method: 'POST',
      url: '/api/v1/tests/placement/finish',
      token,
    });
    expect(response.statusCode).toBe(409);
  });

  it('serves the finished result again by attempt id', async () => {
    const { result } = await playPlacement(async () => true);
    const again = data<TestResult>(
      await request({ method: 'GET', url: `/api/v1/tests/attempts/${result.attemptId}`, token }),
    );
    expect(again.cefrResult).toBe(result.cefrResult);
    expect(again.maxScore).toBe(result.maxScore);
  });

  it('will not show another learner’s attempt', async () => {
    const { result } = await playPlacement(async () => true);

    const other = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: { ...LEARNER, email: 'other-learner@sprout.local' },
    });
    const otherToken = data<{ accessToken: string }>(other).accessToken;

    const response = await request({
      method: 'GET',
      url: `/api/v1/tests/attempts/${result.attemptId}`,
      token: otherToken,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('analytics', () => {
  it('returns an honest empty page for a learner who has done nothing', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/me/analytics', token });
    expect(response.statusCode).toBe(200);

    const analytics = data<{
      period: string;
      daily: unknown[];
      totals: { xp: number; activeDays: number; accuracy: number | null };
      skills: { skill: string; attempts: number; periodAccuracy: number | null }[];
      insightsVi: string[];
    }>(response);

    expect(analytics.period).toBe('30d');
    expect(analytics.daily).toHaveLength(30);
    expect(analytics.totals.xp).toBe(0);
    expect(analytics.totals.accuracy).toBeNull();
    // A skill never practised reports null, not zero.
    expect(analytics.skills.every((skill) => skill.periodAccuracy === null)).toBe(true);
    expect(analytics.insightsVi).toEqual(['Chưa có buổi học nào trong khoảng thời gian này.']);
  });

  it('honours the period and always fills every day in the range', async () => {
    const week = data<{ daily: { date: string }[]; from: string; to: string }>(
      await request({ method: 'GET', url: '/api/v1/me/analytics?period=7d', token }),
    );
    expect(week.daily).toHaveLength(7);
    expect(week.daily[0]?.date).toBe(week.from);
    expect(week.daily.at(-1)?.date).toBe(week.to);

    const quarter = data<{ daily: unknown[] }>(
      await request({ method: 'GET', url: '/api/v1/me/analytics?period=90d', token }),
    );
    expect(quarter.daily).toHaveLength(90);
  });

  it('rejects a period it does not know', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/me/analytics?period=1y', token });
    expect(response.statusCode).toBe(422);
  });

  it('counts real activity into the totals and the mistake breakdown', async () => {
    const lesson = data<{ exercises: { id: string }[] }>(
      await request({ method: 'GET', url: '/api/v1/grammar/lessons/present-simple', token }),
    );
    const first = lesson.exercises[0];
    if (!first) throw new Error('bài học không có bài tập');

    await request({
      method: 'POST',
      url: '/api/v1/grammar/lessons/present-simple/submit',
      token,
      body: { answers: [{ exerciseId: first.id, answer: 'sai hoàn toàn', timeSpentMs: 4000 }] },
    });

    const analytics = data<{
      totals: { xp: number; activeDays: number };
      skills: { skill: string; attempts: number; periodAccuracy: number | null }[];
      mistakes: { category: string; labelVi: string; count: number }[];
      insightsVi: string[];
    }>(await request({ method: 'GET', url: '/api/v1/me/analytics?period=7d', token }));

    expect(analytics.totals.activeDays).toBe(1);
    expect(analytics.totals.xp).toBeGreaterThan(0);

    const grammar = analytics.skills.find((skill) => skill.skill === 'GRAMMAR');
    expect(grammar?.attempts).toBe(1);
    expect(grammar?.periodAccuracy).toBe(0);

    expect(analytics.mistakes.length).toBe(1);
    expect(analytics.mistakes[0]?.labelVi).toContain('Ngữ pháp');
    expect(analytics.insightsVi[0]).toContain('1/7 ngày');
  });

  it('names a topic as weak only when the learner is actually getting it wrong', async () => {
    const lesson = await request({
      method: 'GET',
      url: '/api/v1/grammar/lessons/present-simple',
      token,
    });
    const exercises = data<{ exercises: { id: string }[] }>(lesson).exercises;

    // Answer every question correctly: seven attempts, well above the
    // five-attempt floor, so the only thing keeping this topic off the list
    // is the accuracy ceiling.
    const answers = [];
    for (const exercise of exercises) {
      const row = await prisma.exercise.findUniqueOrThrow({ where: { id: exercise.id } });
      const stored = row.answer as Record<string, unknown>;
      const answer =
        typeof stored['optionId'] === 'string'
          ? stored['optionId']
          : typeof stored['value'] === 'boolean'
            ? String(stored['value'])
            : Array.isArray(stored['order'])
              ? JSON.stringify(stored['order'])
              : String((stored['accept'] as string[])[0]);
      answers.push({ exerciseId: exercise.id, answer, timeSpentMs: 4000 });
    }

    await request({
      method: 'POST',
      url: '/api/v1/grammar/lessons/present-simple/submit',
      token,
      body: { answers },
    });

    const analytics = data<{ weakSpots: { key: string }[] }>(
      await request({ method: 'GET', url: '/api/v1/me/analytics?period=7d', token }),
    );
    expect(analytics.weakSpots.map((spot) => spot.key)).not.toContain('present-simple');
  });
  it('does not claim a weak skill from too little evidence', async () => {
    const lesson = data<{ exercises: { id: string }[] }>(
      await request({ method: 'GET', url: '/api/v1/grammar/lessons/present-simple', token }),
    );
    const first = lesson.exercises[0];
    if (!first) throw new Error('bài học không có bài tập');

    await request({
      method: 'POST',
      url: '/api/v1/grammar/lessons/present-simple/submit',
      token,
      body: { answers: [{ exerciseId: first.id, answer: 'sai', timeSpentMs: 4000 }] },
    });

    const analytics = data<{ insightsVi: string[]; weakSpots: unknown[] }>(
      await request({ method: 'GET', url: '/api/v1/me/analytics?period=7d', token }),
    );
    // One attempt is below rankWeakTopics' five-attempt floor.
    expect(analytics.weakSpots).toHaveLength(0);
    expect(analytics.insightsVi.join(' ')).toContain('Chưa đủ bài làm');
  });
});
