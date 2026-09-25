import { z } from 'zod';
import { cefrLevelSchema } from './common.js';
import type { CefrLevel } from '../constants/cefr.js';

/** §5.6 — the four lengths a writing task can be. */
export const WRITING_KINDS = ['sentence', 'paragraph', 'email', 'essay'] as const;
export type WritingKind = (typeof WRITING_KINDS)[number];
export const writingKindSchema = z.enum(WRITING_KINDS);

/** The rubric §5.6 scores every submission against. */
export const WRITING_CRITERIA = ['task', 'organization', 'vocabulary', 'grammar'] as const;
export type WritingCriterion = (typeof WRITING_CRITERIA)[number];

export type WritingStatus = 'draft' | 'grading' | 'graded' | 'failed';

export interface WritingPromptCard {
  slug: string;
  kind: WritingKind;
  cefr: CefrLevel;
  title: string;
  instructionsVi: string;
  instructionsEn: string;
  minWords: number;
  maxWords: number;
  timeLimitMin: number | null;
  outlineVi: string | null;
  /** Withheld until the learner has submitted at least once (§7). */
  sampleAnswer: string | null;
  /** How many times this learner has already answered it. */
  attempts: number;
  bestScore: number | null;
}

/** One thing the grader found wrong, anchored in the learner's own text. */
export interface WritingIssue {
  /** Character offsets into the submitted content, so the UI can highlight it. */
  start: number;
  end: number;
  /** The learner's words, echoed so a stale offset is detectable. */
  original: string;
  suggestion: string;
  /** "grammar" | "vocabulary" | "spelling" | "punctuation" | "style" | "coherence" */
  category: string;
  severity: 'minor' | 'major';
  /** Why it is wrong, in Vietnamese — never just a corrected string. */
  whyVi: string;
}

export interface WritingCriterionScore {
  criterion: WritingCriterion;
  /** 0..10 */
  score: number;
  commentVi: string;
}

export interface WritingNextStep {
  labelVi: string;
  /** Where to go and do something about it, when there is somewhere. */
  href?: string;
}

export interface WritingFeedback {
  overallScore: number;
  cefrEstimate: CefrLevel;
  criteria: WritingCriterionScore[];
  issues: WritingIssue[];
  /** The whole text rewritten at the level above, for comparison. */
  rewrite: string;
  rewriteNotesVi: string[];
  strengths: string[];
  nextSteps: WritingNextStep[];
}

export interface WritingSubmissionView {
  id: string;
  promptSlug: string | null;
  promptTitle: string | null;
  freeTopic: string | null;
  content: string;
  wordCount: number;
  status: WritingStatus;
  submittedAt: string;
  gradedAt: string | null;
  errorMessageVi: string | null;
  feedback: WritingFeedback | null;
}

export const writingListQuerySchema = z.object({
  kind: writingKindSchema.optional(),
  cefr: cefrLevelSchema.optional(),
});
export type WritingListQuery = z.infer<typeof writingListQuerySchema>;

/**
 * A submission carries either a prompt or a free topic, never neither: a piece
 * of writing with no task cannot be scored against "task achievement".
 */
export const writingSubmitSchema = z
  .object({
    promptSlug: z.string().min(1).optional(),
    freeTopic: z.string().min(3).max(200).optional(),
    content: z.string().min(10).max(8000),
  })
  .refine((value) => Boolean(value.promptSlug) !== Boolean(value.freeTopic), {
    message: 'Cần chọn một đề bài, hoặc tự nhập chủ đề — không phải cả hai.',
    path: ['promptSlug'],
  });
export type WritingSubmitInput = z.infer<typeof writingSubmitSchema>;

/** What the AI is asked to return. Validated before anything is stored. */
export const writingFeedbackSchema = z.object({
  overallScore: z.number().min(0).max(100),
  cefrEstimate: cefrLevelSchema,
  criteria: z
    .array(
      z.object({
        criterion: z.enum(WRITING_CRITERIA),
        score: z.number().min(0).max(10),
        commentVi: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(4),
  issues: z
    .array(
      z.object({
        original: z.string().min(1).max(300),
        suggestion: z.string().max(300),
        category: z.string().min(1).max(40),
        severity: z.enum(['minor', 'major']),
        whyVi: z.string().min(1).max(500),
      }),
    )
    .max(30),
  rewrite: z.string().max(8000),
  rewriteNotesVi: z.array(z.string().max(400)).max(10),
  strengths: z.array(z.string().max(300)).max(6),
  nextSteps: z.array(z.string().max(300)).max(6),
});
export type WritingFeedbackPayload = z.infer<typeof writingFeedbackSchema>;
