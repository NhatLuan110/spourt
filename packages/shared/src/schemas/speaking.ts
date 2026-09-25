import { z } from 'zod';
import { cefrLevelSchema } from './common.js';
import type { CefrLevel } from '../constants/cefr.js';

/** §5.6 — what a spoken attempt was for. */
export const SPEAKING_KINDS = ['drill', 'roleplay', 'test'] as const;
export type SpeakingKind = (typeof SPEAKING_KINDS)[number];

export interface SpeakingDrillCard {
  slug: string;
  text: string;
  cefr: CefrLevel;
  /** The sound or pattern this drill targets, e.g. "θ" or "final-consonant". */
  focus: string;
  focusLabelVi: string;
  ipa: string | null;
  translationVi: string;
  audioUrl: string | null;
  /** The near-identical word that makes the difference audible. */
  minimalPair: string | null;
  tipVi: string;
  /** The learner's best score on this drill, if they have tried it. */
  bestScore: number | null;
  attempts: number;
}

export interface SpeakingWordScore {
  word: string;
  score: number;
  errorType: string;
  /** "green" | "amber" | "red" — precomputed so the UI has one rule. */
  color: string;
}

export interface PronunciationIssueView {
  phoneme: string;
  errorCount: number;
  totalCount: number;
  /** The §7.6.3 explanation of why Vietnamese speakers get this sound wrong. */
  labelVi: string;
  tipVi: string;
  exampleWords: string[];
}

export interface SpeakingAttemptView {
  id: string;
  kind: SpeakingKind;
  targetText: string | null;
  transcript: string;
  durationMs: number;
  scores: {
    accuracy: number;
    fluency: number;
    completeness: number;
    /** Null when nothing measured intonation (D-051). */
    prosody: number | null;
    overall: number;
  };
  band: string;
  bandLabelVi: string;
  words: SpeakingWordScore[];
  extraWords: string[];
  wpm: number;
  targetWpm: { min: number; max: number };
  feedbackVi: string;
  issues: PronunciationIssueView[];
  createdAt: string;
}

export interface SpeakingScenarioCard {
  slug: string;
  title: string;
  titleVi: string;
  cefr: CefrLevel;
  category: string;
  coverImageUrl: string | null;
  objectives: string[];
  usefulPhrases: { en: string; vi: string; when: string }[];
  maxTurns: number;
}

export interface RoleplayTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Set on the learner's turn when they spoke rather than typed. */
  transcript?: string;
  corrections?: { original: string; corrected: string; whyVi: string }[];
}

export interface RoleplayState {
  conversationId: string;
  scenarioSlug: string;
  turns: RoleplayTurn[];
  turnsUsed: number;
  maxTurns: number;
  /** True once the objectives are met or the turn budget is spent. */
  finished: boolean;
  objectivesMet: string[];
}

export const speakingListQuerySchema = z.object({
  cefr: cefrLevelSchema.optional(),
  focus: z.string().min(1).max(40).optional(),
  /** Only drills targeting sounds this learner actually gets wrong. */
  weakOnly: z.coerce.boolean().optional(),
});
export type SpeakingListQuery = z.infer<typeof speakingListQuerySchema>;

/**
 * Audio arrives base64-encoded in JSON rather than as multipart.
 *
 * A drill recording is a few seconds long, the API already validates every
 * other body with Zod, and multipart would mean a second validation path for
 * one endpoint. The cap is enforced here and again by the body-size limit.
 */
export const speakingAttemptSchema = z.object({
  drillSlug: z.string().min(1).optional(),
  /** Free practice: the learner supplies the sentence themselves. */
  targetText: z.string().min(1).max(500).optional(),
  /** base64, without the data: prefix. Roughly 1.4 MB of audio. */
  audioBase64: z.string().min(100).max(2_000_000),
  mimeType: z.enum(['audio/webm', 'audio/wav', 'audio/mp4', 'audio/ogg']),
  durationMs: z.number().int().min(200).max(120_000),
});
export type SpeakingAttemptInput = z.infer<typeof speakingAttemptSchema>;

export const roleplayTurnSchema = z.object({
  scenarioSlug: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  /** Either typed text, or audio to be transcribed first. */
  message: z.string().min(1).max(1000).optional(),
  audioBase64: z.string().min(100).max(2_000_000).optional(),
  mimeType: z.enum(['audio/webm', 'audio/wav', 'audio/mp4', 'audio/ogg']).optional(),
  durationMs: z.number().int().min(200).max(120_000).optional(),
});
export type RoleplayTurnInput = z.infer<typeof roleplayTurnSchema>;

/** What the model returns for one role-play turn. */
export const roleplayReplySchema = z.object({
  reply: z.string().min(1).max(1000),
  corrections: z
    .array(
      z.object({
        original: z.string().min(1).max(300),
        corrected: z.string().max(300),
        whyVi: z.string().min(1).max(400),
      }),
    )
    .max(4)
    .default([]),
  objectivesMet: z.array(z.string().max(200)).max(8).default([]),
  finished: z.boolean().default(false),
});
export type RoleplayReplyPayload = z.infer<typeof roleplayReplySchema>;
