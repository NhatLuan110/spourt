import { describe, expect, it } from 'vitest';
import { studyDayKey, zonedParts } from '@sprout/shared';
import {
  cardAccuracy,
  createCard,
  DEFAULT_CONFIG,
  isLeech,
  isMastered,
  previewIntervals,
  review,
} from '../src/index.js';
import type { ReviewContext } from '../src/index.js';

const TZ = 'Asia/Ho_Chi_Minh';
const NOON = new Date('2026-03-10T05:00:00.000Z'); // 12:00 in Ho Chi Minh City

function ctx(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    now: NOON,
    timeZone: TZ,
    dayRolloverHour: 4,
    random: () => 0.5, // neutral fuzz
    ...overrides,
  };
}

describe('learning steps', () => {
  it('sends a brand new card to the first step on Again', () => {
    const outcome = review(createCard(), 0, ctx());
    expect(outcome.card.state).toBe('LEARNING');
    expect(outcome.card.learningStep).toBe(0);
    expect(outcome.intervalDays).toBeCloseTo(1 / 1440, 6);
    expect(outcome.dueAt.getTime()).toBe(NOON.getTime() + 60_000);
    expect(outcome.isCorrect).toBe(false);
  });

  it('repeats the current step on Hard', () => {
    const card = createCard({ state: 'LEARNING', learningStep: 1 });
    const outcome = review(card, 1, ctx());
    expect(outcome.card.state).toBe('LEARNING');
    expect(outcome.card.learningStep).toBe(1);
    expect(outcome.intervalDays).toBeCloseTo(10 / 1440, 6);
  });

  it('advances one step on Good and graduates after the last step', () => {
    const first = review(createCard(), 2, ctx());
    expect(first.card.state).toBe('LEARNING');
    expect(first.card.learningStep).toBe(1);
    expect(first.intervalDays).toBeCloseTo(10 / 1440, 6);
    expect(first.graduated).toBe(false);

    const second = review(first.card, 2, ctx());
    expect(second.card.state).toBe('REVIEW');
    expect(second.graduated).toBe(true);
    expect(second.intervalDays).toBe(DEFAULT_CONFIG.graduatingIntervalDays);
    expect(second.card.repetitions).toBe(1);
  });

  it('graduates immediately on Easy', () => {
    const outcome = review(createCard(), 3, ctx());
    expect(outcome.card.state).toBe('REVIEW');
    expect(outcome.intervalDays).toBe(DEFAULT_CONFIG.easyGraduatingIntervalDays);
    expect(outcome.graduated).toBe(true);
  });

  it('counts every answer and only correct ones separately', () => {
    const afterWrong = review(createCard(), 0, ctx()).card;
    expect(afterWrong.totalReviews).toBe(1);
    expect(afterWrong.correctReviews).toBe(0);

    const afterRight = review(afterWrong, 2, ctx()).card;
    expect(afterRight.totalReviews).toBe(2);
    expect(afterRight.correctReviews).toBe(1);
  });
});

describe('review grading', () => {
  const reviewCard = createCard({
    state: 'REVIEW',
    ease: 2.5,
    intervalDays: 10,
    repetitions: 3,
    totalReviews: 3,
    correctReviews: 3,
  });

  it('multiplies by ease on Good and leaves ease untouched', () => {
    const outcome = review(reviewCard, 2, ctx());
    expect(outcome.intervalDays).toBeCloseTo(25, 2);
    expect(outcome.card.ease).toBe(2.5);
    expect(outcome.card.repetitions).toBe(4);
  });

  it('applies the hard multiplier and lowers ease on Hard', () => {
    const outcome = review(reviewCard, 1, ctx());
    expect(outcome.card.ease).toBeCloseTo(2.35, 5);
    expect(outcome.intervalDays).toBeCloseTo(12, 2);
  });

  it('raises ease first and then applies the easy bonus', () => {
    const outcome = review(reviewCard, 3, ctx());
    expect(outcome.card.ease).toBeCloseTo(2.65, 5);
    // 10 x 2.65 x 1.3
    expect(outcome.intervalDays).toBeCloseTo(34.45, 2);
  });

  it('lapses to relearning on Again and keeps the pre-lapse interval', () => {
    const outcome = review(reviewCard, 0, ctx());
    expect(outcome.lapsed).toBe(true);
    expect(outcome.card.state).toBe('RELEARNING');
    expect(outcome.card.lapses).toBe(1);
    expect(outcome.card.ease).toBeCloseTo(2.3, 5);
    expect(outcome.card.learningStep).toBe(0);
    expect(outcome.card.intervalDays).toBe(10);
    expect(outcome.dueAt.getTime()).toBe(NOON.getTime() + 10 * 60_000);
  });

  it('never lets ease fall below the floor', () => {
    let card = createCard({ state: 'REVIEW', ease: 1.4, intervalDays: 5 });
    for (let i = 0; i < 5; i += 1) {
      card = review({ ...card, state: 'REVIEW' }, 0, ctx()).card;
    }
    expect(card.ease).toBe(DEFAULT_CONFIG.minEase);
  });

  it('caps the interval at one year', () => {
    const card = createCard({ state: 'REVIEW', ease: 3.0, intervalDays: 300 });
    const outcome = review(card, 3, ctx());
    expect(outcome.intervalDays).toBe(DEFAULT_CONFIG.maxIntervalDays);
  });

  it('treats a suspended card as a normal review card', () => {
    const card = createCard({ state: 'SUSPENDED', ease: 2.5, intervalDays: 4 });
    const outcome = review(card, 2, ctx());
    expect(outcome.card.state).toBe('REVIEW');
    expect(outcome.intervalDays).toBeCloseTo(10, 2);
  });

  it('gives a review card with no interval at least the graduating interval', () => {
    const card = createCard({ state: 'REVIEW', ease: 2.5, intervalDays: 0 });
    const outcome = review(card, 2, ctx());
    expect(outcome.intervalDays).toBeCloseTo(2.5, 2);
  });
});

describe('relearning', () => {
  const lapsed = createCard({
    state: 'RELEARNING',
    ease: 2.3,
    intervalDays: 20,
    lapses: 1,
    learningStep: 0,
  });

  it('stays on the step for Again and Hard', () => {
    expect(review(lapsed, 0, ctx()).card.state).toBe('RELEARNING');
    expect(review(lapsed, 1, ctx()).intervalDays).toBeCloseTo(10 / 1440, 6);
  });

  it('graduates on Good with half the pre-lapse interval', () => {
    const outcome = review(lapsed, 2, ctx());
    expect(outcome.card.state).toBe('REVIEW');
    expect(outcome.intervalDays).toBe(10);
    expect(outcome.graduated).toBe(true);
  });

  it('never graduates below one day', () => {
    const outcome = review({ ...lapsed, intervalDays: 1 }, 2, ctx());
    expect(outcome.intervalDays).toBe(1);
  });
});

describe('fuzz', () => {
  it('keeps the interval inside the 0.95-1.05 band', () => {
    const card = createCard({ state: 'REVIEW', ease: 2.5, intervalDays: 10 });
    const low = review(card, 2, ctx({ random: () => 0 })).intervalDays;
    const high = review(card, 2, ctx({ random: () => 1 })).intervalDays;
    expect(low).toBeCloseTo(23.75, 2);
    expect(high).toBeCloseTo(26.25, 2);
  });

  it('does not fuzz the one day graduating interval', () => {
    const card = createCard({ state: 'LEARNING', learningStep: 1 });
    expect(review(card, 2, ctx({ random: () => 0 })).intervalDays).toBe(1);
    expect(review(card, 2, ctx({ random: () => 1 })).intervalDays).toBe(1);
  });
});

describe('mastery', () => {
  it('marks a long lived accurate card as mastered', () => {
    const card = createCard({
      state: 'REVIEW',
      ease: 2.8,
      intervalDays: 150,
      lapses: 1,
      totalReviews: 20,
      correctReviews: 19,
    });
    const outcome = review(card, 2, ctx());
    expect(outcome.intervalDays).toBeGreaterThanOrEqual(180);
    expect(outcome.card.state).toBe('MASTERED');
  });

  it('does not master a card with too many lapses', () => {
    const card = createCard({
      state: 'REVIEW',
      ease: 2.8,
      intervalDays: 200,
      lapses: 5,
      totalReviews: 20,
      correctReviews: 19,
    });
    expect(review(card, 2, ctx()).card.state).toBe('REVIEW');
  });

  it('does not master a card with low accuracy', () => {
    const card = createCard({
      state: 'REVIEW',
      intervalDays: 200,
      lapses: 0,
      totalReviews: 20,
      correctReviews: 10,
    });
    expect(isMastered(card)).toBe(false);
  });

  it('ignores cards that are still learning or never reviewed', () => {
    expect(isMastered(createCard({ state: 'LEARNING', intervalDays: 400 }))).toBe(false);
    expect(
      isMastered(createCard({ state: 'REVIEW', intervalDays: 400, totalReviews: 0 })),
    ).toBe(false);
  });

  it('keeps scheduling mastered cards', () => {
    const card = createCard({
      state: 'MASTERED',
      ease: 2.5,
      intervalDays: 200,
      totalReviews: 30,
      correctReviews: 30,
    });
    const outcome = review(card, 2, ctx());
    expect(outcome.intervalDays).toBe(365);
    expect(outcome.card.state).toBe('MASTERED');
  });
});

describe('due dates', () => {
  it('aligns day scale intervals to the start of the learner local day', () => {
    const card = createCard({ state: 'REVIEW', ease: 2.5, intervalDays: 1 });
    const outcome = review(card, 2, ctx());
    const parts = zonedParts(outcome.dueAt, TZ);
    expect(parts.hour).toBe(4);
    expect(parts.minute).toBe(0);
  });

  it('counts a 1am session as the previous study day', () => {
    const oneAmLocal = new Date('2026-03-10T18:10:00.000Z'); // 01:10 on 11 March local
    expect(studyDayKey(oneAmLocal, TZ, 4)).toBe('2026-03-10');
  });

  it('keeps sub-day intervals exact instead of rounding to a day', () => {
    const outcome = review(createCard(), 2, ctx());
    expect(outcome.dueAt.getTime()).toBe(NOON.getTime() + 10 * 60_000);
  });
});

describe('previews and helpers', () => {
  it('previews all four buttons without fuzz', () => {
    const card = createCard({ state: 'REVIEW', ease: 2.5, intervalDays: 10 });
    const preview = previewIntervals(card, {
      now: NOON,
      timeZone: TZ,
      dayRolloverHour: 4,
    });
    expect(Object.keys(preview)).toHaveLength(4);
    expect(preview[2]).toBeCloseTo(25, 2);
    expect(preview[1]).toBeCloseTo(12, 2);
    expect(preview[3]).toBeGreaterThan(preview[2] as number);
    expect(preview[0]).toBeLessThan(1);
  });

  it('does not mutate the card it is given', () => {
    const card = createCard({ state: 'REVIEW', ease: 2.5, intervalDays: 10 });
    const snapshot = { ...card };
    review(card, 0, ctx());
    expect(card).toEqual(snapshot);
  });

  it('reports the previous state for the review log', () => {
    const card = createCard({ state: 'REVIEW', ease: 2.5, intervalDays: 10 });
    const outcome = review(card, 1, ctx());
    expect(outcome.previous).toEqual({ state: 'REVIEW', ease: 2.5, intervalDays: 10 });
  });

  it('computes accuracy and flags leeches', () => {
    expect(cardAccuracy(createCard())).toBe(0);
    expect(cardAccuracy(createCard({ totalReviews: 4, correctReviews: 3 }))).toBe(0.75);
    expect(isLeech(createCard({ lapses: 3 }))).toBe(true);
    expect(isLeech(createCard({ lapses: 2 }))).toBe(false);
  });

  it('uses Math.random when no rng is injected', () => {
    const card = createCard({ state: 'REVIEW', ease: 2.5, intervalDays: 10 });
    const outcome = review(card, 2, { now: NOON, timeZone: TZ, dayRolloverHour: 4 });
    expect(outcome.intervalDays).toBeGreaterThanOrEqual(23.75);
    expect(outcome.intervalDays).toBeLessThanOrEqual(26.25);
  });

  it('honours config overrides', () => {
    const outcome = review(createCard(), 3, ctx({ config: { easyGraduatingIntervalDays: 7 } }));
    expect(outcome.intervalDays).toBe(7);
  });
});
