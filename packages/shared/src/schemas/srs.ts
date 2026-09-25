import { z } from 'zod';
import { SRS_STATES } from '../constants/skills.js';

/** §9.1 — 0 Again, 1 Hard, 2 Good, 3 Easy. */
export const reviewGradeSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type ReviewGrade = z.infer<typeof reviewGradeSchema>;

export const GRADE_LABEL_VI: Record<number, string> = {
  0: 'Quên rồi',
  1: 'Khó',
  2: 'Được',
  3: 'Dễ',
};

export const srsStateSchema = z.enum(SRS_STATES);

export const srsQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  deckId: z.string().min(1).optional(),
  topicSlug: z.string().min(1).optional(),
});
export type SrsQueueQuery = z.infer<typeof srsQueueQuerySchema>;

export const srsReviewSchema = z.object({
  userWordId: z.string().min(1),
  grade: reviewGradeSchema,
  responseMs: z.number().int().min(0).max(600_000),
  reviewedAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export type SrsReviewInput = z.infer<typeof srsReviewSchema>;

/** §11 PWA — offline reviews are replayed in a batch when the device reconnects. */
export const srsBulkReviewSchema = z.object({
  reviews: z.array(srsReviewSchema).min(1).max(200),
});
export type SrsBulkReviewInput = z.infer<typeof srsBulkReviewSchema>;

export const srsResetSchema = z.object({ userWordId: z.string().min(1) });

export interface SrsQueueCard {
  userWordId: string;
  wordId: string;
  lemma: string;
  slug: string;
  ipaUs: string | null;
  ipaUk: string | null;
  audioUsUrl: string | null;
  audioUkUrl: string | null;
  state: string;
  isNew: boolean;
  dueAt: string;
  intervalDays: number;
  senses: {
    pos: string;
    definitionVi: string;
    definitionEn: string;
    examples: { textEn: string; textVi: string; highlightStart: number; highlightEnd: number }[];
  }[];
  synonyms: string[];
  /** Preview of where each grade would send the card, shown on the buttons. */
  intervalPreview: Record<string, number>;
}

export interface SrsReviewResult {
  userWordId: string;
  state: string;
  intervalDays: number;
  nextDueAt: string;
  ease: number;
  lapses: number;
  xpEarned: number;
  remainingInQueue: number;
}
