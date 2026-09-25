import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { createTestApp, data, meta, requester } from './harness';
import type { RequestOptions } from './harness';

let app: NestFastifyApplication;
let prisma: PrismaService;
let request: (options: RequestOptions) => ReturnType<ReturnType<typeof requester>>;
let token: string;

const LEARNER = {
  email: 'reading-learner@sprout.local',
  password: 'docNghe2026',
  displayName: 'Người đọc và nghe',
  timezone: 'Asia/Ho_Chi_Minh',
};

interface Exercise {
  id: string;
  mode: string;
  prompt: string;
  options?: { id: string; text: string }[];
  speakText?: string;
  wordCount?: number;
}

interface ReadingCard {
  slug: string;
  cefr: string;
  wordCount: number;
  questionCount: number;
  completed: boolean;
  bestAccuracy: number | null;
}

interface ReadingDetail extends ReadingCard {
  bodyMdx: string;
  glossary: {
    lemma: string;
    surface: string;
    offsetStart: number;
    offsetEnd: number;
    definitionVi: string;
    known: boolean;
    wordId: string | null;
  }[];
  questions: Exercise[];
}

interface ListeningCard {
  slug: string;
  cefr: string;
  durationSec: number;
  accent: string;
  format: string;
  audioUrl: string;
  questionCount: number;
  hasDictation: boolean;
}

interface ListeningDetail extends ListeningCard {
  transcript: {
    id: string;
    order: number;
    startMs: number;
    endMs: number;
    speaker: string | null;
    text: string;
    words: { w: string; startMs: number; endMs: number }[];
    translationVi: string | null;
  }[];
  questions: Exercise[];
  dictation: Exercise[];
}

interface Result {
  correctCount: number;
  total: number;
  accuracy: number;
  durationSec: number;
  feedback: { exerciseId: string; isCorrect: boolean; score: number; correctAnswer: string }[];
  reward: { xpEarned: number };
}

interface ReadingResult extends Result {
  speed: { wpm: number; targetWpm: number; band: string };
}

interface ListeningResult extends Result {
  dictation: {
    exerciseId: string;
    score: number;
    reference: string;
    tokens: { status: string; expected: string | null; actual: string | null }[];
  }[];
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

async function correctAnswerFor(id: string): Promise<string> {
  const row = await prisma.exercise.findUniqueOrThrow({ where: { id } });
  const stored = row.answer as Record<string, unknown>;
  if (typeof stored['optionId'] === 'string') return stored['optionId'];
  if (typeof stored['value'] === 'boolean') return String(stored['value']);
  if (Array.isArray(stored['order'])) return JSON.stringify(stored['order']);
  if (Array.isArray(stored['accept'])) return String(stored['accept'][0]);
  if (typeof stored['text'] === 'string') return stored['text'];
  throw new Error(`Không biết cách trả lời ${id}`);
}

describe('reading', () => {
  it('lists passages with a real word count', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/reading/passages?limit=100', token });
    expect(response.statusCode).toBe(200);
    const items = data<ReadingCard[]>(response);

    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every((card) => card.wordCount > 100)).toBe(true);
    expect(items.every((card) => card.questionCount >= 5)).toBe(true);
    expect(meta<{ total: number }>(response).total).toBe(items.length);
  });

  it('filters by level', async () => {
    const items = data<ReadingCard[]>(
      await request({ method: 'GET', url: '/api/v1/reading/passages?cefr=B1', token }),
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((card) => card.cefr === 'B1')).toBe(true);
  });

  it('returns a glossary whose offsets point at the right words', async () => {
    const passage = data<ReadingDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/reading/passages/what-happens-to-plastic-in-the-mekong',
        token,
      }),
    );

    expect(passage.glossary.length).toBeGreaterThanOrEqual(5);
    for (const entry of passage.glossary) {
      const sliced = passage.bodyMdx.slice(entry.offsetStart, entry.offsetEnd);
      expect(sliced.toLowerCase()).toBe(entry.surface.toLowerCase());
      expect(sliced.toLowerCase().startsWith(entry.lemma.slice(0, 4).toLowerCase())).toBe(true);
      expect(entry.definitionVi.length).toBeGreaterThan(0);
      expect(entry.known).toBe(false);
    }
  });

  it('marks a glossary word as known once it is in the collection', async () => {
    const before = data<ReadingDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/reading/passages/what-happens-to-plastic-in-the-mekong',
        token,
      }),
    );
    const first = before.glossary.find((entry) => entry.wordId !== null);
    if (!first?.wordId) throw new Error('bài đọc không có từ nào nối được với từ điển');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: LEARNER.email } });
    await prisma.userWord.create({
      data: { userId: user.id, wordId: first.wordId, dueAt: new Date() },
    });

    const after = data<ReadingDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/reading/passages/what-happens-to-plastic-in-the-mekong',
        token,
      }),
    );
    expect(after.glossary.find((entry) => entry.wordId === first.wordId)?.known).toBe(true);
  });

  it('never sends the answers with the passage', async () => {
    const response = await request({
      method: 'GET',
      url: '/api/v1/reading/passages/the-night-train-to-sapa',
      token,
    });
    expect(response.body).not.toContain('"accept"');
    expect(response.body).not.toContain('optionId');
  });

  it('reports reading speed against the level target', async () => {
    const started = data<{ sessionId: string }>(
      await request({
        method: 'POST',
        url: '/api/v1/reading/passages/sleeping-better-on-a-busy-week/start',
        token,
      }),
    );
    const passage = data<ReadingDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/reading/passages/sleeping-better-on-a-busy-week',
        token,
      }),
    );

    const answers = [];
    for (const question of passage.questions) {
      answers.push({
        exerciseId: question.id,
        answer: await correctAnswerFor(question.id),
        timeSpentMs: 5000,
      });
    }

    const result = data<ReadingResult>(
      await request({
        method: 'POST',
        url: '/api/v1/reading/passages/sleeping-better-on-a-busy-week/submit',
        token,
        body: { sessionId: started.sessionId, answers },
      }),
    );

    expect(result.accuracy).toBe(1);
    expect(result.speed.targetWpm).toBe(90);
    expect(result.speed.wpm).toBeGreaterThan(0);
    // The test answers instantly, so this is a skim by definition — except the
    // answers are all right, which is exactly the case the band must not call
    // skimmed.
    expect(result.speed.band).toBe('fast');
    expect(result.reward.xpEarned).toBeGreaterThan(0);
  });

  it('remembers the best accuracy on the list', async () => {
    const passage = data<ReadingDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/reading/passages/the-night-train-to-sapa',
        token,
      }),
    );
    const first = passage.questions[0];
    if (!first) throw new Error('bài đọc không có câu hỏi');

    await request({
      method: 'POST',
      url: '/api/v1/reading/passages/the-night-train-to-sapa/submit',
      token,
      body: {
        answers: [
          { exerciseId: first.id, answer: await correctAnswerFor(first.id), timeSpentMs: 4000 },
        ],
      },
    });

    const items = data<ReadingCard[]>(
      await request({ method: 'GET', url: '/api/v1/reading/passages?limit=100', token }),
    );
    const card = items.find((item) => item.slug === 'the-night-train-to-sapa');
    expect(card?.completed).toBe(true);
    expect(card?.bestAccuracy).toBe(1);
  });
});

describe('listening', () => {
  it('lists tracks with an estimated duration and a dictation flag', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/listening/tracks', token });
    expect(response.statusCode).toBe(200);
    const items = data<ListeningCard[]>(response);

    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every((card) => card.durationSec > 10)).toBe(true);
    expect(items.every((card) => card.hasDictation)).toBe(true);
    // D-033 — no TTS provider is configured, so the client speaks the text.
    expect(items.every((card) => card.audioUrl === '')).toBe(true);
  });

  it('filters by accent and format', async () => {
    const uk = data<ListeningCard[]>(
      await request({ method: 'GET', url: '/api/v1/listening/tracks?accent=UK', token }),
    );
    expect(uk.length).toBeGreaterThan(0);
    expect(uk.every((card) => card.accent === 'UK')).toBe(true);

    const podcasts = data<ListeningCard[]>(
      await request({ method: 'GET', url: '/api/v1/listening/tracks?format=podcast', token }),
    );
    expect(podcasts.every((card) => card.format === 'podcast')).toBe(true);
  });

  it('returns a transcript with per-word timings that stay inside the segment', async () => {
    const track = data<ListeningDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/listening/tracks/ordering-coffee-to-take-away',
        token,
      }),
    );

    expect(track.transcript.length).toBe(10);
    expect(track.transcript[0]?.speaker).toBe('Barista');
    expect(track.transcript.every((segment) => segment.translationVi !== null)).toBe(true);

    for (const segment of track.transcript) {
      expect(segment.endMs).toBeGreaterThan(segment.startMs);
      expect(segment.words.length).toBeGreaterThan(0);
      expect(segment.words[0]?.startMs).toBe(segment.startMs);
      expect(segment.words.at(-1)?.endMs).toBeLessThanOrEqual(segment.endMs + 1);
    }

    // Segments run in order and never overlap.
    for (let index = 1; index < track.transcript.length; index += 1) {
      const previous = track.transcript[index - 1];
      const current = track.transcript[index];
      expect(current?.startMs).toBeGreaterThan(previous?.endMs ?? 0);
    }
  });

  it('separates comprehension questions from dictation lines', async () => {
    const track = data<ListeningDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/listening/tracks/a-voicemail-about-a-deadline',
        token,
      }),
    );

    expect(track.questions.length).toBe(6);
    expect(track.dictation.length).toBe(3);
    expect(track.dictation.every((item) => item.mode === 'dictation')).toBe(true);
    expect(track.dictation.every((item) => (item.wordCount ?? 0) > 3)).toBe(true);
    expect(track.dictation.every((item) => (item.speakText ?? '').length > 0)).toBe(true);
  });
});

describe('expanded reading and listening library', () => {
  it.each([
    ['reading/passages', 55],
    ['listening/tracks', 40],
  ])('makes every %s lesson reachable across pages', async (path, total) => {
    const first = await request({ method: 'GET', url: `/api/v1/${path}?limit=30&page=1`, token });
    const second = await request({ method: 'GET', url: `/api/v1/${path}?limit=30&page=2`, token });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(meta<{ total: number; hasMore: boolean }>(first)).toMatchObject({ total, hasMore: true });
    expect(meta<{ total: number; hasMore: boolean }>(second)).toMatchObject({ total, hasMore: false });
    const slugs = [...data<{ slug: string }[]>(first), ...data<{ slug: string }[]>(second)].map(row => row.slug);
    expect(slugs.length).toBe(total);
    expect(new Set(slugs).size).toBe(total);
  });

  it.each([
    ['reading/passages', 'a-returnable-packaging-trial', 8],
    ['listening/tracks', 'reviewing-a-returnable-cup-pilot', 12],
  ])('opens and grades the new %s content', async (path, slug, total) => {
    const detailResponse = await request({ method: 'GET', url: `/api/v1/${path}/${slug}`, token });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.body).not.toContain('"accept"');
    const detail = data<ReadingDetail & Partial<ListeningDetail>>(detailResponse);
    expect(detail.questions).toHaveLength(8);
    for (const question of detail.questions) {
      expect(question.prompt.trim().length).toBeGreaterThan(0);
      if (question.mode === 'true-false') expect((question as Exercise & { statement: string }).statement.trim().length).toBeGreaterThan(0);
    }
    if (path.startsWith('listening')) {
      expect(detail.transcript).toHaveLength(12);
      expect(detail.transcript?.every(turn => turn.translationVi && turn.words.length)).toBe(true);
      expect(detail.dictation).toHaveLength(4);
    }
    const exercises = [...detail.questions, ...(detail.dictation ?? [])];
    const answers = await Promise.all(exercises.map(async question => ({ exerciseId: question.id, answer: await correctAnswerFor(question.id), timeSpentMs: 5000 })));
    const submitted = await request({ method: 'POST', url: `/api/v1/${path}/${slug}/submit`, token, body: { answers } });
    expect(submitted.statusCode).toBe(200);
    expect(data<Result>(submitted)).toMatchObject({ total, correctCount: total, accuracy: 1 });
  });
});

describe('dictation and playback', () => {
  it('scores dictation word by word and shows what was missed', async () => {
    const track = data<ListeningDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/listening/tracks/ordering-coffee-to-take-away',
        token,
      }),
    );
    const line = track.dictation[0];
    if (!line) throw new Error('bài nghe không có câu chép chính tả');

    const reference = await correctAnswerFor(line.id);
    const missingOneWord = reference.split(' ').slice(0, -1).join(' ');

    const result = data<ListeningResult>(
      await request({
        method: 'POST',
        url: '/api/v1/listening/tracks/ordering-coffee-to-take-away/submit',
        token,
        body: {
          answers: [{ exerciseId: line.id, answer: missingOneWord, timeSpentMs: 20000 }],
          playback: { playbackRate: 0.75, replays: 4, transcriptShown: false },
        },
      }),
    );

    expect(result.dictation.length).toBe(1);
    const graded = result.dictation[0];
    expect(graded?.reference).toBe(reference);
    expect(graded?.score).toBeGreaterThan(0.5);
    expect(graded?.score).toBeLessThan(1);
    expect(graded?.tokens.some((entry) => entry.status === 'missing')).toBe(true);
  });

  it('records how the learner listened, for the slow-listening achievement', async () => {
    const track = data<ListeningDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/listening/tracks/a-doctors-appointment',
        token,
      }),
    );
    const question = track.questions[0];
    if (!question) throw new Error('bài nghe không có câu hỏi');

    await request({
      method: 'POST',
      url: '/api/v1/listening/tracks/a-doctors-appointment/submit',
      token,
      body: {
        answers: [
          {
            exerciseId: question.id,
            answer: await correctAnswerFor(question.id),
            timeSpentMs: 12000,
          },
        ],
        playback: { playbackRate: 0.5, replays: 9, transcriptShown: true },
      },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: LEARNER.email } });
    const attempt = await prisma.exerciseAttempt.findFirstOrThrow({
      where: { userId: user.id, exerciseId: question.id },
    });
    const answer = attempt.userAnswer as Record<string, unknown>;
    expect(answer['playbackRate']).toBe(0.5);
    expect(answer['replays']).toBe(9);
    expect(answer['transcriptShown']).toBe(true);
  });

  it('defaults the playback block when the client omits it', async () => {
    const track = data<ListeningDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/listening/tracks/checking-in-at-the-airport',
        token,
      }),
    );
    const question = track.questions[0];
    if (!question) throw new Error('bài nghe không có câu hỏi');

    const response = await request({
      method: 'POST',
      url: '/api/v1/listening/tracks/checking-in-at-the-airport/submit',
      token,
      body: {
        answers: [
          {
            exerciseId: question.id,
            answer: await correctAnswerFor(question.id),
            timeSpentMs: 6000,
          },
        ],
      },
    });
    expect(response.statusCode).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: LEARNER.email } });
    const attempt = await prisma.exerciseAttempt.findFirstOrThrow({
      where: { userId: user.id, exerciseId: question.id },
    });
    expect((attempt.userAnswer as Record<string, unknown>)['playbackRate']).toBe(1);
  });

  it('awards listening XP and measures the listening skill', async () => {
    const track = data<ListeningDetail>(
      await request({
        method: 'GET',
        url: '/api/v1/listening/tracks/campus-radio-on-recycling',
        token,
      }),
    );

    const answers = [];
    for (const question of track.questions) {
      answers.push({
        exerciseId: question.id,
        answer: await correctAnswerFor(question.id),
        timeSpentMs: 7000,
      });
    }

    const result = data<ListeningResult>(
      await request({
        method: 'POST',
        url: '/api/v1/listening/tracks/campus-radio-on-recycling/submit',
        token,
        body: { answers, playback: { playbackRate: 1, replays: 0, transcriptShown: false } },
      }),
    );
    expect(result.accuracy).toBe(1);
    expect(result.reward.xpEarned).toBeGreaterThan(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: LEARNER.email } });
    const score = await prisma.skillScore.findFirstOrThrow({
      where: { userId: user.id, skill: 'LISTENING' },
    });
    expect(score.score).toBeGreaterThan(0);
  });
});
