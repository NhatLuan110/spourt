'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { WordAudio } from '@/components/domain/word-audio';
import { queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { api } from '@/lib/api-client';
import { STATE_LABEL_VI, STATE_TONE } from '@/lib/srs-labels';
import type { CefrLevel } from '@sprout/shared';

const STATE_FILTERS = ['all', 'learning', 'mastered', 'leech', 'favorite', 'suspended'] as const;
const SORTS = ['due', 'alphabet', 'accuracy', 'recent'] as const;

export default function CollectionPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [state, setState] = useState<(typeof STATE_FILTERS)[number]>('all');
  const [sort, setSort] = useState<(typeof SORTS)[number]>('due');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const params = { state, sort, search: search || undefined, page, limit: 24 };
  const words = useQuery({
    queryKey: queryKeys.myWords(params),
    queryFn: () => fetchers.myWords(params),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; isFavorite?: boolean; state?: 'SUSPENDED' | 'REVIEW' }) =>
      api.patch(`/srs/cards/${input.id}`, {
        isFavorite: input.isFavorite,
        state: input.state,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me', 'words'] });
    },
  });

  const reset = useMutation({
    mutationFn: (id: string) => api.post(`/srs/cards/${id}/reset`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me', 'words'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[30px]">{t('collection.title')}</h1>
        <div className="w-[240px]">
          <Input
            type="search"
            aria-label={t('vocabulary.search')}
            placeholder={t('vocabulary.search')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {STATE_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={state === filter}
            onClick={() => {
              setState(filter);
              setPage(1);
            }}
            className={[
              'rounded-[var(--r-full)] border px-3 py-1.5 text-[13px] transition-colors',
              state === filter
                ? 'border-transparent bg-[var(--primary)] text-[var(--text-inverse)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)]',
            ].join(' ')}
          >
            {t(`collection.${filter}`)}
          </button>
        ))}

        <label className="ml-auto text-[13px] text-[var(--text-muted)]" htmlFor="collection-sort">
          Sắp xếp
        </label>
        <select
          id="collection-sort"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as (typeof SORTS)[number]);
            setPage(1);
          }}
          className="h-9 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-alt)] px-2 text-[14px]"
        >
          {SORTS.map((option) => (
            <option key={option} value={option}>
              {t(`collection.sort${option.charAt(0).toUpperCase()}${option.slice(1)}`)}
            </option>
          ))}
        </select>
      </div>

      {words.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          {Array.from({ length: 6 }, (_unused, index) => (
            <Skeleton key={index} className="h-[120px] w-full rounded-[var(--r-md)]" />
          ))}
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : words.isError || !words.data ? (
        <EmptyState
          title={t('common.errorTitle')}
          body={t('common.errorBody')}
          action={<Button onClick={() => void words.refetch()}>{t('common.retry')}</Button>}
        />
      ) : words.data.data.length === 0 ? (
        <EmptyState
          title={t('collection.empty')}
          body={t('collection.emptyBody')}
          action={
            <Link href="/learn">
              <Button>{t('vocabulary.learnNew')}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {words.data.data.map((row) => (
              <li key={row.userWordId}>
                <Card className="h-full">
                  <CardBody className="flex h-full flex-col gap-1.5 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/word/${row.slug}`} className="text-[17px] hover:underline">
                        {row.lemma}
                      </Link>
                      <CefrTag level={row.cefr as CefrLevel} />
                      <Badge tone={STATE_TONE[row.state] ?? 'neutral'}>
                        {STATE_LABEL_VI[row.state] ?? row.state}
                      </Badge>
                      {row.isLeech ? <Badge tone="danger">Hay quên</Badge> : null}
                      <WordAudio
                        className="ml-auto"
                        size="sm"
                        text={row.lemma}
                        urlUs={row.audioUsUrl}
                      />
                    </div>
                    {row.ipaUs ? <p className="ipa text-[13px]">{row.ipaUs}</p> : null}
                    <p className="text-[14px] text-[var(--text-muted)]">{row.definitionVi}</p>
                    <p className="text-[12px] text-[var(--text-subtle)]">
                      {row.dueLabelVi}
                      {row.accuracy !== null
                        ? ` · ${t('word.accuracy', { percent: Math.round(row.accuracy * 100) })}`
                        : ''}
                    </p>

                    <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-pressed={row.isFavorite}
                        onClick={() =>
                          update.mutate({ id: row.userWordId, isFavorite: !row.isFavorite })
                        }
                      >
                        {row.isFavorite ? '★' : '☆'} {t('collection.star')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          update.mutate({
                            id: row.userWordId,
                            state: row.state === 'SUSPENDED' ? 'REVIEW' : 'SUSPENDED',
                          })
                        }
                      >
                        {row.state === 'SUSPENDED' ? t('collection.resume') : t('collection.suspend')}
                      </Button>
                      {row.isLeech ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => reset.mutate(row.userWordId)}
                        >
                          {t('collection.reset')}
                        </Button>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>

          <nav className="flex items-center justify-center gap-3" aria-label="Phân trang">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t('vocabulary.prev')}
            </Button>
            <span className="text-[13px] text-[var(--text-muted)]">
              {t('vocabulary.page', { page })} · {words.data.meta.total} từ
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!words.data.meta.hasMore}
              onClick={() => setPage(page + 1)}
            >
              {t('vocabulary.next')}
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
