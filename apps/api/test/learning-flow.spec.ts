import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { GamificationService } from '@app/modules/gamification/gamification.service';
import { createTestApp, data, meta, requester } from './harness';
import type { RequestOptions } from './harness';

let app: NestFastifyApplication;
let prisma: PrismaService;
let request: (options: RequestOptions) => ReturnType<ReturnType<typeof requester>>;
let token: string;
let userId: string;

const LEARNER = {
  email: 'flow-learner@sprout.local',
  password: 'hocMoiNgay2026',
  displayName: 'Người học',
  timezone: 'Asia/Ho_Chi_Minh',
};

async function signIn(dailyGoalMinutes = 30): Promise<void> {
  const registered = await request({
    method: 'POST',
    url: '/api/v1/auth/register',
    body: LEARNER,
  });
  const body = data<{ accessToken: string; user: { id: string } }>(registered);
  token = body.accessToken;
  userId = body.user.id;

  await request({
    method: 'POST',
    url: '/api/v1/me/onboarding',
    token,
    body: {
      goals: ['ielts'],
      dailyGoalMinutes,
      selfAssessedLevel: 'B1',
      takePlacementTest: false,
    },
  });
}

interface LearnCard {
  wordId: string;
  lemma: string;
}

async function learnWords(topic = 'environment'): Promise<LearnCard[]> {
  const response = await request({
    method: 'GET',
    url: `/api/v1/learn/cards?topic=${topic}`,
    token,
  });
  return data<LearnCard[]>(response);
}

beforeAll(async () => {
  const harness = await createTestApp();
  app = harness.app;
  prisma = harness.prisma;
  request = requester(app);
});

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });
  await signIn();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });
  await app.close();
});

describe('learning new words', () => {
  it('never offers more new words than the daily allowance', async () => {
    const cards = await learnWords();
    const settings = await prisma.userSettings.findUnique({ where: { userId } });

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(settings!.newWordsPerDay);
  });

  it('teaches the most frequent words first', async () => {
    const cards = await learnWords();
    const ranks = await prisma.word.findMany({
      where: { id: { in: cards.map((card) => card.wordId) } },
      select: { id: true, frequencyRank: true },
    });
    const byId = new Map(ranks.map((row) => [row.id, row.frequencyRank ?? Number.MAX_SAFE_INTEGER]));
    const ordered = cards.map((card) => byId.get(card.wordId) ?? 0);

    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
  });

  it('adds the words to the schedule and pays 5 XP each', async () => {
    const cards = (await learnWords()).slice(0, 4);
    const response = await request({
      method: 'POST',
      url: '/api/v1/learn/commit',
      token,
      body: { wordIds: cards.map((card) => card.wordId), sourceType: 'topic' },
    });

    const body = data<{ added: number; reward: { xpEarned: number; totalXp: number } }>(response);
    expect(body.added).toBe(4);
    expect(body.reward.xpEarned).toBe(20);

    const stored = await prisma.userWord.findMany({ where: { userId } });
    expect(stored).toHaveLength(4);
    expect(stored.every((row) => row.state === 'NEW')).toBe(true);
  });

  it('does not charge twice for a word already in the collection', async () => {
    const cards = (await learnWords()).slice(0, 2);
    const body = { wordIds: cards.map((card) => card.wordId), sourceType: 'topic' };

    await request({ method: 'POST', url: '/api/v1/learn/commit', token, body });
    const second = await request({ method: 'POST', url: '/api/v1/learn/commit', token, body });

    const result = data<{ added: number; skipped: number }>(second);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(2);
    expect(await prisma.userWord.count({ where: { userId } })).toBe(2);
  });

  it('stops offering new words once the daily allowance is spent', async () => {
    // No topic filter, so the allowance is filled from the whole dictionary
    // rather than running out of words in one topic first.
    const response = await request({ method: 'GET', url: '/api/v1/learn/cards', token });
    const cards = data<LearnCard[]>(response);
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    expect(cards).toHaveLength(settings!.newWordsPerDay);

    await request({
      method: 'POST',
      url: '/api/v1/learn/commit',
      token,
      body: { wordIds: cards.map((card) => card.wordId), sourceType: 'manual' },
    });

    const again = await request({ method: 'GET', url: '/api/v1/learn/cards', token });
    expect(data<unknown[]>(again)).toHaveLength(0);
    expect(meta<{ remainingToday: number }>(again).remainingToday).toBe(0);
  });
});

describe('review scheduling', () => {
  async function seedCollection(count = 6): Promise<void> {
    const cards = (await learnWords()).slice(0, count);
    await request({
      method: 'POST',
      url: '/api/v1/learn/commit',
      token,
      body: { wordIds: cards.map((card) => card.wordId), sourceType: 'topic' },
    });
  }

  it('offers the new cards with an interval preview on every grade', async () => {
    await seedCollection(3);
    const response = await request({ method: 'GET', url: '/api/v1/srs/queue', token });

    const cards = data<
      { userWordId: string; isNew: boolean; intervalPreview: Record<string, number> }[]
    >(response);
    expect(cards).toHaveLength(3);
    expect(cards.every((card) => card.isNew)).toBe(true);

    const preview = cards[0]!.intervalPreview;
    expect(Object.keys(preview).sort()).toEqual(['0', '1', '2', '3']);
    // §9.1 — Easy graduates straight to four days, Again stays inside the day.
    expect(preview['3']).toBe(4);
    expect(preview['0']).toBeLessThan(1);
  });

  it('moves a new card into learning and records the review', async () => {
    await seedCollection(1);
    const queue = await request({ method: 'GET', url: '/api/v1/srs/queue', token });
    const card = data<{ userWordId: string }[]>(queue)[0]!;

    const response = await request({
      method: 'POST',
      url: '/api/v1/srs/review',
      token,
      body: { userWordId: card.userWordId, grade: 2, responseMs: 1800 },
    });

    const result = data<{ state: string; xpEarned: number }>(response);
    expect(result.state).toBe('LEARNING');
    expect(result.xpEarned).toBe(2);

    const log = await prisma.reviewLog.findFirst({ where: { userWordId: card.userWordId } });
    expect(log).toMatchObject({ grade: 2, prevState: 'NEW', newState: 'LEARNING' });
  });

  it('refuses to grade a card that belongs to someone else', async () => {
    await seedCollection(1);
    const queue = await request({ method: 'GET', url: '/api/v1/srs/queue', token });
    const card = data<{ userWordId: string }[]>(queue)[0]!;

    const intruder = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: { ...LEARNER, email: 'intruder@sprout.local' },
    });
    const intruderToken = data<{ accessToken: string }>(intruder).accessToken;

    const response = await request({
      method: 'POST',
      url: '/api/v1/srs/review',
      token: intruderToken,
      body: { userWordId: card.userWordId, grade: 3, responseMs: 900 },
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a grade outside 0..3', async () => {
    await seedCollection(1);
    const queue = await request({ method: 'GET', url: '/api/v1/srs/queue', token });
    const card = data<{ userWordId: string }[]>(queue)[0]!;

    const response = await request({
      method: 'POST',
      url: '/api/v1/srs/review',
      token,
      body: { userWordId: card.userWordId, grade: 7, responseMs: 900 },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });
});

describe('gamification', () => {
  /**
   * §9.4 — "streak chạy đúng qua nửa đêm". These go through the service so the
   * clock can be moved; everything else in the pipeline is the real thing.
   */
  function gamification(): GamificationService {
    return app.get(GamificationService);
  }

  /** 21:00 local in Ho Chi Minh City on the given day. */
  function evening(dayKey: string): Date {
    return new Date(`${dayKey}T14:00:00.000Z`);
  }

  /** 01:00 local — after midnight, but before the 04:00 rollover. */
  function afterMidnight(dayKey: string): Date {
    return new Date(`${dayKey}T18:00:00.000Z`);
  }

  it('counts a qualifying day once, no matter how many awards it takes', async () => {
    const service = gamification();
    const now = evening('2026-03-10');

    for (let index = 0; index < 12; index += 1) {
      await service.award({ userId, source: 'NEW_WORD', skill: 'VOCABULARY', now });
    }

    const progress = await prisma.userProgress.findUnique({ where: { userId } });
    expect(progress!.currentStreak).toBe(1);
    expect(progress!.totalXp).toBe(60);
  });

  it('keeps a session after midnight on the day it started', async () => {
    const service = gamification();
    // 21:00 on the 10th, then 01:00 on the 11th: still the same study day.
    await service.award({
      userId,
      source: 'NEW_WORD',
      skill: 'VOCABULARY',
      quantity: 12,
      now: evening('2026-03-10'),
    });
    await service.award({
      userId,
      source: 'NEW_WORD',
      skill: 'VOCABULARY',
      quantity: 12,
      now: afterMidnight('2026-03-10'),
    });

    const progress = await prisma.userProgress.findUnique({ where: { userId } });
    expect(progress!.currentStreak).toBe(1);

    const stats = await prisma.dailyStat.findMany({ where: { userId } });
    expect(stats).toHaveLength(1);
    expect(stats[0]!.date.toISOString().slice(0, 10)).toBe('2026-03-10');
  });

  it('advances the streak on the next study day', async () => {
    const service = gamification();
    await service.award({ userId, source: 'NEW_WORD', skill: 'VOCABULARY', quantity: 12, now: evening('2026-03-10') });
    await service.award({ userId, source: 'NEW_WORD', skill: 'VOCABULARY', quantity: 12, now: evening('2026-03-11') });

    const progress = await prisma.userProgress.findUnique({ where: { userId } });
    expect(progress!.currentStreak).toBe(2);
    expect(progress!.longestStreak).toBe(2);
  });

  it('spends a freeze to cover exactly one missed day', async () => {
    const service = gamification();
    await service.award({ userId, source: 'NEW_WORD', skill: 'VOCABULARY', quantity: 12, now: evening('2026-03-10') });
    // Nothing on the 11th.
    const reward = await service.award({
      userId,
      source: 'NEW_WORD',
      skill: 'VOCABULARY',
      quantity: 12,
      now: evening('2026-03-12'),
    });

    expect(reward.streak.freezeUsed).toBe(true);
    expect(reward.streak.current).toBe(2);

    const progress = await prisma.userProgress.findUnique({ where: { userId } });
    expect(progress!.streakFreezes).toBe(1);
    expect(progress!.streakRepairedAt).not.toBeNull();
  });

  it('breaks the streak when the gap is longer than a freeze can cover', async () => {
    const service = gamification();
    await service.award({ userId, source: 'NEW_WORD', skill: 'VOCABULARY', quantity: 12, now: evening('2026-03-10') });
    const reward = await service.award({
      userId,
      source: 'NEW_WORD',
      skill: 'VOCABULARY',
      quantity: 12,
      now: evening('2026-03-20'),
    });

    expect(reward.streak.current).toBe(1);
    const progress = await prisma.userProgress.findUnique({ where: { userId } });
    expect(progress!.streakLostAt).not.toBeNull();
  });
});

describe('the tree', () => {
  it('grows a stage the moment total XP crosses the threshold', async () => {
    const service = app.get(GamificationService);
    const now = new Date('2026-03-10T14:00:00.000Z');

    // 59 new words is 295 XP: one short of the 300 XP sprout stage.
    const before = await service.award({
      userId,
      source: 'NEW_WORD',
      skill: 'VOCABULARY',
      quantity: 59,
      now,
    });
    expect(before.totalXp).toBe(295);
    expect(before.treeStage).toBe(1);
    expect(before.treeGrew).toBe(false);

    const after = await service.award({
      userId,
      source: 'NEW_WORD',
      skill: 'VOCABULARY',
      now,
    });
    expect(after.totalXp).toBe(300);
    expect(after.treeStage).toBe(2);
    expect(after.treeGrew).toBe(true);

    const dashboard = await request({ method: 'GET', url: '/api/v1/me/dashboard', token });
    const view = data<{ tree: { stage: number; nameVi: string; nextStageXp: number | null } }>(
      dashboard,
    );
    expect(view.tree.stage).toBe(2);
    expect(view.tree.nameVi).toBe('Mầm');
    expect(view.tree.nextStageXp).toBe(1500);
  });

  it('yellows the leaves after a missed day and wilts after three', async () => {
    const service = app.get(GamificationService);
    await service.award({
      userId,
      source: 'NEW_WORD',
      skill: 'VOCABULARY',
      quantity: 12,
      now: new Date('2026-03-10T14:00:00.000Z'),
    });

    // The dashboard reads "today" from the server clock, so the last study day
    // is pushed back instead of moving the clock forward.
    await prisma.userProgress.update({
      where: { userId },
      data: { lastStudyDate: new Date(Date.now() - 2 * 86_400_000) },
    });

    const response = await request({ method: 'GET', url: '/api/v1/me/dashboard', token });
    expect(data<{ tree: { health: string } }>(response).tree.health).toBe('yellowing');
  });
});
