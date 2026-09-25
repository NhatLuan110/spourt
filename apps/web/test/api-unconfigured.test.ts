import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it('does not send credentials or API requests to GitHub when the backend is missing', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', '');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { restoreSession, api } = await import('../src/lib/api-client');
  expect(await restoreSession()).toBe(false);
  await expect(api.post('/auth/login', { email: 'learner@example.test', password: 'test' }))
    .rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 });
  expect(fetch).not.toHaveBeenCalled();
});
