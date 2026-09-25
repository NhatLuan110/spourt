import { describe, expect, it } from 'vitest';
import { alignTokens, gradeDictation, gradeGapFill, isNearMatch } from '../src/index.js';

describe('alignTokens', () => {
  it('aligns identical sequences one to one', () => {
    const aligned = alignTokens(['i', 'am', 'here'], ['i', 'am', 'here']);
    expect(aligned).toHaveLength(3);
    expect(aligned.every((pair) => pair.expected === pair.actual)).toBe(true);
  });

  it('does not shift everything when one word is missing', () => {
    const aligned = alignTokens(['the', 'big', 'red', 'car'], ['the', 'red', 'car']);
    expect(aligned).toHaveLength(4);
    expect(aligned[1]).toEqual({ expected: 'big', actual: null });
    expect(aligned[2]).toEqual({ expected: 'red', actual: 'red' });
  });

  it('marks inserted words as extra', () => {
    const aligned = alignTokens(['go', 'home'], ['go', 'back', 'home']);
    expect(aligned).toContainEqual({ expected: null, actual: 'back' });
  });

  it('handles empty input on either side', () => {
    expect(alignTokens([], ['a', 'b'])).toHaveLength(2);
    expect(alignTokens(['a', 'b'], [])).toHaveLength(2);
    expect(alignTokens([], [])).toHaveLength(0);
  });
});

describe('isNearMatch', () => {
  it('accepts small typos of similar length', () => {
    expect(isNearMatch('beautiful', 'beatiful')).toBe(true);
    expect(isNearMatch('receive', 'recieve')).toBe(true);
  });

  it('rejects identical words and distant words', () => {
    expect(isNearMatch('cat', 'cat')).toBe(false);
    expect(isNearMatch('cat', 'elephant')).toBe(false);
    expect(isNearMatch('go', 'going')).toBe(false);
  });
});

describe('gradeDictation', () => {
  it('gives a perfect score for an exact answer', () => {
    const result = gradeDictation('She has a beautiful voice.', 'she has a beautiful voice');
    expect(result.score).toBe(1);
    expect(result.correctCount).toBe(5);
    expect(result.tokens.every((token) => token.status === 'correct')).toBe(true);
  });

  it('normalises contractions and punctuation', () => {
    const result = gradeDictation("I'm not going, thanks!", 'I am not going thanks');
    expect(result.score).toBe(1);
  });

  it('gives half a point for a spelling slip', () => {
    const result = gradeDictation('the weather is beautiful', 'the weather is beatiful');
    expect(result.nearCount).toBe(1);
    expect(result.score).toBeCloseTo(0.875, 3);
    expect(result.tokens.at(-1)?.status).toBe('near');
  });

  it('marks missing and extra words', () => {
    const result = gradeDictation('i went to the market', 'i went to market today');
    expect(result.missingCount).toBe(1);
    expect(result.extraCount).toBe(1);
    expect(result.score).toBeLessThan(0.8);
  });

  it('flags homophones as right sound wrong word', () => {
    const result = gradeDictation('their house is there', 'there house is their');
    expect(result.homophoneWarnings).toHaveLength(2);
    expect(result.tokens.filter((token) => token.homophone)).toHaveLength(2);
    // A homophone is wrong, never a near miss, even when spelling is close.
    expect(result.nearCount).toBe(0);
  });

  it('scores an empty answer as zero', () => {
    const result = gradeDictation('anything at all', '');
    expect(result.score).toBe(0);
    expect(result.missingCount).toBe(3);
  });

  it('returns zero when there is nothing to compare against', () => {
    const result = gradeDictation('', 'something');
    expect(result.score).toBe(0);
    expect(result.totalExpected).toBe(0);
  });

  it('penalises padded answers instead of rewarding them', () => {
    const clean = gradeDictation('i like tea', 'i like tea');
    const padded = gradeDictation('i like tea', 'i like tea very much indeed');
    expect(padded.score).toBeLessThan(clean.score);
  });
});

describe('gradeGapFill', () => {
  it('accepts the exact word', () => {
    expect(gradeGapFill('beautiful', 'Beautiful')).toEqual({
      isCorrect: true,
      isNear: false,
      score: 1,
    });
  });

  it('accepts the expanded contraction', () => {
    expect(gradeGapFill("I'm", 'I am').isCorrect).toBe(true);
  });

  it('gives partial credit for a typo', () => {
    expect(gradeGapFill('beautiful', 'beatiful')).toEqual({
      isCorrect: false,
      isNear: true,
      score: 0.5,
    });
  });

  it('rejects a different word', () => {
    expect(gradeGapFill('beautiful', 'ugly').score).toBe(0);
  });
});
