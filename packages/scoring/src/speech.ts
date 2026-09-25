import { levenshtein, tokenizeWords } from '@sprout/shared';
import type { CefrLevel } from '@sprout/shared';
import { alignTokens } from './dictation.js';
import {
  SCORE_WEIGHTS,
  computeCompleteness,
  computeFluency,
  type PronunciationScores,
  type WordScore,
} from './pronunciation.js';

/**
 * §9.3 without Azure — scoring a spoken attempt from a transcript.
 *
 * Azure Pronunciation Assessment returns a score per phoneme. A transcription
 * model returns words. So this scores at the word level and is honest about it:
 * a word the recogniser heard correctly scores high, a word it heard as
 * something else scores by how far off it was, and a word it did not hear at
 * all is an omission.
 *
 * That is genuinely useful — most Vietnamese pronunciation errors change the
 * word the listener hears, which is exactly what a recogniser is sensitive to —
 * but it is not phoneme-level truth, and `prosody` is left null rather than
 * invented (D-051).
 */

export interface SpeechScoreInput {
  /** What the learner was asked to say. */
  reference: string;
  /** What the recogniser heard. */
  transcript: string;
  durationMs: number;
  cefr: CefrLevel;
}

export interface SpeechScoreResult {
  scores: PronunciationScores;
  words: WordScore[];
  /** Null when nothing measured prosody, rather than a fabricated number. */
  prosody: number | null;
  overall: number;
  /** Words the learner said that were not in the reference. */
  extraWords: string[];
  wpm: number;
}

/** Fillers a Vietnamese learner reaches for; they cost fluency, not accuracy. */
export const FILLERS = ['uh', 'um', 'er', 'ah', 'hmm', 'like', 'you know'] as const;

/**
 * How close a heard word has to be to count as the intended one. One edit in a
 * short word is a different word; one edit in a long word is an accent.
 */
export function wordSimilarity(expected: string, actual: string): number {
  if (expected === actual) return 100;
  const distance = levenshtein(expected, actual);
  const length = Math.max(expected.length, actual.length);
  if (length === 0) return 0;
  return Math.round(Math.max(0, 1 - distance / length) * 100);
}

export function scoreSpeech(input: SpeechScoreInput): SpeechScoreResult {
  const reference = tokenizeWords(input.reference);
  const heard = tokenizeWords(input.transcript);
  const spoken = heard.filter((word) => !FILLERS.includes(word as (typeof FILLERS)[number]));

  const aligned = alignTokens(reference, spoken);
  const words: WordScore[] = [];
  const extraWords: string[] = [];
  let matched = 0;
  let accuracySum = 0;

  for (const token of aligned) {
    if (token.expected === null) {
      // Something said that was not asked for. It does not lower accuracy —
      // the learner may simply have added a word — but it is worth showing.
      if (token.actual) extraWords.push(token.actual);
      continue;
    }

    if (token.actual === null) {
      words.push({ word: token.expected, score: 0, errorType: 'Omission' });
      accuracySum += 0;
      continue;
    }

    // alignTokens pairs words up; it does not label them, so the comparison
    // happens here. A recogniser that heard the word exactly is strong evidence
    // the learner said it; anything else is scored by distance, floored so one
    // wrong word does not read as a total failure of the whole utterance.
    const similarity = wordSimilarity(token.expected, token.actual);
    const score = token.expected === token.actual ? 100 : Math.max(20, similarity);
    if (score >= 80) matched += 1;
    accuracySum += score;

    words.push({
      word: token.expected,
      score,
      errorType: score >= 80 ? 'None' : 'Mispronunciation',
      // Phoneme detail would be invented here, so it is left out entirely and
      // detectIssues falls back to inferring from omissions.
    });
  }

  const accuracy = words.length === 0 ? 0 : round1(accuracySum / words.length);
  const completeness = computeCompleteness(matched, reference.length);
  const fillers = heard.length - spoken.length;

  const fluency = computeFluency({
    wordCount: spoken.length,
    durationMs: Math.max(1, input.durationMs),
    // Nothing measures silence without an audio analyser, so it is zero rather
    // than an estimate that would quietly flatter or punish the learner.
    silenceMs: 0,
    longPauses: 0,
    fillers,
    cefr: input.cefr,
  });

  const scores: PronunciationScores = { accuracy, fluency, completeness, prosody: 0 };

  return {
    scores,
    words,
    prosody: null,
    overall: overallWithoutProsody(scores),
    extraWords,
    wpm: Math.round((spoken.length / Math.max(1, input.durationMs)) * 60_000),
  };
}

/**
 * The §9.3 weighting with prosody removed and its weight shared out.
 *
 * Scoring prosody as zero would drag every attempt down by fifteen points for a
 * thing nobody measured; scoring it as a hundred would flatter every attempt by
 * the same amount. Redistributing is the only honest option.
 */
export function overallWithoutProsody(scores: PronunciationScores): number {
  const weight = SCORE_WEIGHTS.accuracy + SCORE_WEIGHTS.fluency + SCORE_WEIGHTS.completeness;
  const total =
    scores.accuracy * SCORE_WEIGHTS.accuracy +
    scores.fluency * SCORE_WEIGHTS.fluency +
    scores.completeness * SCORE_WEIGHTS.completeness;
  return round1(total / weight);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
