import { describe, expect, it } from 'vitest';
import {
  READING_WPM_TARGET,
  gradeChoice,
  gradeReorder,
  gradeShortAnswer,
  gradeTrueFalse,
  readingSpeedBand,
  readingWpm,
  reorderPositions,
  sameText,
} from '../src/lesson-grading.js';

describe('gradeShortAnswer', () => {
  it('accepts the exact answer', () => {
    expect(gradeShortAnswer(['has been living'], 'has been living')).toMatchObject({
      isCorrect: true,
      score: 1,
    });
  });

  it('ignores case, punctuation and extra spaces', () => {
    expect(gradeShortAnswer(['has been living'], '  Has  been, living. ')).toMatchObject({
      isCorrect: true,
      score: 1,
    });
  });

  it('accepts any of several genuinely different answers and says which matched', () => {
    const result = gradeShortAnswer(['in the morning', 'at dawn'], 'At dawn.');
    expect(result.isCorrect).toBe(true);
    expect(result.matched).toBe('at dawn');
  });

  it('treats a contraction and its expansion as the same answer', () => {
    /* normalizeForComparison expands contractions, so either written form is
       accepted whichever one the content author chose. */
    expect(gradeShortAnswer(["I haven't"], 'I have not').isCorrect).toBe(true);
    expect(gradeShortAnswer(['I have not'], "i haven't").isCorrect).toBe(true);
  });

  it('forgives one typo in a long answer', () => {
    const result = gradeShortAnswer(['has been travelling'], 'has been travelling'.replace('vel', 'vle'));
    expect(result.isCorrect).toBe(true);
    expect(result.typo).toBe(true);
  });

  it('does not forgive a typo in a short answer', () => {
    /* "go" -> "ga" is one edit but the allowance for two characters is zero. */
    expect(gradeShortAnswer(['go'], 'ga').isCorrect).toBe(false);
  });

  it('gives half credit for a near miss', () => {
    expect(gradeShortAnswer(['have been waiting'], 'have been wait').score).toBe(0.5);
  });

  it('scores an empty answer zero without crashing', () => {
    expect(gradeShortAnswer(['anything'], '   ')).toEqual({ isCorrect: false, score: 0 });
  });

  it('scores a wholly different answer zero', () => {
    expect(gradeShortAnswer(['have been waiting'], 'completely unrelated text').score).toBe(0);
  });
});

describe('gradeReorder', () => {
  const expected = ['She', 'has', 'never', 'been', 'to', 'Japan'];

  it('marks the exact order correct', () => {
    expect(gradeReorder(expected, [...expected])).toEqual({ isCorrect: true, score: 1 });
  });

  it('gives partial credit for one chunk out of place', () => {
    const answer = ['She', 'never', 'has', 'been', 'to', 'Japan'];
    const result = gradeReorder(expected, answer);
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.score).toBeLessThan(1);
  });

  it('scores a fully reversed order low', () => {
    expect(gradeReorder(expected, [...expected].reverse()).score).toBeLessThan(0.4);
  });

  it('handles a short answer without dividing by zero', () => {
    expect(gradeReorder([], [])).toEqual({ isCorrect: false, score: 0 });
  });

  it('reports which positions are right', () => {
    const answer = ['She', 'never', 'has', 'been', 'to', 'Japan'];
    expect(reorderPositions(expected, answer)).toEqual([true, false, false, true, true, true]);
  });
});

describe('gradeTrueFalse and gradeChoice', () => {
  it('grades true/false', () => {
    expect(gradeTrueFalse(true, true).isCorrect).toBe(true);
    expect(gradeTrueFalse(true, false)).toEqual({ isCorrect: false, score: 0 });
  });

  it('grades a choice by option id', () => {
    expect(gradeChoice('opt_a', 'opt_a').score).toBe(1);
    expect(gradeChoice('opt_a', 'opt_b').score).toBe(0);
  });
});

describe('reading speed', () => {
  it('computes words per minute', () => {
    expect(readingWpm(300, 120_000)).toBe(150);
  });

  it('floors the elapsed time so a mis-fired timer cannot report a huge speed', () => {
    expect(readingWpm(300, 5)).toBe(9000);
    expect(readingWpm(300, 5)).toBe(readingWpm(300, 2000));
  });

  it('calls a comfortable speed on target', () => {
    expect(readingSpeedBand(READING_WPM_TARGET.B1, 'B1', 0.8)).toBe('on-target');
  });

  it('calls a slow read slow', () => {
    expect(readingSpeedBand(60, 'B1', 0.9)).toBe('slow');
  });

  it('calls a fast accurate read fast, not skimmed', () => {
    expect(readingSpeedBand(300, 'B1', 0.9)).toBe('fast');
  });

  it('calls a very fast inaccurate read skimmed', () => {
    expect(readingSpeedBand(300, 'B1', 0.4)).toBe('skimmed');
  });
});

describe('sameText', () => {
  it('ignores case and punctuation', () => {
    expect(sameText('The cat, sat!', 'the cat sat')).toBe(true);
  });

  it('still separates different words', () => {
    expect(sameText('the cat sat', 'the cat ran')).toBe(false);
  });
});
