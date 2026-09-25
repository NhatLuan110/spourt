'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { TestCard } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { testKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';

export default function TestsPage() {
  const t = useTranslations();
  const tests = useQuery({ queryKey: testKeys.list({}), queryFn: () => fetchers.tests({}) });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[30px]">{t('tests.title')}</h1>
        <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
          {t('tests.subtitle')}
        </p>
      </header>

      {tests.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (tests.data ?? []).length === 0 ? (
        <EmptyState title={t('tests.emptyTitle')} body={t('tests.emptyBody')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {(tests.data ?? []).map((test) => (
            <li key={test.slug}>
              <TestRow test={test} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TestRow({ test }: { test: TestCard }) {
  const t = useTranslations();
  const last = test.lastAttempt;

  return (
    <Card>
      <CardBody className="flex flex-col gap-3 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{t(`tests.kind.${test.kind}`)}</Badge>
          {test.cefr ? <CefrTag level={test.cefr} /> : null}
          {test.isAdaptive ? <Badge tone="accent">{t('tests.adaptive')}</Badge> : null}
        </div>

        <div>
          <p className="text-[19px] font-semibold">{test.title}</p>
          <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
            {test.description}
          </p>
        </div>

        <p className="text-[13px] text-[var(--text-subtle)]">
          {test.isAdaptive
            ? t('tests.metaAdaptive', { minutes: test.durationMin })
            : t('tests.meta', { minutes: test.durationMin, questions: test.questionCount })}
        </p>

        {last ? (
          <p className="text-[14px]">
            {t('tests.lastResult', {
              score: Math.round((last.totalScore / Math.max(1, last.maxScore)) * 100),
              level: last.cefrResult ?? '—',
            })}{' '}
            <Link
              href={`/tests/result/${last.id}`}
              className="text-[var(--primary)] underline"
            >
              {t('tests.viewResult')}
            </Link>
          </p>
        ) : null}

        <div>
          <Link href={`/tests/${test.slug}`}>
            <Button>{last ? t('tests.retake') : t('tests.start')}</Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
