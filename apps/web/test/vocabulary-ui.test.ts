import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRS_STATES, VOCAB_EXERCISE_MODES } from '@sprout/shared';
import { GRADES, STATE_LABEL_VI, STATE_TONE } from '../src/lib/srs-labels';

function messages(locale: string): Record<string, unknown> {
  const path = resolve(__dirname, `../messages/${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function lookup(source: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, source);
}

describe('SRS labels', () => {
  it('names every state the scheduler can produce', () => {
    for (const state of SRS_STATES) {
      expect(STATE_LABEL_VI[state], state).toBeTruthy();
      expect(STATE_TONE[state], state).toBeTruthy();
    }
  });

  it('offers the four §9.1 grades in order', () => {
    expect(GRADES.map((entry) => entry.grade)).toEqual([0, 1, 2, 3]);
    expect(new Set(GRADES.map((entry) => entry.key)).size).toBe(4);
  });

  it('translates every grade label in both languages', () => {
    for (const locale of ['vi', 'en']) {
      const catalogue = messages(locale);
      for (const entry of GRADES) {
        expect(lookup(catalogue, `review.${entry.key}`), `${locale}:${entry.key}`).toBeTruthy();
      }
    }
  });
});

describe('practice instructions', () => {
  /**
   * The API sends an instruction key rather than a sentence, so a missing
   * translation would render as a raw key in front of the learner. This is the
   * contract test that keeps the two sides in step.
   */
  const KEY_FOR_MODE: Record<string, string> = {
    'mcq-meaning': 'practice.instruction.mcqMeaning',
    'mcq-reverse': 'practice.instruction.mcqReverse',
    'gap-fill': 'practice.instruction.gapFill',
    'listen-type': 'practice.instruction.listenType',
    matching: 'practice.instruction.matching',
  };

  it('covers all five exercise modes', () => {
    expect(Object.keys(KEY_FOR_MODE).sort()).toEqual([...VOCAB_EXERCISE_MODES].sort());
  });

  it('has a translation for every mode in both languages', () => {
    for (const locale of ['vi', 'en']) {
      const catalogue = messages(locale);
      for (const key of Object.values(KEY_FOR_MODE)) {
        const value = lookup(catalogue, key);
        expect(typeof value, `${locale}:${key}`).toBe('string');
        expect((value as string).length).toBeGreaterThan(3);
      }
    }
  });
});
