'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ListeningPlayback } from '@sprout/shared';
import { api } from '@/lib/api-client';
import type { ListeningActivityResult } from '@/lib/api-types';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TranscriptPlayer } from '@/components/domain/transcript-player';
import { ExerciseRunner, ExerciseReview, DictationDiff } from '@/components/domain/exercise-runner';
import type { SubmittedAnswer } from '@/components/domain/exercise-runner';
import { RewardBanner } from '@/components/domain/reward-banner';
import { lessonKeys, queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';

type Stage = 'listening' | 'questions' | 'dictation' | 'done';

export default function ListeningTrackPage() {
  const t = useTranslations();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>('listening');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<SubmittedAnswer[]>([]);
  const [result, setResult] = useState<ListeningActivityResult | null>(null);
  const [playback, setPlayback] = useState<ListeningPlayback>({
    playbackRate: 1,
    replays: 0,
    transcriptShown: false,
  });

  const track = useQuery({
    queryKey: lessonKeys.listeningTrack(slug),
    queryFn: () => fetchers.listeningTrack(slug),
  });

  const start = useMutation({
    mutationFn: () => api.post<{ sessionId: string }>(`/listening/tracks/${slug}/start`),
    onSuccess: (data) => setSessionId(data.sessionId),
  });

  const submit = useMutation({
    mutationFn: (all: SubmittedAnswer[]) =>
      api.post<ListeningActivityResult>(`/listening/tracks/${slug}/submit`, {
        ...(sessionId ? { sessionId } : {}),
        answers: all,
        playback,
      }),
    onSuccess: async (data) => {
      setResult(data);
      setStage('done');
      await queryClient.invalidateQueries({ queryKey: lessonKeys.listeningTrack(slug) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  // Stable identity: the player calls this from an effect, so a new function
  // on every render would loop.
  const handlePlayback = useCallback((next: ListeningPlayback) => setPlayback(next), []);

  if (track.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (track.isError || !track.data) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('listening.loadFailed')}</p>
          <Link href="/listening" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('listening.backToList')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const data = track.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/listening" className="text-[14px] text-[var(--text-muted)]">
          ← {t('listening.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px]">{data.titleVi}</h1>
          <CefrTag level={data.cefr} />
          <Badge tone="info">{t(`listening.accent.${data.accent}`)}</Badge>
          <Badge tone="neutral">{t(`listening.format.${data.format}`)}</Badge>
        </div>
        <p className="text-[15px] text-[var(--text-muted)]">{data.title}</p>
      </header>

      {stage !== 'done' ? (
        <TranscriptPlayer
          transcript={data.transcript}
          accent={data.accent}
          audioUrl={data.audioUrl}
          onPlaybackChange={handlePlayback}
        />
      ) : null}

      {stage === 'listening' ? (
        <Button
          block
          size="lg"
          loading={start.isPending}
          onClick={() => {
            if (!sessionId) start.mutate();
            setStage('questions');
          }}
        >
          {t('listening.startQuestions', { count: data.questionCount })}
        </Button>
      ) : null}

      {stage === 'questions' ? (
        <ExerciseRunner
          exercises={data.questions}
          submitting={false}
          onFinish={(given) => {
            setAnswers(given);
            if (data.dictation.length > 0) {
              setStage('dictation');
              return;
            }
            submit.mutate(given);
          }}
        />
      ) : null}

      {stage === 'dictation' ? (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] text-[var(--text-muted)]">{t('listening.dictationIntro')}</p>
          <ExerciseRunner
            exercises={data.dictation}
            submitting={submit.isPending}
            onFinish={(given) => submit.mutate([...answers, ...given])}
          />
        </div>
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

          {result.dictation.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-[20px]">{t('listening.dictationResults')}</h2>
              {result.dictation.map((line) => (
                <Card key={line.exerciseId}>
                  <CardBody className="flex flex-col gap-2 py-4">
                    <div className="flex items-center gap-2">
                      <Badge tone={line.score >= 0.9 ? 'success' : 'warning'}>
                        {Math.round(line.score * 100)}%
                      </Badge>
                      {line.homophoneWarnings.length > 0 ? (
                        <Badge tone="info">
                          {t('listening.homophone', {
                            words: line.homophoneWarnings
                              .map((pair) => `${pair.actual} → ${pair.expected}`)
                              .join(', '),
                          })}
                        </Badge>
                      ) : null}
                    </div>
                    <DictationDiff diff={line.tokens} />
                    <p className="text-[14px] text-[var(--text-muted)]">
                      {t('listening.reference')}: {line.reference}
                    </p>
                  </CardBody>
                </Card>
              ))}
            </section>
          ) : null}

          <ExerciseReview
            feedback={result.feedback.filter((item) => item.mode !== 'dictation')}
          />

          <div className="flex flex-wrap gap-3">
            <Link href="/listening">
              <Button variant="secondary">{t('listening.backToList')}</Button>
            </Link>
            <Button
              onClick={() => {
                setResult(null);
                setSessionId(null);
                setAnswers([]);
                setStage('listening');
              }}
            >
              {t('listening.listenAgain')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
