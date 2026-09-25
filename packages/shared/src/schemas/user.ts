import { z } from 'zod';
import { cefrLevelSchema } from './common.js';
import { displayNameSchema } from './auth.js';
import { LEARNING_GOALS } from '../constants/topics.js';

export const userRoleSchema = z.enum(['USER', 'ADMIN', 'CONTENT_EDITOR']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const themeSchema = z.enum(['light', 'dark', 'system']);
export const ttsAccentSchema = z.enum(['US', 'UK']);

const goalKeys = LEARNING_GOALS.map((goal) => goal.key);

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  bio: z.string().max(280).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
  currentLevel: cefrLevelSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** §5.2 UserSettings — every field is optional so the client can PATCH one at a time. */
export const updateSettingsSchema = z.object({
  dailyGoalMinutes: z.number().int().min(5).max(240).optional(),
  dailyGoalXp: z.number().int().min(5).max(1000).optional(),
  newWordsPerDay: z.number().int().min(0).max(100).optional(),
  maxReviewsPerDay: z.number().int().min(10).max(500).optional(),
  dayRolloverHour: z.number().int().min(0).max(23).optional(),
  theme: themeSchema.optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ nhắc phải có dạng HH:MM')
    .optional(),
  ttsVoice: z.string().min(1).max(64).optional(),
  ttsAccent: ttsAccentSchema.optional(),
  autoPlayAudio: z.boolean().optional(),
  showIpa: z.boolean().optional(),
  quietMode: z.boolean().optional(),
  leaderboardVisibility: z.enum(['public', 'anonymous', 'hidden']).optional(),
  learningGoals: z.array(z.enum(goalKeys as [string, ...string[]])).max(6).optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** §7.1 — onboarding writes goals, daily commitment and a starting level in one call. */
export const onboardingSchema = z.object({
  goals: z.array(z.enum(goalKeys as [string, ...string[]])).min(1).max(6),
  dailyGoalMinutes: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(30),
    z.literal(60),
  ]),
  selfAssessedLevel: cefrLevelSchema.nullable(),
  takePlacementTest: z.boolean(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export interface MeResponse {
  id: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  createdAt: string;
  onboardedAt: string | null;
  profile: {
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    nativeLang: string;
    timezone: string;
    currentLevel: string;
  };
  settings: {
    dailyGoalMinutes: number;
    dailyGoalXp: number;
    newWordsPerDay: number;
    maxReviewsPerDay: number;
    dayRolloverHour: number;
    theme: string;
    reminderEnabled: boolean;
    reminderTime: string;
    ttsVoice: string;
    ttsAccent: string;
    autoPlayAudio: boolean;
    showIpa: boolean;
    quietMode: boolean;
    leaderboardVisibility: string;
    learningGoals: string[];
    /** Masked form of the learner's own AI key, or null (D-052). */
    aiKeyHint: string | null;
    aiProvider: string | null;
  };
  progress: {
    totalXp: number;
    level: number;
    coins: number;
    currentStreak: number;
    longestStreak: number;
    lastStudyDate: string | null;
    streakFreezes: number;
    treeStage: number;
    totalStudyMin: number;
    wordsLearned: number;
  };
}

/**
 * The learner's own AI provider key (D-052).
 *
 * Sending an empty string removes the saved key, which is why the field is not
 * simply `.min(1)`: "clear it" and "set it" are the same request.
 */
export const aiKeySchema = z.object({
  apiKey: z.string().max(400),
  provider: z.enum(['gemini', 'groq', 'openrouter', 'github']).default('gemini'),
});
export type AiKeyInput = z.infer<typeof aiKeySchema>;

export interface AiKeyStatus {
  /** Masked, e.g. "AQ.Ab8…vU0Q". Null when the learner has not set one. */
  hint: string | null;
  provider: string | null;
  /** False when the stored value could not be decrypted and must be re-entered. */
  readable: boolean;
}
