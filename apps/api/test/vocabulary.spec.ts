import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '@app/app.module';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AllExceptionsFilter } from '@app/common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from '@app/common/interceptors/envelope.interceptor';
import { ensureJwtKeys } from '@app/infra/config/keys';

let app: NestFastifyApplication;
let prisma: PrismaService;
let token: string;

const LEARNER = {
  email: 'vocab-learner@sprout.local',
  password: 'hocTuVung2026',
  displayName: 'Học viên từ vựng',
  timezone: 'Asia/Ho_Chi_Minh',
};

async function request(options: {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  token?: string;
}) {
  return app.inject({
    method: options.method,
    url: options.url,
    payload: options.body as never,
    headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
  });
}

async function signIn(): Promise<string> {
  const response = await request({
    method: 'POST',
    url: '/api/v1/auth/register',
    body: LEARNER,
  });
  const body = response.json() as { data: { accessToken: string } };

  await request({
    method: 'POST',
    url: '/api/v1/me/onboarding',
    token: body.data.accessToken,
    body: {
      goals: ['ielts'],
      dailyGoalMinutes: 30,
      selfAssessedLevel: 'B1',
      takePlacementTest: false,
    },
  });

  return body.data.accessToken;
}

beforeAll(async () => {
  ensureJwtKeys();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(fastifyCookie, { secret: 'test-cookie-secret-value' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });
  token = await signIn();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });
  await app.close();
});

describe('topics and dictionary', () => {
  it('lists the topics and everyday collection with per-learner progress', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/topics', token });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { data: { slug: string; wordCount: number }[] };
    expect(body.data).toHaveLength(9);
    expect(body.data.map((topic) => topic.slug)).toContain('environment');
    expect(body.data.every((topic) => topic.wordCount === (topic.slug === 'everyday-communication' ? 2000 : 100))).toBe(true);
  });

  it('refuses an unknown topic with NOT_FOUND rather than an empty page', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/topics/khong-co', token });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('keeps a shared word in both of its original topics', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/words/refund', token });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { topics: { slug: string }[] } };
    expect(body.data.topics.map((topic) => topic.slug)).toEqual(
      expect.arrayContaining(['daily-life', 'travel']),
    );
  });

  it('divides the communication collection into twenty complete learning groups', async () => {
    const response = await request({
      method: 'GET', url: '/api/v1/topics/everyday-communication', token,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: { wordCount: number; subtopics: { slug: string; wordCount: number }[] };
    };
    expect(body.data.wordCount).toBe(2000);
    expect(body.data.subtopics).toHaveLength(20);
    expect(body.data.subtopics.every((group) => group.wordCount === 100)).toBe(true);
    const group = body.data.subtopics[0]!;
    const words = await request({
      method: 'GET', url: `/api/v1/topics/${group.slug}/words?limit=5&page=1`, token,
    });
    expect(words.statusCode).toBe(200);
    expect(words.json()).toMatchObject({ meta: { total: 100, hasMore: true } });
  });

  it('paginates a topic word list and reports the total', async () => {
    const response = await request({
      method: 'GET',
      url: '/api/v1/topics/environment/words?limit=5&page=1',
      token,
    });

    const body = response.json() as {
      data: unknown[];
      meta: { total: number; hasMore: boolean; page: number };
    };
    expect(body.data).toHaveLength(5);
    expect(body.meta.total).toBeGreaterThanOrEqual(20);
    expect(body.meta.hasMore).toBe(true);
  });

  it('searches by Vietnamese meaning as well as by lemma', async () => {
    const byLemma = await request({
      method: 'GET',
      url: '/api/v1/words?search=pollution',
      token,
    });
    const byMeaning = await request({
      method: 'GET',
      url: '/api/v1/words?search=%C3%B4%20nhi%E1%BB%85m',
      token,
    });

    expect((byLemma.json() as { data: unknown[] }).data.length).toBeGreaterThan(0);
    expect((byMeaning.json() as { data: unknown[] }).data.length).toBeGreaterThan(0);
  });

  it('returns a full dictionary entry with senses, examples and highlights', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/words/pollution', token });
    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      data: {
        lemma: string;
        ipaUs: string | null;
        senses: {
          posLabelVi: string;
          examples: { textEn: string; highlightStart: number; highlightEnd: number }[];
        }[];
        userWord: unknown;
      };
    };

    expect(body.data.lemma).toBe('pollution');
    expect(body.data.ipaUs).toBeTruthy();
    expect(body.data.senses[0]?.posLabelVi).toBe('danh từ');

    const example = body.data.senses[0]?.examples[0];
    expect(example).toBeDefined();
    // §12.1 — the offsets must actually point at the word, not at zero.
    expect(example!.highlightEnd).toBeGreaterThan(example!.highlightStart);
    expect(example!.textEn.slice(example!.highlightStart, example!.highlightEnd).toLowerCase()).toContain(
      'pollut',
    );

    expect(body.data.userWord).toBeNull();
  });
});
