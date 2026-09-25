'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { DeckDetail } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { WordAudio } from '@/components/domain/word-audio';
import { queryKeys, vocabKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { api } from '@/lib/api-client';
import { STATE_LABEL_VI, STATE_TONE } from '@/lib/srs-labels';

export default function DeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const deck = useQuery({
    queryKey: vocabKeys.deck(deckId),
    queryFn: () => fetchers.deck(deckId),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.delete<DeckDetail>(`/me/decks/${deckId}/items/${itemId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: vocabKeys.deck(deckId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.decks });
    },
  });

  const removeDeck = useMutation({
    mutationFn: () => api.delete<{ deleted: true }>(`/me/decks/${deckId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.decks });
      router.push('/decks');
    },
  });

  if (deck.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-[240px] w-full rounded-[var(--r-lg)]" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (deck.isError || !deck.data) {
    return (
      <EmptyState
        title={t('common.errorTitle')}
        body={t('common.errorBody')}
        action={<Button onClick={() => void deck.refetch()}>{t('common.retry')}</Button>}
      />
    );
  }

  const detail = deck.data;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-[13px] text-[var(--text-muted)]">
        <Link href="/decks" className="hover:text-[var(--text)]">
          {t('decks.title')}
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{detail.name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-[34px]">
            {detail.emoji}
          </span>
          <div>
            <h1 className="text-[28px]">{detail.name}</h1>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">
              {t('decks.cards', { count: detail.itemCount })}
              {detail.dueCount > 0 ? ` · ${t('vocabulary.due', { count: detail.dueCount })}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.dueCount > 0 ? (
            <Link href={`/review?deck=${deckId}`}>
              <Button variant="accent">{t('vocabulary.review')}</Button>
            </Link>
          ) : null}
          <Button
            variant="danger"
            loading={removeDeck.isPending}
            onClick={() => {
              if (window.confirm(t('decks.confirmDelete'))) removeDeck.mutate();
            }}
          >
            {t('decks.deleteDeck')}
          </Button>
        </div>
      </header>

      {detail.items.length === 0 ? (
        <EmptyState
          title={t('decks.emptyDeck')}
          body={t('decks.emptyDeckBody')}
          action={
            <Link href="/vocabulary">
              <Button>{t('vocabulary.title')}</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {detail.items.map((item) => (
            <li key={item.id}>
              <Card>
                <CardBody className="flex flex-col gap-1.5 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.slug ? (
                      <Link href={`/word/${item.slug}`} className="text-[17px] hover:underline">
                        {item.lemma}
                      </Link>
                    ) : (
                      <span className="text-[17px]">{item.customFront}</span>
                    )}
                    {item.learnState ? (
                      <Badge tone={STATE_TONE[item.learnState] ?? 'neutral'}>
                        {STATE_LABEL_VI[item.learnState] ?? item.learnState}
                      </Badge>
                    ) : null}
                    {item.lemma ? (
                      <WordAudio
                        className="ml-auto"
                        size="sm"
                        text={item.lemma}
                        urlUs={item.audioUsUrl}
                      />
                    ) : null}
                  </div>
                  {item.ipaUs ? <p className="ipa text-[13px]">{item.ipaUs}</p> : null}
                  <p className="text-[14px] text-[var(--text-muted)]">
                    {item.definitionVi ?? item.customBack}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    loading={removeItem.isPending}
                    onClick={() => removeItem.mutate(item.id)}
                  >
                    {t('decks.remove')}
                  </Button>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
