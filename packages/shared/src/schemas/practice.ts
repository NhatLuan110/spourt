import { z } from 'zod';
import type { VocabExerciseMode } from './vocabulary.js';

/**
 * §7.3.4 — the wire shape of one generated practice item.
 *
 * The correct answer never travels to the client: `answer` stays on the server
 * and the client posts what the learner chose, so a curious learner cannot read
 * the answer out of the network tab.
 */
export interface PracticeOption {
  id: string;
  /** What the learner reads on the button. */
  text: string;
  /** Secondary line: part of speech, or the IPA for a lemma option. */
  hint?: string;
}

export interface PracticeItemBase {
  id: string;
  wordId: string;
  lemma: string;
  mode: VocabExerciseMode;
  /** Vietnamese instruction, always present (§11 — no hardcoded strings client side). */
  instructionKey: string;
}

export interface McqPracticeItem extends PracticeItemBase {
  mode: 'mcq-meaning' | 'mcq-reverse';
  prompt: string;
  promptIpa?: string | null;
  promptAudioUrl?: string | null;
  options: PracticeOption[];
}

export interface GapFillPracticeItem extends PracticeItemBase {
  mode: 'gap-fill';
  /** The sentence with the target replaced by "____". */
  prompt: string;
  translation: string;
  /** First letter plus length, e.g. "r___" — never the whole answer. */
  hint: string;
  pos: string;
}

export interface ListenTypePracticeItem extends PracticeItemBase {
  mode: 'listen-type';
  audioUrl: string | null;
  /** Client falls back to speech synthesis when audioUrl is null. */
  speakText: string;
  definitionVi: string;
  hint: string;
}

export interface MatchingPracticeItem extends PracticeItemBase {
  mode: 'matching';
  left: PracticeOption[];
  right: PracticeOption[];
}

export type PracticeItem =
  | McqPracticeItem
  | GapFillPracticeItem
  | ListenTypePracticeItem
  | MatchingPracticeItem;

export interface PracticeSet {
  sessionId: string;
  items: PracticeItem[];
  /** Total items, so the progress bar can render before the first answer. */
  total: number;
}

export const practiceAnswerSchema = z.object({
  /** The Exercise id served in the set — the answer itself never leaves the server. */
  itemId: z.string().min(1),
  /** For matching this is a JSON array of "leftId:rightId" pairs. */
  answer: z.string().max(2000),
  timeSpentMs: z.number().int().min(0).max(600_000),
});
export type PracticeAnswerInput = z.infer<typeof practiceAnswerSchema>;

export const practiceSubmitSchema = z.object({
  sessionId: z.string().min(1),
  answers: z.array(practiceAnswerSchema).min(1).max(50),
});
export type PracticeSubmitInput = z.infer<typeof practiceSubmitSchema>;

export interface PracticeItemResult {
  itemId: string;
  wordId: string;
  lemma: string;
  isCorrect: boolean;
  score: number;
  /** What the learner should have written or chosen. */
  correctAnswer: string;
  /** §5.5 — never just right/wrong. */
  explanationVi: string;
}

export interface PracticeResult {
  sessionId: string;
  results: PracticeItemResult[];
  correct: number;
  total: number;
  accuracy: number;
  xpEarned: number;
  coinsEarned: number;
  durationSec: number;
}

/** §7.3.2 — one card of the "learn new words" flow, before any SRS scheduling. */
export interface LearnCard {
  wordId: string;
  lemma: string;
  slug: string;
  cefr: string;
  ipaUs: string | null;
  ipaUk: string | null;
  audioUsUrl: string | null;
  audioUkUrl: string | null;
  syllables: string | null;
  stressPattern: string | null;
  senses: {
    id: string;
    pos: string;
    definitionEn: string;
    definitionVi: string;
    register: string | null;
    examples: {
      textEn: string;
      textVi: string;
      highlightStart: number;
      highlightEnd: number;
    }[];
  }[];
  synonyms: string[];
  antonyms: string[];
  /** Other members of the same word family, for the §7.4 pointer. */
  family: { lemma: string; slug: string; pos: string; suffix: string | null }[];
  alreadyLearning: boolean;
}

export const learnSessionQuerySchema = z.object({
  topic: z.string().min(1).optional(),
  deckId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});
export type LearnSessionQuery = z.infer<typeof learnSessionQuerySchema>;

export const learnCommitSchema = z.object({
  wordIds: z.array(z.string().min(1)).min(1).max(30),
  sourceType: z.enum(['topic', 'reading', 'listening', 'manual', 'ai', 'deck']).default('topic'),
  sourceId: z.string().min(1).optional(),
});
export type LearnCommitInput = z.infer<typeof learnCommitSchema>;
