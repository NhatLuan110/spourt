'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { RewriteSet } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { sentenceKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';

export default function SentencePage() {
  const t = useTranslations();
  const [expanded, setExpanded] = useState<string | null>(null);

  const sets = useQuery({ queryKey: sentenceKeys.sets, queryFn: fetchers.rewriteSets });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px]">{t('sentence.title')}</h1>
          <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
            {t('sentence.subtitle')}
          </p>
        </div>
        <Link href="/sentence/practice">
          <Button>{t('sentence.mixedPractice')}</Button>
        </Link>
      </header>

      {sets.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (sets.data ?? []).length === 0 ? (
        <EmptyState title={t('sentence.emptyTitle')} body={t('sentence.emptyBody')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {(sets.data ?? []).map((set) => (
            <li key={set.slug}>
              <SetCard
                set={set}
                open={expanded === set.slug}
                onToggle={() => setExpanded((current) => (current === set.slug ? null : set.slug))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetCard({
  set,
  open,
  onToggle,
}: {
  set: RewriteSet;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations();
  const done = set.itemCount > 0 && set.solved >= set.itemCount;

  return (
    <Card>
      <CardBody className="flex flex-col gap-3 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <CefrTag level={set.cefr as never} />
          {done ? <Badge tone="success">{t('sentence.allSolved')}</Badge> : null}
        </div>

        <div>
          <p className="text-[19px] font-semibold">{set.titleVi}</p>
          <p className="text-[14px] text-[var(--text-muted)]">{set.title}</p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-alt)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={set.itemCount}
            aria-valuenow={set.solved}
            aria-label={set.titleVi}
          >
            <div
              className="h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${(set.solved / Math.max(1, set.itemCount)) * 100}%` }}
            />
          </div>
          <span className="text-[13px] text-[var(--text-subtle)]">
            {set.solved}/{set.itemCount}
          </span>
        </div>

        {open ? (
          <p className="rounded-[var(--r-md)] bg-[var(--surface-alt)] p-3 text-[14px] leading-relaxed">
            {set.explanationVi}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link href={`/sentence/practice?set=${set.slug}`}>
            <Button>{done ? t('sentence.practiceAgain') : t('sentence.practice')}</Button>
          </Link>
          <Button variant="ghost" onClick={onToggle}>
            {open ? t('sentence.hideRule') : t('sentence.showRule')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
