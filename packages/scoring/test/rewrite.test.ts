import { describe, expect, it } from 'vitest';
import {
  damerauLevenshtein,
  gradeRewrite,
  gradeSentenceOrder,
  isSameWordMistyped,
  sameSentence,
  usesCue,
} from '../src/rewrite.js';

const question = (
  accepted: string[],
  cue: string | null = null,
  cueType: 'start' | 'keyword' | 'none' = 'none',
) => ({ accepted, cue, cueType });

describe('usesCue', () => {
  it('accepts any answer when there is no cue', () => {
    expect(usesCue('anything at all', null, 'none')).toBe(true);
  });

  it('checks a start cue against the beginning of the sentence', () => {
    expect(usesCue('It was John who called.', 'It was', 'start')).toBe(true);
    expect(usesCue('John was the one who called.', 'It was', 'start')).toBe(false);
  });

  it('ignores capitalisation and punctuation in a start cue', () => {
    expect(usesCue('it was john who called', 'It was', 'start')).toBe(true);
  });

  it('finds a keyword anywhere in the sentence', () => {
    expect(usesCue('He is not old enough to drive.', 'enough', 'keyword')).toBe(true);
    expect(usesCue('He is too young to drive.', 'enough', 'keyword')).toBe(false);
  });

  it('matches a keyword as a whole word, not inside another one', () => {
    // "enough" must not be satisfied by a word that merely contains it.
    expect(usesCue('That is enoughness.', 'enough', 'keyword')).toBe(false);
  });

  it('handles a multi-word keyword', () => {
    expect(usesCue('She has been waiting for two hours.', 'has been', 'keyword')).toBe(true);
    expect(usesCue('She waited two hours.', 'has been', 'keyword')).toBe(false);
  });
});

describe('gradeRewrite', () => {
  it('marks an exact answer correct', () => {
    const result = gradeRewrite(question(['He is not old enough to drive.'], 'enough', 'keyword'), 'He is not old enough to drive.');
    expect(result).toMatchObject({ isCorrect: true, score: 1, usedCue: true });
    expect(result.hintVi).toBeNull();
  });

  it('ignores case and punctuation', () => {
    const result = gradeRewrite(question(['He is not old enough to drive.'], 'enough', 'keyword'), 'he is not old enough to drive');
    expect(result.isCorrect).toBe(true);
  });

  it('accepts any of several correct answers and says which matched', () => {
    const result = gradeRewrite(
      question(['I have been learning English for five years.', 'I have learned English for five years.'], 'for', 'keyword'),
      'I have learned English for five years.',
    );
    expect(result.isCorrect).toBe(true);
    expect(result.matched).toBe('I have learned English for five years.');
  });

  it('forgives a typing slip in a long sentence', () => {
    const result = gradeRewrite(
      question(['She has been living here since 2019.'], 'since', 'keyword'),
      'She has been liviing here since 2019.',
    );
    expect(result.isCorrect).toBe(true);
    expect(result.typo).toBe(true);
    expect(result.hintVi).toContain('chính tả');
  });

  it('recognises the original sentence handed back unchanged', () => {
    // The commonest non-answer. String distance cannot tell that "too young"
    // means the same as "not old enough" — but it can tell that this is the
    // sentence the learner was asked to transform, which is more useful anyway.
    const result = gradeRewrite(
      {
        accepted: ['He is not old enough to drive.'],
        cue: 'enough',
        cueType: 'keyword',
        source: 'He is too young to drive.',
      },
      'He is too young to drive.',
    );
    expect(result.copiedSource).toBe(true);
    expect(result.score).toBe(0);
    expect(result.hintVi).toContain('câu gốc');
  });

  it('gives half marks for the right sentence without the required cue', () => {
    const result = gradeRewrite(
      question(['It was Lan who paid the bill.'], 'It was', 'start'),
      'it was lan who paid the bill',
    );
    expect(result.isCorrect).toBe(true);
    // The same sentence with the cue removed loses the cue half.
    const without = gradeRewrite(
      question(['Lan paid the bill.', 'It was Lan who paid the bill.'], 'It was', 'start'),
      'Lan paid the bill.',
    );
    expect(without.score).toBe(0.5);
    expect(without.usedCue).toBe(false);
    expect(without.hintVi).toContain('It was');
  });

  it('gives half marks for the right structure with the wrong meaning', () => {
    const result = gradeRewrite(
      question(['He is not old enough to drive.'], 'enough', 'keyword'),
      'He is not tall enough to drive.',
    );
    expect(result.score).toBe(0.5);
    expect(result.usedCue).toBe(true);
    expect(result.hintVi).toContain('Cấu trúc đúng');
  });

  it('names the required opening when a start cue is missed', () => {
    const result = gradeRewrite(
      question(['It was Lan who paid the bill.'], 'It was', 'start'),
      'Lan was the one who paid the bill.',
    );
    expect(result.usedCue).toBe(false);
    expect(result.hintVi).toContain('It was');
  });

  it('scores an unrelated sentence zero', () => {
    const result = gradeRewrite(
      question(['He is not old enough to drive.'], 'enough', 'keyword'),
      'The weather is nice today.',
    );
    expect(result.score).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('handles an empty answer without crashing', () => {
    const result = gradeRewrite(question(['anything'], null, 'none'), '   ');
    expect(result).toMatchObject({ isCorrect: false, score: 0, usedCue: false });
    expect(result.hintVi).toContain('chưa viết');
  });

  it('does not forgive a typo in a very short answer', () => {
    expect(gradeRewrite(question(['Go now'], null, 'none'), 'Ga now').isCorrect).toBe(false);
  });
});

describe('gradeSentenceOrder', () => {
  const target = 'She has never been to Japan';

  it('marks the right order correct', () => {
    expect(gradeSentenceOrder(target, 'She has never been to Japan')).toMatchObject({
      isCorrect: true,
      score: 1,
    });
  });

  it('ignores case and punctuation', () => {
    expect(gradeSentenceOrder(target, 'she has never been to japan.').isCorrect).toBe(true);
  });

  it('scores the same words in the wrong order by how many are in place', () => {
    const result = gradeSentenceOrder(target, 'She never has been to Japan');
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.score).toBeLessThan(1);
  });

  it('penalises missing words separately from wrong order', () => {
    const missing = gradeSentenceOrder(target, 'She has been to Japan');
    const reordered = gradeSentenceOrder(target, 'She never has been to Japan');
    // Dropping "never" reverses the meaning; misplacing a word does not.
    expect(missing.score).toBeLessThan(reordered.score);
  });

  it('scores a completely different sentence near zero', () => {
    expect(gradeSentenceOrder(target, 'I like cats').score).toBeLessThan(0.2);
  });

  it('handles an empty target', () => {
    expect(gradeSentenceOrder('', 'anything')).toEqual({ isCorrect: false, score: 0 });
  });

  it('returns the expected sentence so the learner can compare', () => {
    expect(gradeSentenceOrder(target, 'Japan to been never has She').matched).toBe(target);
  });
});

describe('sameSentence', () => {
  it('ignores case and punctuation', () => {
    expect(sameSentence('The cat, sat!', 'the cat sat')).toBe(true);
  });

  it('separates genuinely different sentences', () => {
    expect(sameSentence('the cat sat', 'the cat ran')).toBe(false);
  });
});

describe('damerauLevenshtein', () => {
  it('counts a swap of two neighbouring letters as one mistake', () => {
    // Plain Levenshtein charges two for this, which is why it was replaced.
    expect(damerauLevenshtein('drink', 'drnik')).toBe(1);
    expect(damerauLevenshtein('the', 'teh')).toBe(1);
  });

  it('still charges one per ordinary edit', () => {
    expect(damerauLevenshtein('cat', 'cot')).toBe(1);
    expect(damerauLevenshtein('cat', 'cats')).toBe(1);
    expect(damerauLevenshtein('cat', 'at')).toBe(1);
  });

  it('returns zero for identical strings and the length for an empty one', () => {
    expect(damerauLevenshtein('hello', 'hello')).toBe(0);
    expect(damerauLevenshtein('hello', '')).toBe(5);
    expect(damerauLevenshtein('', '')).toBe(0);
  });
});

describe('isSameWordMistyped', () => {
  it('forgives a transposition in a normal word', () => {
    expect(isSameWordMistyped('drink', 'drnik')).toBe(true);
    expect(isSameWordMistyped('receive', 'recieve')).toBe(true);
  });

  it('refuses a different word that starts with the same letter', () => {
    expect(isSameWordMistyped('drink', 'drive')).toBe(false);
  });

  it('refuses any change to a short word', () => {
    // "not" and "nut" would otherwise be the same word, which flips a sentence.
    expect(isSameWordMistyped('not', 'nut')).toBe(false);
    expect(isSameWordMistyped('is', 'it')).toBe(false);
  });

  it('refuses a different first letter, however close the rest is', () => {
    expect(isSameWordMistyped('bought', 'thought')).toBe(false);
  });
});
