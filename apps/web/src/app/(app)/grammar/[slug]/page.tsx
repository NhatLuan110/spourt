'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ActivityResult, LessonSectionKind } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LessonMarkdown } from '@/components/domain/lesson-markdown';
import { ExerciseRunner, ExerciseReview } from '@/components/domain/exercise-runner';
import type { SubmittedAnswer } from '@/components/domain/exercise-runner';
import { RewardBanner } from '@/components/domain/reward-banner';
import { lessonKeys, queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';

const SECTION_TONE: Record<LessonSectionKind, 'primary' | 'info' | 'accent' | 'warning'> = {
  theory: 'primary',
  examples: 'info',
  tips: 'accent',
  'common-mistakes': 'warning',
};

type Stage = 'reading' | 'practising' | 'done';

export default function GrammarLessonPage() {
  const t = useTranslations();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>('reading');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<ActivityResult | null>(null);

  const lesson = useQuery({
    queryKey: lessonKeys.grammarLesson(slug),
    queryFn: () => fetchers.grammarLesson(slug),
  });

  const start = useMutation({
    mutationFn: () => api.post<{ sessionId: string }>(`/grammar/lessons/${slug}/start`),
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setStage('practising');
    },
  });

  const markRead = useMutation({
    mutationFn: (sectionId: string) =>
      api.post(`/grammar/lessons/${slug}/sections`, { sectionId }),
  });

  const submit = useMutation({
    mutationFn: (answers: SubmittedAnswer[]) =>
      api.post<ActivityResult>(`/grammar/lessons/${slug}/submit`, {
        ...(sessionId ? { sessionId } : {}),
        answers,
      }),
    onSuccess: async (data) => {
      setResult(data);
      setStage('done');
      await queryClient.invalidateQueries({ queryKey: lessonKeys.grammarLesson(slug) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  if (lesson.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (lesson.isError || !lesson.data) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('grammar.loadFailed')}</p>
          <Link href="/grammar" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('grammar.backToList')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const data = lesson.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/grammar" className="text-[14px] text-[var(--text-muted)]">
          ← {t('grammar.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px]">{data.titleVi}</h1>
          <CefrTag level={data.cefr} />
        </div>
        <p className="text-[15px] text-[var(--text-muted)]">{data.title}</p>
      </header>

      {stage === 'reading' ? (
        <>
          {data.sections.map((section) => (
            <Card key={section.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge tone={SECTION_TONE[section.kind]}>
                    {t(`grammar.section.${section.kind}`)}
                  </Badge>
                  <CardTitle>{section.title}</CardTitle>
                </div>
              </CardHeader>
              <CardBody>
                <LessonMarkdown source={section.bodyMdx} />
              </CardBody>
            </Card>
          ))}

          <Button
            block
            size="lg"
            loading={start.isPending}
            onClick={() => {
              const last = data.sections.at(-1);
              if (last) markRead.mutate(last.id);
              start.mutate();
            }}
          >
            {t('grammar.startExercises', { count: data.exercises.length })}
          </Button>

          {start.isError ? (
            <p className="text-center text-[14px] text-[var(--danger)]">
              {t('grammar.startFailed')}
            </p>
          ) : null}
        </>
      ) : null}

      {stage === 'practising' ? (
        <ExerciseRunner
          exercises={data.exercises}
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
          <ExerciseReview feedback={result.feedback} />
          <div className="flex flex-wrap gap-3">
            <Link href="/grammar">
              <Button variant="secondary">{t('grammar.backToList')}</Button>
            </Link>
            <Button
              onClick={() => {
                setResult(null);
                setSessionId(null);
                setStage('reading');
              }}
            >
              {t('lesson.reviewAgain')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
