'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CEFR_LEVELS, LISTENING_ACCENTS } from '@sprout/shared';
import type { CefrLevel, ListeningAccent, ListeningCard } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { lessonKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function ListeningPage() {
  const t = useTranslations();
  const [level, setLevel] = useState<CefrLevel | 'all'>('all');
  const [accent, setAccent] = useState<ListeningAccent | 'all'>('all');
  const [page, setPage] = useState(1);

  const params = {
    page,
    limit: 30,
    ...(level === 'all' ? {} : { cefr: level }),
    ...(accent === 'all' ? {} : { accent }),
  };
  const tracks = useQuery({
    queryKey: lessonKeys.listeningTracks(params),
    queryFn: () => fetchers.listeningTracks(params),
  });

  const items = tracks.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[30px]">{t('listening.title')}</h1>
        <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
          {t('listening.subtitle')}
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <div role="group" aria-label={t('listening.filterLevel')} className="flex flex-wrap gap-2">
          <Chip active={level === 'all'} onClick={() => { setLevel('all'); setPage(1); }}>
            {t('listening.allLevels')}
          </Chip>
          {CEFR_LEVELS.slice(0, 4).map((value) => (
            <Chip key={value} active={level === value} onClick={() => { setLevel(value); setPage(1); }}>
              {value}
            </Chip>
          ))}
        </div>

        <div role="group" aria-label={t('listening.filterAccent')} className="flex flex-wrap gap-2">
          <Chip active={accent === 'all'} onClick={() => { setAccent('all'); setPage(1); }}>
            {t('listening.allAccents')}
          </Chip>
          {LISTENING_ACCENTS.map((value) => (
            <Chip key={value} active={accent === value} onClick={() => { setAccent(value); setPage(1); }}>
              {t(`listening.accent.${value}`)}
            </Chip>
          ))}
        </div>
      </div>

      {tracks.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : tracks.isError ? (
        <EmptyState title={t('common.errorTitle')} body={tracks.error.message} action={<Button onClick={() => void tracks.refetch()}>{t('common.retry')}</Button>} />
      ) : items.length === 0 ? (
        <EmptyState title={t('listening.emptyTitle')} body={t('listening.emptyBody')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((track) => (
            <li key={track.slug}>
              <TrackCard track={track} />
            </li>
          ))}
        </ul>
      )}
      {tracks.data && tracks.data.meta.total > 30 ? (
        <nav aria-label={t('common.pagination')} className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" disabled={page === 1 || tracks.isFetching} onClick={() => setPage(value => value - 1)}>{t('common.previousPage')}</Button>
          <span className="text-sm text-[var(--text-muted)]">{t('common.pageOf', { page, pages: Math.ceil(tracks.data.meta.total / 30), total: tracks.data.meta.total })}</span>
          <Button variant="secondary" disabled={!tracks.data.meta.hasMore || tracks.isFetching} onClick={() => setPage(value => value + 1)}>{t('common.nextPage')}</Button>
        </nav>
      ) : null}
    </div>
  );
}

function TrackCard({ track }: { track: ListeningCard }) {
  const t = useTranslations();
  const minutes = Math.floor(track.durationSec / 60);
  const seconds = track.durationSec % 60;

  return (
    <Link href={`/listening/${track.slug}`} className="block h-full">
      <Card className="h-full transition-colors hover:border-[var(--border-strong)]">
        <CardBody className="flex h-full flex-col gap-2 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <CefrTag level={track.cefr} />
            <Badge tone="info">{t(`listening.accent.${track.accent}`)}</Badge>
            <Badge tone="neutral">{t(`listening.format.${track.format}`)}</Badge>
            {track.completed ? (
              <Badge tone="success">
                {t('listening.scored', { percent: Math.round((track.bestAccuracy ?? 0) * 100) })}
              </Badge>
            ) : null}
          </div>

          <p className="text-[17px] font-semibold">{track.titleVi}</p>
          <p className="text-[14px] text-[var(--text-subtle)]">{track.title}</p>

          <p className="mt-auto pt-2 text-[13px] text-[var(--text-muted)]">
            {t('listening.meta', {
              duration: `${minutes}:${String(seconds).padStart(2, '0')}`,
              speakers: track.speakerCount,
              questions: track.questionCount,
            })}
          </p>
        </CardBody>
      </Card>
    </Link>
  );
}

function Chip({
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
