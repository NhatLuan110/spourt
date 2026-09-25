import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '@app/app.module';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AllExceptionsFilter } from '@app/common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from '@app/common/interceptors/envelope.interceptor';
import { ensureJwtKeys } from '@app/infra/config/keys';

export interface TestHarness {
  app: NestFastifyApplication;
  prisma: PrismaService;
}

/**
 * §11 — the suites drive the real HTTP stack through Fastify's `inject`, so
 * guards, filters, interceptors and Zod pipes all run exactly as in production.
 * Rate limiting is the one thing replaced: a suite that registers dozens of
 * accounts would otherwise trip the per-minute limit and fail with a
 * misleading 401. It has its own test in auth.spec.
 */
export async function createTestApp(): Promise<TestHarness> {
  ensureJwtKeys();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ bodyLimit: 4 * 1024 * 1024 }));
  await app.register(fastifyCookie, { secret: 'test-cookie-secret-value' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app, prisma: app.get(PrismaService) };
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  token?: string;
  cookie?: string;
}

export function requester(app: NestFastifyApplication) {
  return (options: RequestOptions) =>
    app.inject({
      method: options.method,
      url: options.url,
      payload: options.body as never,
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
    });
}

/** Unwrap the §6.1 envelope in tests without repeating the cast everywhere. */
export function data<T>(response: { json: () => unknown }): T {
  return (response.json() as { data: T }).data;
}

export function meta<T>(response: { json: () => unknown }): T {
  return (response.json() as { meta: T }).meta;
}
