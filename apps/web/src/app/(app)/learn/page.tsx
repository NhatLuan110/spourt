'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { CefrLevel } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { WordAudio } from '@/components/domain/word-audio';
import { ExampleSentence } from '@/components/domain/example-sentence';
import { RewardBanner } from '@/components/domain/reward-banner';
import { vocabKeys, queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { api } from '@/lib/api-client';
import type { LearnCommitResponse } from '@/lib/api-types';

export default function LearnPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-[var(--r-lg)]" />}>
      <LearnSession />
    </Suspense>
  );
}

function LearnSession() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const topic = searchParams.get('topic') ?? undefined;
  const queryClient = useQueryClient();

  const [index, setIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const params = useMemo(() => ({ topic }), [topic]);
  const cards = useQuery({
    queryKey: vocabKeys.learnCards(params),
    queryFn: () => fetchers.learnCards(params),
  });

  const commit = useMutation({
    mutationFn: (wordIds: string[]) =>
      api.post<LearnCommitResponse>('/learn/commit', {
        wordIds,
        sourceType: topic ? 'topic' : 'manual',
        sourceId: topic,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      await queryClient.invalidateQueries({ queryKey: queryKeys.topics });
      await queryClient.invalidateQueries({ queryKey: ['srs'] });
    },
  });

  if (cards.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[420px] w-full rounded-[var(--r-lg)]" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (cards.isError || !cards.data) {
    return (
      <EmptyState
        title={t('common.errorTitle')}
        body={t('common.errorBody')}
        action={<Button onClick={() => void cards.refetch()}>{t('common.retry')}</Button>}
      />
    );
  }

  if (commit.isSuccess && commit.data) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-[26px]">{t('learn.committed', { count: commit.data.added })}</h1>
        {commit.data.reward ? <RewardBanner reward={commit.data.reward} /> : null}
        <div className="flex flex-wrap gap-2">
          <Link href={`/review${topic ? `?topic=${topic}` : ''}`}>
            <Button>{t('vocabulary.review')}</Button>
          </Link>
          <Link href={`/practice${topic ? `?topic=${topic}` : ''}`}>
            <Button variant="secondary">{t('vocabulary.practice')}</Button>
          </Link>
          <Link href="/vocabulary">
            <Button variant="ghost">{t('vocabulary.title')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  const list = cards.data.data;

  if (list.length === 0) {
    const quotaReached = cards.data.meta.remainingToday === 0;
    return (
      <EmptyState
        title={quotaReached ? t('learn.quotaTitle') : t('learn.noWords')}
        body={
          quotaReached
            ? t('learn.quotaBody', { count: cards.data.meta.dailyAllowance })
            : t('learn.noWordsBody')
        }
        action={
          <Link href="/review">
            <Button>{t('vocabulary.review')}</Button>
          </Link>
        }
      />
    );
  }

  const card = list[Math.min(index, list.length - 1)];
  if (!card) return null;
  const isLast = index >= list.length - 1;
  const chosen = list.filter((item) => !skipped.has(item.wordId)).map((item) => item.wordId);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px]">{t('learn.title')}</h1>
        <p className="text-[14px] text-[var(--text-muted)]">
          {t('learn.cardOf', { current: index + 1, total: list.length })} ·{' '}
          {t('learn.remaining', { count: cards.data.meta.remainingToday })}
        </p>
      </header>

      <div
        className="h-1.5 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-alt)]"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={list.length}
        aria-label={t('learn.title')}
      >
        <div
          className="h-full bg-[var(--primary)] transition-[width] duration-300"
          style={{ width: `${((index + 1) / list.length) * 100}%` }}
        />
      </div>

      <Card>
        <CardBody className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[32px]">{card.lemma}</h2>
            <CefrTag level={card.cefr as CefrLevel} />
            <WordAudio both text={card.lemma} urlUs={card.audioUsUrl} urlUk={card.audioUkUrl} />
          </div>

          {card.ipaUs ? <p className="ipa text-[16px]">{card.ipaUs}</p> : null}
          {card.syllables ? (
            <p className="text-[13px] text-[var(--text-subtle)]">{card.syllables}</p>
          ) : null}

          {card.senses.map((sense) => (
            <div key={sense.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge tone="primary">{sense.pos}</Badge>
              </div>
              <p className="text-[18px]">{sense.definitionVi}</p>
              <p className="text-[14px] text-[var(--text-muted)]">{sense.definitionEn}</p>
              <div className="flex flex-col gap-2 border-l-2 border-[var(--border)] pl-3">
                {sense.examples.map((example) => (
                  <ExampleSentence key={example.textEn} example={example} />
                ))}
              </div>
            </div>
          ))}

          {card.synonyms.length > 0 ? (
            <p className="text-[13px] text-[var(--text-subtle)]">
              Đồng nghĩa: {card.synonyms.join(', ')}
            </p>
          ) : null}
          {card.family.length > 0 ? (
            <p className="text-[13px] text-[var(--text-subtle)]">
              Họ từ: {card.family.map((member) => `${member.lemma} (${member.pos})`).join(', ')}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          {t('learn.back')}
        </Button>

        <Button
          variant="secondary"
          onClick={() => {
            setSkipped((current) => new Set(current).add(card.wordId));
            if (!isLast) setIndex(index + 1);
          }}
        >
          {t('learn.knowIt')}
        </Button>

        {isLast ? (
          <Button
            className="ml-auto"
            loading={commit.isPending}
            disabled={chosen.length === 0}
            onClick={() => commit.mutate(chosen)}
          >
            {t('learn.finish')} ({chosen.length})
          </Button>
        ) : (
          <Button className="ml-auto" onClick={() => setIndex(index + 1)}>
            {t('learn.next')}
          </Button>
        )}
      </div>

      {commit.isError ? (
        <p role="alert" className="text-[14px] text-[var(--danger)]">
          {commit.error instanceof Error ? commit.error.message : t('common.errorBody')}
        </p>
      ) : null}
    </div>
  );
}
