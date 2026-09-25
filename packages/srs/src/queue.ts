import { addDaysToDayKey, studyDayKey } from '@sprout/shared';
import type { QueueCandidate, QueueOptions, QueueResult } from './types.js';

const REVIEWABLE_STATES = new Set(['LEARNING', 'REVIEW', 'RELEARNING', 'MASTERED']);

function byDueDateThenRank(a: QueueCandidate, b: QueueCandidate): number {
  const diff = a.dueAt.getTime() - b.dueAt.getTime();
  if (diff !== 0) return diff;
  return (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) - (b.frequencyRank ?? Number.MAX_SAFE_INTEGER);
}

function byTopicThenFrequency(a: QueueCandidate, b: QueueCandidate): number {
  const topicDiff = Number(b.inActiveTopic ?? false) - Number(a.inActiveTopic ?? false);
  if (topicDiff !== 0) return topicDiff;
  return (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) - (b.frequencyRank ?? Number.MAX_SAFE_INTEGER);
}

/**
 * §9.1 — build today's queue: due cards first (oldest first, capped by the daily
 * limit), new cards ordered by active topic then frequency, and the two lists
 * interleaved so new words are not all dumped at the tired end of the session.
 */
export function buildQueue(params: {
  candidates: QueueCandidate[];
  dueBefore: Date;
  options: QueueOptions;
}): QueueResult {
  const { candidates, dueBefore, options } = params;
  const everyN = Math.max(1, options.newCardEveryNReviews ?? 4);

  const dueAll = candidates
    .filter(
      (candidate) =>
        REVIEWABLE_STATES.has(candidate.state) && candidate.dueAt.getTime() <= dueBefore.getTime(),
    )
    .sort(byDueDateThenRank);

  const fresh = candidates
    .filter((candidate) => candidate.state === 'NEW')
    .sort(byTopicThenFrequency)
    .slice(0, Math.max(0, options.newWordsPerDay));

  const due = dueAll.slice(0, Math.max(0, options.maxReviewsPerDay));

  const mixed: QueueCandidate[] = [];
  let newIndex = 0;
  due.forEach((card, index) => {
    mixed.push(card);
    const isBoundary = (index + 1) % everyN === 0;
    if (isBoundary && newIndex < fresh.length) {
      mixed.push(fresh[newIndex] as QueueCandidate);
      newIndex += 1;
    }
  });
  while (newIndex < fresh.length) {
    mixed.push(fresh[newIndex] as QueueCandidate);
    newIndex += 1;
  }

  const limited = options.limit ? mixed.slice(0, options.limit) : mixed;

  return {
    cards: limited,
    dueCount: limited.filter((card) => card.state !== 'NEW').length,
    newCount: limited.filter((card) => card.state === 'NEW').length,
    backlogWarning: dueAll.length > 2 * Math.max(1, options.maxReviewsPerDay),
    totalDueAvailable: dueAll.length,
  };
}

export interface ForecastBucket {
  date: string;
  count: number;
}

/**
 * §7.3.5 — a 30 day forecast so learners can see a wave of reviews coming and
 * spread the load instead of meeting 300 cards on one morning.
 */
export function forecast(params: {
  dueDates: Date[];
  from: Date;
  days: number;
  timeZone: string;
  dayRolloverHour: number;
}): ForecastBucket[] {
  const { dueDates, from, days, timeZone, dayRolloverHour } = params;
  const startKey = studyDayKey(from, timeZone, dayRolloverHour);
  const buckets = new Map<string, number>();
  for (let offset = 0; offset < days; offset += 1) {
    buckets.set(addDaysToDayKey(startKey, offset), 0);
  }

  for (const dueAt of dueDates) {
    // Anything overdue is shown on the first day, which is where it will be studied.
    const rawKey = studyDayKey(dueAt, timeZone, dayRolloverHour);
    const key = rawKey < startKey ? startKey : rawKey;
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + 1);
  }

  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}
