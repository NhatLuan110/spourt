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

const CREDENTIALS = {
  email: 'test-learner@sprout.local',
  password: 'hocTiengAnh2026',
  displayName: 'Người học thử',
  timezone: 'Asia/Ho_Chi_Minh',
};

async function request(options: {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  token?: string;
  cookie?: string;
}) {
  return app.inject({
    method: options.method,
    url: options.url,
    payload: options.body as never,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
  });
}

function refreshCookieFrom(response: { cookies: { name: string; value: string }[] }): string {
  const cookie = response.cookies.find((entry) => entry.name === 'sprout_rt');
  return cookie ? `sprout_rt=${cookie.value}` : '';
}

beforeAll(async () => {
  ensureJwtKeys();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // Rate limiting is exercised separately; a suite that registers dozens of
    // users would otherwise trip the 5-per-minute limit on /auth/register.
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
  // Deleting the user cascades to sessions, profile, settings and progress.
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'sprout.local' } } });
  await app.close();
});

describe('health', () => {
  it('reports liveness without a token', async () => {
    const response = await request({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('reports readiness including the database check', async () => {
    const response = await request({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ready', checks: { database: true } });
  });
});

describe('registration', () => {
  it('creates the user with profile, settings and progress rows', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.user).toMatchObject({ email: CREDENTIALS.email, onboarded: false });

    const stored = await prisma.user.findUnique({
      where: { email: CREDENTIALS.email },
      include: { profile: true, settings: true, progress: true },
    });
    expect(stored?.profile?.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(stored?.settings?.dayRolloverHour).toBe(4);
    expect(stored?.progress?.streakFreezes).toBe(2);
    // The password is never stored in the clear.
    expect(stored?.passwordHash).not.toContain(CREDENTIALS.password);
    expect(stored?.passwordHash?.startsWith('$argon2id$')).toBe(true);
  });

  it('sets an httpOnly refresh cookie', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const cookie = response.cookies.find((entry) => entry.name === 'sprout_rt');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    expect(cookie?.path).toBe('/');
  });

  it('rejects a duplicate email', async () => {
    await request({ method: 'POST', url: '/api/v1/auth/register', body: CREDENTIALS });
    const second = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });

    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('reports every invalid field at once', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: { email: 'not-an-email', password: 'short', displayName: 'A' },
    });

    expect(response.statusCode).toBe(422);
    const { error } = response.json();
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details.map((issue: { path: string }) => issue.path).sort()).toEqual([
      'displayName',
      'email',
      'password',
    ]);
  });
});

describe('login', () => {
  beforeEach(async () => {
    await request({ method: 'POST', url: '/api/v1/auth/register', body: CREDENTIALS });
  });

  it('returns an access token for the right password', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.accessToken).toBeTruthy();
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request({
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: CREDENTIALS.email, password: 'definitely-wrong' },
    });
    const unknownEmail = await request({
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'nobody@sprout.local', password: 'definitely-wrong' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().error).toEqual(unknownEmail.json().error);
  });
});

describe('protected routes', () => {
  it('rejects a request with no token', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed token', async () => {
    const response = await request({ method: 'GET', url: '/api/v1/me', token: 'not.a.jwt' });
    expect(response.statusCode).toBe(401);
  });

  it('returns the full profile for a valid token', async () => {
    const registered = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const token = registered.json().data.accessToken;

    const response = await request({ method: 'GET', url: '/api/v1/me', token });
    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.email).toBe(CREDENTIALS.email);
    expect(data.profile.displayName).toBe(CREDENTIALS.displayName);
    expect(data.settings.dailyGoalMinutes).toBe(15);
    expect(data.progress.level).toBe(1);
  });
});

describe('onboarding', () => {
  it('stores goals and derives the daily targets from the chosen minutes', async () => {
    const registered = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const token = registered.json().data.accessToken;

    const response = await request({
      method: 'POST',
      url: '/api/v1/me/onboarding',
      token,
      body: {
        goals: ['work-communication', 'travel'],
        dailyGoalMinutes: 30,
        selfAssessedLevel: 'B1',
        takePlacementTest: false,
      },
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.settings.learningGoals).toEqual(['work-communication', 'travel']);
    expect(data.settings.dailyGoalXp).toBe(60);
    expect(data.settings.newWordsPerDay).toBe(25);
    expect(data.settings.maxReviewsPerDay).toBe(200);
    expect(data.profile.currentLevel).toBe('B1');
    expect(data.onboardedAt).not.toBeNull();
  });

  it('leaves onboarding open when the learner takes the placement test', async () => {
    const registered = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const token = registered.json().data.accessToken;

    const response = await request({
      method: 'POST',
      url: '/api/v1/me/onboarding',
      token,
      body: {
        goals: ['ielts'],
        dailyGoalMinutes: 15,
        selfAssessedLevel: null,
        takePlacementTest: true,
      },
    });

    expect(response.json().data.onboardedAt).toBeNull();
  });
});

describe('settings', () => {
  it('patches one field without touching the others', async () => {
    const registered = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const token = registered.json().data.accessToken;

    const response = await request({
      method: 'PATCH',
      url: '/api/v1/me/settings',
      token,
      body: { showIpa: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.settings.showIpa).toBe(false);
    expect(response.json().data.settings.autoPlayAudio).toBe(true);
  });

  it('rejects a value outside the allowed range', async () => {
    const registered = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const token = registered.json().data.accessToken;

    const response = await request({
      method: 'PATCH',
      url: '/api/v1/me/settings',
      token,
      body: { dayRolloverHour: 42 },
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('refresh token rotation', () => {
  it('rotates the token and keeps the session alive', async () => {
    const registered = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const firstCookie = refreshCookieFrom(registered);

    const refreshed = await request({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookie: firstCookie,
    });

    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().data.accessToken).toBeTruthy();
    expect(refreshCookieFrom(refreshed)).not.toBe(firstCookie);
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const registered = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const original = refreshCookieFrom(registered);

    const rotated = await request({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookie: original,
    });
    const successor = refreshCookieFrom(rotated);

    const replay = await request({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookie: original,
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('REFRESH_TOKEN_REUSED');

    // The successor must die with the rest of the family.
    const afterBreach = await request({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookie: successor,
    });
    expect(afterBreach.statusCode).toBe(401);
  });

  it('rejects a refresh with no cookie at all', async () => {
    const response = await request({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(response.statusCode).toBe(401);
  });

  it('stops accepting the token after logout', async () => {
    const registered = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const cookie = refreshCookieFrom(registered);

    await request({ method: 'POST', url: '/api/v1/auth/logout', cookie });
    const afterLogout = await request({ method: 'POST', url: '/api/v1/auth/refresh', cookie });
    expect(afterLogout.statusCode).toBe(401);
  });
});

describe('account deletion', () => {
  it('soft deletes and blocks further sign in', async () => {
    const registered = await request({
      method: 'POST',
      url: '/api/v1/auth/register',
      body: CREDENTIALS,
    });
    const token = registered.json().data.accessToken;

    const deleted = await request({ method: 'DELETE', url: '/api/v1/me', token });
    expect(deleted.statusCode).toBe(200);

    const signIn = await request({
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });
    expect(signIn.statusCode).toBe(401);
  });
});
