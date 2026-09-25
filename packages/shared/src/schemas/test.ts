import { z } from 'zod';
import { cefrLevelSchema, skillSchema } from './common.js';
import type { CefrLevel } from '../constants/cefr.js';
import type { Skill } from '../constants/skills.js';
import type { LessonExercise } from './exercise.js';

/** §5.7 — the four kinds of test the app can run. */
export const TEST_KINDS = ['placement', 'skill', 'mixed', 'level-up'] as const;
export type TestKind = (typeof TEST_KINDS)[number];
export const testKindSchema = z.enum(TEST_KINDS);

export interface TestCard {
  slug: string;
  kind: TestKind;
  skill: Skill | null;
  cefr: CefrLevel | null;
  title: string;
  description: string;
  durationMin: number;
  passScore: number;
  isAdaptive: boolean;
  questionCount: number;
  /** The learner's most recent finished attempt, if there is one. */
  lastAttempt: {
    id: string;
    submittedAt: string;
    totalScore: number;
    maxScore: number;
    cefrResult: CefrLevel | null;
  } | null;
}

export interface TestSectionView {
  id: string;
  skill: Skill;
  title: string;
  order: number;
  timeLimitMin: number | null;
  questionCount: number;
}

export interface TestDetail extends TestCard {
  sections: TestSectionView[];
}

/**
 * An adaptive test serves one question at a time, because which question comes
 * next depends on the answer to this one. A fixed test serves the whole set.
 */
export interface TestQuestion {
  exercise: LessonExercise;
  skill: Skill;
  cefr: CefrLevel;
  /** 1-based, for "câu 4" — not an index into a list the client holds. */
  position: number;
}

export interface TestRunState {
  attemptId: string;
  isAdaptive: boolean;
  /** Null once the test is finished. */
  next: TestQuestion | null;
  answered: number;
  /** Null for an adaptive test, which does not know its own length up front. */
  total: number | null;
  /** Seconds left, or null when the test is untimed. */
  secondsRemaining: number | null;
}

export const testAnswerSchema = z.object({
  exerciseId: z.string().min(1),
  answer: z.string().max(4000),
  timeSpentMs: z.number().int().min(0).max(1_800_000),
});
export type TestAnswerInput = z.infer<typeof testAnswerSchema>;

/** One answer at a time for adaptive; a batch is accepted for fixed tests. */
export const testSubmitSchema = z.object({
  answers: z.array(testAnswerSchema).min(1).max(60),
});
export type TestSubmitInput = z.infer<typeof testSubmitSchema>;

export interface TestSkillResult {
  skill: Skill;
  correct: number;
  asked: number;
  score: number;
  cefr: CefrLevel;
}

export interface TestResult {
  attemptId: string;
  totalScore: number;
  maxScore: number;
  accuracy: number;
  passed: boolean;
  cefrResult: CefrLevel | null;
  skills: TestSkillResult[];
  durationSec: number;
  /** Which skills came out weakest, in the learner's language. */
  adviceVi: string[];
  /** Placement tests write the level onto the profile; this says whether it did. */
  profileUpdated: boolean;
}

export const testListQuerySchema = z.object({
  kind: testKindSchema.optional(),
  skill: skillSchema.optional(),
  cefr: cefrLevelSchema.optional(),
});
export type TestListQuery = z.infer<typeof testListQuerySchema>;
