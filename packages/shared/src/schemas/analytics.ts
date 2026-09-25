import { z } from 'zod';
import type { CefrLevel } from '../constants/cefr.js';
import type { Skill } from '../constants/skills.js';

/** §7 Analytics — the periods the page offers. */
export const ANALYTICS_PERIODS = ['7d', '30d', '90d'] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const analyticsQuerySchema = z.object({
  period: z.enum(ANALYTICS_PERIODS).default('30d'),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const PERIOD_DAYS: Record<AnalyticsPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };

export interface DailyPoint {
  /** Study-day key, "YYYY-MM-DD" in the learner's timezone. */
  date: string;
  xp: number;
  minutes: number;
  wordsLearned: number;
  wordsReviewed: number;
  accuracy: number | null;
}

export interface SkillBreakdown {
  skill: Skill;
  score: number;
  cefrEstimate: CefrLevel | null;
  confidence: number;
  lowConfidence: boolean;
  /** Accuracy over the period, from real attempts, or null when untouched. */
  periodAccuracy: number | null;
  attempts: number;
}

export interface MistakeGroup {
  category: string;
  labelVi: string;
  skill: Skill;
  count: number;
  resolved: number;
}

export interface WeakSpot {
  key: string;
  label: string;
  accuracy: number;
  attempts: number;
  reasonVi: string;
}

export interface StudyHabit {
  /** 0..23 in the learner's own timezone. */
  hour: number;
  minutes: number;
}

export interface AnalyticsResponse {
  period: AnalyticsPeriod;
  from: string;
  to: string;
  totals: {
    xp: number;
    minutes: number;
    activeDays: number;
    wordsLearned: number;
    wordsReviewed: number;
    accuracy: number | null;
    currentStreak: number;
    longestStreak: number;
  };
  daily: DailyPoint[];
  skills: SkillBreakdown[];
  overall: { score: number; cefr: CefrLevel };
  mistakes: MistakeGroup[];
  weakSpots: WeakSpot[];
  /** When the learner actually studies, for the "your best hour" note. */
  habits: StudyHabit[];
  /** Vietnamese sentences describing what the numbers mean. */
  insightsVi: string[];
}
