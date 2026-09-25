'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { loginSchema } from '@sprout/shared';
import type { LoginInput } from '@sprout/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError, api, API_URL } from '@/lib/api-client';
import { useSessionStarter } from '@/components/auth-provider';

interface LoginResponse {
  accessToken: string;
  user: { onboarded: boolean };
}

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const startSession = useSessionStarter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await api.post<LoginResponse>('/auth/login', values, {
        retryOnUnauthorized: false,
      });
      await startSession(result.accessToken);
      router.replace(result.user.onboarded ? '/dashboard' : '/welcome');
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : t('errors.UNKNOWN'),
      );
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[24px]">{t('auth.loginTitle')}</CardTitle>
        <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            label={t('auth.email')}
            type="email"
            autoComplete="email"
            autoFocus
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label={t('auth.password')}
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          {formError ? (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-[var(--r-md)] bg-[var(--danger-soft)] px-3 py-2 text-[14px] text-[var(--danger)]"
            >
              <span aria-hidden="true">✗</span>
              {formError}
            </p>
          ) : null}

          <Button type="submit" block disabled={!API_URL} loading={isSubmitting} loadingLabel={t('auth.submitting')}>
            {t('auth.login')}
          </Button>
        </form>

        {process.env.NEXT_PUBLIC_GOOGLE_LOGIN !== 'false' && <>
        <div className="my-5 flex items-center gap-3 text-[12px] text-[var(--text-subtle)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          {t('auth.orContinueWith')}
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <a href={API_URL ? `${API_URL}/auth/google` : undefined} aria-disabled={!API_URL} className="block">
          <Button variant="secondary" block type="button" disabled={!API_URL}>
            {t('auth.google')}
          </Button>
        </a>
        </>}

        <p className="mt-5 text-center text-[14px] text-[var(--text-muted)]">
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="font-medium text-[var(--primary)] underline">
            {t('auth.register')}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
