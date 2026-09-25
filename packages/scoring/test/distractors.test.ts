import { describe, expect, it } from 'vitest';
import {
  AMBIGUITY_THRESHOLD,
  blankOut,
  definitionWeight,
  gapHint,
  meaningOverlap,
  pickDistractors,
  scoreDistractor,
} from '../src/distractors.js';
import type { DistractorCandidate } from '../src/distractors.js';

const target: DistractorCandidate = {
  wordId: 'w-pollution',
  lemma: 'pollution',
  pos: 'NOUN',
  cefr: 'B1',
  topicSlugs: ['environment'],
  frequencyRank: 3120,
  definitionVi: 'Sự ô nhiễm; tình trạng không khí hoặc nước bị nhiễm chất độc hại.',
  synonyms: ['contamination'],
};

function candidate(overrides: Partial<DistractorCandidate>): DistractorCandidate {
  return {
    wordId: `w-${overrides.lemma ?? 'x'}`,
    lemma: 'thing',
    pos: 'NOUN',
    cefr: 'B1',
    topicSlugs: ['environment'],
    frequencyRank: 3000,
    definitionVi: 'Một khái niệm khác hẳn, không liên quan.',
    ...overrides,
  };
}

describe('scoreDistractor', () => {
  it('rewards the same part of speech', () => {
    const noun = scoreDistractor(target, candidate({ lemma: 'drought', pos: 'NOUN' }));
    const verb = scoreDistractor(target, candidate({ lemma: 'drought', pos: 'VERB' }));
    expect(noun.score).toBeGreaterThan(verb.score);
    expect(noun.reasons).toContain('same-pos');
  });

  it('rewards a shared topic', () => {
    const same = scoreDistractor(target, candidate({ lemma: 'drought' }));
    const other = scoreDistractor(target, candidate({ lemma: 'drought', topicSlugs: ['space'] }));
    expect(same.score).toBeGreaterThan(other.score);
    expect(same.reasons).toContain('shared-topic');
  });

  it('prefers the same CEFR band, then an adjacent one', () => {
    const same = scoreDistractor(target, candidate({ lemma: 'drought', cefr: 'B1' }));
    const near = scoreDistractor(target, candidate({ lemma: 'drought', cefr: 'B2' }));
    const far = scoreDistractor(target, candidate({ lemma: 'drought', cefr: 'C2' }));
    expect(same.score).toBeGreaterThan(near.score);
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.reasons).toContain('adjacent-cefr');
  });

  it('punishes a declared synonym so two answers are never both right', () => {
    const synonym = scoreDistractor(target, candidate({ lemma: 'contamination' }));
    const plain = scoreDistractor(target, candidate({ lemma: 'drought' }));
    expect(synonym.score).toBeLessThan(plain.score);
    expect(synonym.reasons).toContain('synonym-penalty');
  });

  it('punishes a near-identical definition even when no synonym is declared', () => {
    const paraphrase = scoreDistractor(
      target,
      candidate({
        lemma: 'smog',
        definitionVi: 'Tình trạng không khí bị nhiễm chất độc hại; sự ô nhiễm.',
      }),
    );
    expect(paraphrase.reasons).toContain('meaning-overlap-penalty');
  });

  it('handles an unknown CEFR string without crashing', () => {
    const odd = scoreDistractor(target, candidate({ lemma: 'drought', cefr: 'Z9' }));
    expect(odd.reasons).not.toContain('same-cefr');
    expect(Number.isFinite(odd.score)).toBe(true);
  });
});

describe('meaningOverlap', () => {
  it('is 1 for the same definition and 0 for unrelated ones', () => {
    expect(meaningOverlap('sự ô nhiễm không khí', 'sự ô nhiễm không khí')).toBe(1);
    expect(meaningOverlap('sự ô nhiễm', 'phi hành gia bay lên')).toBe(0);
  });

  it('ignores Vietnamese function words', () => {
    // Only "ô", "nhiễm" carry meaning; "của", "là", "một" must not inflate it.
    expect(meaningOverlap('là một của ô nhiễm', 'ô nhiễm')).toBeGreaterThanOrEqual(
      AMBIGUITY_THRESHOLD,
    );
  });

  it('returns 0 when a definition has no content words', () => {
    expect(meaningOverlap('', 'ô nhiễm')).toBe(0);
    expect(meaningOverlap('là của và', 'ô nhiễm')).toBe(0);
  });
});

describe('pickDistractors', () => {
  const pool: DistractorCandidate[] = [
    candidate({ lemma: 'drought', wordId: 'w1', pos: 'NOUN', cefr: 'B1' }),
    candidate({ lemma: 'habitat', wordId: 'w2', pos: 'NOUN', cefr: 'B1' }),
    candidate({ lemma: 'emission', wordId: 'w3', pos: 'NOUN', cefr: 'B2' }),
    candidate({ lemma: 'orbit', wordId: 'w4', pos: 'NOUN', cefr: 'B1', topicSlugs: ['space'] }),
    candidate({ lemma: 'recycle', wordId: 'w5', pos: 'VERB', cefr: 'A2' }),
    candidate({ lemma: 'contamination', wordId: 'w6', pos: 'NOUN', cefr: 'B1' }),
  ];

  it('returns the requested number of options', () => {
    expect(pickDistractors(target, pool, { count: 3 })).toHaveLength(3);
  });

  it('never returns the target itself', () => {
    const withTarget = [...pool, target];
    const picked = pickDistractors(target, withTarget, { count: 6 });
    expect(picked.map((item) => item.wordId)).not.toContain(target.wordId);
  });

  it('ranks same-topic nouns above an off-topic noun and a verb', () => {
    const picked = pickDistractors(target, pool, { count: 3 });
    const lemmas = picked.map((item) => item.lemma);
    expect(lemmas).toContain('drought');
    expect(lemmas).toContain('habitat');
    expect(lemmas).not.toContain('recycle');
  });

  it('pushes the declared synonym to the very bottom', () => {
    const picked = pickDistractors(target, pool, { count: 6 });
    expect(picked[picked.length - 1]?.lemma).toBe('contamination');
  });

  it('honours the exclude list', () => {
    const picked = pickDistractors(target, pool, { count: 3, exclude: ['w1', 'w2'] });
    expect(picked.map((item) => item.wordId)).not.toContain('w1');
    expect(picked.map((item) => item.wordId)).not.toContain('w2');
  });

  it('drops duplicate lemmas arriving through two senses', () => {
    const doubled = [...pool, candidate({ lemma: 'drought', wordId: 'w1-bis' })];
    const picked = pickDistractors(target, doubled, { count: 6 });
    const droughts = picked.filter((item) => item.lemma === 'drought');
    expect(droughts).toHaveLength(1);
  });

  it('is deterministic for one seed and shuffles ties across seeds', () => {
    const ties: DistractorCandidate[] = Array.from({ length: 8 }, (_, index) =>
      candidate({ lemma: `word${index}`, wordId: `t${index}` }),
    );
    const a = pickDistractors(target, ties, { count: 3, seed: 1 }).map((item) => item.wordId);
    const again = pickDistractors(target, ties, { count: 3, seed: 1 }).map((item) => item.wordId);
    const b = pickDistractors(target, ties, { count: 3, seed: 99 }).map((item) => item.wordId);
    expect(a).toEqual(again);
    expect(a).not.toEqual(b);
  });

  it('returns an empty list when asked for nothing or given nothing', () => {
    expect(pickDistractors(target, pool, { count: 0 })).toEqual([]);
    expect(pickDistractors(target, [], { count: 3 })).toEqual([]);
  });
});

describe('gapHint', () => {
  it('shows the first letter and hides the rest', () => {
    expect(gapHint('recycle')).toBe('r______');
    expect(gapHint('a')).toBe('a');
  });

  it('keeps spaces visible in multi-word answers', () => {
    expect(gapHint('give up')).toBe('g___ __');
  });

  it('is empty for an empty answer', () => {
    expect(gapHint('   ')).toBe('');
  });
});

describe('blankOut', () => {
  const sentence = 'We recycle paper at home.';

  it('replaces the target with a blank and returns what was removed', () => {
    const result = blankOut(sentence, 3, 10);
    expect(result).toEqual({ prompt: 'We ____ paper at home.', answer: 'recycle' });
  });

  it('blanks an inflected form, not the lemma', () => {
    const inflected = 'She was browsing the web.';
    expect(blankOut(inflected, 8, 16)?.answer).toBe('browsing');
  });

  it('refuses offsets that do not fit the sentence', () => {
    expect(blankOut(sentence, -1, 4)).toBeNull();
    expect(blankOut(sentence, 3, 999)).toBeNull();
    expect(blankOut(sentence, 5, 5)).toBeNull();
  });
});

describe('definitionWeight', () => {
  it('counts content words so one-word glosses can be rejected', () => {
    expect(definitionWeight('rubbish')).toBe(1);
    expect(definitionWeight('to treat used materials')).toBe(4);
  });
});
