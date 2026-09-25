import { dueDateFromIntervalDays } from '@sprout/shared';
import { resolveConfig } from './config.js';
import type { ReviewContext, ReviewGrade, ReviewOutcome, SchedulerConfig, SrsCard } from './types.js';
import { GRADES } from './types.js';

const MINUTES_PER_DAY = 1440;

function minutesToDays(minutes: number): number {
  return minutes / MINUTES_PER_DAY;
}

function clampEase(ease: number, config: SchedulerConfig): number {
  return Math.min(config.maxEase, Math.max(config.minEase, roundTo(ease, 3)));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function stepMinutes(steps: number[], index: number): number {
  const safeIndex = Math.min(Math.max(index, 0), steps.length - 1);
  return steps[safeIndex] ?? 1;
}

/**
 * §9.1 — apply one grade to one card.
 * The card object is never mutated; the next state is returned instead so callers
 * can persist it inside the same transaction that writes the ReviewLog.
 */
export function review(card: SrsCard, grade: ReviewGrade, context: ReviewContext): ReviewOutcome {
  const config = resolveConfig(context.config);
  const random = context.random ?? Math.random;
  const previous = { state: card.state, ease: card.ease, intervalDays: card.intervalDays };

  const next: SrsCard = { ...card };
  next.totalReviews += 1;
  const isCorrect = grade > 0;
  if (isCorrect) next.correctReviews += 1;

  let scheduledDays: number;
  let graduated = false;
  let lapsed = false;

  const state = card.state === 'SUSPENDED' ? 'REVIEW' : card.state;

  if (state === 'NEW' || state === 'LEARNING') {
    const steps = config.learningStepsMinutes;
    if (grade === 0) {
      next.state = 'LEARNING';
      next.learningStep = 0;
      scheduledDays = minutesToDays(stepMinutes(steps, 0));
    } else if (grade === 1) {
      next.state = 'LEARNING';
      next.learningStep = Math.min(card.learningStep, steps.length - 1);
      scheduledDays = minutesToDays(stepMinutes(steps, next.learningStep));
    } else if (grade === 2) {
      const nextStep = card.state === 'NEW' ? 1 : card.learningStep + 1;
      if (nextStep >= steps.length) {
        next.state = 'REVIEW';
        next.learningStep = 0;
        next.repetitions += 1;
        next.intervalDays = config.graduatingIntervalDays;
        scheduledDays = config.graduatingIntervalDays;
        graduated = true;
      } else {
        next.state = 'LEARNING';
        next.learningStep = nextStep;
        scheduledDays = minutesToDays(stepMinutes(steps, nextStep));
      }
    } else {
      next.state = 'REVIEW';
      next.learningStep = 0;
      next.repetitions += 1;
      next.intervalDays = config.easyGraduatingIntervalDays;
      scheduledDays = config.easyGraduatingIntervalDays;
      graduated = true;
    }
  } else if (state === 'RELEARNING') {
    const steps = config.relearningStepsMinutes;
    if (grade <= 1) {
      next.state = 'RELEARNING';
      next.learningStep = grade === 0 ? 0 : Math.min(card.learningStep, steps.length - 1);
      scheduledDays = minutesToDays(stepMinutes(steps, next.learningStep));
    } else {
      const recovered = Math.max(
        1,
        Math.round(card.intervalDays * config.lapseIntervalFactor),
      );
      next.state = 'REVIEW';
      next.learningStep = 0;
      next.repetitions += 1;
      next.intervalDays = recovered;
      scheduledDays = recovered;
      graduated = true;
    }
  } else {
    // REVIEW or MASTERED
    const baseInterval = Math.max(card.intervalDays, config.graduatingIntervalDays);
    if (grade === 0) {
      next.lapses += 1;
      next.ease = clampEase(card.ease - config.againEasePenalty, config);
      next.state = 'RELEARNING';
      next.learningStep = 0;
      // The pre-lapse interval is kept so graduation can halve it (§9.1).
      next.intervalDays = baseInterval;
      scheduledDays = minutesToDays(stepMinutes(config.relearningStepsMinutes, 0));
      lapsed = true;
    } else if (grade === 1) {
      next.state = 'REVIEW';
      next.ease = clampEase(card.ease - config.hardEasePenalty, config);
      next.repetitions += 1;
      scheduledDays = baseInterval * config.hardMultiplier;
    } else if (grade === 2) {
      next.state = 'REVIEW';
      next.repetitions += 1;
      scheduledDays = baseInterval * card.ease;
    } else {
      next.state = 'REVIEW';
      next.ease = clampEase(card.ease + config.easyEaseBonus, config);
      next.repetitions += 1;
      scheduledDays = baseInterval * next.ease * config.easyBonus;
    }
  }

  if (!lapsed && scheduledDays >= 1) {
    if (scheduledDays >= config.fuzzMinIntervalDays) {
      const fuzz = config.fuzzMin + (config.fuzzMax - config.fuzzMin) * random();
      scheduledDays *= fuzz;
    }
    scheduledDays = Math.min(scheduledDays, config.maxIntervalDays);
    scheduledDays = roundTo(scheduledDays, 2);
    next.intervalDays = scheduledDays;
  }

  if (isMastered(next, config)) {
    next.state = 'MASTERED';
  }

  const dueAt = dueDateFromIntervalDays(
    context.now,
    scheduledDays,
    context.timeZone,
    context.dayRolloverHour,
  );

  return {
    card: next,
    intervalDays: scheduledDays,
    dueAt,
    previous,
    graduated,
    lapsed,
    isCorrect,
  };
}

/** §9.1 — MASTERED needs a long interval, few lapses and high accuracy. */
export function isMastered(card: SrsCard, config = resolveConfig()): boolean {
  if (card.state !== 'REVIEW' && card.state !== 'MASTERED') return false;
  if (card.intervalDays < config.masteredIntervalDays) return false;
  if (card.lapses > config.masteredMaxLapses) return false;
  if (card.totalReviews === 0) return false;
  return card.correctReviews / card.totalReviews >= config.masteredMinAccuracy;
}

/**
 * §7.3.3 — every grading button shows where the card would land ("Good -> 4 ngày").
 * Fuzz is neutralised so the preview matches what the learner is promised.
 */
export function previewIntervals(
  card: SrsCard,
  context: Omit<ReviewContext, 'random'>,
): Record<ReviewGrade, number> {
  const neutralFuzz = { ...context, random: () => 0.5 };
  const preview = {} as Record<ReviewGrade, number>;
  for (const grade of GRADES) {
    preview[grade] = review(card, grade, neutralFuzz).intervalDays;
  }
  return preview;
}

/** Accuracy over the card lifetime, used by analytics and the "hay quên" filter. */
export function cardAccuracy(card: SrsCard): number {
  if (card.totalReviews === 0) return 0;
  return card.correctReviews / card.totalReviews;
}

/** §7.3.6 — a leech is a card the learner keeps forgetting. */
export function isLeech(card: SrsCard, lapseThreshold = 3): boolean {
  return card.lapses >= lapseThreshold;
}
