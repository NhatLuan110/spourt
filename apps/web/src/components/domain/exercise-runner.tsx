'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ExerciseFeedback, LessonExercise } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LessonExerciseCard } from '@/components/domain/lesson-exercise';
import { cn } from '@/lib/utils';

export interface SubmittedAnswer {
  exerciseId: string;
  answer: string;
  timeSpentMs: number;
  hintsUsed: number;
}

export interface ExerciseRunnerProps {
  exercises: LessonExercise[];
  submitting: boolean;
  onFinish: (answers: SubmittedAnswer[]) => void;
}

/**
 * Walks a learner through a set one question at a time and hands the whole set
 * back at the end. Nothing is graded until the last answer, so the learner is
 * never interrupted mid-flow, and the server sees one submission per activity.
 */
export function ExerciseRunner({ exercises, submitting, onFinish }: ExerciseRunnerProps) {
  const t = useTranslations();
  const [index, setIndex] = useState(0);
  const answers = useRef<SubmittedAnswer[]>([]);
  const startedAt = useRef(Date.now());

  const current = exercises[index];
  if (!current) return null;

  const isLast = index === exercises.length - 1;

  function handleAnswer(answer: string) {
    if (!current) return;
    answers.current = [
      ...answers.current,
      {
        exerciseId: current.id,
        answer,
        timeSpentMs: Math.max(0, Date.now() - startedAt.current),
        hintsUsed: 0,
      },
    ];
    startedAt.current = Date.now();

    if (isLast) {
      onFinish(answers.current);
      return;
    }
    setIndex((position) => position + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-[13px] text-[var(--text-muted)]">
        <span>{t('lesson.questionOf', { current: index + 1, total: exercises.length })}</span>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={exercises.length}
          aria-valuenow={index}
          aria-label={t('lesson.progress')}
          className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--surface-alt)]"
        >
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
            style={{ width: `${(index / exercises.length) * 100}%` }}
          />
        </div>
      </div>

      <Card>
        <CardBody className="pt-6">
          <LessonExerciseCard
            key={current.id}
            exercise={current}
            submitting={submitting && isLast}
            isLast={isLast}
            onAnswer={handleAnswer}
          />
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * The review screen. §5.5 requires an explanation on every item, right or
 * wrong, so the explanation is rendered unconditionally rather than only on a
 * mistake.
 */
export function ExerciseReview({ feedback }: { feedback: ExerciseFeedback[] }) {
  const t = useTranslations();

  return (
    <ol className="flex flex-col gap-3">
      {feedback.map((item, position) => (
        <li key={item.exerciseId}>
          <Card>
            <CardBody className="flex flex-col gap-2 pt-5">
              <div className="flex items-center gap-2">
                <Badge tone={item.isCorrect ? 'success' : 'danger'}>
                  {item.isCorrect ? t('lesson.correct') : t('lesson.incorrect')}
                </Badge>
                <span className="text-[13px] text-[var(--text-subtle)]">
                  {t('lesson.questionNumber', { number: position + 1 })}
                </span>
                {item.typo ? (
                  <Badge tone="warning">{t('lesson.typoForgiven')}</Badge>
                ) : null}
              </div>

              {item.mode === 'dictation' && item.diff ? (
                <DictationDiff diff={item.diff} />
              ) : (
                <div className="flex flex-col gap-1 text-[15px]">
                  <p className={cn(item.isCorrect ? 'text-[var(--text)]' : 'line-through opacity-70')}>
                    {t('lesson.yourAnswer')}: {item.yourAnswer || '—'}
                  </p>
                  {!item.isCorrect ? (
                    <p className="text-[var(--success)]">
                      {t('lesson.correctAnswer')}: {item.correctAnswer}
                    </p>
                  ) : null}
                </div>
              )}

              <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
                {item.explanationVi}
              </p>
            </CardBody>
          </Card>
        </li>
      ))}
    </ol>
  );
}

/** §9.5 — the word level diff, coloured by what went wrong. */
export function DictationDiff({
  diff,
}: {
  diff: NonNullable<ExerciseFeedback['diff']>;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap gap-1.5 text-[16px] leading-relaxed">
        {diff.map((token, position) => (
          <DiffWord key={`${token.expected ?? token.actual ?? 'x'}-${position}`} token={token} />
        ))}
      </p>
      <p className="text-[12px] text-[var(--text-subtle)]">{t('lesson.diffLegend')}</p>
    </div>
  );
}

function DiffWord({ token }: { token: NonNullable<ExerciseFeedback['diff']>[number] }) {
  const t = useTranslations();

  switch (token.status) {
    case 'correct':
      return <span className="text-[var(--text)]">{token.actual}</span>;
    case 'near':
      return (
        <span
          title={t('lesson.nearMiss', { expected: token.expected ?? '' })}
          className="rounded-[var(--r-sm)] bg-[var(--warning-soft)] px-1 underline decoration-dotted"
        >
          {token.actual}
        </span>
      );
    case 'missing':
      return (
        <span
          title={t('lesson.missingWord')}
          className="rounded-[var(--r-sm)] border border-dashed border-[var(--border-strong)] px-1 text-[var(--text-subtle)]"
        >
          {token.expected}
        </span>
      );
    case 'extra':
      return (
        <span title={t('lesson.extraWord')} className="px-1 text-[var(--text-subtle)] line-through">
          {token.actual}
        </span>
      );
    default:
      return (
        <span
          title={t('lesson.shouldBe', { expected: token.expected ?? '' })}
          className="rounded-[var(--r-sm)] bg-[var(--danger-soft)] px-1"
        >
          {token.actual}
          {token.homophone ? <sup className="ml-0.5 text-[10px]">♪</sup> : null}
        </span>
      );
  }
}
