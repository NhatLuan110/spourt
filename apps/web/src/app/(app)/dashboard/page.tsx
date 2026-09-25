'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { TREE_STAGES } from '@sprout/shared';
import { useAuth } from '@/components/auth-provider';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TreeCanvas } from '@/components/domain/tree-canvas';
import { LeafProgressRing } from '@/components/domain/leaf-progress-ring';
import { StatPill, XpBar } from '@/components/domain/stat-pills';
import { WeekStrip } from '@/components/domain/week-strip';
import { queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { greetingKey, formatNumber } from '@/lib/utils';

export default function DashboardPage() {
  const t = useTranslations();
  const { user } = useAuth();
  const dashboard = useQuery({ queryKey: queryKeys.dashboard, queryFn: fetchers.dashboard });

  if (!user) return null;

  if (dashboard.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-[420px] w-full rounded-[var(--r-lg)]" />
          <div className="flex flex-col gap-6">
            <Skeleton className="h-[180px] w-full rounded-[var(--r-lg)]" />
            <Skeleton className="h-[180px] w-full rounded-[var(--r-lg)]" />
          </div>
        </div>
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <EmptyState
        title={t('common.errorTitle')}
        body={dashboard.error instanceof Error ? dashboard.error.message : undefined}
        action={<Button onClick={() => void dashboard.refetch()}>{t('common.retry')}</Button>}
      />
    );
  }

  const { progress, tree, today, srs, recommendations, week, recentAchievements } = dashboard.data;
  const nextStage = TREE_STAGES.find((entry) => entry.minXp > progress.totalXp);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[30px]">
          {t(`dashboard.greeting${greetingKey()}`, { name: user.profile.displayName })}
        </h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">{t(`tree.${tree.health}`)}</p>
      </header>

      <Link href="/exam-prep" className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--primary)]">
        <span className="font-medium">{t('nav.examPrep')} · IELTS, TOEIC, Aptis</span>
        <span aria-hidden="true">→</span>
      </Link>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <CardBody className="pt-6">
            <div className="mx-auto max-w-[420px]">
              <TreeCanvas
                stage={tree.stage}
                health={tree.health}
                birds={tree.birds}
                flowers={tree.flowers}
                ariaLabel={`Cây học tập giai đoạn ${tree.nameVi}`}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <StatPill
                icon="🔥"
                value={t('dashboard.streakDays', { days: progress.currentStreak })}
                label=""
                tone="accent"
              />
              <StatPill icon="⭐" value={formatNumber(progress.totalXp)} label="XP" />
              <StatPill
                icon="🌱"
                value={t('dashboard.level', { level: progress.level.level })}
                label=""
              />
              <StatPill icon="🪙" value={progress.coins} label="" />
            </div>

            <XpBar
              className="mt-5"
              level={progress.level.level}
              xpIntoLevel={progress.level.xpIntoLevel}
              xpForNextLevel={progress.level.xpForNextLevel}
            />

            {nextStage ? (
              <p className="mt-3 text-center text-[13px] text-[var(--text-muted)]">
                {t('tree.nextStage', {
                  xp: formatNumber(nextStage.minXp - progress.totalXp),
                  stage: nextStage.nameVi,
                })}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.todayGoal')}</CardTitle>
            </CardHeader>
            <CardBody className="flex items-center gap-5">
              <LeafProgressRing
                value={today.xpEarned}
                max={today.goalXp}
                label={`${today.xpEarned}/${today.goalXp}`}
                caption="XP"
                ariaLabel={t('dashboard.todayGoal')}
              />
              <div className="text-[14px] text-[var(--text-muted)]">
                <p>{today.studyMinutes} phút hôm nay</p>
                <p className="mt-1">
                  {today.wordsLearned} từ mới · {today.wordsReviewed} thẻ ôn
                </p>
                {today.accuracy !== null ? (
                  <p className="mt-1">Chính xác {Math.round(today.accuracy * 100)}%</p>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.continueLearning')}</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              {recommendations.length === 0 ? (
                <EmptyState
                  className="py-4"
                  title={t('dashboard.emptyStateTitle')}
                  body={t('dashboard.emptyStateBody')}
                  action={
                    <Link href="/vocabulary">
                      <Button>{t('vocabulary.learnNew')}</Button>
                    </Link>
                  }
                />
              ) : (
                recommendations.map((item, index) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-[var(--r-md)] border border-[var(--border)] p-3 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-medium">{item.titleVi}</span>
                      {index === 0 ? <Badge tone="primary">Ưu tiên</Badge> : null}
                    </span>
                    <span className="mt-1 block text-[13px] text-[var(--text-muted)]">
                      {item.reasonVi}
                    </span>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.weekStats')}</CardTitle>
          </CardHeader>
          <CardBody>
            <WeekStrip days={week} goalXp={today.goalXp} />
            <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-[13px]">
              <div>
                <dt className="text-[var(--text-muted)]">Đang học</dt>
                <dd className="text-[20px]">{srs.learningCount}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Đã thuộc</dt>
                <dd className="text-[20px]">{srs.masteredCount}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Đến hạn</dt>
                <dd className="text-[20px]">{srs.dueNow}</dd>
              </div>
            </dl>
            {srs.backlogWarning ? (
              <p className="mt-3 rounded-[var(--r-sm)] bg-[var(--warning-soft)] p-2 text-[13px] text-[var(--warning)]">
                {t('review.backlog')}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thành tựu gần đây</CardTitle>
          </CardHeader>
          <CardBody>
            {recentAchievements.length === 0 ? (
              <p className="text-[14px] text-[var(--text-muted)]">
                Chưa có huy hiệu nào. Học đủ 10 từ để mở chiếc đầu tiên.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentAchievements.map((achievement) => (
                  <li key={achievement.slug} className="flex items-center gap-3">
                    <span aria-hidden="true" className="text-[24px]">
                      {achievement.icon}
                    </span>
                    <span className="text-[14px]">{achievement.nameVi}</span>
                    <Badge tone="success" className="ml-auto">
                      {achievement.tier}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
