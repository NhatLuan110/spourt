import { z } from 'zod';
import { posSchema } from './vocabulary.js';

/** §7.4 — one row of the suffix table. */
export interface SuffixRuleView {
  suffix: string;
  pos: string;
  posLabelVi: string;
  reliability: number;
  explanationVi: string;
  examples: string[];
  exceptions: string[];
}

export interface WordFamilyMember {
  wordId: string;
  lemma: string;
  slug: string;
  pos: string;
  posLabelVi: string;
  suffix: string | null;
  note: string | null;
  ipaUs: string | null;
  definitionVi: string | null;
  /** SRS state of this member for the current learner, null when untouched. */
  learnState: string | null;
}

export interface WordFamilyView {
  rootSlug: string;
  glossVi: string;
  members: WordFamilyMember[];
}

export const wordClassPracticeRequestSchema = z.object({
  /** Restrict to one family, otherwise the generator picks from what you know. */
  rootSlug: z.string().min(1).optional(),
  pos: posSchema.optional(),
  count: z.coerce.number().int().min(1).max(20).default(8),
});
export type WordClassPracticeRequest = z.infer<typeof wordClassPracticeRequestSchema>;

/** §7.4.3 — "The company decided to ___ (expand)." */
export interface WordFormItem {
  id: string;
  wordId: string;
  /** Sentence with "____" where the derived form belongs. */
  prompt: string;
  translation: string;
  /** The dictionary form shown in brackets after the gap. */
  baseLemma: string;
  /** Which class the gap needs — the whole point of the exercise. */
  targetPos: string;
  targetPosLabelVi: string;
  rootSlug: string;
}

export interface WordFormSet {
  sessionId: string;
  items: WordFormItem[];
  total: number;
}

export const wordClassSubmitSchema = z.object({
  sessionId: z.string().min(1),
  answers: z
    .array(
      z.object({
        itemId: z.string().min(1),
        answer: z.string().trim().max(60),
        timeSpentMs: z.number().int().min(0).max(600_000),
      }),
    )
    .min(1)
    .max(20),
});
export type WordClassSubmitInput = z.infer<typeof wordClassSubmitSchema>;
