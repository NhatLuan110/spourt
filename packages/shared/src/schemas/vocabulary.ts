import { z } from 'zod';
import type { CefrLevel } from '../constants/cefr.js';
import { cefrLevelSchema, paginationQuerySchema } from './common.js';
import { PARTS_OF_SPEECH } from '../constants/skills.js';

export const posSchema = z.enum(PARTS_OF_SPEECH);

export const wordListQuerySchema = paginationQuerySchema.extend({
  cefr: cefrLevelSchema.optional(),
  subtopic: z.string().min(1).optional(),
  search: z.string().trim().max(64).optional(),
  sort: z.enum(['frequency', 'alphabet', 'cefr', 'learned']).default('frequency'),
});
export type WordListQuery = z.infer<typeof wordListQuerySchema>;

export const myWordsQuerySchema = paginationQuerySchema.extend({
  state: z.enum(['all', 'learning', 'mastered', 'leech', 'favorite', 'suspended']).default('all'),
  topic: z.string().min(1).optional(),
  search: z.string().trim().max(64).optional(),
  sort: z.enum(['due', 'alphabet', 'accuracy', 'recent']).default('due'),
});
export type MyWordsQuery = z.infer<typeof myWordsQuerySchema>;

export const learnWordSchema = z.object({
  sourceType: z.enum(['topic', 'reading', 'listening', 'manual', 'ai', 'deck']).default('topic'),
  sourceId: z.string().min(1).optional(),
});
export type LearnWordInput = z.infer<typeof learnWordSchema>;

export const updateUserWordSchema = z.object({
  isFavorite: z.boolean().optional(),
  state: z.enum(['SUSPENDED', 'REVIEW']).optional(),
});
export type UpdateUserWordInput = z.infer<typeof updateUserWordSchema>;

export const createDeckSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(280).optional(),
  emoji: z.string().min(1).max(8).default('🌿'),
  isPublic: z.boolean().default(false),
});
export type CreateDeckInput = z.infer<typeof createDeckSchema>;

export const addDeckItemsSchema = z.object({
  items: z
    .array(
      z.object({
        wordId: z.string().min(1).optional(),
        customFront: z.string().trim().min(1).max(120).optional(),
        customBack: z.string().trim().min(1).max(400).optional(),
      }),
    )
    .min(1)
    .max(200),
  enqueueForReview: z.boolean().default(true),
});
export type AddDeckItemsInput = z.infer<typeof addDeckItemsSchema>;

/** §7.3.4 — the five vocabulary exercise formats. */
export const VOCAB_EXERCISE_MODES = [
  'mcq-meaning',
  'mcq-reverse',
  'gap-fill',
  'listen-type',
  'matching',
] as const;

export const vocabExerciseModeSchema = z.enum(VOCAB_EXERCISE_MODES);
export type VocabExerciseMode = z.infer<typeof vocabExerciseModeSchema>;

export const vocabPracticeRequestSchema = z.object({
  topicSlug: z.string().min(1).optional(),
  wordIds: z.array(z.string().min(1)).max(50).optional(),
  modes: z.array(vocabExerciseModeSchema).min(1).default(['mcq-meaning']),
  count: z.number().int().min(1).max(30).default(10),
});
export type VocabPracticeRequest = z.infer<typeof vocabPracticeRequestSchema>;

export interface WordSummary {
  id: string;
  lemma: string;
  slug: string;
  cefr: string;
  ipaUs: string | null;
  ipaUk: string | null;
  audioUsUrl: string | null;
  audioUkUrl: string | null;
  primaryPos: string | null;
  definitionVi: string | null;
  learnState: string | null;
}

/**
 * §7.3 flashcards — a browsable deck, distinct from the SRS review queue.
 *
 * SRS decides *when* a card comes back and grades recall on a four-button
 * scale. Flashcards are for a learner who wants to flip through a topic at
 * their own pace, in either direction, before the schedule has any opinion
 * about them. The two share the same `UserWord` rows: rating a flashcard
 * "chưa thuộc" enqueues it for review.
 */
export const FLASHCARD_DIRECTIONS = ['en-vi', 'vi-en', 'mixed'] as const;
export type FlashcardDirection = (typeof FLASHCARD_DIRECTIONS)[number];

export const FLASHCARD_SOURCES = ['topic', 'deck', 'collection', 'due'] as const;
export type FlashcardSource = (typeof FLASHCARD_SOURCES)[number];

export interface FlashcardFace {
  /** What is shown, already resolved for the chosen direction. */
  primary: string;
  /** IPA, part of speech, or the Vietnamese gloss — whatever belongs underneath. */
  secondary: string | null;
  ipa: string | null;
  audioUrl: string | null;
  /** Only ever set on the English face; the browser speaks it when audio is missing. */
  speakText: string | null;
}

export interface FlashcardView {
  wordId: string;
  slug: string;
  lemma: string;
  cefr: CefrLevel;
  front: FlashcardFace;
  back: FlashcardFace;
  /** One example, both languages, shown on the back. */
  example: { en: string; vi: string } | null;
  /** Null when the learner has never studied this word. */
  learnState: string | null;
  /** True when this card is due for review right now. */
  due: boolean;
}

export interface FlashcardDeckView {
  source: FlashcardSource;
  /** Topic slug, deck id, or null for the whole collection. */
  ref: string | null;
  title: string;
  cards: FlashcardView[];
  total: number;
}

export const flashcardQuerySchema = z.object({
  source: z.enum(FLASHCARD_SOURCES).default('topic'),
  ref: z.string().min(1).optional(),
  direction: z.enum(FLASHCARD_DIRECTIONS).default('en-vi'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  /** Shuffle, so a second pass is not the same order. */
  shuffle: z.coerce.boolean().default(true),
  /** Only words the learner has not marked known. */
  unknownOnly: z.coerce.boolean().default(false),
});
export type FlashcardQuery = z.infer<typeof flashcardQuerySchema>;

/**
 * A self-rating on one card. Deliberately two-way rather than the SRS
 * four-button scale: flipping through a deck is a different act from grading
 * recall, and offering four buttons here would make the two modes look
 * interchangeable when they are not.
 */
export const flashcardRateSchema = z.object({
  wordId: z.string().min(1),
  known: z.boolean(),
  /** Milliseconds the card was on screen, for the study-time rollup. */
  timeSpentMs: z.number().int().min(0).max(600_000).default(0),
});
export type FlashcardRateInput = z.infer<typeof flashcardRateSchema>;

export interface FlashcardRateResult {
  wordId: string;
  /** The SRS state after the rating, so the UI can say what happened. */
  state: string;
  /** Set when the word was added to the review schedule by this rating. */
  enqueued: boolean;
  dueAt: string | null;
}
