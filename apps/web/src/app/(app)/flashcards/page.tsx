'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FLASHCARD_DIRECTIONS } from '@sprout/shared';
import type {
  FlashcardDeckView,
  FlashcardDirection,
  FlashcardRateResult,
  FlashcardSource,
  FlashcardView,
} from '@sprout/shared';
import { api } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { vocabKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { playWord } from '@/lib/speech';
import { cn } from '@/lib/utils';

export default function FlashcardsPage() {
  const t = useTranslations();
  const search = useSearchParams();

  const source = (search.get('source') ?? 'topic') as FlashcardSource;
  const ref = search.get('ref') ?? undefined;
  const [direction, setDirection] = useState<FlashcardDirection>('en-vi');
  const [unknownOnly, setUnknownOnly] = useState(false);

  const params = { source, ref, direction, unknownOnly, limit: 30 };
  const deck = useQuery({
    queryKey: vocabKeys.flashcards(params),
    queryFn: () => fetchers.flashcards(params),
  });

  if (deck.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (deck.isError || !deck.data) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('flashcards.loadFailed')}</p>
          <Link href="/vocabulary" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('flashcards.backToVocabulary')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Runner
      deck={deck.data}
      direction={direction}
      unknownOnly={unknownOnly}
      onDirection={setDirection}
      onUnknownOnly={setUnknownOnly}
      onRestart={() => void deck.refetch()}
    />
  );
}

function Runner({
  deck,
  direction,
  unknownOnly,
  onDirection,
  onUnknownOnly,
  onRestart,
}: {
  deck: FlashcardDeckView;
  direction: FlashcardDirection;
  unknownOnly: boolean;
  onDirection: (value: FlashcardDirection) => void;
  onUnknownOnly: (value: boolean) => void;
  onRestart: () => void;
}) {
  const t = useTranslations();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [unknown, setUnknown] = useState<Set<string>>(new Set());

  const card = deck.cards[index];
  const finished = index >= deck.cards.length;

  const rate = useMutation({
    mutationFn: (body: { wordId: string; known: boolean; timeSpentMs: number }) =>
      api.post<FlashcardRateResult>('/flashcards/rate', body),
  });

  const answer = useCallback(
    (isKnown: boolean) => {
      if (!card) return;
      rate.mutate({
        wordId: card.wordId,
        known: isKnown,
        timeSpentMs: Math.min(600_000, Date.now() - shownAt),
      });
      if (isKnown) setKnown((set) => new Set(set).add(card.wordId));
      else setUnknown((set) => new Set(set).add(card.wordId));

      setFlipped(false);
      setShownAt(Date.now());
      setIndex((current) => current + 1);
    },
    [card, rate, shownAt],
  );

  // Space flips, arrow keys answer — the shortcuts a learner who has used
  // Quizlet or Anki will already try.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (finished) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setFlipped((value) => !value);
      } else if (flipped && event.key === 'ArrowRight') {
        event.preventDefault();
        answer(true);
      } else if (flipped && event.key === 'ArrowLeft') {
        event.preventDefault();
        answer(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, finished, flipped]);

  const progress = deck.cards.length === 0 ? 0 : (index / deck.cards.length) * 100;

  const controls = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t('flashcards.direction')} className="flex gap-1.5">
          {FLASHCARD_DIRECTIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={direction === value}
              onClick={() => onDirection(value)}
              className={cn(
                'rounded-[var(--r-full)] border px-3 py-1 text-[13px] transition-colors',
                direction === value
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                  : 'border-[var(--border)] text-[var(--text-muted)]',
              )}
            >
              {t(`flashcards.dir.${value}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={unknownOnly}
          onClick={() => onUnknownOnly(!unknownOnly)}
          className={cn(
            'rounded-[var(--r-full)] border px-3 py-1 text-[13px] transition-colors',
            unknownOnly
              ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
              : 'border-[var(--border)] text-[var(--text-muted)]',
          )}
        >
          {t('flashcards.unknownOnly')}
        </button>
      </div>
    ),
    [direction, onDirection, onUnknownOnly, t, unknownOnly],
  );

  if (deck.cards.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <Header title={deck.title} controls={controls} />
        <EmptyState title={t('flashcards.emptyTitle')} body={t('flashcards.emptyBody')} />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="flex flex-col gap-5">
        <Header title={deck.title} controls={controls} />
        <Card>
          <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="text-[44px]" aria-hidden="true">
              🌿
            </span>
            <p className="text-[20px]">{t('flashcards.done')}</p>
            <p className="text-[15px] text-[var(--text-muted)]">
              {t('flashcards.summary', { known: known.size, unknown: unknown.size })}
            </p>
            {unknown.size > 0 ? (
              <p className="max-w-prose text-[14px] text-[var(--text-subtle)]">
                {t('flashcards.enqueuedNotice', { count: unknown.size })}
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setIndex(0);
                  setFlipped(false);
                  setKnown(new Set());
                  setUnknown(new Set());
                  setShownAt(Date.now());
                  onRestart();
                }}
              >
                {t('flashcards.again')}
              </Button>
              {unknown.size > 0 ? (
                <Link href="/review">
                  <Button variant="secondary">{t('flashcards.goReview')}</Button>
                </Link>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Header title={deck.title} controls={controls} />

      <div className="flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-alt)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={deck.cards.length}
          aria-valuenow={index}
          aria-label={t('flashcards.progress')}
        >
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[13px] text-[var(--text-subtle)]">
          {index + 1}/{deck.cards.length}
        </span>
      </div>

      {card ? (
        <>
          <Flashcard card={card} flipped={flipped} onFlip={() => setFlipped((v) => !v)} />

          {flipped ? (
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => answer(false)}
              >
                {t('flashcards.notYet')}
              </Button>
              <Button className="flex-1" onClick={() => answer(true)}>
                {t('flashcards.gotIt')}
              </Button>
            </div>
          ) : (
            <Button size="lg" onClick={() => setFlipped(true)}>
              {t('flashcards.flip')}
            </Button>
          )}

          <p className="text-center text-[12px] text-[var(--text-subtle)]">
            {t('flashcards.shortcuts')}
          </p>
        </>
      ) : null}
    </div>
  );
}

function Header({ title, controls }: { title: string; controls: React.ReactNode }) {
  const t = useTranslations();
  return (
    <header className="flex flex-col gap-3">
      <Link href="/vocabulary" className="text-[14px] text-[var(--text-muted)]">
        ← {t('flashcards.backToVocabulary')}
      </Link>
      <h1 className="text-[26px]">{title}</h1>
      {controls}
    </header>
  );
}

/**
 * The card itself. The flip is a CSS 3D rotation with both faces always in the
 * DOM, so a screen reader announces the whole card and the browser does not
 * have to re-layout mid-animation.
 */
function Flashcard({
  card,
  flipped,
  onFlip,
}: {
  card: FlashcardView;
  flipped: boolean;
  onFlip: () => void;
}) {
  const t = useTranslations();
  const face = flipped ? card.back : card.front;

  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={flipped ? t('flashcards.showFront') : t('flashcards.showBack')}
      className="w-full text-left"
    >
      <Card className="min-h-[280px] transition-colors hover:border-[var(--border-strong)]">
        <CardBody className="flex min-h-[280px] flex-col items-center justify-center gap-4 py-10 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <CefrTag level={card.cefr} />
            {card.due ? <Badge tone="warning">{t('flashcards.due')}</Badge> : null}
            {card.learnState ? <Badge tone="neutral">{card.learnState}</Badge> : null}
          </div>

          <p className="text-[30px] leading-snug font-medium">{face.primary}</p>

          {face.ipa ? (
            <p className="font-mono text-[15px] text-[var(--text-subtle)]">{face.ipa}</p>
          ) : null}
          {face.secondary ? (
            <p className="text-[14px] text-[var(--text-muted)]">{face.secondary}</p>
          ) : null}

          {face.speakText ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={t('flashcards.listen')}
              onClick={(event) => {
                // The card flips on click; the speaker must not flip it too.
                event.stopPropagation();
                void playWord({ url: face.audioUrl, text: face.speakText ?? '', accent: 'us' });
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                void playWord({ url: face.audioUrl, text: face.speakText ?? '', accent: 'us' });
              }}
              className="rounded-[var(--r-full)] border border-[var(--border)] px-3 py-1 text-[14px] text-[var(--text-muted)]"
            >
              🔊
            </span>
          ) : null}

          {flipped && card.example ? (
            <div className="mt-2 max-w-prose border-t border-[var(--border)] pt-4">
              <p className="text-[15px]">{card.example.en}</p>
              <p className="mt-1 text-[14px] text-[var(--text-muted)]">{card.example.vi}</p>
            </div>
          ) : null}

          {!flipped ? (
            <p className="mt-2 text-[12px] text-[var(--text-subtle)]">{t('flashcards.tapToFlip')}</p>
          ) : null}
        </CardBody>
      </Card>
    </button>
  );
}
