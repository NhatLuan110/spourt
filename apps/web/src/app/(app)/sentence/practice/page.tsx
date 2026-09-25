'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { RewriteFeedback, RewriteItem, RewriteResult } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { RewardBanner } from '@/components/domain/reward-banner';
import { sentenceKeys, queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function SentencePracticePage() {
  const t = useTranslations();
  const search = useSearchParams();
  const set = search.get('set') ?? undefined;
  const queryClient = useQueryClient();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [startedAt] = useState(() => Date.now());
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [checked, setChecked] = useState<Record<string, RewriteFeedback>>({});

  const params = { ...(set ? { set } : {}), limit: 10 };
  const items = useQuery({
    queryKey: sentenceKeys.practice(params),
    queryFn: () => fetchers.rewritePractice(params),
  });

  const submit = useMutation({
    mutationFn: (list: RewriteItem[]) =>
      api.post<RewriteResult>('/sentence/submit', {
        answers: list.map((item) => ({
          itemId: item.id,
          answer: answers[item.id] ?? '',
          timeSpentMs: Math.min(1_800_000, Math.round((Date.now() - startedAt) / list.length)),
        })),
      }),
    onSuccess: async (payload) => {
      setResult(payload);
      await queryClient.invalidateQueries({ queryKey: sentenceKeys.sets });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  const list = items.data ?? [];
  // Not memoised: `list` is a fresh array each render, so a memo keyed on it
  // would recompute anyway while pretending not to. Counting ten items is free.
  const answered = list.filter((item) => (answers[item.id] ?? '').trim().length > 0).length;

  if (items.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (items.isError) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('sentence.loadFailed')}</p>
          <Link href="/sentence" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('sentence.backToSets')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <Header title={t('sentence.title')} />
        <EmptyState title={t('sentence.emptyTitle')} body={t('sentence.emptyBody')} />
      </div>
    );
  }

  if (result) {
    return (
      <Results
        result={result}
        items={list}
        onAgain={() => {
          setResult(null);
          setAnswers({});
          void items.refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Header title={list[0]?.setTitleVi ?? t('sentence.title')} />

      <p className="text-[14px] text-[var(--text-subtle)]">
        {t('sentence.answeredCount', { answered, total: list.length })}
      </p>

      <ol className="flex flex-col gap-4">
        {list.map((item, index) => (
          <li key={item.id}>
            <ItemCard
              item={item}
              index={index + 1}
              value={answers[item.id] ?? ''}
              checked={checked[item.id] ?? null}
              onChange={(value) => {
                setAnswers((current) => ({ ...current, [item.id]: value }));
                // Editing invalidates the previous verdict; leaving a stale
                // 'correct' badge above a changed answer would be a lie.
                setChecked((current) => {
                  if (!current[item.id]) return current;
                  const next = { ...current };
                  delete next[item.id];
                  return next;
                });
              }}
              onChecked={(feedback) =>
                setChecked((current) => ({ ...current, [item.id]: feedback }))
              }
            />
          </li>
        ))}
      </ol>

      <Button
        size="lg"
        disabled={answered === 0}
        loading={submit.isPending}
        onClick={() => submit.mutate(list)}
      >
        {t('sentence.submit')}
      </Button>

      {submit.isError ? (
        <p className="text-[14px] text-[var(--danger)]">
          {submit.error instanceof Error ? submit.error.message : t('sentence.submitFailed')}
        </p>
      ) : null}
    </div>
  );
}

function Header({ title }: { title: string }) {
  const t = useTranslations();
  return (
    <header className="flex flex-col gap-2">
      <Link href="/sentence" className="text-[14px] text-[var(--text-muted)]">
        ← {t('sentence.backToSets')}
      </Link>
      <h1 className="text-[26px]">{title}</h1>
    </header>
  );
}

function ItemCard({
  item,
  index,
  value,
  checked,
  onChange,
  onChecked,
}: {
  item: RewriteItem;
  index: number;
  value: string;
  checked: RewriteFeedback | null;
  onChange: (value: string) => void;
  onChecked: (feedback: RewriteFeedback) => void;
}) {
  const t = useTranslations();
  const inputId = `rewrite-${item.id}`;

  const check = useMutation({
    mutationFn: () =>
      api.post<RewriteFeedback>('/sentence/check', { itemId: item.id, answer: value }),
    onSuccess: onChecked,
  });

  const partial = checked !== null && !checked.isCorrect && checked.score > 0;

  return (
    <Card
      className={cn(
        checked === null
          ? undefined
          : checked.isCorrect
            ? 'border-[var(--success)]'
            : partial
              ? 'border-[var(--warning)]'
              : 'border-[var(--danger)]',
      )}
    >
      <CardBody className="flex flex-col gap-3 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-[var(--text-subtle)]">{index}</span>
          <CefrTag level={item.cefr as never} />
          {item.cue ? (
            <Badge tone="primary">
              {item.cueType === 'start'
                ? t('sentence.mustStart', { cue: item.cue })
                : t('sentence.mustUse', { cue: item.cue })}
            </Badge>
          ) : null}
        </div>

        <p className="text-[18px] leading-relaxed">{item.source}</p>
        <p className="text-[14px] text-[var(--text-muted)]">{item.instructionVi}</p>

        <label htmlFor={inputId} className="sr-only">
          {t('sentence.yourAnswer')}
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={
            item.cueType === 'start' && item.cue ? `${item.cue}…` : t('sentence.placeholder')
          }
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || value.trim().length === 0) return;
            event.preventDefault();
            check.mutate();
          }}
          className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[16px] outline-none focus:border-[var(--primary)]"
        />

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            disabled={value.trim().length === 0}
            loading={check.isPending}
            onClick={() => check.mutate()}
          >
            {t('sentence.check')}
          </Button>
          {checked === null ? (
            <span className="text-[13px] text-[var(--text-subtle)]">{t('sentence.checkHint')}</span>
          ) : (
            <Badge tone={checked.isCorrect ? 'success' : partial ? 'warning' : 'danger'}>
              {checked.isCorrect
                ? t('sentence.correct')
                : partial
                  ? t('sentence.partial', { score: checked.score })
                  : t('sentence.wrong')}
            </Badge>
          )}
        </div>

        {checked !== null ? (
          <div className="flex flex-col gap-1.5 rounded-[var(--r-md)] bg-[var(--surface-alt)] p-3">
            {checked.hintVi ? (
              <p className="text-[14px] text-[var(--warning)]">{checked.hintVi}</p>
            ) : null}

            {/* The accepted answers are only worth showing once the learner has
                had a go: revealing them earlier turns the exercise into copying. */}
            {!checked.isCorrect ? (
              <div className="text-[14px]">
                <span className="text-[var(--text-muted)]">{t('sentence.accepted')}: </span>
                <span className="font-medium text-[var(--success)]">
                  {checked.accepted.join(' / ')}
                </span>
              </div>
            ) : null}

            <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
              {checked.explanationVi}
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Results({
  result,
  items,
  onAgain,
}: {
  result: RewriteResult;
  items: RewriteItem[];
  onAgain: () => void;
}) {
  const t = useTranslations();
  const bySource = new Map(items.map((item) => [item.id, item]));

  return (
    <div className="flex flex-col gap-5">
      <Header title={t('sentence.resultTitle')} />

      <RewardBanner reward={result.reward} />

      <Card>
        <CardBody className="py-6 text-center">
          <p className="text-[34px] font-semibold text-[var(--primary)]">
            {result.correctCount}/{result.total}
          </p>
          <p className="text-[14px] text-[var(--text-muted)]">
            {t('sentence.accuracy', { percent: Math.round(result.accuracy * 100) })}
          </p>
        </CardBody>
      </Card>

      <ol className="flex flex-col gap-3">
        {result.feedback.map((entry, index) => (
          <li key={entry.itemId}>
            <FeedbackCard
              feedback={entry}
              source={bySource.get(entry.itemId)?.source ?? ''}
              index={index + 1}
            />
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-3">
        <Button onClick={onAgain}>{t('sentence.another')}</Button>
        <Link href="/sentence">
          <Button variant="secondary">{t('sentence.backToSets')}</Button>
        </Link>
      </div>
    </div>
  );
}

function FeedbackCard({
  feedback,
  source,
  index,
}: {
  feedback: RewriteFeedback;
  source: string;
  index: number;
}) {
  const t = useTranslations();
  const partial = !feedback.isCorrect && feedback.score > 0;

  return (
    <Card
      className={cn(
        feedback.isCorrect
          ? 'border-[var(--success)]'
          : partial
            ? 'border-[var(--warning)]'
            : 'border-[var(--danger)]',
      )}
    >
      <CardBody className="flex flex-col gap-2 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-[var(--text-subtle)]">{index}</span>
          <Badge tone={feedback.isCorrect ? 'success' : partial ? 'warning' : 'danger'}>
            {feedback.isCorrect
              ? t('sentence.correct')
              : partial
                ? t('sentence.partial', { score: feedback.score })
                : t('sentence.wrong')}
          </Badge>
          {feedback.copiedSource ? (
            <Badge tone="danger">{t('sentence.copiedSource')}</Badge>
          ) : !feedback.usedCue ? (
            <Badge tone="warning">{t('sentence.cueMissing')}</Badge>
          ) : null}
        </div>

        <p className="text-[14px] text-[var(--text-subtle)]">{source}</p>

        <p className="text-[15px]">
          <span className="text-[var(--text-muted)]">{t('sentence.yours')}: </span>
          <span className={feedback.isCorrect ? '' : 'text-[var(--danger)]'}>
            {feedback.yourAnswer || '—'}
          </span>
        </p>

        <div className="text-[15px]">
          <span className="text-[var(--text-muted)]">{t('sentence.accepted')}: </span>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {feedback.accepted.map((answer) => (
              <li key={answer} className="font-medium text-[var(--success)]">
                {answer}
              </li>
            ))}
          </ul>
        </div>

        {feedback.hintVi ? (
          <p className="text-[14px] text-[var(--warning)]">{feedback.hintVi}</p>
        ) : null}

        <p className="border-t border-[var(--border)] pt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">
          {feedback.explanationVi}
        </p>
      </CardBody>
    </Card>
  );
}
