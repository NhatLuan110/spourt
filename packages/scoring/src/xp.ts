import {
  STREAK_MULTIPLIER_CAP,
  XP_BASE,
  XP_DAILY_REVIEW_CAP,
  coinsFromXp,
  levelFromXp,
  streakMultiplier,
  treeStageFromXp,
} from '@sprout/shared';
import type { XpSource } from '@sprout/shared';

export interface XpAwardInput {
  source: XpSource;
  /** 0..1 for lesson-style activities. */
  accuracy?: number;
  /** 0..100 for speaking and writing. */
  score?: number;
  /** Set for review answers. */
  isCorrect?: boolean;
  /** Length band for tests: short 50, long 100. */
  testWeight?: number;
  streakDays: number;
  /** XP already earned today from review activity, for the anti-grind cap. */
  reviewXpToday?: number;
}

export interface XpAward {
  base: number;
  multiplier: number;
  amount: number;
  coins: number;
  cappedByDailyReviewLimit: boolean;
}

/** §9.2 — base XP before the streak multiplier. */
export function baseXpFor(input: XpAwardInput): number {
  const accuracy = clamp01(input.accuracy ?? 0);
  const score = Math.max(0, Math.min(100, input.score ?? 0));

  switch (input.source) {
    case 'NEW_WORD':
      return XP_BASE.NEW_WORD;
    case 'REVIEW':
      return input.isCorrect === false ? XP_BASE.REVIEW_WRONG : XP_BASE.REVIEW_CORRECT;
    case 'LESSON':
      return XP_BASE.GRAMMAR_LESSON + Math.round(accuracy * XP_BASE.GRAMMAR_ACCURACY_BONUS);
    case 'READING':
      return XP_BASE.READING_LESSON + Math.round(accuracy * XP_BASE.READING_ACCURACY_BONUS);
    case 'LISTENING':
      return XP_BASE.LISTENING_LESSON + Math.round(accuracy * XP_BASE.LISTENING_ACCURACY_BONUS);
    case 'SPEAKING':
      if (score >= 85) return XP_BASE.SPEAKING_EXCELLENT;
      if (score >= 60) return XP_BASE.SPEAKING_PASS;
      return 0;
    case 'WRITING':
      return XP_BASE.WRITING_SUBMISSION + Math.round((score / 100) * XP_BASE.WRITING_SCORE_BONUS);
    case 'TEST':
      return Math.max(50, Math.min(100, input.testWeight ?? 50));
    case 'CHALLENGE':
      return XP_BASE.DAILY_CHALLENGE;
    case 'STREAK_BONUS':
      return XP_BASE.DAILY_GOAL_BONUS;
    case 'QUIZ':
      return Math.round(5 + accuracy * 10);
    case 'ACHIEVEMENT':
      return 0;
    default:
      return 0;
  }
}

/**
 * §9.2 — apply the streak multiplier, then the review-only daily ceiling.
 * XP is never taken away, so the cap only limits what is added.
 */
export function computeXpAward(input: XpAwardInput): XpAward {
  const base = baseXpFor(input);
  const multiplier = Math.min(STREAK_MULTIPLIER_CAP, streakMultiplier(input.streakDays));
  let amount = Math.round(base * multiplier);
  let capped = false;

  if (input.source === 'REVIEW') {
    const earnedToday = Math.max(0, input.reviewXpToday ?? 0);
    const remaining = Math.max(0, XP_DAILY_REVIEW_CAP - earnedToday);
    if (amount > remaining) {
      amount = remaining;
      capped = true;
    }
  }

  return {
    base,
    multiplier,
    amount,
    coins: coinsFromXp(amount),
    cappedByDailyReviewLimit: capped,
  };
}

export interface ProgressUpdate {
  totalXp: number;
  level: number;
  leveledUp: boolean;
  treeStage: number;
  treeGrew: boolean;
  coinsEarned: number;
}

/** Fold one award into the aggregate progress row. */
export function applyXp(
  current: { totalXp: number; level: number; treeStage: number },
  award: XpAward,
): ProgressUpdate {
  const totalXp = current.totalXp + award.amount;
  const level = levelFromXp(totalXp);
  const treeStage = treeStageFromXp(totalXp).stage;
  return {
    totalXp,
    level,
    leveledUp: level > current.level,
    treeStage,
    treeGrew: treeStage > current.treeStage,
    coinsEarned: award.coins,
  };
}

/** §9.4 — did this day count towards the streak? */
export function dayCountsForStreak(params: {
  xpEarned: number;
  dailyGoalXp: number;
  lessonsCompleted: number;
  cardsReviewed: number;
  minCards?: number;
}): boolean {
  if (params.xpEarned >= params.dailyGoalXp) return true;
  if (params.lessonsCompleted >= 1) return true;
  return params.cardsReviewed >= (params.minCards ?? 5);
}

export interface StreakUpdate {
  currentStreak: number;
  longestStreak: number;
  freezesRemaining: number;
  freezeUsed: boolean;
  streakBroken: boolean;
  milestoneReached: number | null;
}

/**
 * §9.4 — advance the streak given how many study days have passed.
 * A single missed day is absorbed by a freeze when the learner has one.
 */
export function updateStreak(params: {
  currentStreak: number;
  longestStreak: number;
  freezesRemaining: number;
  /** Whole study days between the last counted day and today. */
  daysSinceLastStudyDay: number;
  milestones?: number[];
}): StreakUpdate {
  const milestones = params.milestones ?? [7, 30, 100, 365];
  let streak = params.currentStreak;
  let freezes = params.freezesRemaining;
  let freezeUsed = false;
  let broken = false;

  if (params.daysSinceLastStudyDay <= 0) {
    // Already counted today; nothing changes.
    return {
      currentStreak: streak,
      longestStreak: params.longestStreak,
      freezesRemaining: freezes,
      freezeUsed: false,
      streakBroken: false,
      milestoneReached: null,
    };
  }

  if (params.daysSinceLastStudyDay === 1) {
    streak += 1;
  } else if (params.daysSinceLastStudyDay === 2 && freezes > 0) {
    freezes -= 1;
    freezeUsed = true;
    streak += 1;
  } else {
    broken = true;
    streak = 1;
  }

  const longest = Math.max(params.longestStreak, streak);
  const milestoneReached = milestones.includes(streak) ? streak : null;
  // §9.4 — a freeze is granted at every 7 day milestone, capped at 3.
  if (milestoneReached !== null && milestoneReached % 7 === 0) {
    freezes = Math.min(3, freezes + 1);
  }

  return {
    currentStreak: streak,
    longestStreak: longest,
    freezesRemaining: freezes,
    freezeUsed,
    streakBroken: broken,
    milestoneReached,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
