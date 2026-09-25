'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import type { ReadingActivityResult } from '@/lib/api-types';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GlossaryReader } from '@/components/domain/glossary-reader';
import { ExerciseRunner, ExerciseReview } from '@/components/domain/exercise-runner';
import type { SubmittedAnswer } from '@/components/domain/exercise-runner';
import { RewardBanner } from '@/components/domain/reward-banner';
import { lessonKeys, queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';

type Stage = 'reading' | 'answering' | 'done';

const BAND_TONE = {
  slow: 'info',
  'on-target': 'success',
  fast: 'primary',
  skimmed: 'warning',
} as const;

export default function ReadingPassagePage() {
  const t = useTranslations();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>('reading');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<ReadingActivityResult | null>(null);

  const passage = useQuery({
    queryKey: lessonKeys.readingPassage(slug),
    queryFn: () => fetchers.readingPassage(slug),
  });

  const start = useMutation({
    mutationFn: () => api.post<{ sessionId: string }>(`/reading/passages/${slug}/start`),
    onSuccess: (data) => setSessionId(data.sessionId),
  });

  // The clock has to start when the passage appears, not when the questions
  // open: otherwise the words-per-minute figure measures how long the learner
  // spent answering rather than how long they spent reading.
  const startMutate = start.mutate;
  const passageLoaded = passage.isSuccess;
  useEffect(() => {
    if (passageLoaded && sessionId === null && stage === 'reading') startMutate();
  }, [passageLoaded, sessionId, stage, startMutate]);

  const submit = useMutation({
    mutationFn: (answers: SubmittedAnswer[]) =>
      api.post<ReadingActivityResult>(`/reading/passages/${slug}/submit`, {
        ...(sessionId ? { sessionId } : {}),
        answers,
      }),
    onSuccess: async (data) => {
      setResult(data);
      setStage('done');
      await queryClient.invalidateQueries({ queryKey: lessonKeys.readingPassage(slug) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  if (passage.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (passage.isError || !passage.data) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('reading.loadFailed')}</p>
          <Link href="/reading" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('reading.backToList')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const data = passage.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/reading" className="text-[14px] text-[var(--text-muted)]">
          ← {t('reading.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px]">{data.titleVi}</h1>
          <CefrTag level={data.cefr} />
          {data.topicName ? <Badge tone="neutral">{data.topicName}</Badge> : null}
        </div>
        <p className="text-[15px] text-[var(--text-muted)]">{data.title}</p>
        <p className="text-[13px] text-[var(--text-subtle)]">
          {t('reading.meta', {
            words: data.wordCount,
            minutes: data.estimatedMinutes,
            questions: data.questionCount,
          })}
          {data.source ? ` · ${data.source}` : ''}
        </p>
      </header>

      {stage !== 'answering' ? (
        <Card>
          <CardBody className="py-6">
            <p className="mb-4 text-[13px] text-[var(--text-subtle)]">{t('reading.tapHint')}</p>
            <GlossaryReader body={data.bodyMdx} glossary={data.glossary} />
          </CardBody>
        </Card>
      ) : null}

      {stage === 'reading' ? (
        <>
          <Button block size="lg" onClick={() => setStage('answering')}>
            {t('reading.startQuestions', { count: data.questionCount })}
          </Button>
          <p className="text-center text-[13px] text-[var(--text-subtle)]">
            {t('reading.speedNotice')}
          </p>
        </>
      ) : null}

      {stage === 'answering' ? (
        <ExerciseRunner
          exercises={data.questions}
          submitting={submit.isPending}
          onFinish={(answers) => submit.mutate(answers)}
        />
      ) : null}

      {stage === 'done' && result ? (
        <div className="flex flex-col gap-5">
          <RewardBanner
            reward={result.reward}
            headline={t('lesson.resultHeadline', {
              correct: result.correctCount,
              total: result.total,
            })}
          />

          <Card>
            <CardBody className="flex flex-wrap items-center gap-3 py-4">
              <Badge tone={BAND_TONE[result.speed.band]}>
                {t(`reading.band.${result.speed.band}`)}
              </Badge>
              <span className="text-[16px]">
                {t('reading.wpm', { wpm: result.speed.wpm })}
              </span>
              <span className="text-[14px] text-[var(--text-muted)]">
                {t('reading.wpmTarget', { target: result.speed.targetWpm })}
              </span>
            </CardBody>
          </Card>

          <ExerciseReview feedback={result.feedback} />

          <div className="flex flex-wrap gap-3">
            <Link href="/reading">
              <Button variant="secondary">{t('reading.backToList')}</Button>
            </Link>
            <Button
              onClick={() => {
                setResult(null);
                setSessionId(null);
                setStage('reading');
              }}
            >
              {t('reading.readAgain')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
