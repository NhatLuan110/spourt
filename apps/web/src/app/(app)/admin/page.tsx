'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { AdminContentIssue, AdminOverview, AdminUserRow } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { adminKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function AdminPage() {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const overview = useQuery({ queryKey: adminKeys.overview, queryFn: fetchers.adminOverview });
  const issues = useQuery({ queryKey: adminKeys.issues, queryFn: fetchers.adminContentIssues });
  const users = useQuery({
    queryKey: adminKeys.users({ search, page }),
    queryFn: () => fetchers.adminUsers({ search: search || undefined, page, limit: 20 }),
  });

  // A learner without the role gets a 403 from every call here; saying so is
  // better than three empty panels.
  const forbidden =
    overview.isError && overview.error instanceof Error && overview.error.message.includes('quyền');

  if (forbidden) {
    return (
      <EmptyState title={t('admin.forbiddenTitle')} body={t('admin.forbiddenBody')} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[30px]">{t('admin.title')}</h1>
        <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
          {t('admin.subtitle')}
        </p>
      </header>

      {overview.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : overview.data ? (
        <Overview data={overview.data} />
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px]">
          {t('admin.issues', { count: (issues.data ?? []).length })}
        </h2>
        {issues.isLoading ? (
          <Skeleton className="h-20" />
        ) : (issues.data ?? []).length === 0 ? (
          <Card>
            <CardBody className="py-5">
              <p className="text-[15px] text-[var(--success)]">{t('admin.noIssues')}</p>
            </CardBody>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {(issues.data ?? []).map((issue) => (
              <li key={`${issue.kind}-${issue.ref}`}>
                <IssueRow issue={issue} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px]">{t('admin.users')}</h2>
          <input
            type="search"
            value={search}
            aria-label={t('admin.searchLabel')}
            placeholder={t('admin.searchPlaceholder')}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--primary)]"
          />
        </div>

        {users.isLoading ? (
          <Skeleton className="h-64" />
        ) : (users.data?.data ?? []).length === 0 ? (
          <EmptyState title={t('admin.noUsers')} body={t('admin.noUsersBody')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[14px]">
                <caption className="sr-only">{t('admin.users')}</caption>
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[13px] text-[var(--text-muted)]">
                    <th scope="col" className="py-2 pr-3 font-medium">{t('admin.colName')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('admin.colLevel')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('admin.colXp')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('admin.colStreak')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('admin.colLastStudy')}</th>
                    <th scope="col" className="py-2 font-medium">{t('admin.colRole')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(users.data?.data ?? []).map((row) => (
                    <UserRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>

            {users.data?.meta ? (
              <div className="flex items-center justify-between text-[13px] text-[var(--text-subtle)]">
                <span>
                  {t('admin.pageOf', {
                    page: users.data.meta.page,
                    total: users.data.meta.total,
                  })}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    ←
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!users.data.meta.hasMore}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    →
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function Overview({ data }: { data: AdminOverview }) {
  const t = useTranslations();

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('admin.totalUsers')} value={String(data.users.total)} />
        <Stat label={t('admin.activeToday')} value={String(data.users.activeToday)} />
        <Stat label={t('admin.activeWeek')} value={String(data.users.activeThisWeek)} />
        <Stat label={t('admin.newWeek')} value={String(data.users.newThisWeek)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="flex flex-col gap-2 py-5">
            <h2 className="text-[18px]">{t('admin.content')}</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
              <Row label={t('admin.words')} value={data.content.words} />
              <Row label={t('admin.topics')} value={data.content.topics} />
              <Row label={t('admin.lessons')} value={data.content.lessons} />
              <Row label={t('admin.passages')} value={data.content.passages} />
              <Row label={t('admin.tracks')} value={data.content.tracks} />
              <Row label={t('admin.drills')} value={data.content.drills} />
              <Row label={t('admin.scenarios')} value={data.content.scenarios} />
              <Row label={t('admin.writingPrompts')} value={data.content.writingPrompts} />
              <Row label={t('admin.rewriteItems')} value={data.content.rewriteItems} />
              <Row label={t('admin.exercises')} value={data.content.exercises} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-2 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px]">{t('admin.ai')}</h2>
              <Badge tone={data.ai.configured ? 'success' : 'danger'}>
                {data.ai.configured ? data.ai.provider : t('admin.aiOff')}
              </Badge>
              <Badge tone="neutral">
                {t('admin.speech', { provider: data.ai.speechProvider })}
              </Badge>
            </div>

            <p className="text-[13px] text-[var(--text-subtle)]">
              {t('admin.ownKeys', { count: data.ai.learnersWithOwnKey })}
            </p>

            {data.ai.callsByFeature.length === 0 ? (
              <p className="text-[14px] text-[var(--text-muted)]">{t('admin.noAiCalls')}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
                {data.ai.callsByFeature.map((row) => (
                  <Row
                    key={row.feature}
                    label={row.feature}
                    value={row.calls}
                    hint={`${row.tokensIn + row.tokensOut} token`}
                  />
                ))}
              </dl>
            )}

            <h3 className="mt-2 text-[15px]">{t('admin.activityWeek')}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
              <Row label={t('admin.sessions')} value={data.activity.sessions} />
              <Row label={t('admin.reviews')} value={data.activity.reviews} />
              <Row label={t('admin.attempts')} value={data.activity.exerciseAttempts} />
              <Row label={t('admin.writings')} value={data.activity.writingSubmissions} />
              <Row label={t('admin.speakings')} value={data.activity.speakingAttempts} />
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
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

function Row({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <>
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right font-medium">
        {value}
        {hint ? <span className="ml-1 text-[12px] text-[var(--text-subtle)]">{hint}</span> : null}
      </dd>
    </>
  );
}

function IssueRow({ issue }: { issue: AdminContentIssue }) {
  return (
    <Card className="border-[var(--warning)]">
      <CardBody className="flex flex-wrap items-center gap-3 py-3">
        <Badge tone="warning">{issue.kind}</Badge>
        <code className="text-[13px]">{issue.ref}</code>
        <span className="text-[14px] text-[var(--text-muted)]">{issue.detailVi}</span>
      </CardBody>
    </Card>
  );
}

function UserRow({ row }: { row: AdminUserRow }) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const setRole = useMutation({
    mutationFn: (role: AdminUserRow['role']) =>
      api.patch<AdminUserRow>(`/admin/users/${row.id}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <tr className="border-b border-[var(--border)]">
      <td className="py-2 pr-3">
        <span className="block font-medium">{row.displayName}</span>
        <span className="block text-[12px] text-[var(--text-subtle)]">{row.email}</span>
      </td>
      <td className="py-2 pr-3">
        <CefrTag level={row.level} />
      </td>
      <td className="py-2 pr-3">{row.totalXp}</td>
      <td className="py-2 pr-3">{row.currentStreak}</td>
      <td className="py-2 pr-3 text-[13px] text-[var(--text-subtle)]">
        {row.lastStudyDate ? new Date(row.lastStudyDate).toLocaleDateString('vi-VN') : '—'}
      </td>
      <td className="py-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('admin.colRole')}
            value={row.role}
            disabled={setRole.isPending}
            onChange={(event) => setRole.mutate(event.target.value as AdminUserRow['role'])}
            className={cn(
              'rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[13px]',
              setRole.isPending && 'opacity-60',
            )}
          >
            <option value="USER">USER</option>
            <option value="CONTENT_EDITOR">CONTENT_EDITOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          {row.ownAiKey ? <Badge tone="primary">{t('admin.ownKey')}</Badge> : null}
        </div>
        {setRole.isError ? (
          <p className="mt-1 text-[12px] text-[var(--danger)]">
            {setRole.error instanceof Error ? setRole.error.message : t('admin.roleFailed')}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
