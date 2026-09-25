'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { LessonExercise, PracticeOption } from '@sprout/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { speak } from '@/lib/speech';
import { cn } from '@/lib/utils';

export interface LessonExerciseProps {
  exercise: LessonExercise;
  submitting: boolean;
  isLast: boolean;
  onAnswer: (answer: string) => void;
}

/**
 * One renderer for the six lesson formats. Grammar, reading and listening all
 * use this, so an improvement to the reorder widget lands everywhere at once.
 */
export function LessonExerciseCard({
  exercise,
  submitting,
  isLast,
  onAnswer,
}: LessonExerciseProps) {
  const t = useTranslations();
  const label = isLast ? t('lesson.submit') : t('lesson.next');

  return (
    <div className="flex flex-col gap-4">
      {exercise.promptVi ? (
        <p className="text-[14px] text-[var(--text-muted)]">{exercise.promptVi}</p>
      ) : null}

      {exercise.mode === 'mcq' ? (
        <ChoiceExercise exercise={exercise} submitting={submitting} label={label} onAnswer={onAnswer} />
      ) : exercise.mode === 'true-false' ? (
        <TrueFalseExercise exercise={exercise} submitting={submitting} label={label} onAnswer={onAnswer} />
      ) : exercise.mode === 'reorder' ? (
        <ReorderExercise exercise={exercise} submitting={submitting} label={label} onAnswer={onAnswer} />
      ) : exercise.mode === 'dictation' ? (
        <DictationExercise exercise={exercise} submitting={submitting} label={label} onAnswer={onAnswer} />
      ) : (
        <TypedExercise exercise={exercise} submitting={submitting} label={label} onAnswer={onAnswer} />
      )}
    </div>
  );
}

function ChoiceExercise({
  exercise,
  submitting,
  label,
  onAnswer,
}: {
  exercise: Extract<LessonExercise, { mode: 'mcq' }>;
  submitting: boolean;
  label: string;
  onAnswer: (answer: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [exercise.id]);

  return (
    <>
      <p className="text-[19px] leading-relaxed">{exercise.prompt}</p>
      <ul className="flex flex-col gap-2">
        {exercise.options.map((option) => (
          <li key={option.id}>
            <OptionButton
              option={option}
              selected={selected === option.id}
              onSelect={() => setSelected(option.id)}
            />
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

function OptionButton({
  option,
  selected,
  onSelect,
}: {
  option: PracticeOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'w-full rounded-[var(--r-md)] border p-3 text-left text-[15px] transition-colors',
        selected
          ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
          : 'border-[var(--border)] hover:border-[var(--border-strong)]',
      )}
    >
      {option.text}
    </button>
  );
}

function TrueFalseExercise({
  exercise,
  submitting,
  label,
  onAnswer,
}: {
  exercise: Extract<LessonExercise, { mode: 'true-false' }>;
  submitting: boolean;
  label: string;
  onAnswer: (answer: string) => void;
}) {
  const t = useTranslations();
  const [choice, setChoice] = useState<boolean | null>(null);
  useEffect(() => setChoice(null), [exercise.id]);

  return (
    <>
      <p className="text-[15px] text-[var(--text-muted)]">{exercise.prompt}</p>
      <p className="rounded-[var(--r-md)] bg-[var(--surface-alt)] p-4 text-[18px] leading-relaxed">
        {exercise.statement}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={choice === value}
            onClick={() => setChoice(value)}
            className={cn(
              'rounded-[var(--r-md)] border p-3 text-[15px] transition-colors',
              choice === value
                ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                : 'border-[var(--border)] hover:border-[var(--border-strong)]',
            )}
          >
            {value ? t('lesson.true') : t('lesson.false')}
          </button>
        ))}
      </div>
      <Button
        block
        disabled={choice === null}
        loading={submitting}
        onClick={() => choice !== null && onAnswer(String(choice))}
      >
        {label}
      </Button>
    </>
  );
}

/**
 * Tap to build the sentence, tap again to take a chunk back. Tapping rather
 * than dragging keeps it usable on a phone and with a keyboard, which drag and
 * drop is not without a great deal of extra work.
 */
function ReorderExercise({
  exercise,
  submitting,
  label,
  onAnswer,
}: {
  exercise: Extract<LessonExercise, { mode: 'reorder' }>;
  submitting: boolean;
  label: string;
  onAnswer: (answer: string) => void;
}) {
  const t = useTranslations();
  const [placed, setPlaced] = useState<string[]>([]);
  useEffect(() => setPlaced([]), [exercise.id]);

  const byId = new Map(exercise.chunks.map((chunk) => [chunk.id, chunk]));
  const remaining = exercise.chunks.filter((chunk) => !placed.includes(chunk.id));

  return (
    <>
      <p className="text-[15px] text-[var(--text-muted)]">{exercise.prompt}</p>

      <div
        className="min-h-[64px] rounded-[var(--r-md)] border border-dashed border-[var(--border)] p-3"
        aria-label={t('lesson.yourSentence')}
      >
        {placed.length === 0 ? (
          <span className="text-[14px] text-[var(--text-subtle)]">{t('lesson.tapToBuild')}</span>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {placed.map((id, position) => (
              <li key={`${id}-${position}`}>
                <button
                  type="button"
                  onClick={() => setPlaced((current) => current.filter((entry) => entry !== id))}
                  className="rounded-[var(--r-sm)] bg-[var(--primary-soft)] px-3 py-1.5 text-[15px]"
                >
                  {byId.get(id)?.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="flex flex-wrap gap-2">
        {remaining.map((chunk) => (
          <li key={chunk.id}>
            <button
              type="button"
              onClick={() => setPlaced((current) => [...current, chunk.id])}
              className="rounded-[var(--r-sm)] border border-[var(--border)] px-3 py-1.5 text-[15px] hover:border-[var(--border-strong)]"
            >
              {chunk.text}
            </button>
          </li>
        ))}
      </ul>

      <Button
        block
        disabled={remaining.length > 0}
        loading={submitting}
        onClick={() => onAnswer(JSON.stringify(placed))}
      >
        {label}
      </Button>
    </>
  );
}

function TypedExercise({
  exercise,
  submitting,
  label,
  onAnswer,
}: {
  exercise: Extract<LessonExercise, { mode: 'gap-fill' | 'short-answer' }>;
  submitting: boolean;
  label: string;
  onAnswer: (answer: string) => void;
}) {
  const t = useTranslations();
  const [value, setValue] = useState('');
  useEffect(() => setValue(''), [exercise.id]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onAnswer(value.trim());
      }}
    >
      <p className="text-[19px] leading-relaxed">{exercise.prompt}</p>
      {exercise.hint ? (
        <div>
          <Badge tone="primary">{t('lesson.hint')}</Badge>
          <span className="ml-2 font-mono text-[14px] text-[var(--text-subtle)]">
            {exercise.hint}
          </span>
        </div>
      ) : null}
      <Input
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={t('lesson.typeHere')}
        placeholder={t('lesson.typeHere')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button block type="submit" disabled={value.trim().length === 0} loading={submitting}>
        {label}
      </Button>
    </form>
  );
}

function DictationExercise({
  exercise,
  submitting,
  label,
  onAnswer,
}: {
  exercise: Extract<LessonExercise, { mode: 'dictation' }>;
  submitting: boolean;
  label: string;
  onAnswer: (answer: string) => void;
}) {
  const t = useTranslations();
  const [value, setValue] = useState('');
  const [rate, setRate] = useState(1);
  useEffect(() => setValue(''), [exercise.id]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onAnswer(value.trim());
      }}
    >
      <p className="text-[15px] text-[var(--text-muted)]">{exercise.prompt}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" type="button" onClick={() => void speak(exercise.speakText, 'us', rate)}>
          {t('lesson.play')}
        </Button>
        {[0.75, 1].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={rate === option}
            onClick={() => setRate(option)}
            className={cn(
              'rounded-[var(--r-sm)] border px-3 py-1.5 text-[13px]',
              rate === option
                ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                : 'border-[var(--border)]',
            )}
          >
            {option}x
          </button>
        ))}
        <span className="text-[13px] text-[var(--text-subtle)]">
          {t('lesson.wordCount', { count: exercise.wordCount })}
        </span>
      </div>

      <textarea
        rows={3}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={t('lesson.typeWhatYouHear')}
        placeholder={t('lesson.typeWhatYouHear')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[16px] leading-relaxed outline-none focus:border-[var(--primary)]"
      />

      <Button block type="submit" disabled={value.trim().length === 0} loading={submitting}>
        {label}
      </Button>
    </form>
  );
}
