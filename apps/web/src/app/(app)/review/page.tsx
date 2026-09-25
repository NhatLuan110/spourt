'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { formatIntervalVi } from '@sprout/shared';
import type { ReviewGrade } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { WordAudio } from '@/components/domain/word-audio';
import { ExampleSentence } from '@/components/domain/example-sentence';
import { RewardBanner } from '@/components/domain/reward-banner';
import { queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { api } from '@/lib/api-client';
import { GRADES } from '@/lib/srs-labels';
import type { RewardSummary, SessionSummary, SrsReviewResponse } from '@/lib/api-types';

export default function ReviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-[var(--r-lg)]" />}>
      <ReviewSession />
    </Suspense>
  );
}

function ReviewSession() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const topicSlug = searchParams.get('topic') ?? undefined;
  const deckId = searchParams.get('deck') ?? undefined;
  const queryClient = useQueryClient();

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [lastReward, setLastReward] = useState<RewardSummary | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const sessionId = useRef<string | null>(null);
  const shownAt = useRef<number>(Date.now());

  const params = useMemo(
    () => ({ limit: 30, topicSlug, deckId }),
    [topicSlug, deckId],
  );
  const queue = useQuery({
    queryKey: queryKeys.srsQueue(params),
    queryFn: () => fetchers.srsQueue(params),
    // The queue is a snapshot of one sitting; refetching mid-session would
    // shuffle the cards under the learner.
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (sessionId.current !== null || !queue.data || queue.data.data.length === 0) return;
    let cancelled = false;
    void api.post<{ id: string }>('/srs/sessions').then((session) => {
      if (!cancelled) sessionId.current = session.id;
    });
    return () => {
      cancelled = true;
    };
  }, [queue.data]);

  const grade = useMutation({
    mutationFn: (input: { userWordId: string; grade: ReviewGrade; responseMs: number }) =>
      api.post<SrsReviewResponse>('/srs/review', input),
    onSuccess: (result) => {
      setLastReward(result.reward);
    },
  });

  const finish = useMutation({
    mutationFn: async () => {
      if (!sessionId.current) return null;
      return api.post<SessionSummary>(`/srs/sessions/${sessionId.current}/finish`);
    },
    onSuccess: async (result) => {
      if (result) setSummary(result);
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      await queryClient.invalidateQueries({ queryKey: ['srs'] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.topics });
    },
  });

  if (queue.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[360px] w-full rounded-[var(--r-lg)]" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (queue.isError || !queue.data) {
    return (
      <EmptyState
        title={t('common.errorTitle')}
        body={t('common.errorBody')}
        action={<Button onClick={() => void queue.refetch()}>{t('common.retry')}</Button>}
      />
    );
  }

  const cards = queue.data.data;

  if (summary) {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
        <h1 className="text-[26px]">{t('review.done')}</h1>
        <p className="text-[15px] text-[var(--text-muted)]">
          {t('review.doneBody', {
            count: summary.reviewed,
            percent: Math.round((summary.accuracy ?? 0) * 100),
          })}
        </p>
        {lastReward ? <RewardBanner reward={lastReward} /> : null}
        {summary.achievementsUnlocked.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {summary.achievementsUnlocked.map((achievement) => (
              <li key={achievement.slug}>
                <Badge tone="accent">
                  <span aria-hidden="true">{achievement.icon}</span> {achievement.nameVi}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard">
            <Button>{t('nav.dashboard')}</Button>
          </Link>
          <Link href="/vocabulary">
            <Button variant="secondary">{t('vocabulary.title')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        title={t('review.empty')}
        body={t('review.emptyBody')}
        action={
          <Link href="/learn">
            <Button>{t('vocabulary.learnNew')}</Button>
          </Link>
        }
      />
    );
  }

  const card = cards[index];
  if (!card) return null;

  const submit = (value: ReviewGrade) => {
    const responseMs = Math.min(600_000, Math.max(0, Date.now() - shownAt.current));
    grade.mutate(
      { userWordId: card.userWordId, grade: value, responseMs },
      {
        onSuccess: () => {
          if (index + 1 >= cards.length) {
            finish.mutate();
            return;
          }
          setIndex(index + 1);
          setRevealed(false);
          shownAt.current = Date.now();
        },
      },
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px]">{t('review.title')}</h1>
        <p className="text-[14px] text-[var(--text-muted)]">
          {t('review.remaining', { count: cards.length - index })}
        </p>
      </header>

      {queue.data.meta.backlogWarning ? (
        <p className="rounded-[var(--r-sm)] bg-[var(--warning-soft)] p-3 text-[14px] text-[var(--warning)]">
          {t('review.backlog')}
        </p>
      ) : null}

      <div
        className="h-1.5 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-alt)]"
        role="progressbar"
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={cards.length}
        aria-label={t('review.title')}
      >
        <div
          className="h-full bg-[var(--primary)] transition-[width] duration-300"
          style={{ width: `${(index / cards.length) * 100}%` }}
        />
      </div>

      <Card>
        <CardBody className="flex min-h-[280px] flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[34px]">{card.lemma}</h2>
            {card.isNew ? <Badge tone="info">{t('review.newCard')}</Badge> : null}
            <WordAudio both text={card.lemma} urlUs={card.audioUsUrl} urlUk={card.audioUkUrl} />
          </div>
          {card.ipaUs ? <p className="ipa text-[16px]">{card.ipaUs}</p> : null}

          {revealed ? (
            <div className="flex flex-col gap-3">
              {card.senses.map((sense) => (
                <div key={`${sense.pos}-${sense.definitionVi}`} className="flex flex-col gap-2">
                  <Badge tone="primary" className="self-start">
                    {sense.pos}
                  </Badge>
                  <p className="text-[18px]">{sense.definitionVi}</p>
                  <div className="flex flex-col gap-2 border-l-2 border-[var(--border)] pl-3">
                    {sense.examples.map((example) => (
                      <ExampleSentence key={example.textEn} example={example} withAudio={false} />
                    ))}
                  </div>
                </div>
              ))}
              {card.synonyms.length > 0 ? (
                <p className="text-[13px] text-[var(--text-subtle)]">
                  Đồng nghĩa: {card.synonyms.join(', ')}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="my-auto text-center text-[14px] text-[var(--text-subtle)]">
              Nhớ lại nghĩa rồi bấm để kiểm tra.
            </p>
          )}
        </CardBody>
      </Card>

      {revealed ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRADES.map((item) => (
            <Button
              key={item.grade}
              variant={item.grade === 2 ? 'primary' : 'secondary'}
              className="flex-col !h-auto py-2"
              loading={grade.isPending}
              onClick={() => submit(item.grade)}
            >
              <span>{t(`review.${item.key}`)}</span>
              <span className="text-[12px] opacity-75">
                {formatIntervalVi(card.intervalPreview[String(item.grade)] ?? 0)}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <Button
          block
          size="lg"
          onClick={() => setRevealed(true)}
        >
          {t('review.showAnswer')}
        </Button>
      )}

      {grade.isError ? (
        <p role="alert" className="text-[14px] text-[var(--danger)]">
          {grade.error instanceof Error ? grade.error.message : t('common.errorBody')}
        </p>
      ) : null}
    </div>
  );
}
