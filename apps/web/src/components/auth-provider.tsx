'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeResponse } from '@sprout/shared';
import {
  api,
  getAccessToken,
  onAccessTokenChange,
  restoreSession,
  setAccessToken,
} from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface AuthContextValue {
  user: MeResponse | null;
  /** True until the refresh cookie has been checked once. */
  initialising: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [initialising, setInitialising] = useState(true);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    // Any part of the app that stores a token — a login call, a silent refresh
    // after a 401 — flows through here, so the /me query enables itself.
    const unsubscribe = onAccessTokenChange((token) => setHasToken(token !== null));

    let cancelled = false;
    // A page load has no access token in memory, but the browser still holds
    // the refresh cookie, so one silent refresh restores the session.
    void restoreSession().then((ok) => {
      if (cancelled) return;
      setHasToken(ok && getAccessToken() !== null);
      setInitialising(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const { data: user } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<MeResponse>('/me'),
    enabled: hasToken,
    staleTime: 60_000,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: user ?? null,
      initialising,
      isAuthenticated: hasToken && user !== undefined,
      signOut: async () => {
        await api.post('/auth/logout').catch(() => undefined);
        setAccessToken(null);
        setHasToken(false);
        queryClient.clear();
      },
      refresh: async () => {
        const ok = await restoreSession();
        setHasToken(ok);
        await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      },
    }),
    [user, initialising, hasToken, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** Marks the session as live right after a login or registration call. */
export function useSessionStarter() {
  const queryClient = useQueryClient();
  return async (accessToken: string) => {
    setAccessToken(accessToken);
    // The /me query is still disabled until the token change re-renders the
    // provider, so invalidating it would resolve without fetching and the app
    // layout would see no user and bounce to /login. Load it explicitly.
    await queryClient.fetchQuery({
      queryKey: queryKeys.me,
      queryFn: () => api.get<MeResponse>('/me'),
      staleTime: 0,
    });
  };
}
