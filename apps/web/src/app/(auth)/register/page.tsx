'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { registerSchema } from '@sprout/shared';
import type { RegisterInput } from '@sprout/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError, api, API_URL } from '@/lib/api-client';
import { useSessionStarter } from '@/components/auth-provider';

interface RegisterResponse {
  accessToken: string;
}

export default function RegisterPage() {
  const t = useTranslations();
  const router = useRouter();
  const startSession = useSessionStarter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      // The learner timezone decides when their day rolls over (§9.4).
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await api.post<RegisterResponse>('/auth/register', values, {
        retryOnUnauthorized: false,
      });
      await startSession(result.accessToken);
      router.replace('/welcome');
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('errors.UNKNOWN'));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[24px]">{t('auth.registerTitle')}</CardTitle>
        <CardDescription>{t('auth.registerSubtitle')}</CardDescription>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            label={t('auth.displayName')}
            autoComplete="nickname"
            autoFocus
            error={errors.displayName?.message}
            {...register('displayName')}
          />
          <Input
            label={t('auth.email')}
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label={t('auth.password')}
            type="password"
            autoComplete="new-password"
            hint={t('auth.passwordHint')}
            error={errors.password?.message}
            {...register('password')}
          />
          <input type="hidden" {...register('timezone')} />

          {formError ? (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-[var(--r-md)] bg-[var(--danger-soft)] px-3 py-2 text-[14px] text-[var(--danger)]"
            >
              <span aria-hidden="true">✗</span>
              {formError}
            </p>
          ) : null}

          <Button type="submit" block loading={isSubmitting} loadingLabel={t('auth.submitting')}>
            {t('auth.register')}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[12px] text-[var(--text-subtle)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          {t('auth.orContinueWith')}
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <a href={`${API_URL}/auth/google`} className="block">
          <Button variant="secondary" block type="button">
            {t('auth.google')}
          </Button>
        </a>

        <p className="mt-5 text-center text-[14px] text-[var(--text-muted)]">
          {t('auth.hasAccount')}{' '}
          <Link href="/login" className="font-medium text-[var(--primary)] underline">
            {t('auth.login')}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
