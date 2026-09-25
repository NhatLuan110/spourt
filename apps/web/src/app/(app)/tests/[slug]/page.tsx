'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { TestResult, TestRunState } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LessonExerciseCard } from '@/components/domain/lesson-exercise';
import { testKeys, queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';

export default function TestRunnerPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const queryClient = useQueryClient();

  const [run, setRun] = useState<TestRunState | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [questionStart, setQuestionStart] = useState(() => Date.now());

  const test = useQuery({ queryKey: testKeys.detail(slug), queryFn: () => fetchers.test(slug) });

  const start = useMutation({
    mutationFn: () => api.post<TestRunState>(`/tests/${slug}/start`),
    onSuccess: (state) => {
      setRun(state);
      setSeconds(state.secondsRemaining);
      setQuestionStart(Date.now());
    },
  });

  const answer = useMutation({
    mutationFn: (body: { exerciseId: string; answer: string }) =>
      api.post<TestRunState>(`/tests/${slug}/answer`, {
        answers: [
          {
            exerciseId: body.exerciseId,
            answer: body.answer,
            timeSpentMs: Math.max(0, Date.now() - questionStart),
          },
        ],
      }),
    onSuccess: (state) => {
      setRun(state);
      setSeconds(state.secondsRemaining);
      setQuestionStart(Date.now());
    },
  });

  const finish = useMutation({
    mutationFn: () => api.post<TestResult>(`/tests/${slug}/finish`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      router.push(`/tests/result/${result.attemptId}`);
    },
  });

  // Local countdown so the clock ticks between requests. The server's own
  // secondsRemaining overwrites it on every answer, so drift cannot accumulate.
  useEffect(() => {
    if (seconds === null || seconds <= 0) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => (value === null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  const finishMutate = finish.mutate;
  const outOfQuestions = run !== null && run.next === null;
  useEffect(() => {
    // Both the walk ending and the clock running out finish the test.
    if (outOfQuestions && !finish.isPending && !finish.isSuccess) finishMutate();
  }, [outOfQuestions, finish.isPending, finish.isSuccess, finishMutate]);

  if (test.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (test.isError || !test.data) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('tests.loadFailed')}</p>
          <Link href="/tests" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('tests.backToList')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const data = test.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/tests" className="text-[14px] text-[var(--text-muted)]">
          ← {t('tests.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px]">{data.title}</h1>
          {data.isAdaptive ? <Badge tone="accent">{t('tests.adaptive')}</Badge> : null}
        </div>
      </header>

      {run === null ? (
        <Card>
          <CardBody className="flex flex-col gap-4 py-6">
            <p className="max-w-prose text-[15px] text-[var(--text-muted)]">{data.description}</p>

            <ul className="flex flex-col gap-1 text-[14px] text-[var(--text-subtle)]">
              <li>
                {data.isAdaptive
                  ? t('tests.metaAdaptive', { minutes: data.durationMin })
                  : t('tests.meta', { minutes: data.durationMin, questions: data.questionCount })}
              </li>
              <li>
                {t('tests.sections', {
                  list: data.sections.map((section) => section.title).join(', '),
                })}
              </li>
              <li>{t('tests.noGoingBack')}</li>
            </ul>

            <Button size="lg" loading={start.isPending} onClick={() => start.mutate()}>
              {t('tests.begin')}
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {run?.next ? (
        <>
          <div className="flex items-center justify-between text-[13px] text-[var(--text-muted)]">
            <span>
              {run.total === null
                ? t('tests.questionAdaptive', { number: run.next.position })
                : t('tests.questionOf', { current: run.next.position, total: run.total })}
            </span>
            <span className="flex items-center gap-2">
              <CefrTag level={run.next.cefr} />
              {seconds !== null ? (
                <span className={seconds < 60 ? 'text-[var(--danger)]' : undefined}>
                  {formatClock(seconds)}
                </span>
              ) : null}
            </span>
          </div>

          <Card>
            <CardBody className="pt-6">
              <LessonExerciseCard
                key={run.next.exercise.id}
                exercise={run.next.exercise}
                submitting={answer.isPending}
                isLast={false}
                onAnswer={(given) =>
                  answer.mutate({ exerciseId: run.next?.exercise.id ?? '', answer: given })
                }
              />
            </CardBody>
          </Card>

          <p className="text-center text-[13px] text-[var(--text-subtle)]">
            {t('tests.answeredSoFar', { count: run.answered })}
          </p>
        </>
      ) : null}

      {outOfQuestions ? (
        <Card>
          <CardBody className="py-10 text-center">
            <p className="text-[16px]">{t('tests.scoring')}</p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
