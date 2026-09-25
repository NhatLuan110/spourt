import { afterEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AuthController } from '@app/modules/auth/auth.controller';
import { AuthService } from '@app/modules/auth/auth.service';
import { GoogleOAuthService } from '@app/modules/auth/google-oauth.service';
import { validateEnv } from '@app/infra/config/env';

let app: NestFastifyApplication | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

async function setup(crossSite = true) {
  const auth = {
    login: vi.fn().mockResolvedValue({ accessToken: 'test-access', refreshToken: 'test-refresh', refreshExpiresAt: new Date(Date.now() + 60_000), expiresIn: 900, user: { id: 'test' } }),
    register: vi.fn(), refresh: vi.fn(), logout: vi.fn().mockResolvedValue(undefined),
  };
  auth.refresh.mockImplementation(auth.login);
  auth.register.mockImplementation(auth.login);
  const env: Record<string, unknown> = { COOKIE_CROSS_SITE: crossSite, NODE_ENV: 'production', WEB_ORIGIN: 'https://nhatluan110.github.io/spourt/' };
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: GoogleOAuthService, useValue: {} },
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
    ],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(fastifyCookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { auth, inject: app.inject.bind(app) };
}

describe('cross-site authentication for GitHub Pages', () => {
  it('issues, rotates and clears a secure partitioned cookie', async () => {
    const { inject, auth } = await setup();
    const headers = { origin: 'https://nhatluan110.github.io' };
    const login = await inject({ method: 'POST', url: '/auth/login', headers, payload: { email: 'learner@example.test', password: 'test-password-123' } });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=None', 'Partitioned', 'Path=/']) expect(cookie).toContain(attribute);
    const refresh = await inject({ method: 'POST', url: '/auth/refresh', headers: { ...headers, cookie: 'sprout_rt=test-refresh' } });
    expect(refresh.statusCode).toBe(200);
    expect(auth.refresh).toHaveBeenCalledWith('test-refresh', expect.any(Object));
    expect(String(refresh.headers['set-cookie'])).toContain('Partitioned');
    const logout = await inject({ method: 'POST', url: '/auth/logout', headers: { ...headers, cookie: 'sprout_rt=test-refresh' } });
    expect(logout.statusCode).toBe(200);
    const cleared = String(logout.headers['set-cookie']);
    expect(cleared).toContain('Partitioned');
    expect(cleared).toContain('SameSite=None');
    expect(cleared).toContain('Max-Age=0');
  });

  it.each([undefined, 'null', 'https://attacker.example', 'https://nhatluan110.github.io.attacker.example'])('rejects unsafe origin %s before modifying a session', async (origin) => {
    const { inject, auth } = await setup();
    for (const path of ['refresh', 'logout']) {
      const response = await inject({ method: 'POST', url: `/auth/${path}`, headers: { ...(origin ? { origin } : {}), cookie: 'sprout_rt=test-refresh' } });
      expect(response.statusCode).toBe(403);
    }
    const login = await inject({ method: 'POST', url: '/auth/login', headers: origin ? { origin } : {}, payload: { email: 'learner@example.test', password: 'test-password-123' } });
    expect(login.statusCode).toBe(403);
    expect(auth.login).not.toHaveBeenCalled();
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('preserves lax cookies for existing same-origin deployments', async () => {
    const { inject } = await setup(false);
    const response = await inject({ method: 'POST', url: '/auth/login', payload: { email: 'learner@example.test', password: 'test-password-123' } });
    expect(response.statusCode).toBe(200);
    expect(String(response.headers['set-cookie'])).toContain('SameSite=Lax');
    expect(String(response.headers['set-cookie'])).not.toContain('Partitioned');
  });

  it('requires explicit opt-in in environment configuration', () => {
    expect(validateEnv({ DATABASE_URL: 'postgresql://unused/unused' }).COOKIE_CROSS_SITE).toBe(false);
    expect(validateEnv({ DATABASE_URL: 'postgresql://unused/unused', COOKIE_CROSS_SITE: 'false' }).COOKIE_CROSS_SITE).toBe(false);
    expect(validateEnv({ DATABASE_URL: 'postgresql://unused/unused', COOKIE_CROSS_SITE: 'true' }).COOKIE_CROSS_SITE).toBe(true);
  });
});
