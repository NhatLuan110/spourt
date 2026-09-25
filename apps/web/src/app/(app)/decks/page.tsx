'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { DeckSummary } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { api } from '@/lib/api-client';

export default function DecksPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const decks = useQuery({ queryKey: queryKeys.decks, queryFn: fetchers.decks });

  const create = useMutation({
    mutationFn: (deckName: string) =>
      api.post<DeckSummary>('/me/decks', { name: deckName, emoji: '🌿', isPublic: false }),
    onSuccess: async () => {
      setName('');
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.decks });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px]">{t('decks.title')}</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">{t('decks.subtitle')}</p>
        </div>
        {!creating ? (
          <Button onClick={() => setCreating(true)}>{t('decks.create')}</Button>
        ) : null}
      </header>

      {creating ? (
        <Card>
          <CardBody className="pt-5">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) create.mutate(name.trim());
              }}
            >
              <div className="min-w-[240px] flex-1">
                <Input
                  autoFocus
                  label={t('decks.name')}
                  maxLength={60}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button type="submit" loading={create.isPending} disabled={name.trim() === ''}>
                {t('common.save')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setName('');
                }}
              >
                {t('common.cancel')}
              </Button>
            </form>
            {create.isError ? (
              <p role="alert" className="mt-2 text-[13px] text-[var(--danger)]">
                {create.error instanceof Error ? create.error.message : t('common.errorBody')}
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {decks.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_unused, index) => (
            <Skeleton key={index} className="h-[120px] w-full rounded-[var(--r-lg)]" />
          ))}
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : decks.isError || !decks.data ? (
        <EmptyState
          title={t('common.errorTitle')}
          body={t('common.errorBody')}
          action={<Button onClick={() => void decks.refetch()}>{t('common.retry')}</Button>}
        />
      ) : decks.data.length === 0 ? (
        <EmptyState
          title={t('decks.empty')}
          body={t('decks.emptyBody')}
          action={<Button onClick={() => setCreating(true)}>{t('decks.create')}</Button>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decks.data.map((deck) => (
            <li key={deck.id}>
              <Link href={`/decks/${deck.id}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-[var(--primary)]">
                  <CardBody className="flex h-full flex-col gap-2 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <span aria-hidden="true" className="text-[28px]">
                        {deck.emoji}
                      </span>
                      {deck.dueCount > 0 ? (
                        <Badge tone="accent">
                          {t('vocabulary.due', { count: deck.dueCount })}
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="text-[17px]">{deck.name}</h2>
                    {deck.description ? (
                      <p className="line-clamp-2 text-[13px] text-[var(--text-muted)]">
                        {deck.description}
                      </p>
                    ) : null}
                    <p className="mt-auto text-[13px] text-[var(--text-subtle)]">
                      {t('decks.cards', { count: deck.itemCount })}
                    </p>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
