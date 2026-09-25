import { z } from 'zod';
import { cefrLevelSchema, paginationQuerySchema } from './common.js';
import type { CefrLevel } from '../constants/cefr.js';
import type { LessonExercise } from './exercise.js';

/**
 * One word in the passage worth a tap. Offsets are into `bodyMdx` so the
 * reader can wrap exactly those characters without re-tokenising the text and
 * risking a mismatch with what the server highlighted.
 */
export interface GlossaryEntry {
  wordId: string | null;
  lemma: string;
  /** The surface form as it appears in the passage, e.g. "polluted". */
  surface: string;
  offsetStart: number;
  offsetEnd: number;
  definitionVi: string;
  pos: string | null;
  ipa: string | null;
  /** True when this learner already has the word in their collection. */
  known: boolean;
}

export interface ReadingCard {
  slug: string;
  title: string;
  titleVi: string;
  cefr: CefrLevel;
  wordCount: number;
  estimatedMinutes: number;
  topicSlug: string | null;
  topicName: string | null;
  imageUrl: string | null;
  source: string | null;
  questionCount: number;
  /** Best accuracy this learner has reached on the questions, if they tried. */
  bestAccuracy: number | null;
  completed: boolean;
}

export interface ReadingDetail extends ReadingCard {
  bodyMdx: string;
  ttsAudioUrl: string | null;
  glossary: GlossaryEntry[];
  questions: LessonExercise[];
}

export const readingListQuerySchema = paginationQuerySchema.extend({
  cefr: cefrLevelSchema.optional(),
  topic: z.string().min(1).optional(),
  completed: z.coerce.boolean().optional(),
});
export type ReadingListQuery = z.infer<typeof readingListQuerySchema>;

export type ReadingSpeedBandView = 'slow' | 'on-target' | 'fast' | 'skimmed';

/** The extra block a reading submission returns on top of `ActivityResult`. */
export interface ReadingSpeedView {
  wpm: number;
  targetWpm: number;
  band: ReadingSpeedBandView;
}
