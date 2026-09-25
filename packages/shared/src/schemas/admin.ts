import { z } from 'zod';
import { paginationQuerySchema } from './common.js';
import type { CefrLevel } from '../constants/cefr.js';
import type { UserRole } from './user.js';

/**
 * §12 admin — what a person running the app needs to see.
 *
 * Deliberately read-mostly. Content lives in `content/*.yaml` and is seeded, so
 * an admin screen that edited it would put the database and the files out of
 * step with each other. What this exposes instead is what only the database
 * knows: who is using the app, what the content actually costs, and whether
 * anything is broken.
 */

export interface AdminOverview {
  users: {
    total: number;
    /** Signed up within the last seven days. */
    newThisWeek: number;
    /** Studied within the last seven days. */
    activeThisWeek: number;
    activeToday: number;
  };
  content: {
    words: number;
    topics: number;
    lessons: number;
    passages: number;
    tracks: number;
    drills: number;
    scenarios: number;
    writingPrompts: number;
    rewriteItems: number;
    exercises: number;
    tests: number;
  };
  activity: {
    /** Study sessions in the last seven days. */
    sessions: number;
    reviews: number;
    exerciseAttempts: number;
    writingSubmissions: number;
    speakingAttempts: number;
  };
  ai: {
    provider: string;
    speechProvider: string;
    configured: boolean;
    /** Calls in the last seven days, by feature. */
    callsByFeature: { feature: string; calls: number; tokensIn: number; tokensOut: number }[];
    /** Learners who have supplied their own key (D-052). */
    learnersWithOwnKey: number;
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  level: CefrLevel;
  totalXp: number;
  currentStreak: number;
  wordsLearned: number;
  createdAt: string;
  lastStudyDate: string | null;
  /** True when this learner uses their own AI key. */
  ownAiKey: boolean;
}

export const adminUserQuerySchema = paginationQuerySchema.extend({
  search: z.string().min(1).max(120).optional(),
  role: z.enum(['USER', 'ADMIN', 'CONTENT_EDITOR']).optional(),
  /** Only learners who have studied in the last seven days. */
  activeOnly: z.coerce.boolean().optional(),
});
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const adminRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN', 'CONTENT_EDITOR']),
});
export type AdminRoleInput = z.infer<typeof adminRoleSchema>;

/**
 * A content problem the seeded data has, found by querying rather than by
 * reading the files — so it catches things the YAML checker cannot, such as a
 * lesson whose exercises were deleted by a bad migration.
 */
export interface AdminContentIssue {
  kind: 'lesson-no-exercises' | 'topic-no-words' | 'word-no-sense' | 'track-no-transcript' | 'drill-unknown-focus';
  ref: string;
  detailVi: string;
}
