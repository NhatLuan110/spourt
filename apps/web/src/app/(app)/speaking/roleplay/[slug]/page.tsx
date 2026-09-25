'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { RoleplayState, RoleplayTurn } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { speakingKeys, queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { useRecorder } from '@/lib/use-recorder';
import { cn } from '@/lib/utils';

export default function RoleplayPage() {
  const t = useTranslations();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const queryClient = useQueryClient();

  const [state, setState] = useState<RoleplayState | null>(null);
  const [draft, setDraft] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);
  const recorder = useRecorder(60_000);

  const scenario = useQuery({
    queryKey: speakingKeys.scenario(slug),
    queryFn: () => fetchers.scenario(slug),
  });
  const capabilities = useQuery({
    queryKey: speakingKeys.capabilities,
    queryFn: fetchers.speakingCapabilities,
  });

  const send = useMutation({
    mutationFn: (payload: { message?: string; audio?: { base64: string; mimeType: string; durationMs: number } }) =>
      api.post<RoleplayState>('/speaking/roleplay', {
        scenarioSlug: slug,
        ...(state ? { conversationId: state.conversationId } : {}),
        ...(payload.message ? { message: payload.message } : {}),
        ...(payload.audio
          ? {
              audioBase64: payload.audio.base64,
              mimeType: payload.audio.mimeType,
              durationMs: payload.audio.durationMs,
            }
          : {}),
      }),
    onSuccess: async (next) => {
      setState(next);
      recorder.reset();
      if (next.finished) await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state?.turns.length, send.isPending]);

  if (scenario.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (scenario.isError || !scenario.data) {
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

  const data = scenario.data;
  const canRecord = capabilities.data?.canTranscribe ?? false;
  const finished = state?.finished ?? false;

  function submitText() {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || send.isPending || finished) return;
    setDraft('');
    send.mutate({ message: trimmed });
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link href="/speaking" className="text-[14px] text-[var(--text-muted)]">
          ← {t('speaking.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[26px]">{data.titleVi}</h1>
          <CefrTag level={data.cefr} />
          {state ? (
            <Badge tone="neutral">
              {t('speaking.turnCount', { used: state.turnsUsed, max: state.maxTurns })}
            </Badge>
          ) : null}
        </div>
        <p className="text-[14px] text-[var(--text-muted)]">{data.title}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-3">
          <Card>
            <CardBody className="flex min-h-[360px] flex-col gap-4 py-5">
              {!state ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <span className="text-[40px]" aria-hidden="true">
                    🎭
                  </span>
                  <p className="max-w-sm text-[15px] text-[var(--text-muted)]">
                    {t('speaking.roleplayStart')}
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-4">
                  {state.turns.map((turn, index) => (
                    <li key={`${turn.role}-${index}`}>
                      <Turn turn={turn} />
                    </li>
                  ))}
                </ul>
              )}

              {send.isPending ? (
                <p className="text-[14px] text-[var(--text-subtle)]">{t('speaking.thinking')}</p>
              ) : null}

              {send.isError ? (
                <p className="text-[14px] text-[var(--danger)]">
                  {send.error instanceof Error ? send.error.message : t('speaking.turnFailed')}
                </p>
              ) : null}

              <div ref={bottom} />
            </CardBody>
          </Card>

          {finished ? (
            <Card>
              <CardBody className="flex flex-col gap-2 py-5 text-center">
                <p className="text-[17px]">{t('speaking.finished')}</p>
                <p className="text-[14px] text-[var(--text-muted)]">
                  {t('speaking.objectivesMet', {
                    met: state?.objectivesMet.length ?? 0,
                    total: data.objectives.length,
                  })}
                </p>
                <div className="mt-2 flex justify-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setState(null);
                      recorder.reset();
                    }}
                  >
                    {t('speaking.startOver')}
                  </Button>
                  <Link href="/speaking">
                    <Button>{t('speaking.backToList')}</Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          ) : (
            <>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitText();
                }}
              >
                <textarea
                  rows={2}
                  aria-label={t('speaking.yourTurn')}
                  placeholder={t('speaking.typeInEnglish')}
                  value={draft}
                  disabled={send.isPending}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      submitText();
                    }
                  }}
                  className="flex-1 resize-none rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[16px] outline-none focus:border-[var(--primary)] disabled:opacity-60"
                />
                <Button type="submit" disabled={draft.trim().length === 0} loading={send.isPending}>
                  {t('speaking.send')}
                </Button>
              </form>

              {canRecord ? (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <span className="text-[13px] text-[var(--text-subtle)]">
                    {t('speaking.orSpeak')}
                  </span>
                  <Button
                    variant={recorder.state === 'recording' ? 'danger' : 'secondary'}
                    disabled={send.isPending || recorder.state === 'requesting'}
                    onClick={() =>
                      recorder.state === 'recording' ? recorder.stop() : void recorder.start()
                    }
                  >
                    {recorder.state === 'recording'
                      ? `■ ${(recorder.elapsedMs / 1000).toFixed(1)}s`
                      : `🎤 ${t('speaking.record')}`}
                  </Button>

                  {recorder.recording ? (
                    <Button
                      loading={send.isPending}
                      onClick={() =>
                        send.mutate({
                          audio: {
                            base64: recorder.recording?.base64 ?? '',
                            mimeType: recorder.recording?.mimeType ?? 'audio/webm',
                            durationMs: recorder.recording?.durationMs ?? 0,
                          },
                        })
                      }
                    >
                      {t('speaking.sendRecording')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h2 className="text-[16px]">{t('speaking.objectives')}</h2>
            <ul className="flex flex-col gap-1.5 text-[14px]">
              {data.objectives.map((objective) => {
                const met = state?.objectivesMet.includes(objective) ?? false;
                return (
                  <li
                    key={objective}
                    className={cn(
                      'flex gap-2',
                      met ? 'text-[var(--success)]' : 'text-[var(--text-muted)]',
                    )}
                  >
                    <span aria-hidden="true">{met ? '✓' : '○'}</span>
                    <span>{objective}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[16px]">{t('speaking.usefulPhrases')}</h2>
            <ul className="flex flex-col gap-2">
              {data.usefulPhrases.map((phrase) => (
                <li key={phrase.en}>
                  <button
                    type="button"
                    onClick={() => setDraft(phrase.en)}
                    className="w-full rounded-[var(--r-md)] border border-[var(--border)] p-2.5 text-left text-[14px] transition-colors hover:border-[var(--border-strong)]"
                  >
                    <span className="block font-medium">{phrase.en}</span>
                    <span className="block text-[13px] text-[var(--text-muted)]">{phrase.vi}</span>
                    <span className="block text-[12px] text-[var(--text-subtle)]">
                      {phrase.when}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Turn({ turn }: { turn: RoleplayTurn }) {
  const t = useTranslations();
  const isLearner = turn.role === 'user';

  return (
    <div className={cn('flex flex-col gap-2', isLearner ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-[var(--r-lg)] px-4 py-3 text-[15px] leading-relaxed',
          isLearner
            ? 'bg-[var(--primary-soft)]'
            : 'border border-[var(--border)] bg-[var(--surface)]',
        )}
      >
        <p className="whitespace-pre-wrap">{turn.content}</p>
        {turn.transcript ? (
          <p className="mt-1 text-[12px] text-[var(--text-subtle)]">🎤 {t('speaking.spoken')}</p>
        ) : null}
      </div>

      {(turn.corrections ?? []).length > 0 ? (
        <div className="w-full max-w-[85%] rounded-[var(--r-md)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
          <p className="mb-1.5 text-[13px] font-medium">{t('speaking.corrections')}</p>
          <ul className="flex flex-col gap-2 text-[14px]">
            {(turn.corrections ?? []).map((correction) => (
              <li key={correction.original}>
                <p>
                  <span className="line-through opacity-70">{correction.original}</span>
                  {correction.corrected ? (
                    <>
                      {' → '}
                      <span className="font-medium">{correction.corrected}</span>
                    </>
                  ) : null}
                </p>
                <p className="text-[13px] text-[var(--text-muted)]">{correction.whyVi}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
