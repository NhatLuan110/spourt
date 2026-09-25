'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { PracticeItem, PracticeResult, PracticeSet } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PracticeQuestion } from '@/components/domain/practice-question';
import { queryKeys } from '@/lib/query-keys';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';

const ALL_MODES = ['mcq-meaning', 'mcq-reverse', 'gap-fill', 'listen-type', 'matching'] as const;

export default function PracticePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-[var(--r-lg)]" />}>
      <PracticeSession />
    </Suspense>
  );
}

interface AnswerDraft {
  itemId: string;
  answer: string;
  timeSpentMs: number;
}

function PracticeSession() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const topicSlug = searchParams.get('topic') ?? undefined;
  const queryClient = useQueryClient();

  const [set, setSet] = useState<PracticeSet | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerDraft[]>([]);
  const [result, setResult] = useState<PracticeResult | null>(null);
  const shownAt = useRef(Date.now());

  const create = useMutation({
    mutationFn: () =>
      api.post<PracticeSet>('/practice', {
        topicSlug,
        modes: [...ALL_MODES],
        count: 10,
      }),
    onSuccess: (data) => {
      setSet(data);
      setIndex(0);
      setAnswers([]);
      setResult(null);
      shownAt.current = Date.now();
    },
  });

  const submit = useMutation({
    mutationFn: (payload: { sessionId: string; answers: AnswerDraft[] }) =>
      api.post<PracticeResult>('/practice/submit', payload),
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      await queryClient.invalidateQueries({ queryKey: ['srs'] });
    },
  });

  const start = create.mutate;
  useEffect(() => {
    start();
  }, [start, topicSlug]);

  if (create.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[360px] w-full rounded-[var(--r-lg)]" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (create.isError) {
    const notEnough = create.error instanceof ApiError && create.error.status === 404;
    return (
      <EmptyState
        title={notEnough ? t('practice.needWords') : t('common.errorTitle')}
        body={notEnough ? t('practice.needWordsBody') : t('common.errorBody')}
        action={
          notEnough ? (
            <Link href={topicSlug ? `/learn?topic=${topicSlug}` : '/learn'}>
              <Button>{t('vocabulary.learnNew')}</Button>
            </Link>
          ) : (
            <Button onClick={() => create.mutate()}>{t('common.retry')}</Button>
          )
        }
      />
    );
  }

  if (result) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
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
              <Card
                className={
                  item.isCorrect
                    ? 'border-[var(--success)]'
                    : 'border-[var(--danger)]'
                }
              >
                <CardBody className="flex flex-col gap-1.5 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.isCorrect ? 'success' : 'danger'}>
                      {item.isCorrect ? t('practice.correct') : t('practice.incorrect')}
                    </Badge>
                    <span className="text-[16px] font-medium">{item.lemma}</span>
                  </div>
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
          <Link href={topicSlug ? `/vocabulary/${topicSlug}` : '/vocabulary'}>
            <Button variant="secondary">{t('vocabulary.title')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!set) return null;

  const item = set.items[index];
  if (!item) return null;
  const isLast = index >= set.items.length - 1;

  const record = (answer: string) => {
    const draft: AnswerDraft = {
      itemId: item.id,
      answer,
      timeSpentMs: Math.min(600_000, Math.max(0, Date.now() - shownAt.current)),
    };
    const next = [...answers.filter((entry) => entry.itemId !== item.id), draft];
    setAnswers(next);

    if (isLast) {
      submit.mutate({ sessionId: set.sessionId, answers: next });
      return;
    }
    setIndex(index + 1);
    shownAt.current = Date.now();
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px]">{t('practice.title')}</h1>
        <p className="text-[14px] text-[var(--text-muted)]">
          {t('practice.questionOf', { current: index + 1, total: set.items.length })}
        </p>
      </header>

      <div
        className="h-1.5 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-alt)]"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={set.items.length}
        aria-label={t('practice.title')}
      >
        <div
          className="h-full bg-[var(--primary)] transition-[width] duration-300"
          style={{ width: `${((index + 1) / set.items.length) * 100}%` }}
        />
      </div>

      <PracticeQuestion
        key={item.id}
        item={item as PracticeItem}
        submitting={submit.isPending}
        isLast={isLast}
        onAnswer={record}
      />

      {submit.isError ? (
        <p role="alert" className="text-[14px] text-[var(--danger)]">
          {submit.error instanceof Error ? submit.error.message : t('common.errorBody')}
        </p>
      ) : null}
    </div>
  );
}
