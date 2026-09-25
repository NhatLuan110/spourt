import { levenshtein, normalizeForComparison, tokenizeWords } from '@sprout/shared';
import type { CefrLevel } from '@sprout/shared';

/**
 * Grading for the exercise formats that lessons, reading and listening use but
 * vocabulary practice does not: short answer, sentence reordering, true/false.
 *
 * Every grader returns the same shape so the lesson engine can treat all
 * formats identically when it writes an `ExerciseAttempt`.
 */
export interface GradeOutcome {
  isCorrect: boolean;
  /** 0..1 — partial credit where the format allows it. */
  score: number;
  /** Set when the answer was accepted despite a small spelling slip. */
  typo?: boolean;
  /** Which of the accepted answers matched, for the explanation panel. */
  matched?: string;
}

/**
 * A short answer is judged on words, not characters: punctuation, case and
 * runs of whitespace are irrelevant, and one edit per six characters is
 * forgiven as a typo so a learner is not failed for "recieve".
 */
export const SHORT_ANSWER_TYPO_RATIO = 6;

export function gradeShortAnswer(accepted: readonly string[], answer: string): GradeOutcome {
  const given = tokenizeWords(answer).join(' ');
  if (given.length === 0) return { isCorrect: false, score: 0 };

  let best: { distance: number; candidate: string } | null = null;

  for (const candidate of accepted) {
    const expected = tokenizeWords(candidate).join(' ');
    if (expected === given) return { isCorrect: true, score: 1, matched: candidate };
    const distance = levenshtein(expected, given);
    if (best === null || distance < best.distance) best = { distance, candidate };
  }

  if (best === null) return { isCorrect: false, score: 0 };

  const target = tokenizeWords(best.candidate).join(' ');
  const allowance = Math.floor(target.length / SHORT_ANSWER_TYPO_RATIO);
  if (allowance >= 1 && best.distance <= allowance) {
    return { isCorrect: true, score: 1, typo: true, matched: best.candidate };
  }
  /* Close but not close enough still earns half, so the learner sees progress. */
  if (best.distance <= allowance + 2) {
    return { isCorrect: false, score: 0.5, matched: best.candidate };
  }
  return { isCorrect: false, score: 0, matched: best.candidate };
}

/**
 * Reordering is scored by the longest common subsequence between the expected
 * order and the learner's, so moving one chunk out of place costs one chunk
 * rather than the whole sentence.
 */
export function gradeReorder(expected: readonly string[], answer: readonly string[]): GradeOutcome {
  if (expected.length === 0) return { isCorrect: false, score: 0 };
  const exact = expected.length === answer.length && expected.every((c, i) => c === answer[i]);
  if (exact) return { isCorrect: true, score: 1 };
  const common = longestCommonSubsequence(expected, answer);
  return { isCorrect: false, score: round2(common / expected.length) };
}

/** Which positions the learner got right, for highlighting the submitted order. */
export function reorderPositions(
  expected: readonly string[],
  answer: readonly string[],
): boolean[] {
  return answer.map((chunk, index) => expected[index] === chunk);
}

export function gradeTrueFalse(expected: boolean, answer: boolean): GradeOutcome {
  return { isCorrect: expected === answer, score: expected === answer ? 1 : 0 };
}

/**
 * Multiple choice by option id. Kept here so a lesson exercise and a vocabulary
 * exercise are graded by the same rule.
 */
export function gradeChoice(expectedId: string, answerId: string): GradeOutcome {
  const isCorrect = expectedId === answerId;
  return { isCorrect, score: isCorrect ? 1 : 0 };
}

/**
 * §7 Reading — words per minute, with the reading time floored at two seconds
 * so a mis-fired timer cannot report a four-figure speed.
 */
export function readingWpm(wordCount: number, elapsedMs: number): number {
  const minutes = Math.max(elapsedMs, 2000) / 60_000;
  return Math.round(wordCount / minutes);
}

/**
 * Comfortable silent-reading speeds for a learner at each level. A native adult
 * reads 200–250 wpm; a B1 learner reading at 130 is doing well.
 */
export const READING_WPM_TARGET: Record<CefrLevel, number> = {
  A1: 60,
  A2: 90,
  B1: 130,
  B2: 170,
  C1: 200,
  C2: 230,
};

export type ReadingSpeedBand = 'slow' | 'on-target' | 'fast' | 'skimmed';

/**
 * Faster than double the target with the questions answered badly means the
 * passage was skimmed, not read — worth saying out loud rather than praising.
 */
export function readingSpeedBand(
  wpm: number,
  cefr: CefrLevel,
  accuracy: number,
): ReadingSpeedBand {
  const target = READING_WPM_TARGET[cefr];
  if (wpm > target * 2 && accuracy < 0.6) return 'skimmed';
  if (wpm > target * 1.25) return 'fast';
  if (wpm < target * 0.7) return 'slow';
  return 'on-target';
}

/** True when two texts differ only by case, punctuation or spacing. */
export function sameText(a: string, b: string): boolean {
  return normalizeForComparison(a) === normalizeForComparison(b);
}

function longestCommonSubsequence(a: readonly string[], b: readonly string[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  /* Flat table with an explicit reader: strict mode types every index access as
     possibly undefined, and the arithmetic is easier to read named. */
  const table: number[] = new Array<number>(rows * cols).fill(0);
  const at = (i: number, j: number): number => table[i * cols + j] ?? 0;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i * cols + j] =
        a[i - 1] === b[j - 1]
          ? at(i - 1, j - 1) + 1
          : Math.max(at(i - 1, j), at(i, j - 1));
    }
  }
  return at(rows - 1, cols - 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
