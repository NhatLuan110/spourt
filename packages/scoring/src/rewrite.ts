import { levenshtein, normalizeForComparison, tokenizeWords } from '@sprout/shared';
import type { GradeOutcome } from './lesson-grading.js';

/**
 * Sentence transformation — "viết lại câu", the exercise every Vietnamese
 * English syllabus is built around.
 *
 * The learner is given a sentence and a cue, and must produce a sentence that
 * means the same thing. Grading has to answer two separate questions, because
 * a learner can get one right and the other wrong:
 *
 *   1. Did they produce one of the accepted sentences?
 *   2. Did they actually use the cue they were told to use?
 *
 * A sentence that means the right thing but ignores the cue is not a pass — the
 * whole point of the exercise is practising that structure — but it is not a
 * zero either, and scoring it as one teaches the learner nothing about which
 * half they got wrong.
 */

export type CueType =
  /** The answer must begin with these words, e.g. "It was ...". */
  | 'start'
  /** The answer must contain this word somewhere, e.g. "enough". */
  | 'keyword'
  /** No constraint beyond meaning. */
  | 'none';

export interface RewriteQuestion {
  /** Accepted answers, in the order the author considers them best. */
  accepted: readonly string[];
  cue: string | null;
  cueType: CueType;
  /** The sentence being transformed, so copying it back can be recognised. */
  source?: string;
}

export interface RewriteOutcome extends GradeOutcome {
  /** False when the required cue was missing, whatever else was right. */
  usedCue: boolean;
  /** Which accepted answer the learner came closest to. */
  matched: string | undefined;
  /** Vietnamese explanation of what went wrong, when something did. */
  hintVi: string | null;
  /** True when the learner handed back the original sentence unchanged. */
  copiedSource?: boolean;
}

/**
 * A typing slip is judged per WORD, not across the sentence.
 *
 * Judging it on total length was wrong and quietly so: "old" -> "tall" is three
 * edits, which fits inside the allowance for a twenty-nine character sentence,
 * so a learner who changed the meaning of the sentence was told they had made a
 * spelling mistake. A misspelled word is still recognisably the same word; a
 * substituted word is a different word.
 */
export const WORD_TYPO_RATIO = 4;
/** At most this many words may be misspelled before it stops being a slip. */
export const MAX_TYPO_WORDS = 2;

/**
 * Edit distance that counts a swap of two neighbouring letters as one mistake.
 *
 * Plain Levenshtein charges two for a transposition, which is wrong for typing:
 * "drnik" for "drink" and "teh" for "the" are one slip of the fingers, and
 * they are the commonest slips there are.
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[] = new Array<number>(rows * cols).fill(0);
  const at = (i: number, j: number): number => d[i * cols + j] ?? 0;

  for (let i = 0; i < rows; i += 1) d[i * cols] = i;
  for (let j = 0; j < cols; j += 1) d[j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      d[i * cols + j] = best;
    }
  }
  return at(rows - 1, cols - 1);
}

/** True when two words are the same word, one of them mistyped. */
export function isSameWordMistyped(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  // A different first letter is almost always a different word, not a slip.
  if (expected[0] !== actual[0]) return false;
  // Short words get no allowance at all. One free edit on a three-letter word
  // makes "is" and "it", or "not" and "nut", the same word — and those are
  // exactly the changes that flip a sentence's meaning.
  if (expected.length <= 3) return false;
  const allowance = Math.max(1, Math.floor(expected.length / WORD_TYPO_RATIO));
  return damerauLevenshtein(expected, actual) <= allowance;
}

/**
 * Whether the answer is the expected sentence with nothing worse than a couple
 * of typing slips in it. Word count must match: a missing or extra word is a
 * different sentence, not a slip.
 */
export function isTypoOf(expected: string, actual: string): boolean {
  const target = tokenizeWords(expected);
  const given = tokenizeWords(actual);
  if (target.length !== given.length) return false;

  let slips = 0;
  for (let index = 0; index < target.length; index += 1) {
    const a = target[index] ?? '';
    const b = given[index] ?? '';
    if (a === b) continue;
    if (!isSameWordMistyped(a, b)) return false;
    slips += 1;
    if (slips > MAX_TYPO_WORDS) return false;
  }
  return slips > 0;
}

/**
 * True when the learner's sentence honours the cue.
 *
 * A "start" cue is checked on normalised text so capitalisation and a trailing
 * comma do not fail an otherwise correct answer.
 */
export function usesCue(answer: string, cue: string | null, cueType: CueType): boolean {
  if (cueType === 'none' || cue === null || cue.trim().length === 0) return true;

  const normalisedAnswer = tokenizeWords(answer).join(' ');
  const normalisedCue = tokenizeWords(cue).join(' ');
  if (normalisedCue.length === 0) return true;

  if (cueType === 'start') {
    return normalisedAnswer.startsWith(normalisedCue);
  }

  // A keyword must appear as a whole word: "enough" should not be satisfied by
  // "enoughly", and more importantly a one-letter cue should not match inside
  // every other word.
  const words = normalisedAnswer.split(' ');
  const cueWords = normalisedCue.split(' ');
  for (let index = 0; index + cueWords.length <= words.length; index += 1) {
    if (cueWords.every((word, offset) => words[index + offset] === word)) return true;
  }
  return false;
}

export function gradeRewrite(question: RewriteQuestion, answer: string): RewriteOutcome {
  const given = tokenizeWords(answer).join(' ');
  const usedCue = usesCue(answer, question.cue, question.cueType);

  if (given.length === 0) {
    return {
      isCorrect: false,
      score: 0,
      usedCue: false,
      matched: undefined,
      hintVi: 'Bạn chưa viết gì.',
    };
  }

  let best: { distance: number; candidate: string } | null = null;
  let exact = false;

  for (const candidate of question.accepted) {
    const expected = tokenizeWords(candidate).join(' ');
    if (expected === given) {
      best = { distance: 0, candidate };
      exact = true;
      break;
    }
    const distance = levenshtein(expected, given);
    if (best === null || distance < best.distance) best = { distance, candidate };
  }

  const matched = best?.candidate;
  const typo = !exact && matched !== undefined && isTypoOf(matched, answer);
  const meaningRight = exact || typo;

  // Handing back the original sentence is a specific, common non-answer, and
  // saying so is far more useful than "chưa đúng nghĩa".
  if (!meaningRight && question.source && sameSentence(question.source, answer)) {
    return {
      isCorrect: false,
      score: 0,
      usedCue,
      matched,
      copiedSource: true,
      hintVi: 'Đây vẫn là câu gốc. Đề bài yêu cầu viết lại theo cấu trúc khác.',
    };
  }

  if (meaningRight && usedCue) {
    return {
      isCorrect: true,
      score: 1,
      usedCue: true,
      matched,
      ...(typo ? { typo: true } : {}),
      hintVi: typo ? 'Đúng rồi, chỉ sai chính tả một chút.' : null,
    };
  }

  // Right meaning, wrong structure. Half marks, and say which half.
  if (meaningRight && !usedCue) {
    return {
      isCorrect: false,
      score: 0.5,
      usedCue: false,
      matched,
      hintVi: cueHint(question),
    };
  }

  // Used the structure but did not reach an accepted sentence. Also half, for
  // the same reason in reverse: the learner did the thing being practised.
  // Close enough to be an attempt at the right sentence rather than a guess:
  // within a quarter of the sentence's length in edits.
  const nearMiss =
    best !== null && matched !== undefined && best.distance <= Math.max(4, matched.length / 4);
  if (!meaningRight && usedCue && nearMiss) {
    return {
      isCorrect: false,
      score: 0.5,
      usedCue: true,
      matched,
      hintVi: 'Cấu trúc đúng rồi, nhưng câu chưa khớp nghĩa. Đọc lại câu gốc xem còn thiếu ý nào.',
    };
  }

  return {
    isCorrect: false,
    score: 0,
    usedCue,
    matched,
    hintVi: usedCue ? 'Câu này chưa đúng nghĩa với câu gốc.' : cueHint(question),
  };
}

function cueHint(question: RewriteQuestion): string {
  if (question.cueType === 'start' && question.cue) {
    return `Câu trả lời phải bắt đầu bằng "${question.cue}".`;
  }
  if (question.cueType === 'keyword' && question.cue) {
    return `Bạn chưa dùng từ "${question.cue}" như đề bài yêu cầu.`;
  }
  return 'Câu này chưa đúng nghĩa với câu gốc.';
}

/**
 * §7 sentence ordering — "sắp xếp câu".
 *
 * Distinct from `gradeReorder` in lesson-grading: that one scores a chunk
 * ordering that was presented as buttons, where every chunk is used exactly
 * once. This grades a sentence the learner typed or assembled freely, so it has
 * to cope with a missing or repeated word.
 */
/** The most an answer missing or adding words can score. */
export const INCOMPLETE_CEILING = 0.6;

export function gradeSentenceOrder(expected: string, answer: string): GradeOutcome {
  const target = tokenizeWords(expected);
  const given = tokenizeWords(answer);

  if (target.length === 0) return { isCorrect: false, score: 0 };
  if (given.join(' ') === target.join(' ')) return { isCorrect: true, score: 1 };

  // Same words, wrong order is a different mistake from missing words, and the
  // learner should be told which one they made.
  const sameWords =
    given.length === target.length &&
    [...given].sort().join(' ') === [...target].sort().join(' ');

  if (sameWords) {
    const inPlace = given.filter((word, index) => target[index] === word).length;
    return {
      isCorrect: false,
      score: Math.round((inPlace / target.length) * 100) / 100,
      matched: expected,
    };
  }

  // A missing word costs double a misplaced one. Dropping "never" reverses the
  // sentence, which is a worse mistake than fumbling the word order, and the
  // score has to say so.
  const missing = target.filter((word) => !given.includes(word)).length;
  const extra = Math.max(0, given.length - target.length);
  const penalty = (missing * 2 + extra) / target.length;
  return {
    isCorrect: false,
    // Capped: an answer built from the wrong words is an incomplete sentence,
    // and must never outscore one that has every word in a clumsy order.
    score: Math.max(0, Math.min(INCOMPLETE_CEILING, Math.round((1 - penalty) * 100) / 100)),
    matched: expected,
  };
}

/** Normalised comparison, exposed so the API and the tests agree on it. */
export function sameSentence(a: string, b: string): boolean {
  return normalizeForComparison(a) === normalizeForComparison(b);
}
