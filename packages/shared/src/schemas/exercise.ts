import { z } from 'zod';
import type { PracticeOption } from './practice.js';
import type { RewardSummary } from './stats.js';

/**
 * The exercise formats that grammar lessons, reading passages and listening
 * tracks share. Vocabulary practice (§7.3.4) keeps its own narrower union in
 * `practice.ts`; these two vocabularies overlap on `PracticeOption` only.
 *
 * As in vocabulary practice, the correct answer never travels to the client
 * until the set is submitted.
 */
export const LESSON_EXERCISE_MODES = [
  'mcq',
  'gap-fill',
  'true-false',
  'reorder',
  'short-answer',
  'dictation',
] as const;

export type LessonExerciseMode = (typeof LESSON_EXERCISE_MODES)[number];
export const lessonExerciseModeSchema = z.enum(LESSON_EXERCISE_MODES);

export interface LessonExerciseBase {
  id: string;
  mode: LessonExerciseMode;
  /** The English prompt, already carrying "____" where a gap belongs. */
  prompt: string;
  /** Vietnamese gloss of the instruction, when the content author wrote one. */
  promptVi?: string | null;
  order: number;
}

export interface McqLessonExercise extends LessonExerciseBase {
  mode: 'mcq';
  options: PracticeOption[];
}

export interface GapFillLessonExercise extends LessonExerciseBase {
  mode: 'gap-fill';
  /** First letter plus length when the author asked for a hint. */
  hint?: string | null;
  /** Bare infinitive or root shown in brackets, e.g. "(go)". */
  root?: string | null;
}

export interface TrueFalseLessonExercise extends LessonExerciseBase {
  mode: 'true-false';
  /** The statement being judged; `prompt` holds the instruction. */
  statement: string;
}

export interface ReorderLessonExercise extends LessonExerciseBase {
  mode: 'reorder';
  /** Shuffled chunks — the learner drags or taps them into order. */
  chunks: PracticeOption[];
}

export interface ShortAnswerLessonExercise extends LessonExerciseBase {
  mode: 'short-answer';
  hint?: string | null;
}

export interface DictationLessonExercise extends LessonExerciseBase {
  mode: 'dictation';
  audioUrl?: string | null;
  /** What the browser speaks when there is no recorded audio (D-027, D-033). */
  speakText: string;
  /** Which transcript segment this line came from, for replaying just that bit. */
  segmentOrder?: number | null;
  /** How many words the learner should expect, so the box is the right size. */
  wordCount: number;
}

export type LessonExercise =
  | McqLessonExercise
  | GapFillLessonExercise
  | TrueFalseLessonExercise
  | ReorderLessonExercise
  | ShortAnswerLessonExercise
  | DictationLessonExercise;

/** §9.5 — one word of a dictation diff. Declared here so both apps share it. */
export type DiffStatus = 'correct' | 'near' | 'missing' | 'extra' | 'wrong';

export interface DiffToken {
  status: DiffStatus;
  /** The word the learner should have typed, if any. */
  expected: string | null;
  /** What the learner actually typed, if any. */
  actual: string | null;
  /** True when the two words sound alike: right sound, wrong word. */
  homophone: boolean;
  /** Character distance for near misses, useful for the tooltip. */
  distance: number;
}

export const exerciseAnswerSchema = z.object({
  exerciseId: z.string().min(1),
  /** For reorder this is a JSON array of chunk ids; for true/false "true"/"false". */
  answer: z.string().max(4000),
  timeSpentMs: z.number().int().min(0).max(1_800_000),
  hintsUsed: z.number().int().min(0).max(10).default(0),
});

export type ExerciseAnswerInput = z.infer<typeof exerciseAnswerSchema>;

export const exerciseSubmitSchema = z.object({
  answers: z.array(exerciseAnswerSchema).min(1).max(60),
  /** The StudySession opened when the learner started, if there was one. */
  sessionId: z.string().min(1).optional(),
  /** Wall-clock time on the whole activity, used for reading speed. */
  elapsedMs: z.number().int().min(0).max(7_200_000).optional(),
});

export type ExerciseSubmitInput = z.infer<typeof exerciseSubmitSchema>;

/** What comes back per exercise once the set is submitted. */
export interface ExerciseFeedback {
  exerciseId: string;
  mode: LessonExerciseMode;
  isCorrect: boolean;
  score: number;
  /** What the learner sent, echoed back so the review screen is self-contained. */
  yourAnswer: string;
  /** Revealed only now. */
  correctAnswer: string;
  /** Mandatory per §5.5 — never just right or wrong. */
  explanationVi: string;
  /** Set when a spelling slip was forgiven, so the learner still sees it. */
  typo?: boolean;
  /** Word-level diff, dictation only. */
  diff?: DiffToken[];
}

export interface ActivityResult {
  sessionId: string | null;
  correctCount: number;
  total: number;
  /** Mean of the per-item scores, so partial credit counts. */
  accuracy: number;
  /** Seconds on the activity, measured server side from the session start. */
  durationSec: number;
  feedback: ExerciseFeedback[];
  /** The same block vocabulary practice returns, so the UI has one reward view. */
  reward: RewardSummary;
}

/**
 * §7 sentence transformation — "viết lại câu".
 *
 * Carried outside `LessonExercise` because it needs two things no other mode
 * has: the sentence being transformed, and a cue the learner is required to
 * use. Grading answers those separately, so a learner who got the meaning
 * right but skipped the structure is told which half they missed.
 */
export const CUE_TYPES = ['start', 'keyword', 'none'] as const;
export type CueTypeView = (typeof CUE_TYPES)[number];

export interface RewriteItem {
  id: string;
  /** The sentence to transform. */
  source: string;
  /** The words that must be used, or null when only the meaning matters. */
  cue: string | null;
  cueType: CueTypeView;
  /** Vietnamese instruction, already assembled from the cue. */
  instructionVi: string;
  cefr: string;
  setSlug: string;
  setTitleVi: string;
}

export interface RewriteSet {
  slug: string;
  title: string;
  titleVi: string;
  cefr: string;
  explanationVi: string;
  itemCount: number;
  /** How many of them this learner has answered correctly at least once. */
  solved: number;
}

export interface RewriteFeedback {
  itemId: string;
  isCorrect: boolean;
  score: number;
  yourAnswer: string;
  /** Every accepted answer, revealed only after submitting. */
  accepted: string[];
  explanationVi: string;
  /** False when the required cue was missing. */
  usedCue: boolean;
  /** True when the learner handed back the original sentence. */
  copiedSource: boolean;
  /** What specifically went wrong, in Vietnamese. */
  hintVi: string | null;
}

export const rewriteQuerySchema = z.object({
  /** A single set, or omitted for a mix across all of them. */
  set: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});
export type RewriteQuery = z.infer<typeof rewriteQuerySchema>;

export const rewriteSubmitSchema = z.object({
  answers: z
    .array(
      z.object({
        itemId: z.string().min(1),
        answer: z.string().max(500),
        timeSpentMs: z.number().int().min(0).max(1_800_000).default(0),
      }),
    )
    .min(1)
    .max(30),
});
export type RewriteSubmitInput = z.infer<typeof rewriteSubmitSchema>;

/**
 * One item checked on its own, before the set is submitted.
 *
 * Deliberately separate from submit: checking each answer as you write it is
 * better practice, but routing it through submit would pay XP once per item and
 * turn a ten-item set into ten times the reward.
 */
export const rewriteCheckSchema = z.object({
  itemId: z.string().min(1),
  answer: z.string().max(500),
});
export type RewriteCheckInput = z.infer<typeof rewriteCheckSchema>;

export interface RewriteResult {
  correctCount: number;
  total: number;
  accuracy: number;
  feedback: RewriteFeedback[];
  reward: RewardSummary;
}
