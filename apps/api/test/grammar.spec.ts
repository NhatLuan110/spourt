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
  email: 'grammar-learner@sprout.local',
  password: 'nguPhap2026',
  displayName: 'Người học ngữ pháp',
  timezone: 'Asia/Ho_Chi_Minh',
};

interface Option {
  id: string;
  text: string;
}

interface Exercise {
  id: string;
  mode: string;
  prompt: string;
  options?: Option[];
  chunks?: Option[];
  statement?: string;
}

interface LessonCard {
  slug: string;
  titleVi: string;
  cefr: string;
  exerciseCount: number;
  status: string;
  progressPct: number;
  lock: { locked: boolean; requires: { slug: string }[] };
}

interface LessonDetail extends LessonCard {
  sections: { id: string; kind: string; title: string; bodyMdx: string }[];
  exercises: Exercise[];
}

interface Feedback {
  exerciseId: string;
  isCorrect: boolean;
  score: number;
  correctAnswer: string;
  explanationVi: string;
}

interface Result {
  correctCount: number;
  total: number;
  accuracy: number;
  feedback: Feedback[];
  reward: { xpEarned: number };
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

async function detail(slug: string): Promise<LessonDetail> {
  const response = await request({ method: 'GET', url: `/api/v1/grammar/lessons/${slug}`, token });
  expect(response.statusCode).toBe(200);
  return data<LessonDetail>(response);
}

/** Answers every exercise correctly by reading the seeded content directly. */
async function correctAnswerFor(exercise: Exercise): Promise<string> {
  const row = await prisma.exercise.findUniqueOrThrow({ where: { id: exercise.id } });
  const stored = row.answer as Record<string, unknown>;
  if (typeof stored['optionId'] === 'string') return stored['optionId'];
  if (typeof stored['value'] === 'boolean') return String(stored['value']);
  if (Array.isArray(stored['order'])) return JSON.stringify(stored['order']);
  if (Array.isArray(stored['accept'])) return String(stored['accept'][0]);
  if (typeof stored['text'] === 'string') return stored['text'];
  throw new Error(`Không biết cách trả lời ${exercise.id}`);
}

describe('grammar lessons', () => {
  it('lists the seeded lessons in level order', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/grammar/lessons', token });
    expect(response.statusCode).toBe(200);
    const lessons = data<LessonCard[]>(response);

    expect(lessons.length).toBeGreaterThanOrEqual(12);
    expect(lessons[0]?.cefr).toBe('A1');
    expect(lessons.every((lesson) => lesson.exerciseCount > 0)).toBe(true);
    expect(lessons.every((lesson) => lesson.status === 'not_started')).toBe(true);
  });

  it('filters by level', async () => {
    const response = await request({
      method: 'GET',
      url: '/api/v1/grammar/lessons?cefr=B1',
      token,
    });
    const lessons = data<LessonCard[]>(response);
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((lesson) => lesson.cefr === 'B1')).toBe(true);
  });

  it('returns a lesson with its four kinds of section', async () => {
    const lesson = await detail('present-simple');
    const kinds = lesson.sections.map((section) => section.kind);
    expect(kinds).toEqual(['theory', 'examples', 'tips', 'common-mistakes']);
    expect(lesson.sections.every((section) => section.bodyMdx.length > 40)).toBe(true);
    expect(lesson.exercises.length).toBeGreaterThanOrEqual(5);
  });

  it('never sends the answer to the client', async () => {
    const response = await request({
      method: 'GET',
      url: '/api/v1/grammar/lessons/present-simple',
      token,
    });
    const raw = response.body;
    expect(raw).not.toContain('"answer"');
    expect(raw).not.toContain('optionId');
    expect(raw).not.toContain('"accept"');
  });

  it('locks a lesson whose prerequisite is unfinished, and says which one', async () => {
    const lessons = data<LessonCard[]>(
      await request({ method: 'GET', url: '/api/v1/grammar/lessons', token }),
    );
    const gated = lessons.find((lesson) => lesson.slug === 'there-is-there-are');
    expect(gated?.lock.locked).toBe(true);
    expect(gated?.lock.requires.map((item) => item.slug)).toContain('present-simple');

    const refused = await request({
      method: 'POST',
      url: '/api/v1/grammar/lessons/there-is-there-are/start',
      token,
    });
    expect(refused.statusCode).toBe(403);
  });

  it('unlocks the next lesson once the prerequisite is completed', async () => {
    const lesson = await detail('present-simple');
    const answers = [];
    for (const exercise of lesson.exercises) {
      answers.push({
        exerciseId: exercise.id,
        answer: await correctAnswerFor(exercise),
        timeSpentMs: 4000,
      });
    }

    const submitted = await request({
      method: 'POST',
      url: '/api/v1/grammar/lessons/present-simple/submit',
      token,
      body: { answers },
    });
    expect(submitted.statusCode).toBe(200);
    expect(data<Result>(submitted).accuracy).toBe(1);

    const lessons = data<LessonCard[]>(
      await request({ method: 'GET', url: '/api/v1/grammar/lessons', token }),
    );
    expect(lessons.find((item) => item.slug === 'present-simple')?.status).toBe('completed');
    expect(lessons.find((item) => item.slug === 'there-is-there-are')?.lock.locked).toBe(false);
  });
});

describe('grading and progress', () => {
  it('explains every answer, right or wrong', async () => {
    const lesson = await detail('articles-a-an-the');
    const first = lesson.exercises[0];
    if (!first) throw new Error('bài học không có bài tập');

    const result = data<Result>(
      await request({
        method: 'POST',
        url: '/api/v1/grammar/lessons/articles-a-an-the/submit',
        token,
        body: {
          answers: [{ exerciseId: first.id, answer: 'chắc chắn sai', timeSpentMs: 3000 }],
        },
      }),
    );

    expect(result.total).toBe(1);
    expect(result.correctCount).toBe(0);
    expect(result.feedback[0]?.explanationVi.length).toBeGreaterThan(20);
    expect(result.feedback[0]?.correctAnswer.length).toBeGreaterThan(0);
  });

  it('gives partial credit for a nearly correct reorder', async () => {
    const lesson = await detail('present-simple');
    const reorder = lesson.exercises.find((exercise) => exercise.mode === 'reorder');
    if (!reorder?.chunks) throw new Error('không có bài sắp xếp câu');

    const row = await prisma.exercise.findUniqueOrThrow({ where: { id: reorder.id } });
    const order = (row.answer as { order: string[] }).order;
    const swapped = [order[1], order[0], ...order.slice(2)];

    const result = data<Result>(
      await request({
        method: 'POST',
        url: '/api/v1/grammar/lessons/present-simple/submit',
        token,
        body: {
          answers: [
            { exerciseId: reorder.id, answer: JSON.stringify(swapped), timeSpentMs: 8000 },
          ],
        },
      }),
    );

    const feedback = result.feedback[0];
    expect(feedback?.isCorrect).toBe(false);
    expect(feedback?.score).toBeGreaterThan(0.5);
    expect(feedback?.score).toBeLessThan(1);
    expect(feedback?.correctAnswer).toContain('My father');
  });

  it('forgives a typo in a short answer', async () => {
    const lesson = await detail('present-simple');
    const short = lesson.exercises.find((exercise) => exercise.mode === 'short-answer');
    if (!short) throw new Error('không có bài trả lời ngắn');

    const row = await prisma.exercise.findUniqueOrThrow({ where: { id: short.id } });
    const accepted = (row.answer as { accept: string[] }).accept[0] ?? '';
    const withTypo = accepted.replace('work', 'wrok');
    expect(withTypo).not.toBe(accepted);

    const result = data<Result>(
      await request({
        method: 'POST',
        url: '/api/v1/grammar/lessons/present-simple/submit',
        token,
        body: { answers: [{ exerciseId: short.id, answer: withTypo, timeSpentMs: 9000 }] },
      }),
    );

    expect(result.feedback[0]?.isCorrect).toBe(true);
  });

  it('records a mistake for every wrong answer', async () => {
    // comparatives-superlatives has no prerequisite, so it can be submitted by
    // a learner who has completed nothing yet.
    const lesson = await detail('comparatives-superlatives');
    const target = lesson.exercises[0];
    if (!target) throw new Error('bài học không có bài tập');

    const submitted = await request({
      method: 'POST',
      url: '/api/v1/grammar/lessons/comparatives-superlatives/submit',
      token,
      body: { answers: [{ exerciseId: target.id, answer: 'sai hoàn toàn', timeSpentMs: 2000 }] },
    });
    expect(submitted.statusCode).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: LEARNER.email } });
    const mistakes = await prisma.mistakeLog.findMany({ where: { userId: user.id } });
    expect(mistakes.length).toBe(1);
    expect(mistakes[0]?.skill).toBe('GRAMMAR');
    expect(mistakes[0]?.sourceType).toBe('grammar-lesson');
  });

  it('refuses answers that belong to a different lesson', async () => {
    const other = await detail('articles-a-an-the');
    const foreign = other.exercises[0];
    if (!foreign) throw new Error('bài học không có bài tập');

    const response = await request({
      method: 'POST',
      url: '/api/v1/grammar/lessons/present-simple/submit',
      token,
      body: { answers: [{ exerciseId: foreign.id, answer: 'x', timeSpentMs: 1000 }] },
    });
    expect(response.statusCode).toBe(404);
  });

  it('marks a section read and remembers where the learner stopped', async () => {
    const lesson = await detail('present-simple');
    const second = lesson.sections[1];
    if (!second) throw new Error('bài học không đủ phần');

    const response = await request({
      method: 'POST',
      url: '/api/v1/grammar/lessons/present-simple/sections',
      token,
      body: { sectionId: second.id },
    });
    expect(response.statusCode).toBe(200);

    const card = data<LessonCard>(response);
    expect(card.status).toBe('in_progress');
    // Two of four sections read is half of the reading half of the lesson.
    expect(card.progressPct).toBe(25);
  });

  it('awards XP once per submission and closes the session', async () => {
    const started = data<{ sessionId: string }>(
      await request({ method: 'POST', url: '/api/v1/grammar/lessons/present-simple/start', token }),
    );
    const lesson = await detail('present-simple');
    const first = lesson.exercises[0];
    if (!first) throw new Error('bài học không có bài tập');

    const result = data<Result>(
      await request({
        method: 'POST',
        url: '/api/v1/grammar/lessons/present-simple/submit',
        token,
        body: {
          sessionId: started.sessionId,
          answers: [
            { exerciseId: first.id, answer: await correctAnswerFor(first), timeSpentMs: 5000 },
          ],
        },
      }),
    );
    expect(result.reward.xpEarned).toBeGreaterThan(0);

    const session = await prisma.studySession.findUniqueOrThrow({
      where: { id: started.sessionId },
    });
    expect(session.endedAt).not.toBeNull();
    expect(session.skill).toBe('GRAMMAR');

    const replay = await request({
      method: 'POST',
      url: '/api/v1/grammar/lessons/present-simple/submit',
      token,
      body: {
        sessionId: started.sessionId,
        answers: [{ exerciseId: first.id, answer: 'x', timeSpentMs: 1000 }],
      },
    });
    expect(replay.statusCode).toBe(409);
  });
});
