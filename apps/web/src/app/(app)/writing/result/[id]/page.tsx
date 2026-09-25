'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { WritingIssue } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { aiKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function WritingResultPage() {
  const t = useTranslations();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [openIssue, setOpenIssue] = useState<number | null>(null);

  const submission = useQuery({
    queryKey: aiKeys.submission(id),
    queryFn: () => fetchers.writingSubmission(id),
  });

  if (submission.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (submission.isError || !submission.data) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('writing.loadFailed')}</p>
          <Link href="/writing" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('writing.backToList')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const data = submission.data;
  const feedback = data.feedback;

  if (!feedback) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <Badge tone={data.status === 'failed' ? 'danger' : 'neutral'}>
            {t(`writing.status.${data.status}`)}
          </Badge>
          <p className="max-w-prose text-[15px] text-[var(--text-muted)]">
            {data.errorMessageVi ?? t('writing.notGradedYet')}
          </p>
          <Link href="/writing">
            <Button variant="secondary">{t('writing.backToList')}</Button>
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/writing" className="text-[14px] text-[var(--text-muted)]">
          ← {t('writing.backToList')}
        </Link>
        <h1 className="text-[28px]">
          {data.promptTitle ?? data.freeTopic ?? t('writing.freeWriting')}
        </h1>
      </header>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-center gap-6 py-8 text-center">
          <div>
            <p className="text-[13px] text-[var(--text-muted)]">{t('writing.overall')}</p>
            <p className="text-[52px] leading-none font-semibold text-[var(--primary)]">
              {Math.round(feedback.overallScore)}
            </p>
            <p className="text-[13px] text-[var(--text-subtle)]">/100</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-[13px] text-[var(--text-muted)]">{t('writing.levelEstimate')}</p>
            <CefrTag level={feedback.cefrEstimate} />
            <p className="text-[13px] text-[var(--text-subtle)]">
              {t('writing.wordCount', { count: data.wordCount })}
            </p>
          </div>
        </CardBody>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px]">{t('writing.criteria')}</h2>
        <ul className="flex flex-col gap-2">
          {feedback.criteria.map((criterion) => (
            <li key={criterion.criterion}>
              <Card>
                <CardBody className="flex flex-col gap-2 py-4">
                  <div className="flex items-center gap-3">
                    <span className="min-w-[110px] text-[15px] font-medium">
                      {t(`writing.criterion.${criterion.criterion}`)}
                    </span>
                    <div
                      className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-alt)]"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={10}
                      aria-valuenow={criterion.score}
                      aria-label={t(`writing.criterion.${criterion.criterion}`)}
                    >
                      <div
                        className="h-full rounded-full bg-[var(--primary)]"
                        style={{ width: `${(criterion.score / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-[14px] text-[var(--text-muted)]">
                      {criterion.score}/10
                    </span>
                  </div>
                  <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
                    {criterion.commentVi}
                  </p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px]">
          {t('writing.issues', { count: feedback.issues.length })}
        </h2>
        <Card>
          <CardBody className="py-5">
            <p className="mb-3 text-[13px] text-[var(--text-subtle)]">{t('writing.tapIssue')}</p>
            <AnnotatedText
              content={data.content}
              issues={feedback.issues}
              openIndex={openIssue}
              onOpen={setOpenIssue}
            />
          </CardBody>
        </Card>

        {openIssue !== null && feedback.issues[openIssue] ? (
          <IssueDetail issue={feedback.issues[openIssue]} onClose={() => setOpenIssue(null)} />
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px]">{t('writing.rewrite')}</h2>
        <Card>
          <CardBody className="flex flex-col gap-3 py-5">
            <pre className="whitespace-pre-wrap font-sans text-[16px] leading-relaxed">
              {feedback.rewrite}
            </pre>
            {feedback.rewriteNotesVi.length > 0 ? (
              <ul className="flex flex-col gap-1 border-t border-[var(--border)] pt-3 text-[14px] text-[var(--text-muted)]">
                {feedback.rewriteNotesVi.map((note) => (
                  <li key={note}>· {note}</li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="flex flex-col gap-2 py-5">
            <h2 className="text-[18px]">{t('writing.strengths')}</h2>
            <ul className="flex flex-col gap-1.5 text-[15px] text-[var(--text-muted)]">
              {feedback.strengths.map((strength) => (
                <li key={strength}>+ {strength}</li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-2 py-5">
            <h2 className="text-[18px]">{t('writing.nextSteps')}</h2>
            <ul className="flex flex-col gap-1.5 text-[15px] text-[var(--text-muted)]">
              {feedback.nextSteps.map((step) => (
                <li key={step.labelVi}>
                  {step.href ? (
                    <Link href={step.href} className="text-[var(--primary)] underline">
                      → {step.labelVi}
                    </Link>
                  ) : (
                    <>→ {step.labelVi}</>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/writing">
          <Button variant="secondary">{t('writing.backToList')}</Button>
        </Link>
        {data.promptSlug ? (
          <Link href={`/writing/${data.promptSlug}`}>
            <Button>{t('writing.tryAgain')}</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The learner's own text with each issue underlined in place.
 *
 * Offsets come from the server, which located every quote inside the submitted
 * string, so the highlight cannot drift onto the wrong words.
 */
function AnnotatedText({
  content,
  issues,
  openIndex,
  onOpen,
}: {
  content: string;
  issues: WritingIssue[];
  openIndex: number | null;
  onOpen: (index: number | null) => void;
}) {
  const pieces: React.ReactNode[] = [];
  let cursor = 0;

  issues.forEach((issue, index) => {
    if (issue.start < cursor) return;
    if (issue.start > cursor) {
      pieces.push(<Fragment key={`t-${index}`}>{content.slice(cursor, issue.start)}</Fragment>);
    }
    pieces.push(
      <button
        key={`i-${index}`}
        type="button"
        onClick={() => onOpen(openIndex === index ? null : index)}
        className={cn(
          'rounded-[var(--r-sm)] px-0.5 underline decoration-wavy underline-offset-4',
          issue.severity === 'major'
            ? 'decoration-[var(--danger)]'
            : 'decoration-[var(--warning)]',
          openIndex === index ? 'bg-[var(--warning-soft)]' : '',
        )}
      >
        {content.slice(issue.start, issue.end)}
      </button>,
    );
    cursor = issue.end;
  });

  if (cursor < content.length) {
    pieces.push(<Fragment key="t-last">{content.slice(cursor)}</Fragment>);
  }

  return (
    <p className="whitespace-pre-wrap text-[16px] leading-[1.9]">{pieces}</p>
  );
}

function IssueDetail({ issue, onClose }: { issue: WritingIssue; onClose: () => void }) {
  const t = useTranslations();

  return (
    <Card>
      <CardBody className="flex flex-col gap-2 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={issue.severity === 'major' ? 'danger' : 'warning'}>
            {t(`writing.severity.${issue.severity}`)}
          </Badge>
          <Badge tone="neutral">{issue.category}</Badge>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[14px] text-[var(--text-muted)]"
          >
            {t('writing.close')}
          </button>
        </div>

        <p className="text-[16px]">
          <span className="line-through opacity-70">{issue.original}</span>
          {issue.suggestion ? (
            <>
              {' → '}
              <span className="font-medium text-[var(--success)]">{issue.suggestion}</span>
            </>
          ) : null}
        </p>

        <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">{issue.whyVi}</p>
      </CardBody>
    </Card>
  );
}
