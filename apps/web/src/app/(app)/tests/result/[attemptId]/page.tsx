'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { SKILL_LABEL_VI } from '@sprout/shared';
import type { TestSkillResult } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { testKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';

export default function TestResultPage() {
  const t = useTranslations();
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;

  const result = useQuery({
    queryKey: testKeys.attempt(attemptId),
    queryFn: () => fetchers.testAttempt(attemptId),
  });

  if (result.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (result.isError || !result.data) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('tests.resultFailed')}</p>
          <Link href="/tests" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('tests.backToList')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const data = result.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/tests" className="text-[14px] text-[var(--text-muted)]">
          ← {t('tests.backToList')}
        </Link>
        <h1 className="text-[28px]">{t('tests.resultTitle')}</h1>
      </header>

      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-8 text-center">
          {data.cefrResult ? (
            <>
              <span className="text-[15px] text-[var(--text-muted)]">
                {t('tests.yourLevel')}
              </span>
              <span className="text-[56px] leading-none font-semibold text-[var(--primary)]">
                {data.cefrResult}
              </span>
            </>
          ) : null}

          <p className="text-[16px]">
            {t('tests.scoreLine', {
              correct: Math.round(data.totalScore),
              total: data.maxScore,
              percent: Math.round(data.accuracy * 100),
            })}
          </p>

          <p className="text-[13px] text-[var(--text-subtle)]">
            {t('tests.duration', { minutes: Math.max(1, Math.round(data.durationSec / 60)) })}
          </p>

          {data.profileUpdated ? (
            <Badge tone="success">{t('tests.levelSaved')}</Badge>
          ) : null}
        </CardBody>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px]">{t('tests.bySkill')}</h2>
        <ul className="flex flex-col gap-2">
          {[...data.skills]
            .sort((a, b) => a.score - b.score)
            .map((skill) => (
              <li key={skill.skill}>
                <SkillRow skill={skill} />
              </li>
            ))}
        </ul>
      </section>

      {data.adviceVi.length > 0 ? (
        <Card>
          <CardBody className="flex flex-col gap-2 py-5">
            <h2 className="text-[18px]">{t('tests.advice')}</h2>
            <ul className="flex flex-col gap-1.5 text-[15px] text-[var(--text-muted)]">
              {data.adviceVi.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard">
          <Button>{t('tests.startLearning')}</Button>
        </Link>
        <Link href="/analytics">
          <Button variant="secondary">{t('tests.openAnalytics')}</Button>
        </Link>
      </div>
    </div>
  );
}

function SkillRow({ skill }: { skill: TestSkillResult }) {
  const t = useTranslations();

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-3 py-3">
        <span className="min-w-[92px] text-[15px] font-medium">{SKILL_LABEL_VI[skill.skill]}</span>
        <CefrTag level={skill.cefr} />

        <div
          className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-[var(--surface-alt)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={skill.score}
          aria-label={SKILL_LABEL_VI[skill.skill]}
        >
          <div
            className="h-full rounded-full bg-[var(--primary)]"
            style={{ width: `${skill.score}%` }}
          />
        </div>

        <span className="text-[14px] text-[var(--text-muted)]">
          {t('tests.skillScore', {
            correct: skill.correct,
            asked: skill.asked,
            score: skill.score,
          })}
        </span>
      </CardBody>
    </Card>
  );
}
