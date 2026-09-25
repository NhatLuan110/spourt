'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type {
  PronunciationIssueView,
  SpeakingDrillCard,
  SpeakingScenarioCard,
} from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { speakingKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function SpeakingPage() {
  const t = useTranslations();
  const [weakOnly, setWeakOnly] = useState(false);

  const capabilities = useQuery({
    queryKey: speakingKeys.capabilities,
    queryFn: fetchers.speakingCapabilities,
  });
  const drills = useQuery({
    queryKey: speakingKeys.drills({ weakOnly }),
    queryFn: () => fetchers.speakingDrills({ weakOnly }),
  });
  const issues = useQuery({ queryKey: speakingKeys.issues, queryFn: fetchers.pronunciationIssues });
  const scenarios = useQuery({ queryKey: speakingKeys.scenarios, queryFn: fetchers.scenarios });

  const unavailable = capabilities.data ? !capabilities.data.canTranscribe : false;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[30px]">{t('speaking.title')}</h1>
        <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
          {t('speaking.subtitle')}
        </p>
      </header>

      {unavailable ? (
        <Card>
          <CardBody className="py-5">
            <p className="text-[15px] text-[var(--text-muted)]">{t('speaking.notConfigured')}</p>
          </CardBody>
        </Card>
      ) : null}

      {(issues.data ?? []).length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[20px]">{t('speaking.yourWeakSounds')}</h2>
          <ul className="flex flex-col gap-2">
            {(issues.data ?? []).slice(0, 4).map((issue) => (
              <li key={issue.phoneme}>
                <IssueCard issue={issue} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px]">{t('speaking.drills')}</h2>
          <button
            type="button"
            aria-pressed={weakOnly}
            onClick={() => setWeakOnly((on) => !on)}
            className={cn(
              'rounded-[var(--r-full)] border px-3 py-1.5 text-[14px] transition-colors',
              weakOnly
                ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                : 'border-[var(--border)] text-[var(--text-muted)]',
            )}
          >
            {t('speaking.weakOnly')}
          </button>
        </div>

        {drills.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : (drills.data ?? []).length === 0 ? (
          <EmptyState title={t('speaking.emptyTitle')} body={t('speaking.emptyBody')} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {(drills.data ?? []).map((drill) => (
              <li key={drill.slug}>
                <DrillCard drill={drill} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px]">{t('speaking.scenarios')}</h2>
        {scenarios.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {(scenarios.data ?? []).map((scenario) => (
              <li key={scenario.slug}>
                <ScenarioCard scenario={scenario} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function IssueCard({ issue }: { issue: PronunciationIssueView }) {
  const t = useTranslations();
  const rate = issue.totalCount === 0 ? 0 : Math.round((issue.errorCount / issue.totalCount) * 100);

  return (
    <Card>
      <CardBody className="flex flex-col gap-1.5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[var(--r-sm)] bg-[var(--surface-alt)] px-2 py-0.5 font-mono text-[15px]">
            /{issue.phoneme}/
          </span>
          <span className="text-[15px] font-medium">{issue.labelVi}</span>
          <Badge tone={rate > 50 ? 'danger' : 'warning'}>
            {t('speaking.errorRate', { rate, total: issue.totalCount })}
          </Badge>
        </div>
        <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">{issue.tipVi}</p>
        {issue.exampleWords.length > 0 ? (
          <p className="text-[13px] text-[var(--text-subtle)]">
            {t('speaking.examples')}: {issue.exampleWords.join(' · ')}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function DrillCard({ drill }: { drill: SpeakingDrillCard }) {
  const t = useTranslations();

  return (
    <Link href={`/speaking/drill/${drill.slug}`} className="block h-full">
      <Card className="h-full transition-colors hover:border-[var(--border-strong)]">
        <CardBody className="flex h-full flex-col gap-2 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <CefrTag level={drill.cefr} />
            <Badge tone="neutral">{drill.focusLabelVi}</Badge>
            {drill.bestScore !== null ? (
              <Badge tone={drill.bestScore >= 80 ? 'success' : 'warning'}>
                {Math.round(drill.bestScore)}/100
              </Badge>
            ) : null}
          </div>

          <p className="text-[17px] font-medium">{drill.text}</p>
          {drill.ipa ? (
            <p className="font-mono text-[13px] text-[var(--text-subtle)]">{drill.ipa}</p>
          ) : null}
          <p className="text-[14px] text-[var(--text-muted)]">{drill.translationVi}</p>

          {drill.minimalPair ? (
            <p className="mt-auto pt-2 text-[13px] text-[var(--text-subtle)]">
              {t('speaking.minimalPair')}: {drill.minimalPair}
            </p>
          ) : null}
        </CardBody>
      </Card>
    </Link>
  );
}

function ScenarioCard({ scenario }: { scenario: SpeakingScenarioCard }) {
  const t = useTranslations();

  return (
    <Link href={`/speaking/roleplay/${scenario.slug}`} className="block h-full">
      <Card className="h-full transition-colors hover:border-[var(--border-strong)]">
        <CardBody className="flex h-full flex-col gap-2 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <CefrTag level={scenario.cefr} />
            <Badge tone="neutral">{scenario.category}</Badge>
          </div>
          <p className="text-[17px] font-semibold">{scenario.titleVi}</p>
          <p className="text-[14px] text-[var(--text-muted)]">{scenario.title}</p>
          <p className="mt-auto pt-2 text-[13px] text-[var(--text-subtle)]">
            {t('speaking.scenarioMeta', {
              turns: scenario.maxTurns,
              objectives: scenario.objectives.length,
            })}
          </p>
        </CardBody>
      </Card>
    </Link>
  );
}
