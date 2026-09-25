'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { TutorMessageView, TutorReply } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { aiKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'tutor.suggestion1',
  'tutor.suggestion2',
  'tutor.suggestion3',
  'tutor.suggestion4',
] as const;

export default function TutorPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState<TutorMessageView[]>([]);
  const bottom = useRef<HTMLDivElement | null>(null);

  const quota = useQuery({ queryKey: aiKeys.tutorQuota, queryFn: fetchers.tutorQuota });
  const conversations = useQuery({
    queryKey: aiKeys.conversations,
    queryFn: fetchers.conversations,
  });

  const ask = useMutation({
    mutationFn: (message: string) =>
      api.post<TutorReply>('/tutor/ask', {
        ...(conversationId ? { conversationId } : {}),
        message,
      }),
    onSuccess: async (reply) => {
      setConversationId(reply.conversationId);
      setThread((current) => [...current, reply.userMessage, reply.reply]);
      await queryClient.invalidateQueries({ queryKey: aiKeys.tutorQuota });
      await queryClient.invalidateQueries({ queryKey: aiKeys.conversations });
    },
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.length, ask.isPending]);

  async function openConversation(id: string) {
    const detail = await fetchers.conversation(id);
    setConversationId(id);
    setThread(detail.messages);
  }

  function send(message: string) {
    const trimmed = message.trim();
    if (trimmed.length === 0 || ask.isPending) return;
    setDraft('');
    ask.mutate(trimmed);
  }

  const remaining = quota.data?.remaining ?? 0;
  const unavailable = quota.data ? !quota.data.available : false;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px]">{t('tutor.title')}</h1>
          <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
            {t('tutor.subtitle')}
          </p>
        </div>
        {quota.data ? (
          <Badge tone={remaining > 3 ? 'primary' : remaining > 0 ? 'warning' : 'danger'}>
            {t('tutor.quota', { remaining, limit: quota.data.limit })}
          </Badge>
        ) : null}
      </header>

      {unavailable ? (
        <Card>
          <CardBody className="py-6">
            <p className="text-[15px] text-[var(--text-muted)]">{t('tutor.notConfigured')}</p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-3">
          <Card>
            <CardBody className="flex min-h-[380px] flex-col gap-4 py-5">
              {thread.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <span className="text-[40px]" aria-hidden="true">
                    💬
                  </span>
                  <p className="max-w-sm text-[15px] text-[var(--text-muted)]">
                    {t('tutor.emptyBody')}
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-4">
                  {thread.map((message) => (
                    <li key={message.id}>
                      <Bubble message={message} />
                    </li>
                  ))}
                </ul>
              )}

              {ask.isPending ? (
                <p className="text-[14px] text-[var(--text-subtle)]">{t('tutor.thinking')}</p>
              ) : null}

              {ask.isError ? (
                <p className="text-[14px] text-[var(--danger)]">
                  {ask.error instanceof Error ? ask.error.message : t('tutor.failed')}
                </p>
              ) : null}

              <div ref={bottom} />
            </CardBody>
          </Card>

          {thread.length === 0 ? (
            <ul className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => send(t(key))}
                    className="rounded-[var(--r-full)] border border-[var(--border)] px-3 py-1.5 text-[14px] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
                  >
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <textarea
              rows={2}
              aria-label={t('tutor.inputLabel')}
              placeholder={t('tutor.placeholder')}
              value={draft}
              disabled={unavailable || remaining === 0}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter makes a new line — the convention
                // every chat the learner already uses follows.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              className="flex-1 resize-none rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[16px] outline-none focus:border-[var(--primary)] disabled:opacity-60"
            />
            <Button
              type="submit"
              disabled={draft.trim().length === 0 || unavailable || remaining === 0}
              loading={ask.isPending}
            >
              {t('tutor.send')}
            </Button>
          </form>

          {remaining === 0 && !unavailable ? (
            <p className="text-[13px] text-[var(--warning)]">{t('tutor.quotaSpent')}</p>
          ) : null}
        </div>

        <aside className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px]">{t('tutor.history')}</h2>
            {thread.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setConversationId(null);
                  setThread([]);
                }}
                className="text-[13px] text-[var(--primary)]"
              >
                {t('tutor.newChat')}
              </button>
            ) : null}
          </div>

          {conversations.isLoading ? (
            <Skeleton className="h-24" />
          ) : (conversations.data ?? []).length === 0 ? (
            <p className="text-[13px] text-[var(--text-subtle)]">{t('tutor.noHistory')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(conversations.data ?? []).map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    aria-current={conversationId === conversation.id}
                    className={cn(
                      'w-full rounded-[var(--r-md)] border p-2.5 text-left text-[14px] transition-colors',
                      conversationId === conversation.id
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                        : 'border-[var(--border)] hover:border-[var(--border-strong)]',
                    )}
                  >
                    <span className="line-clamp-2">{conversation.title}</span>
                    <span className="mt-0.5 block text-[12px] text-[var(--text-subtle)]">
                      {t('tutor.turns', { count: Math.floor(conversation.messageCount / 2) })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: TutorMessageView }) {
  const t = useTranslations();
  const isLearner = message.role === 'user';

  return (
    <div className={cn('flex flex-col gap-2', isLearner ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-[var(--r-lg)] px-4 py-3 text-[15px] leading-relaxed',
          isLearner
            ? 'bg-[var(--primary-soft)] text-[var(--text)]'
            : 'border border-[var(--border)] bg-[var(--surface)]',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>

      {message.corrections.length > 0 ? (
        <div className="w-full max-w-[85%] rounded-[var(--r-md)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
          <p className="mb-1.5 text-[13px] font-medium">{t('tutor.corrections')}</p>
          <ul className="flex flex-col gap-2 text-[14px]">
            {message.corrections.map((correction) => (
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
