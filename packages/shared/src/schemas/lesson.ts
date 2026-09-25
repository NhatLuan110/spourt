import { z } from 'zod';
import { cefrLevelSchema } from './common.js';
import type { CefrLevel } from '../constants/cefr.js';
import type { LessonExercise } from './exercise.js';

/** The four kinds of prose a grammar lesson is built from (§5.5). */
export const LESSON_SECTION_KINDS = ['theory', 'examples', 'tips', 'common-mistakes'] as const;
export type LessonSectionKind = (typeof LESSON_SECTION_KINDS)[number];

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';

/** Why a lesson is not available yet, so the UI can say so instead of 404ing. */
export interface LessonLock {
  locked: boolean;
  /** Slugs of the lessons that must be completed first. */
  requires: { slug: string; title: string; titleVi: string }[];
}

export interface LessonCard {
  slug: string;
  title: string;
  titleVi: string;
  summary: string;
  cefr: CefrLevel;
  estimatedMinutes: number;
  xpReward: number;
  exerciseCount: number;
  order: number;
  status: LessonStatus;
  progressPct: number;
  accuracy: number | null;
  lock: LessonLock;
}

export interface LessonSectionView {
  id: string;
  order: number;
  kind: LessonSectionKind;
  title: string;
  /** Markdown, rendered by the web app's own renderer — never dangerouslySet raw HTML. */
  bodyMdx: string;
}

export interface LessonDetail extends LessonCard {
  sections: LessonSectionView[];
  exercises: LessonExercise[];
}

export const lessonListQuerySchema = z.object({
  cefr: cefrLevelSchema.optional(),
  /** "all" also returns lessons whose prerequisites are unmet. */
  status: z.enum(['all', 'available', 'completed', 'in_progress']).default('all'),
});
export type LessonListQuery = z.infer<typeof lessonListQuerySchema>;

/** Marking a section read: cheap, idempotent, no XP. */
export const lessonSectionReadSchema = z.object({
  sectionId: z.string().min(1),
});
