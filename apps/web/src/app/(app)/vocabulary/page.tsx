'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';

export default function VocabularyPage() {
  const t = useTranslations();
  const topics = useQuery({ queryKey: queryKeys.topics, queryFn: fetchers.topics });
  const stats = useQuery({ queryKey: ['srs', 'stats'], queryFn: fetchers.srsStats });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px]">{t('vocabulary.title')}</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">{t('vocabulary.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/review">
            <Button variant={stats.data && stats.data.due > 0 ? 'primary' : 'secondary'}>
              {t('vocabulary.review')}
              {stats.data && stats.data.due > 0 ? ` (${stats.data.due})` : ''}
            </Button>
          </Link>
          <Link href="/collection">
            <Button variant="secondary">{t('vocabulary.myCollection')}</Button>
          </Link>
          <Link href="/decks">
            <Button variant="secondary">{t('vocabulary.decks')}</Button>
          </Link>
        </div>
      </header>

      {topics.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 8 }, (_unused, index) => (
            <Skeleton key={index} className="h-[168px] w-full rounded-[var(--r-lg)]" />
          ))}
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : topics.isError || !topics.data ? (
        <EmptyState
          title={t('common.errorTitle')}
          body={t('common.errorBody')}
          action={<Button onClick={() => void topics.refetch()}>{t('common.retry')}</Button>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.data.map((topic) => (
            <li key={topic.slug}>
              <Link href={`/vocabulary/${topic.slug}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-[var(--primary)]">
                <CardBody className="flex h-full flex-col gap-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <span aria-hidden="true" className="text-[32px]">
                      {topic.emoji}
                    </span>
                    {topic.dueCount > 0 ? (
                      <Badge tone="accent">{t('vocabulary.due', { count: topic.dueCount })}</Badge>
                    ) : null}
                  </div>

                  <div>
                    <h2 className="text-[18px]">{topic.nameVi}</h2>
                    <p className="mt-1 line-clamp-2 text-[13px] text-[var(--text-muted)]">
                      {topic.description}
                    </p>
                  </div>

                  <div className="mt-auto">
                    <div
                      className="h-2 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-alt)]"
                      role="progressbar"
                      aria-valuenow={topic.progressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Tiến độ ${topic.nameVi}`}
                    >
                      <div
                        className="h-full rounded-[var(--r-full)] bg-[var(--primary)] transition-[width] duration-300"
                        style={{ width: `${topic.progressPct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
                      {t('vocabulary.learnedOf', {
                        learned: topic.learnedCount,
                        total: topic.wordCount,
                      })}
                      {topic.masteredCount > 0
                        ? ` · ${t('vocabulary.mastered', { count: topic.masteredCount })}`
                        : ''}
                    </p>
                  </div>
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
