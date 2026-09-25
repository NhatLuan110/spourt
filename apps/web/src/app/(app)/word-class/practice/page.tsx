'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { WordFormSet } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { api, ApiError } from '@/lib/api-client';
import type { WordFormResult } from '@/lib/api-types';

export default function WordFormPracticePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[360px] w-full rounded-[var(--r-lg)]" />}>
      <WordFormSession />
    </Suspense>
  );
}

function WordFormSession() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const rootSlug = searchParams.get('family') ?? undefined;
  const queryClient = useQueryClient();

  const [set, setSet] = useState<WordFormSet | null>(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [answers, setAnswers] = useState<{ itemId: string; answer: string; timeSpentMs: number }[]>(
    [],
  );
  const [result, setResult] = useState<WordFormResult | null>(null);
  const shownAt = useRef(Date.now());

  const create = useMutation({
    mutationFn: () => {
      const query = new URLSearchParams({ count: '8' });
      if (rootSlug) query.set('rootSlug', rootSlug);
      return api.get<WordFormSet>(`/word-class/practice?${query.toString()}`);
    },
    onSuccess: (data) => {
      setSet(data);
      setIndex(0);
      setValue('');
      setAnswers([]);
      setResult(null);
      shownAt.current = Date.now();
    },
  });

  const submit = useMutation({
    mutationFn: (payload: {
      sessionId: string;
      answers: { itemId: string; answer: string; timeSpentMs: number }[];
    }) => api.post<WordFormResult>('/word-class/practice/submit', payload),
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  const start = create.mutate;
  useEffect(() => {
    start();
  }, [start, rootSlug]);

  if (create.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px] w-full rounded-[var(--r-lg)]" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (create.isError) {
    const empty = create.error instanceof ApiError && create.error.status === 404;
    return (
      <EmptyState
        title={empty ? t('wordClass.practice') : t('common.errorTitle')}
        body={empty ? 'Chưa có họ từ nào đủ ví dụ để luyện.' : t('common.errorBody')}
        action={
          <Link href="/word-class">
            <Button>{t('wordClass.title')}</Button>
          </Link>
        }
      />
    );
  }

  if (result) {
    return (
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5">
        <h1 className="text-[26px]">{t('practice.resultTitle')}</h1>
        <p className="text-[16px] text-[var(--text-muted)]">
          {t('practice.resultBody', {
            correct: result.correct,
            total: result.total,
            xp: result.xpEarned,
          })}
        </p>
        <ul className="flex flex-col gap-3">
          {result.results.map((item) => (
            <li key={item.itemId}>
              <Card className={item.isCorrect ? 'border-[var(--success)]' : 'border-[var(--danger)]'}>
                <CardBody className="flex flex-col gap-1.5 pt-4">
                  <Badge tone={item.isCorrect ? 'success' : 'danger'} className="self-start">
                    {item.isCorrect ? t('practice.correct') : t('practice.incorrect')}
                  </Badge>
                  {!item.isCorrect ? (
                    <p className="text-[14px]">
                      {t('practice.correctAnswer')}:{' '}
                      <strong className="text-[var(--success)]">{item.correctAnswer}</strong>
                    </p>
                  ) : null}
                  <p className="text-[14px] text-[var(--text-muted)]">{item.explanationVi}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => create.mutate()}>{t('practice.again')}</Button>
          <Link href="/word-class">
            <Button variant="secondary">{t('wordClass.title')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!set) return null;
  const item = set.items[index];
  if (!item) return null;
  const isLast = index >= set.items.length - 1;

  const record = () => {
    const draft = {
      itemId: item.id,
      answer: value.trim(),
      timeSpentMs: Math.min(600_000, Math.max(0, Date.now() - shownAt.current)),
    };
    const next = [...answers.filter((entry) => entry.itemId !== item.id), draft];
    setAnswers(next);
    setValue('');

    if (isLast) {
      submit.mutate({ sessionId: set.sessionId, answers: next });
      return;
    }
    setIndex(index + 1);
    shownAt.current = Date.now();
  };

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px]">{t('wordClass.practice')}</h1>
        <p className="text-[14px] text-[var(--text-muted)]">
          {t('practice.questionOf', { current: index + 1, total: set.items.length })}
        </p>
      </header>

      <Card>
        <CardBody className="flex flex-col gap-4 pt-6">
          <p className="text-[14px] text-[var(--text-muted)]">{t('wordClass.practiceHint')}</p>
          <p className="text-[20px] leading-relaxed">{item.prompt}</p>
          <p className="text-[14px] text-[var(--text-muted)]">{item.translation}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {t('wordClass.root')}: {item.baseLemma}
            </Badge>
            <Badge tone="primary">{item.targetPosLabelVi}</Badge>
          </div>

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              record();
            }}
          >
            <Input
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-label={t('practice.typeHere')}
              placeholder={t('practice.typeHere')}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            <Button block type="submit" loading={submit.isPending} disabled={value.trim() === ''}>
              {isLast ? t('practice.submit') : t('practice.next')}
            </Button>
          </form>
        </CardBody>
      </Card>

      {submit.isError ? (
        <p role="alert" className="text-[14px] text-[var(--danger)]">
          {submit.error instanceof Error ? submit.error.message : t('common.errorBody')}
        </p>
      ) : null}
    </div>
  );
}
