'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CEFR_LEVELS, WRITING_KINDS } from '@sprout/shared';
import type { CefrLevel, WritingKind, WritingPromptCard, WritingSubmissionView } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { aiKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function WritingPage() {
  const t = useTranslations();
  const [level, setLevel] = useState<CefrLevel | 'all'>('all');
  const [kind, setKind] = useState<WritingKind | 'all'>('all');

  const params = {
    ...(level === 'all' ? {} : { cefr: level }),
    ...(kind === 'all' ? {} : { kind }),
  };
  const prompts = useQuery({
    queryKey: aiKeys.writingPrompts(params),
    queryFn: () => fetchers.writingPrompts(params),
  });
  const history = useQuery({
    queryKey: aiKeys.submissions,
    queryFn: () => fetchers.writingSubmissions(5),
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[30px]">{t('writing.title')}</h1>
        <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
          {t('writing.subtitle')}
        </p>
      </header>

      {(history.data ?? []).length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[18px]">{t('writing.recent')}</h2>
          <ul className="flex flex-col gap-2">
            {(history.data ?? []).map((submission) => (
              <li key={submission.id}>
                <HistoryRow submission={submission} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-2">
        <div role="group" aria-label={t('writing.filterLevel')} className="flex flex-wrap gap-2">
          <Chip active={level === 'all'} onClick={() => setLevel('all')}>
            {t('writing.allLevels')}
          </Chip>
          {CEFR_LEVELS.slice(0, 4).map((value) => (
            <Chip key={value} active={level === value} onClick={() => setLevel(value)}>
              {value}
            </Chip>
          ))}
        </div>

        <div role="group" aria-label={t('writing.filterKind')} className="flex flex-wrap gap-2">
          <Chip active={kind === 'all'} onClick={() => setKind('all')}>
            {t('writing.allKinds')}
          </Chip>
          {WRITING_KINDS.map((value) => (
            <Chip key={value} active={kind === value} onClick={() => setKind(value)}>
              {t(`writing.kind.${value}`)}
            </Chip>
          ))}
        </div>
      </div>

      {prompts.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : (prompts.data ?? []).length === 0 ? (
        <EmptyState title={t('writing.emptyTitle')} body={t('writing.emptyBody')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(prompts.data ?? []).map((prompt) => (
            <li key={prompt.slug}>
              <PromptCard prompt={prompt} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PromptCard({ prompt }: { prompt: WritingPromptCard }) {
  const t = useTranslations();

  return (
    <Link href={`/writing/${prompt.slug}`} className="block h-full">
      <Card className="h-full transition-colors hover:border-[var(--border-strong)]">
        <CardBody className="flex h-full flex-col gap-2 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <CefrTag level={prompt.cefr} />
            <Badge tone="neutral">{t(`writing.kind.${prompt.kind}`)}</Badge>
            {prompt.bestScore !== null ? (
              <Badge tone="success">{t('writing.best', { score: Math.round(prompt.bestScore) })}</Badge>
            ) : null}
          </div>

          <p className="text-[17px] font-semibold">{prompt.title}</p>
          <p className="line-clamp-3 text-[14px] text-[var(--text-muted)]">
            {prompt.instructionsVi}
          </p>

          <p className="mt-auto pt-2 text-[13px] text-[var(--text-subtle)]">
            {t('writing.meta', {
              min: prompt.minWords,
              max: prompt.maxWords,
              minutes: prompt.timeLimitMin ?? 0,
            })}
            {prompt.attempts > 0 ? ` · ${t('writing.attempts', { count: prompt.attempts })}` : ''}
          </p>
        </CardBody>
      </Card>
    </Link>
  );
}

function HistoryRow({ submission }: { submission: WritingSubmissionView }) {
  const t = useTranslations();
  const score = submission.feedback?.overallScore ?? null;

  return (
    <Link href={`/writing/result/${submission.id}`}>
      <Card className="transition-colors hover:border-[var(--border-strong)]">
        <CardBody className="flex flex-wrap items-center gap-3 py-3">
          <span className="min-w-0 flex-1 truncate text-[15px]">
            {submission.promptTitle ?? submission.freeTopic ?? t('writing.freeWriting')}
          </span>
          <span className="text-[13px] text-[var(--text-subtle)]">
            {t('writing.wordCount', { count: submission.wordCount })}
          </span>
          {submission.status === 'graded' && score !== null ? (
            <Badge tone={score >= 70 ? 'success' : score >= 50 ? 'warning' : 'danger'}>
              {Math.round(score)}/100
            </Badge>
          ) : (
            <Badge tone={submission.status === 'failed' ? 'danger' : 'neutral'}>
              {t(`writing.status.${submission.status}`)}
            </Badge>
          )}
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
