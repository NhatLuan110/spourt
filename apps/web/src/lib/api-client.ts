import type { ApiErrorBody } from '@sprout/shared';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:4000/api/v1');

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenListener = (token: string | null) => void;

/**
 * The access token lives in memory only. The refresh token is an httpOnly
 * cookie the browser sends on its own, so a script that reads localStorage
 * cannot steal a session (§11).
 */
let accessToken: string | null = null;
const listeners = new Set<TokenListener>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onAccessTokenChange(listener: TokenListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set false for the auth endpoints so a failed refresh cannot loop. */
  retryOnUnauthorized?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!API_URL) return false;
  // Concurrent 401s share one refresh call, otherwise they rotate each other out.
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        setAccessToken(null);
        return false;
      }
      const payload = (await response.json()) as { data: { accessToken: string } };
      setAccessToken(payload.data.accessToken);
      return true;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function apiRaw<T>(path: string, options: RequestOptions = {}): Promise<{ data: T } & Record<string, unknown>> {
  if (!API_URL) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Dịch vụ đang được kết nối. Vui lòng quay lại sau.', 503);
  }
  const { body, retryOnUnauthorized = true, headers, ...rest } = options;

  const send = async (): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let response: Response;
  try {
    response = await send();
  } catch {
    throw new ApiError('NETWORK', 'Không kết nối được máy chủ.', 0);
  }

  if (response.status === 401 && retryOnUnauthorized) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await send();
  }

  if (response.status === 204) return { data: undefined as T };

  const payload = (await response.json().catch(() => null)) as
    | ({ data: T } & Record<string, unknown>)
    | ApiErrorBody
    | null;

  if (!response.ok || payload === null || 'error' in (payload ?? {})) {
    const error = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Có lỗi xảy ra, vui lòng thử lại.',
      response.status,
      error?.details,
    );
  }

  return payload as { data: T } & Record<string, unknown>;
}


/** The common case: give me the payload, not the envelope. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await apiRaw<T>(path, options)).data;
}

/**
 * §6.1 — list endpoints answer with { data, meta }. Paginated screens need the
 * meta as well as the rows.
 */
export async function apiFetchWithMeta<T, M = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: M }> {
  const payload = await apiRaw<T>(path, options);
  return { data: payload.data, meta: payload.meta as M };
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  getWithMeta: <T, M = unknown>(path: string, options?: RequestOptions) =>
    apiFetchWithMeta<T, M>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

/** Called once when the app mounts, to pick up an existing refresh cookie. */
export async function restoreSession(): Promise<boolean> {
  return refreshAccessToken();
}
