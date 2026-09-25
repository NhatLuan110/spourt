'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ANALYTICS_PERIODS, SKILL_LABEL_VI } from '@sprout/shared';
import type { AnalyticsPeriod, DailyPoint, MistakeGroup, SkillBreakdown } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function AnalyticsPage() {
  const t = useTranslations();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');

  const analytics = useQuery({
    queryKey: queryKeys.analytics(period),
    queryFn: () => fetchers.analytics(period),
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px]">{t('analytics.title')}</h1>
          <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
            {t('analytics.subtitle')}
          </p>
        </div>

        <div role="group" aria-label={t('analytics.period')} className="flex gap-2">
          {ANALYTICS_PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={cn(
                'rounded-[var(--r-full)] border px-3 py-1.5 text-[14px] transition-colors',
                period === value
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                  : 'border-[var(--border)] text-[var(--text-muted)]',
              )}
            >
              {t(`analytics.periodLabel.${value}`)}
            </button>
          ))}
        </div>
      </header>

      {analytics.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : !analytics.data ? (
        <EmptyState title={t('analytics.emptyTitle')} body={t('analytics.emptyBody')} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('analytics.totalXp')} value={String(analytics.data.totals.xp)} />
            <Stat
              label={t('analytics.totalMinutes')}
              value={String(analytics.data.totals.minutes)}
            />
            <Stat
              label={t('analytics.activeDays')}
              value={`${analytics.data.totals.activeDays}/${analytics.data.daily.length}`}
            />
            <Stat
              label={t('analytics.accuracy')}
              value={
                analytics.data.totals.accuracy === null
                  ? '—'
                  : `${Math.round(analytics.data.totals.accuracy * 100)}%`
              }
            />
          </section>

          {analytics.data.insightsVi.length > 0 ? (
            <Card>
              <CardBody className="flex flex-col gap-2 py-5">
                <h2 className="text-[18px]">{t('analytics.insights')}</h2>
                <ul className="flex flex-col gap-1.5 text-[15px] text-[var(--text-muted)]">
                  {analytics.data.insightsVi.map((line) => (
                    <li key={line}>· {line}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardBody className="flex flex-col gap-3 py-5">
              <h2 className="text-[18px]">{t('analytics.dailyXp')}</h2>
              <XpBars daily={analytics.data.daily} />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-3 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px]">{t('analytics.skills')}</h2>
                <Badge tone="primary">
                  {t('analytics.overall', {
                    score: Math.round(analytics.data.overall.score),
                    cefr: analytics.data.overall.cefr,
                  })}
                </Badge>
              </div>
              <ul className="flex flex-col gap-2">
                {analytics.data.skills.map((skill) => (
                  <li key={skill.skill}>
                    <SkillBar skill={skill} />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardBody className="flex flex-col gap-3 py-5">
                <h2 className="text-[18px]">{t('analytics.mistakes')}</h2>
                {analytics.data.mistakes.length === 0 ? (
                  <p className="text-[14px] text-[var(--text-muted)]">
                    {t('analytics.noMistakes')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {analytics.data.mistakes.map((group) => (
                      <li key={group.category}>
                        <MistakeRow group={group} max={analytics.data.mistakes[0]?.count ?? 1} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardBody className="flex flex-col gap-3 py-5">
                <h2 className="text-[18px]">{t('analytics.weakSpots')}</h2>
                {analytics.data.weakSpots.length === 0 ? (
                  <p className="text-[14px] text-[var(--text-muted)]">
                    {t('analytics.noWeakSpots')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2 text-[14px]">
                    {analytics.data.weakSpots.map((spot) => (
                      <li key={spot.key} className="flex flex-col">
                        <span className="font-medium">{spot.label}</span>
                        <span className="text-[var(--text-muted)]">{spot.reasonVi}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          {analytics.data.habits.length > 0 ? (
            <Card>
              <CardBody className="flex flex-col gap-3 py-5">
                <h2 className="text-[18px]">{t('analytics.habits')}</h2>
                <HourBars
                  habits={analytics.data.habits}
                  max={Math.max(...analytics.data.habits.map((entry) => entry.minutes))}
                />
              </CardBody>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody className="py-4">
        <p className="text-[13px] text-[var(--text-muted)]">{label}</p>
        <p className="mt-1 text-[24px] font-semibold">{value}</p>
      </CardBody>
    </Card>
  );
}

/**
 * A bar per day. Rendered as divs rather than a chart library: the shape is
 * simple, and this keeps the page working without JavaScript measuring the
 * container first.
 */
function XpBars({ daily }: { daily: DailyPoint[] }) {
  const t = useTranslations();
  const max = Math.max(1, ...daily.map((point) => point.xp));

  return (
    <div className="flex h-32 items-end gap-[2px]" role="img" aria-label={t('analytics.dailyXp')}>
      {daily.map((point) => (
        <div
          key={point.date}
          title={t('analytics.dayTooltip', { date: point.date, xp: point.xp })}
          className="flex-1 rounded-t-[2px] bg-[var(--primary)] transition-[height]"
          style={{
            height: `${Math.max(point.xp === 0 ? 2 : 6, (point.xp / max) * 100)}%`,
            opacity: point.xp === 0 ? 0.18 : 1,
          }}
        />
      ))}
    </div>
  );
}

function SkillBar({ skill }: { skill: SkillBreakdown }) {
  const t = useTranslations();
  const measured = skill.attempts > 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-[86px] text-[14px] font-medium">{SKILL_LABEL_VI[skill.skill]}</span>
      {skill.cefrEstimate ? <CefrTag level={skill.cefrEstimate} /> : null}

      <div
        className="h-2 min-w-[100px] flex-1 overflow-hidden rounded-full bg-[var(--surface-alt)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(skill.score)}
        aria-label={SKILL_LABEL_VI[skill.skill]}
      >
        <div
          className="h-full rounded-full bg-[var(--primary)]"
          style={{ width: `${Math.min(100, skill.score)}%` }}
        />
      </div>

      <span className="text-[13px] text-[var(--text-muted)]">
        {measured
          ? t('analytics.skillMeasured', {
              accuracy: Math.round((skill.periodAccuracy ?? 0) * 100),
              attempts: skill.attempts,
            })
          : t('analytics.skillUntouched')}
      </span>

      {skill.lowConfidence && measured ? (
        <Badge tone="warning">{t('analytics.provisional')}</Badge>
      ) : null}
    </div>
  );
}

function MistakeRow({ group, max }: { group: MistakeGroup; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-[150px] text-[14px]">{group.labelVi}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-alt)]">
        <div
          className="h-full rounded-full bg-[var(--danger)]"
          style={{ width: `${(group.count / Math.max(1, max)) * 100}%` }}
        />
      </div>
      <span className="text-[13px] text-[var(--text-muted)]">{group.count}</span>
    </div>
  );
}

function HourBars({ habits, max }: { habits: { hour: number; minutes: number }[]; max: number }) {
  const byHour = new Map(habits.map((entry) => [entry.hour, entry.minutes]));

  return (
    <div className="flex h-24 items-end gap-[3px]">
      {Array.from({ length: 24 }, (_, hour) => {
        const minutes = byHour.get(hour) ?? 0;
        return (
          <div key={hour} className="flex flex-1 flex-col items-center gap-1">
            <div
              title={`${String(hour).padStart(2, '0')}:00 — ${minutes}′`}
              className="w-full rounded-t-[2px] bg-[var(--moss)]"
              style={{
                height: `${Math.max(minutes === 0 ? 2 : 8, (minutes / Math.max(1, max)) * 70)}px`,
                opacity: minutes === 0 ? 0.18 : 1,
              }}
            />
            {hour % 6 === 0 ? (
              <span className="text-[10px] text-[var(--text-subtle)]">{hour}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
