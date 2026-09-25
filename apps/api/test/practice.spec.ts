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
  email: 'practice-learner@sprout.local',
  password: 'luyenTap2026',
  displayName: 'Người luyện tập',
  timezone: 'Asia/Ho_Chi_Minh',
};

interface Option {
  id: string;
  text: string;
}

type Item =
  | { id: string; mode: 'mcq-meaning' | 'mcq-reverse'; prompt: string; options: Option[]; lemma: string }
  | { id: string; mode: 'gap-fill'; prompt: string; hint: string; translation: string; lemma: string }
  | { id: string; mode: 'listen-type'; speakText: string; hint: string; lemma: string }
  | { id: string; mode: 'matching'; left: Option[]; right: Option[]; lemma: string };

beforeAll(async () => {
  const harness = await createTestApp();
  app = harness.app;
  prisma = harness.prisma;
  request = requester(app);
});

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });

  const registered = await request({
    method: 'POST',
    url: '/api/v1/auth/register',
    body: LEARNER,
  });
  token = data<{ accessToken: string }>(registered).accessToken;

  await request({
    method: 'POST',
    url: '/api/v1/me/onboarding',
    token,
    body: {
      goals: ['ielts'],
      dailyGoalMinutes: 30,
      selfAssessedLevel: 'B1',
      takePlacementTest: false,
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });
  await app.close();
});

async function createSet(modes: string[], count = 5) {
  const response = await request({
    method: 'POST',
    url: '/api/v1/practice',
    token,
    body: { topicSlug: 'environment', modes, count },
  });
  return { response, set: data<{ sessionId: string; items: Item[]; total: number }>(response) };
}

describe('vocabulary practice', () => {
  it('generates every one of the five formats', async () => {
    const { set } = await createSet(
      ['mcq-meaning', 'mcq-reverse', 'gap-fill', 'listen-type', 'matching'],
      10,
    );

    const modes = new Set(set.items.map((item) => item.mode));
    expect(modes.size).toBe(5);
    expect(set.items).toHaveLength(set.total);
  });

  it('never sends the answer to the client', async () => {
    const { response } = await createSet(['mcq-meaning'], 3);
    const raw = response.body;

    expect(raw).not.toContain('__answer');
    expect(raw).not.toContain('"answer"');
    expect(raw).not.toContain('optionId');
  });

  it('builds four plausible options, all from the same topic', async () => {
    const { set } = await createSet(['mcq-meaning'], 4);
    const item = set.items.find((entry) => entry.mode === 'mcq-meaning');
    expect(item).toBeDefined();

    const options = (item as Extract<Item, { mode: 'mcq-meaning' }>).options;
    expect(options).toHaveLength(4);
    expect(new Set(options.map((option) => option.id)).size).toBe(4);
    expect(new Set(options.map((option) => option.text)).size).toBe(4);
    // Distractors are Vietnamese definitions, not lemmas or empty strings.
    expect(options.every((option) => option.text.trim().length > 5)).toBe(true);
  });

  it('blanks the target inside a real sentence and hides all but the first letter', async () => {
    const { set } = await createSet(['gap-fill'], 4);
    const item = set.items.find((entry) => entry.mode === 'gap-fill') as Extract<
      Item,
      { mode: 'gap-fill' }
    >;

    expect(item.prompt).toContain('____');
    expect(item.translation.length).toBeGreaterThan(0);
    expect(item.hint).toMatch(/^[A-Za-z][_\s]*$/);
    // The hint must not give the whole word away.
    expect(item.hint.slice(1)).not.toMatch(/[A-Za-z]/);
  });

  it('grades a correct choice and explains why', async () => {
    const { set } = await createSet(['mcq-meaning'], 3);
    const item = set.items[0] as Extract<Item, { mode: 'mcq-meaning' }>;

    const exercise = await prisma.exercise.findUnique({ where: { id: item.id } });
    const correctId = (exercise!.answer as { optionId: string }).optionId;

    const response = await request({
      method: 'POST',
      url: '/api/v1/practice/submit',
      token,
      body: {
        sessionId: set.sessionId,
        answers: [{ itemId: item.id, answer: correctId, timeSpentMs: 3000 }],
      },
    });

    const result = data<{
      correct: number;
      total: number;
      xpEarned: number;
      results: { isCorrect: boolean; explanationVi: string }[];
    }>(response);

    expect(result.correct).toBe(1);
    expect(result.results[0]!.isCorrect).toBe(true);
    // §5.5 — an explanation is mandatory, right or wrong.
    expect(result.results[0]!.explanationVi.length).toBeGreaterThan(20);
    expect(result.xpEarned).toBeGreaterThan(0);
  });

  it('logs a mistake and names the right answer when the learner is wrong', async () => {
    const { set } = await createSet(['gap-fill'], 3);
    const item = set.items[0] as Extract<Item, { mode: 'gap-fill' }>;

    const response = await request({
      method: 'POST',
      url: '/api/v1/practice/submit',
      token,
      body: {
        sessionId: set.sessionId,
        answers: [{ itemId: item.id, answer: 'zzz', timeSpentMs: 3000 }],
      },
    });

    const result = data<{ results: { isCorrect: boolean; correctAnswer: string }[] }>(response);
    expect(result.results[0]!.isCorrect).toBe(false);
    expect(result.results[0]!.correctAnswer.length).toBeGreaterThan(1);

    const mistakes = await prisma.mistakeLog.count({ where: { sourceType: 'vocab-practice' } });
    expect(mistakes).toBe(1);
  });

  it('refuses to grade the same session twice', async () => {
    const { set } = await createSet(['mcq-meaning'], 2);
    const body = {
      sessionId: set.sessionId,
      answers: [{ itemId: set.items[0]!.id, answer: 'nope', timeSpentMs: 1000 }],
    };

    await request({ method: 'POST', url: '/api/v1/practice/submit', token, body });
    const second = await request({ method: 'POST', url: '/api/v1/practice/submit', token, body });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'ATTEMPT_ALREADY_SUBMITTED' } });
  });
});

describe('word class', () => {
  it('serves the suffix table sorted by how reliable each signal is', async () => {
    const response = await request({
      method: 'GET',
      url: '/api/v1/word-class/suffix-rules',
      token,
    });

    const rules = data<{ suffix: string; posLabelVi: string; reliability: number }[]>(response);
    expect(rules.length).toBeGreaterThanOrEqual(30);
    expect(rules[0]!.reliability).toBeGreaterThan(0.9);
    expect(rules.every((rule) => rule.posLabelVi.length > 0)).toBe(true);
  });

  it('groups a family across parts of speech', async () => {
    const response = await request({
      method: 'GET',
      url: '/api/v1/word-class/families/apply',
      token,
    });

    const family = data<{
      glossVi: string;
      members: { lemma: string; pos: string; suffix: string | null }[];
    }>(response);

    expect(family.members.map((member) => member.lemma).sort()).toEqual([
      'applicant',
      'application',
      'apply',
    ]);
    expect(family.members.find((member) => member.lemma === 'applicant')?.suffix).toBe('-ant');
  });

  it('asks for a derived form and never shows the answer in the bracket', async () => {
    const response = await request({
      method: 'GET',
      url: '/api/v1/word-class/practice?count=5',
      token,
    });

    const set = data<{
      sessionId: string;
      items: { id: string; prompt: string; baseLemma: string; targetPosLabelVi: string }[];
    }>(response);

    expect(set.items.length).toBeGreaterThan(0);
    for (const item of set.items) {
      expect(item.prompt).toContain('____');
      expect(item.targetPosLabelVi.length).toBeGreaterThan(0);

      const exercise = await prisma.exercise.findUnique({ where: { id: item.id } });
      const answer = (exercise!.answer as { value: string }).value;
      expect(answer.toLowerCase()).not.toBe(item.baseLemma.toLowerCase());
    }
  });

  it('explains the suffix when the learner gets the form wrong', async () => {
    const created = await request({
      method: 'GET',
      url: '/api/v1/word-class/practice?count=3',
      token,
    });
    const set = data<{ sessionId: string; items: { id: string }[] }>(created);

    const response = await request({
      method: 'POST',
      url: '/api/v1/word-class/practice/submit',
      token,
      body: {
        sessionId: set.sessionId,
        answers: set.items.map((item) => ({
          itemId: item.id,
          answer: 'khong-dung',
          timeSpentMs: 4000,
        })),
      },
    });

    const result = data<{
      correct: number;
      results: { correctAnswer: string; explanationVi: string }[];
    }>(response);

    expect(result.correct).toBe(0);
    expect(result.results[0]!.explanationVi).toContain('→');
    expect(result.results[0]!.correctAnswer.length).toBeGreaterThan(2);
  });
});

describe('decks', () => {
  async function createDeck(name = 'Từ khó'): Promise<string> {
    const response = await request({
      method: 'POST',
      url: '/api/v1/me/decks',
      token,
      body: { name, emoji: '🌿', isPublic: false },
    });
    return data<{ id: string }>(response).id;
  }

  async function someWordIds(count: number): Promise<string[]> {
    const response = await request({
      method: 'GET',
      url: `/api/v1/topics/space/words?limit=${count}`,
      token,
    });
    return data<{ id: string }[]>(response).map((word) => word.id);
  }

  it('creates a deck, fills it and schedules the words for review', async () => {
    const deckId = await createDeck();
    const wordIds = await someWordIds(3);

    const response = await request({
      method: 'POST',
      url: `/api/v1/me/decks/${deckId}/items`,
      token,
      body: { items: wordIds.map((wordId) => ({ wordId })), enqueueForReview: true },
    });

    const deck = data<{ itemCount: number; items: { lemma: string | null }[] }>(response);
    expect(deck.itemCount).toBe(3);
    expect(deck.items.every((item) => item.lemma !== null)).toBe(true);

    const scheduled = await prisma.userWord.count({ where: { wordId: { in: wordIds } } });
    expect(scheduled).toBe(3);
  });

  it('keeps the words out of the schedule when asked not to enqueue', async () => {
    const deckId = await createDeck('Chỉ để tra');
    const wordIds = await someWordIds(2);

    await request({
      method: 'POST',
      url: `/api/v1/me/decks/${deckId}/items`,
      token,
      body: { items: wordIds.map((wordId) => ({ wordId })), enqueueForReview: false },
    });

    expect(await prisma.userWord.count({ where: { wordId: { in: wordIds } } })).toBe(0);
  });

  it('reorders items and removes one', async () => {
    const deckId = await createDeck();
    const wordIds = await someWordIds(3);
    const filled = await request({
      method: 'POST',
      url: `/api/v1/me/decks/${deckId}/items`,
      token,
      body: { items: wordIds.map((wordId) => ({ wordId })), enqueueForReview: false },
    });
    const items = data<{ items: { id: string }[] }>(filled).items;

    const reversed = [...items].reverse().map((item) => item.id);
    const reordered = await request({
      method: 'PATCH',
      url: `/api/v1/me/decks/${deckId}/items`,
      token,
      body: { itemIds: reversed },
    });
    expect(data<{ items: { id: string }[] }>(reordered).items.map((item) => item.id)).toEqual(
      reversed,
    );

    const removed = await request({
      method: 'DELETE',
      url: `/api/v1/me/decks/${deckId}/items/${reversed[0]}`,
      token,
    });
    expect(data<{ itemCount: number }>(removed).itemCount).toBe(2);
  });

  it('will not let one learner touch another learner deck', async () => {
    const deckId = await createDeck();

    const other = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: { ...LEARNER, email: 'other-deck@sprout.local' },
    });
    const otherToken = data<{ accessToken: string }>(other).accessToken;

    const response = await request({
      method: 'PATCH',
      url: `/api/v1/me/decks/${deckId}`,
      token: otherToken,
      body: { name: 'Đổi tên trộm' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});
