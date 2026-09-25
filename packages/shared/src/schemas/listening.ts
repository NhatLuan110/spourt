import { z } from 'zod';
import { cefrLevelSchema, paginationQuerySchema } from './common.js';
import { exerciseSubmitSchema } from './exercise.js';
import type { CefrLevel } from '../constants/cefr.js';
import type { DiffToken, LessonExercise } from './exercise.js';

export const LISTENING_FORMATS = [
  'dialogue',
  'monologue',
  'news',
  'podcast',
  'interview',
] as const;
export type ListeningFormat = (typeof LISTENING_FORMATS)[number];

export const LISTENING_ACCENTS = ['US', 'UK', 'AU'] as const;
export type ListeningAccent = (typeof LISTENING_ACCENTS)[number];

/** Playback rates offered by the player (§7 — slow listening is a real study mode). */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5] as const;

export interface TranscriptWord {
  w: string;
  startMs: number;
  endMs: number;
  /** Set when the word is one the learner can tap to look up. */
  wordId?: string | null;
}

export interface TranscriptSegmentView {
  id: string;
  order: number;
  startMs: number;
  endMs: number;
  speaker: string | null;
  text: string;
  words: TranscriptWord[];
  translationVi: string | null;
}

export interface ListeningCard {
  slug: string;
  title: string;
  titleVi: string;
  cefr: CefrLevel;
  durationSec: number;
  accent: ListeningAccent;
  format: ListeningFormat;
  speakerCount: number;
  topicSlug: string | null;
  topicName: string | null;
  /** Empty until a TTS provider is configured; the player speaks the text instead (D-033). */
  audioUrl: string;
  questionCount: number;
  hasDictation: boolean;
  bestAccuracy: number | null;
  completed: boolean;
}

export interface ListeningDetail extends ListeningCard {
  /** Withheld until the learner asks for it, or until they submit. */
  transcript: TranscriptSegmentView[];
  questions: LessonExercise[];
  dictation: LessonExercise[];
}

export const listeningListQuerySchema = paginationQuerySchema.extend({
  cefr: cefrLevelSchema.optional(),
  topic: z.string().min(1).optional(),
  accent: z.enum(LISTENING_ACCENTS).optional(),
  format: z.enum(LISTENING_FORMATS).optional(),
});
export type ListeningListQuery = z.infer<typeof listeningListQuerySchema>;

/**
 * How the learner listened, recorded so the "nghe chậm" achievement and the
 * analytics page have something real to read (§12.3).
 */
export const listeningPlaybackSchema = z.object({
  playbackRate: z.number().min(0.5).max(2).default(1),
  /** How many times any segment was replayed. */
  replays: z.number().int().min(0).max(500).default(0),
  /** True when the learner opened the transcript before answering. */
  transcriptShown: z.boolean().default(false),
});
export type ListeningPlayback = z.infer<typeof listeningPlaybackSchema>;

/** Submitting a listening track carries how the learner listened to it. */
export const listeningSubmitSchema = exerciseSubmitSchema.extend({
  playback: listeningPlaybackSchema.default({
    playbackRate: 1,
    replays: 0,
    transcriptShown: false,
  }),
});
export type ListeningSubmitInput = z.infer<typeof listeningSubmitSchema>;

export interface DictationLineResult {
  exerciseId: string;
  score: number;
  reference: string;
  answer: string;
  tokens: DiffToken[];
  homophoneWarnings: { expected: string; actual: string }[];
}

export type { LessonExercise };
