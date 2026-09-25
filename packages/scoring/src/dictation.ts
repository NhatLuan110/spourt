import { areHomophones, levenshtein, tokenizeWords } from '@sprout/shared';
import type { DiffToken } from '@sprout/shared';

/**
 * §9.5 — word level diff for dictation and gap-fill grading. The two types are
 * declared in @sprout/shared because the web app renders them, and re-exported
 * here so every existing import of @sprout/scoring keeps working.
 */
export type { DiffStatus, DiffToken } from '@sprout/shared';

export interface DictationResult {
  score: number;
  correctCount: number;
  nearCount: number;
  missingCount: number;
  extraCount: number;
  wrongCount: number;
  totalExpected: number;
  tokens: DiffToken[];
  homophoneWarnings: { expected: string; actual: string }[];
}

const MATCH = 2;
const MISMATCH = -3;
const GAP = -2;
// MISMATCH is worse than one gap but better than two, so a replaced word stays a
// substitution while a genuinely missing word opens a gap instead of shifting the rest.

/** §9.5 step 2 — Needleman-Wunsch, so a single missing word does not shift everything. */
export function alignTokens(
  expected: string[],
  actual: string[],
): { expected: string | null; actual: string | null }[] {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i]![0] = i * GAP;
  for (let j = 0; j < cols; j += 1) matrix[0]![j] = j * GAP;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const similar = isNearMatch(expected[i - 1] as string, actual[j - 1] as string);
      const diagonalScore = expected[i - 1] === actual[j - 1] ? MATCH : similar ? 1 : MISMATCH;
      matrix[i]![j] = Math.max(
        matrix[i - 1]![j - 1]! + diagonalScore,
        matrix[i - 1]![j]! + GAP,
        matrix[i]![j - 1]! + GAP,
      );
    }
  }

  const aligned: { expected: string | null; actual: string | null }[] = [];
  let i = expected.length;
  let j = actual.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const similar = isNearMatch(expected[i - 1] as string, actual[j - 1] as string);
      const diagonalScore = expected[i - 1] === actual[j - 1] ? MATCH : similar ? 1 : MISMATCH;
      if (matrix[i]![j] === matrix[i - 1]![j - 1]! + diagonalScore) {
        aligned.push({ expected: expected[i - 1] as string, actual: actual[j - 1] as string });
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && matrix[i]![j] === matrix[i - 1]![j]! + GAP) {
      aligned.push({ expected: expected[i - 1] as string, actual: null });
      i -= 1;
      continue;
    }
    aligned.push({ expected: null, actual: actual[j - 1] as string });
    j -= 1;
  }

  return aligned.reverse();
}

/** §9.5 step 3 — a small typo is still worth half a point. */
export function isNearMatch(expected: string, actual: string): boolean {
  if (expected === actual) return false;
  if (Math.abs(expected.length - actual.length) > 1) return false;
  return levenshtein(expected, actual) <= 2;
}

export function gradeDictation(reference: string, answer: string): DictationResult {
  const expectedTokens = tokenizeWords(reference);
  const actualTokens = tokenizeWords(answer);
  const aligned = alignTokens(expectedTokens, actualTokens);

  const tokens: DiffToken[] = [];
  const homophoneWarnings: { expected: string; actual: string }[] = [];
  let correctCount = 0;
  let nearCount = 0;
  let missingCount = 0;
  let extraCount = 0;
  let wrongCount = 0;

  for (const pair of aligned) {
    if (pair.expected !== null && pair.actual !== null) {
      if (pair.expected === pair.actual) {
        correctCount += 1;
        tokens.push({
          status: 'correct',
          expected: pair.expected,
          actual: pair.actual,
          homophone: false,
          distance: 0,
        });
        continue;
      }
      const homophone = areHomophones(pair.expected, pair.actual);
      if (homophone) homophoneWarnings.push({ expected: pair.expected, actual: pair.actual });

      // A homophone is the right sound but the wrong word, so it never scores
      // as a typo even when the spelling happens to be close.
      if (!homophone && isNearMatch(pair.expected, pair.actual)) {
        nearCount += 1;
        tokens.push({
          status: 'near',
          expected: pair.expected,
          actual: pair.actual,
          homophone: false,
          distance: levenshtein(pair.expected, pair.actual),
        });
      } else {
        wrongCount += 1;
        tokens.push({
          status: 'wrong',
          expected: pair.expected,
          actual: pair.actual,
          homophone,
          distance: levenshtein(pair.expected, pair.actual),
        });
      }
      continue;
    }

    if (pair.expected !== null) {
      missingCount += 1;
      tokens.push({
        status: 'missing',
        expected: pair.expected,
        actual: null,
        homophone: false,
        distance: pair.expected.length,
      });
      continue;
    }

    extraCount += 1;
    tokens.push({
      status: 'extra',
      expected: null,
      actual: pair.actual,
      homophone: false,
      distance: (pair.actual ?? '').length,
    });
  }

  const total = expectedTokens.length;
  const rawScore = total === 0 ? 0 : (correctCount + 0.5 * nearCount) / total;
  // Extra words are penalised lightly so padding an answer cannot help.
  const penalty = total === 0 ? 0 : Math.min(0.2, (extraCount * 0.5) / total);

  return {
    score: Math.max(0, Math.min(1, Number((rawScore - penalty).toFixed(4)))),
    correctCount,
    nearCount,
    missingCount,
    extraCount,
    wrongCount,
    totalExpected: total,
    tokens,
    homophoneWarnings,
  };
}

/** §7.5 — gap-fill accepts contractions and is case insensitive. */
export function gradeGapFill(expected: string, answer: string): {
  isCorrect: boolean;
  isNear: boolean;
  score: number;
} {
  const expectedTokens = tokenizeWords(expected);
  const actualTokens = tokenizeWords(answer);
  const normalizedExpected = expectedTokens.join(' ');
  const normalizedActual = actualTokens.join(' ');

  if (normalizedExpected === normalizedActual) return { isCorrect: true, isNear: false, score: 1 };
  if (isNearMatch(normalizedExpected, normalizedActual)) {
    return { isCorrect: false, isNear: true, score: 0.5 };
  }
  return { isCorrect: false, isNear: false, score: 0 };
}
