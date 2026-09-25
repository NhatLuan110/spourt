'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { SpeakingAttemptView, SpeakingWordScore } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { speakingKeys, queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { useRecorder } from '@/lib/use-recorder';
import { playWord } from '@/lib/speech';
import { cn } from '@/lib/utils';

export default function SpeakingDrillPage() {
  const t = useTranslations();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const queryClient = useQueryClient();

  const [result, setResult] = useState<SpeakingAttemptView | null>(null);
  const recorder = useRecorder();

  const drill = useQuery({
    queryKey: speakingKeys.drill(slug),
    queryFn: () => fetchers.speakingDrill(slug),
  });
  const capabilities = useQuery({
    queryKey: speakingKeys.capabilities,
    queryFn: fetchers.speakingCapabilities,
  });

  const assess = useMutation({
    mutationFn: () => {
      const recording = recorder.recording;
      if (!recording) throw new Error('no recording');
      return api.post<SpeakingAttemptView>('/speaking/attempts', {
        drillSlug: slug,
        audioBase64: recording.base64,
        mimeType: recording.mimeType,
        durationMs: recording.durationMs,
      });
    },
    onSuccess: async (attempt) => {
      setResult(attempt);
      await queryClient.invalidateQueries({ queryKey: speakingKeys.issues });
      await queryClient.invalidateQueries({ queryKey: speakingKeys.drill(slug) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  if (drill.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (drill.isError || !drill.data) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('speaking.loadFailed')}</p>
          <Link href="/speaking" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('speaking.backToList')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const data = drill.data;
  const canRecord = capabilities.data?.canTranscribe ?? false;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/speaking" className="text-[14px] text-[var(--text-muted)]">
          ← {t('speaking.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <CefrTag level={data.cefr} />
          <Badge tone="primary">{data.focusLabelVi}</Badge>
        </div>
      </header>

      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-[26px] leading-snug font-medium">{data.text}</p>
          {data.ipa ? (
            <p className="font-mono text-[15px] text-[var(--text-subtle)]">{data.ipa}</p>
          ) : null}
          <p className="text-[15px] text-[var(--text-muted)]">{data.translationVi}</p>

          <Button
            variant="secondary"
            onClick={() => void playWord({ url: data.audioUrl, text: data.text, accent: 'us' })}
          >
            🔊 {t('speaking.listenModel')}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-2 py-4">
          <h2 className="text-[16px]">{t('speaking.tip')}</h2>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">{data.tipVi}</p>
          {data.minimalPair ? (
            <p className="text-[14px] text-[var(--text-subtle)]">
              {t('speaking.minimalPair')}: <span className="font-medium">{data.minimalPair}</span>
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-8">
          {!canRecord ? (
            <p className="max-w-prose text-center text-[15px] text-[var(--text-muted)]">
              {t('speaking.notConfigured')}
            </p>
          ) : recorder.state === 'unsupported' ? (
            <p className="text-[15px] text-[var(--text-muted)]">{t('speaking.noRecorder')}</p>
          ) : recorder.state === 'denied' ? (
            <p className="max-w-prose text-center text-[15px] text-[var(--danger)]">
              {t('speaking.micDenied')}
            </p>
          ) : (
            <>
              <button
                type="button"
                aria-label={
                  recorder.state === 'recording' ? t('speaking.stop') : t('speaking.record')
                }
                onClick={() => (recorder.state === 'recording' ? recorder.stop() : void recorder.start())}
                disabled={recorder.state === 'requesting' || assess.isPending}
                className={cn(
                  'flex h-24 w-24 items-center justify-center rounded-full text-[36px] transition-transform',
                  recorder.state === 'recording'
                    ? 'animate-pulse bg-[var(--danger)] text-white'
                    : 'bg-[var(--primary)] text-white hover:scale-105',
                  'disabled:opacity-60',
                )}
              >
                {recorder.state === 'recording' ? '■' : '🎤'}
              </button>

              <p className="text-[14px] text-[var(--text-muted)]">
                {recorder.state === 'recording'
                  ? t('speaking.recording', { seconds: (recorder.elapsedMs / 1000).toFixed(1) })
                  : recorder.state === 'requesting'
                    ? t('speaking.requesting')
                    : recorder.recording
                      ? t('speaking.recorded', {
                          seconds: (recorder.recording.durationMs / 1000).toFixed(1),
                        })
                      : t('speaking.pressToRecord')}
              </p>

              {recorder.recording ? (
                <div className="flex flex-col items-center gap-3">
                  {/* This is the learner's own recording, played back seconds
                      after they made it. There is no caption to supply, and the
                      sentence they were reading is on screen directly above. */}
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls src={recorder.recording.objectUrl} className="max-w-full" />
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        recorder.reset();
                        setResult(null);
                      }}
                    >
                      {t('speaking.again')}
                    </Button>
                    <Button loading={assess.isPending} onClick={() => assess.mutate()}>
                      {t('speaking.score')}
                    </Button>
                  </div>
                </div>
              ) : null}

              {assess.isError ? (
                <p className="text-center text-[14px] text-[var(--danger)]">
                  {assess.error instanceof Error ? assess.error.message : t('speaking.scoreFailed')}
                </p>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>

      {result ? <AttemptResult attempt={result} /> : null}
    </div>
  );
}

function AttemptResult({ attempt }: { attempt: SpeakingAttemptView }) {
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[20px]">{t('speaking.result')}</h2>

      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-[48px] leading-none font-semibold text-[var(--primary)]">
            {Math.round(attempt.scores.overall)}
          </p>
          <Badge tone={attempt.scores.overall >= 80 ? 'success' : attempt.scores.overall >= 60 ? 'warning' : 'danger'}>
            {attempt.bandLabelVi}
          </Badge>

          <p className="text-[14px] text-[var(--text-muted)]">
            {t('speaking.heard')}: “{attempt.transcript}”
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-3 py-5">
          <h3 className="text-[16px]">{t('speaking.wordByWord')}</h3>
          <p className="flex flex-wrap gap-x-2 gap-y-1 text-[20px] leading-relaxed">
            {attempt.words.map((word, index) => (
              <WordChip key={`${word.word}-${index}`} word={word} />
            ))}
          </p>
          {attempt.extraWords.length > 0 ? (
            <p className="text-[14px] text-[var(--text-subtle)]">
              {t('speaking.extraWords')}: {attempt.extraWords.join(', ')}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <ScoreRow label={t('speaking.accuracy')} value={attempt.scores.accuracy} />
        <ScoreRow label={t('speaking.fluency')} value={attempt.scores.fluency} />
        <ScoreRow label={t('speaking.completeness')} value={attempt.scores.completeness} />
        <Card>
          <CardBody className="flex items-center justify-between gap-3 py-3">
            <span className="text-[14px]">{t('speaking.prosody')}</span>
            <span className="text-[14px] text-[var(--text-subtle)]">
              {attempt.scores.prosody === null
                ? t('speaking.notMeasured')
                : Math.round(attempt.scores.prosody)}
            </span>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-2 py-4">
          <p className="text-[14px] text-[var(--text-subtle)]">
            {t('speaking.pace', {
              wpm: attempt.wpm,
              min: attempt.targetWpm.min,
              max: attempt.targetWpm.max,
            })}
          </p>
          <p className="text-[15px] leading-relaxed">{attempt.feedbackVi}</p>
        </CardBody>
      </Card>
    </section>
  );
}

function WordChip({ word }: { word: SpeakingWordScore }) {
  return (
    <span
      title={`${word.score}/100 · ${word.errorType}`}
      className={cn(
        'rounded-[var(--r-sm)] px-1',
        word.color === 'green'
          ? 'text-[var(--text)]'
          : word.color === 'amber'
            ? 'bg-[var(--warning-soft)] text-[var(--text)]'
            : 'bg-[var(--danger-soft)] text-[var(--danger)] line-through',
      )}
    >
      {word.word}
    </span>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3 py-3">
        <span className="min-w-[86px] text-[14px]">{label}</span>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-alt)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value)}
          aria-label={label}
        >
          <div
            className="h-full rounded-full bg-[var(--primary)]"
            style={{ width: `${Math.min(100, value)}%` }}
          />
        </div>
        <span className="text-[14px] text-[var(--text-muted)]">{Math.round(value)}</span>
      </CardBody>
    </Card>
  );
}
