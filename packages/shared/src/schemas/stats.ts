import { z } from 'zod';
import { skillSchema } from './common.js';

/** §7.2 — everything the dashboard hero needs, in one request. */
export interface DashboardResponse {
  greetingHour: number;
  progress: {
    totalXp: number;
    coins: number;
    level: { level: number; xpIntoLevel: number; xpForNextLevel: number; progressPct: number };
    currentStreak: number;
    longestStreak: number;
    streakFreezes: number;
    wordsLearned: number;
  };
  tree: {
    stage: number;
    key: string;
    nameVi: string;
    emoji: string;
    health: 'healthy' | 'yellowing' | 'wilting';
    nextStageXp: number | null;
    flowers: number;
    birds: number;
  };
  today: {
    dayKey: string;
    xpEarned: number;
    goalXp: number;
    goalMet: boolean;
    studyMinutes: number;
    wordsLearned: number;
    wordsReviewed: number;
    accuracy: number | null;
  };
  srs: {
    dueNow: number;
    newAvailable: number;
    backlogWarning: boolean;
    learningCount: number;
    masteredCount: number;
  };
  /** §9.6 — one primary call to action plus the runners-up. */
  recommendations: {
    id: string;
    kind: string;
    titleVi: string;
    reasonVi: string;
    href: string;
    score: number;
  }[];
  /** Last seven study days, oldest first, for the sparkline. */
  week: { dayKey: string; xpEarned: number; goalMet: boolean; minutes: number }[];
  recentAchievements: {
    slug: string;
    nameVi: string;
    icon: string;
    tier: string;
    unlockedAt: string;
  }[];
}

export const xpHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type XpHistoryQuery = z.infer<typeof xpHistoryQuerySchema>;

export interface SkillScoreView {
  skill: string;
  score: number;
  confidence: number;
  cefrEstimate: string | null;
  observations: number;
  lowConfidence: boolean;
}

export const skillObservationSchema = z.object({
  skill: skillSchema,
  score: z.number().min(0).max(100),
});

export interface AchievementView {
  slug: string;
  nameVi: string;
  descriptionVi: string;
  icon: string;
  tier: string;
  xpReward: number;
  coinReward: number;
  isSecret: boolean;
  unlockedAt: string | null;
  /** 0..1 towards the condition, for the ones we can measure cheaply. */
  progressPct: number | null;
}

/** Returned by every endpoint that can move the gamification needle. */
export interface RewardSummary {
  xpEarned: number;
  coinsEarned: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  treeStage: number;
  treeGrew: boolean;
  streak: {
    current: number;
    longest: number;
    freezesRemaining: number;
    freezeUsed: boolean;
    milestoneReached: number | null;
  };
  cappedByDailyReviewLimit: boolean;
  achievementsUnlocked: {
    slug: string;
    nameVi: string;
    icon: string;
    tier: string;
    xpReward: number;
    coinReward: number;
  }[];
}
