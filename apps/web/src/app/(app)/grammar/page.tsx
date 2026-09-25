'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CEFR_LEVELS, CEFR_LABEL_VI } from '@sprout/shared';
import type { CefrLevel, LessonCard } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { lessonKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function GrammarPage() {
  const t = useTranslations();
  const [level, setLevel] = useState<CefrLevel | 'all'>('all');

  const params = level === 'all' ? {} : { cefr: level };
  const lessons = useQuery({
    queryKey: lessonKeys.grammarLessons(params),
    queryFn: () => fetchers.grammarLessons(params),
  });

  const grouped = groupByLevel(lessons.data ?? []);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[30px]">{t('grammar.title')}</h1>
        <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
          {t('grammar.subtitle')}
        </p>
      </header>

      <div role="group" aria-label={t('grammar.filterLevel')} className="flex flex-wrap gap-2">
        <FilterChip active={level === 'all'} onClick={() => setLevel('all')}>
          {t('grammar.allLevels')}
        </FilterChip>
        {CEFR_LEVELS.slice(0, 4).map((value) => (
          <FilterChip key={value} active={level === value} onClick={() => setLevel(value)}>
            {value}
          </FilterChip>
        ))}
      </div>

      {lessons.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState title={t('grammar.emptyTitle')} body={t('grammar.emptyBody')} />
      ) : (
        grouped.map(([cefr, items]) => (
          <section key={cefr} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-[18px]">
              <CefrTag level={cefr} />
              <span className="text-[var(--text-muted)]">{CEFR_LABEL_VI[cefr]}</span>
            </h2>
            <ul className="flex flex-col gap-3">
              {items.map((lesson) => (
                <li key={lesson.slug}>
                  <LessonRow lesson={lesson} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function LessonRow({ lesson }: { lesson: LessonCard }) {
  const t = useTranslations();

  const body = (
    <Card
      className={cn(
        'transition-colors',
        lesson.lock.locked ? 'opacity-60' : 'hover:border-[var(--border-strong)]',
      )}
    >
      <CardBody className="flex flex-wrap items-center gap-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-semibold">{lesson.titleVi}</span>
            <span className="text-[14px] text-[var(--text-subtle)]">{lesson.title}</span>
            {lesson.status === 'completed' ? (
              <Badge tone="success">{t('grammar.completed')}</Badge>
            ) : lesson.status === 'in_progress' ? (
              <Badge tone="warning">{t('grammar.inProgress')}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">{lesson.summary}</p>

          {lesson.lock.locked ? (
            <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
              🔒{' '}
              {t('grammar.requires', {
                lessons: lesson.lock.requires.map((item) => item.titleVi).join(', '),
              })}
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
              {t('grammar.meta', {
                minutes: lesson.estimatedMinutes,
                exercises: lesson.exerciseCount,
                xp: lesson.xpReward,
              })}
            </p>
          )}
        </div>

        {lesson.accuracy !== null ? (
          <span className="text-[15px] font-semibold text-[var(--success)]">
            {Math.round(lesson.accuracy * 100)}%
          </span>
        ) : lesson.progressPct > 0 ? (
          <span className="text-[13px] text-[var(--text-muted)]">{lesson.progressPct}%</span>
        ) : null}
      </CardBody>
    </Card>
  );

  return lesson.lock.locked ? body : <Link href={`/grammar/${lesson.slug}`}>{body}</Link>;
}

function FilterChip({
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

/** Keeps the API's level order rather than re-sorting, so B1 follows A2. */
function groupByLevel(lessons: LessonCard[]): [CefrLevel, LessonCard[]][] {
  const groups = new Map<CefrLevel, LessonCard[]>();
  for (const lesson of lessons) {
    const bucket = groups.get(lesson.cefr) ?? [];
    bucket.push(lesson);
    groups.set(lesson.cefr, bucket);
  }
  return [...groups];
}
