'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CEFR_LEVELS } from '@sprout/shared';
import type { CefrLevel, ReadingCard } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { lessonKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function ReadingPage() {
  const t = useTranslations();
  const [level, setLevel] = useState<CefrLevel | 'all'>('all');
  const [page, setPage] = useState(1);

  const params = { page, limit: 30, ...(level === 'all' ? {} : { cefr: level }) };
  const passages = useQuery({
    queryKey: lessonKeys.readingPassages(params),
    queryFn: () => fetchers.readingPassages(params),
  });

  const items = passages.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[30px]">{t('reading.title')}</h1>
        <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
          {t('reading.subtitle')}
        </p>
      </header>

      <div role="group" aria-label={t('reading.filterLevel')} className="flex flex-wrap gap-2">
        <LevelChip active={level === 'all'} onClick={() => { setLevel('all'); setPage(1); }}>
          {t('reading.allLevels')}
        </LevelChip>
        {CEFR_LEVELS.slice(0, 4).map((value) => (
          <LevelChip key={value} active={level === value} onClick={() => { setLevel(value); setPage(1); }}>
            {value}
          </LevelChip>
        ))}
      </div>

      {passages.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : passages.isError ? (
        <EmptyState title={t('common.errorTitle')} body={passages.error.message} action={<Button onClick={() => void passages.refetch()}>{t('common.retry')}</Button>} />
      ) : items.length === 0 ? (
        <EmptyState title={t('reading.emptyTitle')} body={t('reading.emptyBody')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((passage) => (
            <li key={passage.slug}>
              <PassageCard passage={passage} />
            </li>
          ))}
        </ul>
      )}
      {passages.data && passages.data.meta.total > 30 ? (
        <nav aria-label={t('common.pagination')} className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" disabled={page === 1 || passages.isFetching} onClick={() => setPage(value => value - 1)}>{t('common.previousPage')}</Button>
          <span className="text-sm text-[var(--text-muted)]">{t('common.pageOf', { page, pages: Math.ceil(passages.data.meta.total / 30), total: passages.data.meta.total })}</span>
          <Button variant="secondary" disabled={!passages.data.meta.hasMore || passages.isFetching} onClick={() => setPage(value => value + 1)}>{t('common.nextPage')}</Button>
        </nav>
      ) : null}
    </div>
  );
}

function PassageCard({ passage }: { passage: ReadingCard }) {
  const t = useTranslations();

  return (
    <Link href={`/reading/${passage.slug}`} className="block h-full">
      <Card className="h-full transition-colors hover:border-[var(--border-strong)]">
        <CardBody className="flex h-full flex-col gap-2 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <CefrTag level={passage.cefr} />
            {passage.topicName ? <Badge tone="neutral">{passage.topicName}</Badge> : null}
            {passage.completed ? (
              <Badge tone="success">
                {t('reading.scored', { percent: Math.round((passage.bestAccuracy ?? 0) * 100) })}
              </Badge>
            ) : null}
          </div>

          <p className="text-[17px] font-semibold">{passage.titleVi}</p>
          <p className="text-[14px] text-[var(--text-subtle)]">{passage.title}</p>

          <p className="mt-auto pt-2 text-[13px] text-[var(--text-muted)]">
            {t('reading.meta', {
              words: passage.wordCount,
              minutes: passage.estimatedMinutes,
              questions: passage.questionCount,
            })}
          </p>
        </CardBody>
      </Card>
    </Link>
  );
}

function LevelChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-[var(--r-full)] border px-3 py-1.5 text-[14px] transition-colors',
        active
          ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
          : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]',
      )}
    >
      {children}
    </button>
  );
}
