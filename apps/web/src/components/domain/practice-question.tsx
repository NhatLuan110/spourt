'use client';

import { mediaUrl } from '@/lib/asset-url';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PracticeItem, PracticeOption } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { WordAudio } from '@/components/domain/word-audio';
import { speak } from '@/lib/speech';
import { cn } from '@/lib/utils';

export interface PracticeQuestionProps {
  item: PracticeItem;
  submitting: boolean;
  isLast: boolean;
  onAnswer: (answer: string) => void;
}

/** §7.3.4 — one renderer per exercise format, sharing the same answer contract. */
export function PracticeQuestion({ item, submitting, isLast, onAnswer }: PracticeQuestionProps) {
  const t = useTranslations();
  const nextLabel = isLast ? t('practice.submit') : t('practice.next');

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 pt-6">
        <p className="text-[14px] text-[var(--text-muted)]">{t(item.instructionKey)}</p>

        {item.mode === 'matching' ? (
          <MatchQuestion item={item} submitting={submitting} label={nextLabel} onAnswer={onAnswer} />
        ) : item.mode === 'gap-fill' ? (
          <GapQuestion item={item} submitting={submitting} label={nextLabel} onAnswer={onAnswer} />
        ) : item.mode === 'listen-type' ? (
          <ListenQuestion item={item} submitting={submitting} label={nextLabel} onAnswer={onAnswer} />
        ) : (
          <ChoiceQuestion item={item} submitting={submitting} label={nextLabel} onAnswer={onAnswer} />
        )}
      </CardBody>
    </Card>
  );
}

function ChoiceQuestion({
  item,
  submitting,
  label,
  onAnswer,
}: {
  item: Extract<PracticeItem, { mode: 'mcq-meaning' | 'mcq-reverse' }>;
  submitting: boolean;
  label: string;
  onAnswer: (answer: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[26px]">{item.prompt}</p>
        {item.promptIpa ? <span className="ipa text-[15px]">{item.promptIpa}</span> : null}
        {item.mode === 'mcq-meaning' ? (
          <WordAudio text={item.lemma} urlUs={item.promptAudioUrl} />
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {item.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              aria-pressed={selected === option.id}
              onClick={() => setSelected(option.id)}
              className={cn(
                'w-full rounded-[var(--r-md)] border p-3 text-left text-[15px] transition-colors',
                selected === option.id
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)]',
              )}
            >
              {option.text}
              {option.hint ? (
                <span className="ml-2 text-[12px] text-[var(--text-subtle)]">{option.hint}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <Button
        block
        disabled={selected === null}
        loading={submitting}
        onClick={() => selected && onAnswer(selected)}
      >
        {label}
      </Button>
    </>
  );
}

function GapQuestion({
  item,
  submitting,
  label,
  onAnswer,
}: {
  item: Extract<PracticeItem, { mode: 'gap-fill' }>;
  submitting: boolean;
  label: string;
  onAnswer: (answer: string) => void;
}) {
  const t = useTranslations();
  const [value, setValue] = useState('');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onAnswer(value.trim());
      }}
    >
      <p className="text-[20px] leading-relaxed">{item.prompt}</p>
      <p className="text-[14px] text-[var(--text-muted)]">{item.translation}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{item.pos}</Badge>
        <span className="ipa text-[14px] text-[var(--text-subtle)]">{item.hint}</span>
      </div>
      <Input
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={t('practice.typeHere')}
        placeholder={t('practice.typeHere')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button block type="submit" loading={submitting} disabled={value.trim() === ''}>
        {label}
      </Button>
    </form>
  );
}

function ListenQuestion({
  item,
  submitting,
  label,
  onAnswer,
}: {
  item: Extract<PracticeItem, { mode: 'listen-type' }>;
  submitting: boolean;
  label: string;
  onAnswer: (answer: string) => void;
}) {
  const t = useTranslations();
  const [value, setValue] = useState('');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onAnswer(value.trim());
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (item.audioUrl) {
              void new Audio(mediaUrl(item.audioUrl)).play().catch(() => speak(item.speakText, 'us'));
              return;
            }
            speak(item.speakText, 'us');
          }}
        >
          🔊 {t('practice.playAgain')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => speak(item.speakText, 'us', 0.7)}>
          🐢 {t('practice.slower')}
        </Button>
      </div>

      <p className="text-[15px] text-[var(--text-muted)]">{item.definitionVi}</p>
      <span className="ipa text-[14px] text-[var(--text-subtle)]">{item.hint}</span>

      <Input
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={t('practice.typeHere')}
        placeholder={t('practice.typeHere')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button block type="submit" loading={submitting} disabled={value.trim() === ''}>
        {label}
      </Button>
    </form>
  );
}

/**
 * Matching is a two column tap-to-pair task rather than drag and drop: it works
 * with a keyboard, a screen reader and a thumb on a phone (§11 a11y).
 */
function MatchQuestion({
  item,
  submitting,
  label,
  onAnswer,
}: {
  item: Extract<PracticeItem, { mode: 'matching' }>;
  submitting: boolean;
  label: string;
  onAnswer: (answer: string) => void;
}) {
  const [activeLeft, setActiveLeft] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});

  const rightOf = (leftId: string): PracticeOption | undefined =>
    item.right.find((option) => option.id === pairs[leftId]);
  const takenRight = new Set(Object.values(pairs));
  const complete = Object.keys(pairs).length === item.left.length;

  const chooseRight = (rightId: string) => {
    if (!activeLeft) return;
    setPairs((current) => {
      const next: Record<string, string> = {};
      for (const [left, right] of Object.entries(current)) {
        if (right !== rightId) next[left] = right;
      }
      next[activeLeft] = rightId;
      return next;
    });
    setActiveLeft(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <ul className="flex flex-col gap-2">
          {item.left.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                aria-pressed={activeLeft === option.id}
                onClick={() => setActiveLeft(option.id)}
                className={cn(
                  'w-full rounded-[var(--r-md)] border p-2.5 text-left text-[15px] transition-colors',
                  activeLeft === option.id
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                    : pairs[option.id]
                      ? 'border-[var(--success)] bg-[var(--success-soft)]'
                      : 'border-[var(--border)] hover:border-[var(--border-strong)]',
                )}
              >
                <span className="font-medium">{option.text}</span>
                {pairs[option.id] ? (
                  <span className="mt-0.5 block text-[12px] text-[var(--text-muted)]">
                    → {rightOf(option.id)?.text}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>

        <ul className="flex flex-col gap-2">
          {item.right.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={activeLeft === null}
                onClick={() => chooseRight(option.id)}
                className={cn(
                  'w-full rounded-[var(--r-md)] border p-2.5 text-left text-[14px] transition-colors',
                  takenRight.has(option.id)
                    ? 'border-[var(--success)] bg-[var(--success-soft)]'
                    : 'border-[var(--border)] hover:border-[var(--border-strong)]',
                  activeLeft === null && !takenRight.has(option.id) ? 'opacity-60' : '',
                )}
              >
                {option.text}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Button
        block
        loading={submitting}
        disabled={!complete}
        onClick={() =>
          onAnswer(
            Object.entries(pairs)
              .map(([left, right]) => `${left}:${right}`)
              .join(','),
          )
        }
      >
        {label}
      </Button>
    </div>
  );
}
