import { describe, expect, it } from 'vitest';
import { buildQueue, forecast } from '../src/index.js';
import type { QueueCandidate } from '../src/index.js';

const TZ = 'Asia/Ho_Chi_Minh';
const NOW = new Date('2026-03-10T05:00:00.000Z');
const END_OF_TODAY = new Date('2026-03-10T21:00:00.000Z');

function dueCard(index: number, minutesAgo: number): QueueCandidate {
  return {
    userWordId: `uw-${index}`,
    wordId: `w-${index}`,
    dueAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    state: 'REVIEW',
    frequencyRank: index,
  };
}

function newCard(index: number, rank: number, inActiveTopic = false): QueueCandidate {
  return {
    userWordId: `new-${index}`,
    wordId: `nw-${index}`,
    dueAt: NOW,
    state: 'NEW',
    frequencyRank: rank,
    inActiveTopic,
  };
}

describe('buildQueue', () => {
  it('injects one new card after every four reviews', () => {
    const candidates = [
      ...Array.from({ length: 8 }, (_, i) => dueCard(i, 100 - i)),
      newCard(1, 10),
      newCard(2, 20),
    ];
    const result = buildQueue({
      candidates,
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 120, newWordsPerDay: 15 },
    });

    expect(result.cards.map((card) => card.state)).toEqual([
      'REVIEW',
      'REVIEW',
      'REVIEW',
      'REVIEW',
      'NEW',
      'REVIEW',
      'REVIEW',
      'REVIEW',
      'REVIEW',
      'NEW',
    ]);
    expect(result.dueCount).toBe(8);
    expect(result.newCount).toBe(2);
  });

  it('appends leftover new cards when there are few reviews', () => {
    const result = buildQueue({
      candidates: [dueCard(1, 5), newCard(1, 1), newCard(2, 2), newCard(3, 3)],
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 120, newWordsPerDay: 15 },
    });
    expect(result.cards).toHaveLength(4);
    expect(result.newCount).toBe(3);
  });

  it('sorts due cards oldest first', () => {
    const result = buildQueue({
      candidates: [dueCard(1, 10), dueCard(2, 300), dueCard(3, 60)],
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 120, newWordsPerDay: 0 },
    });
    expect(result.cards.map((card) => card.userWordId)).toEqual(['uw-2', 'uw-3', 'uw-1']);
  });

  it('breaks due date ties with frequency rank', () => {
    const same = new Date(NOW.getTime() - 60_000);
    const result = buildQueue({
      candidates: [
        { ...dueCard(1, 1), dueAt: same, frequencyRank: 900 },
        { ...dueCard(2, 1), dueAt: same, frequencyRank: 12 },
        { ...dueCard(3, 1), dueAt: same, frequencyRank: null },
      ],
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 120, newWordsPerDay: 0 },
    });
    expect(result.cards.map((card) => card.userWordId)).toEqual(['uw-2', 'uw-1', 'uw-3']);
  });

  it('prefers new words from the topic the learner is working through', () => {
    const result = buildQueue({
      candidates: [newCard(1, 5), newCard(2, 900, true)],
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 0, newWordsPerDay: 5 },
    });
    expect(result.cards.map((card) => card.userWordId)).toEqual(['new-2', 'new-1']);
  });

  it('respects the daily caps', () => {
    const result = buildQueue({
      candidates: [
        ...Array.from({ length: 30 }, (_, i) => dueCard(i, 30 - i)),
        ...Array.from({ length: 10 }, (_, i) => newCard(i, i)),
      ],
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 5, newWordsPerDay: 2 },
    });
    expect(result.dueCount).toBe(5);
    expect(result.newCount).toBe(2);
  });

  it('ignores cards that are not due yet', () => {
    const future: QueueCandidate = {
      ...dueCard(9, 0),
      dueAt: new Date(END_OF_TODAY.getTime() + 3_600_000),
    };
    const result = buildQueue({
      candidates: [future, dueCard(1, 10)],
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 50, newWordsPerDay: 0 },
    });
    expect(result.cards).toHaveLength(1);
    expect(result.totalDueAvailable).toBe(1);
  });

  it('skips suspended cards entirely', () => {
    const suspended: QueueCandidate = { ...dueCard(4, 10), state: 'SUSPENDED' };
    const result = buildQueue({
      candidates: [suspended],
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 50, newWordsPerDay: 5 },
    });
    expect(result.cards).toHaveLength(0);
  });

  it('warns when the backlog is more than twice the daily limit', () => {
    const result = buildQueue({
      candidates: Array.from({ length: 51 }, (_, i) => dueCard(i, 100)),
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 25, newWordsPerDay: 0 },
    });
    expect(result.backlogWarning).toBe(true);
    expect(result.totalDueAvailable).toBe(51);
    expect(result.dueCount).toBe(25);
  });

  it('applies an explicit session limit last', () => {
    const result = buildQueue({
      candidates: Array.from({ length: 20 }, (_, i) => dueCard(i, 50 - i)),
      dueBefore: END_OF_TODAY,
      options: { maxReviewsPerDay: 20, newWordsPerDay: 0, limit: 3 },
    });
    expect(result.cards).toHaveLength(3);
  });
});

describe('forecast', () => {
  it('buckets due dates into local study days', () => {
    const buckets = forecast({
      dueDates: [
        new Date('2026-03-10T05:00:00.000Z'),
        new Date('2026-03-11T05:00:00.000Z'),
        new Date('2026-03-11T06:00:00.000Z'),
      ],
      from: NOW,
      days: 3,
      timeZone: TZ,
      dayRolloverHour: 4,
    });
    expect(buckets).toEqual([
      { date: '2026-03-10', count: 1 },
      { date: '2026-03-11', count: 2 },
      { date: '2026-03-12', count: 0 },
    ]);
  });

  it('collapses overdue cards onto the first day', () => {
    const buckets = forecast({
      dueDates: [new Date('2026-02-01T05:00:00.000Z')],
      from: NOW,
      days: 2,
      timeZone: TZ,
      dayRolloverHour: 4,
    });
    expect(buckets[0]).toEqual({ date: '2026-03-10', count: 1 });
  });

  it('drops cards beyond the requested window', () => {
    const buckets = forecast({
      dueDates: [new Date('2026-09-01T05:00:00.000Z')],
      from: NOW,
      days: 2,
      timeZone: TZ,
      dayRolloverHour: 4,
    });
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(0);
  });
});
