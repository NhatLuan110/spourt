import { describe, expect, it } from 'vitest';
import type { CefrLevel } from '@sprout/shared';
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  advanceAdaptive,
  emptyAdaptiveState,
  estimateLevel,
  shouldStop,
  skillOutcomes,
} from '../src/adaptive.js';

/** Answers a run of questions, all at the level the walk currently sits on. */
function walk(results: boolean[]) {
  let state = emptyAdaptiveState();
  results.forEach((isCorrect, index) => {
    state = advanceAdaptive(state, {
      exerciseId: `q${index}`,
      level: state.level,
      isCorrect,
    });
  });
  return state;
}

describe('adaptive walk', () => {
  it('starts at A2', () => {
    expect(emptyAdaptiveState().level).toBe('A2');
  });

  it('moves up after two right in a row', () => {
    expect(walk([true, true]).level).toBe('B1');
  });

  it('moves down after two wrong in a row', () => {
    expect(walk([false, false]).level).toBe('A1');
  });

  it('does not move on an alternating run', () => {
    expect(walk([true, false, true, false]).level).toBe('A2');
  });

  it('resets both streaks when the level changes', () => {
    const state = walk([true, true]);
    expect(state.correctStreak).toBe(0);
    expect(state.wrongStreak).toBe(0);
  });

  it('records every question it asked, in order', () => {
    const state = walk([true, false, true]);
    expect(state.asked).toEqual(['q0', 'q1', 'q2']);
  });

  it('counts a direction change as a reversal', () => {
    // Up to B1, then two wrong takes it back down: one reversal.
    const state = walk([true, true, false, false]);
    expect(state.reversals).toBe(1);
  });

  it('does not count the first move as a reversal', () => {
    expect(walk([true, true]).reversals).toBe(0);
  });

  it('tallies answers by the level they were asked at', () => {
    const state = walk([true, true, true, true]);
    expect(state.tally['A2']).toEqual({ asked: 2, correct: 2 });
    expect(state.tally['B1']).toEqual({ asked: 2, correct: 2 });
  });

  it('does not step past C2 at the top', () => {
    let state = emptyAdaptiveState('C2');
    state = advanceAdaptive(state, { exerciseId: 'a', level: 'C2', isCorrect: true });
    state = advanceAdaptive(state, { exerciseId: 'b', level: 'C2', isCorrect: true });
    expect(state.level).toBe('C2');
  });

  it('does not step below A1 at the bottom', () => {
    let state = emptyAdaptiveState('A1');
    state = advanceAdaptive(state, { exerciseId: 'a', level: 'A1', isCorrect: false });
    state = advanceAdaptive(state, { exerciseId: 'b', level: 'A1', isCorrect: false });
    expect(state.level).toBe('A1');
  });
});

describe('stopping', () => {
  it('never stops before the minimum number of questions', () => {
    const state = walk(Array.from({ length: MIN_QUESTIONS - 1 }, (_, i) => i % 2 === 0));
    expect(shouldStop(state)).toBe(false);
  });

  it('stops at the maximum even when the walk never settles', () => {
    const state = walk(Array.from({ length: MAX_QUESTIONS }, (_, i) => i % 2 === 0));
    expect(shouldStop(state)).toBe(true);
  });

  it('stops once the level has settled after the minimum', () => {
    // Alternating pairs bounce the level up and down repeatedly.
    const pattern: boolean[] = [];
    for (let i = 0; i < 8; i += 1) pattern.push(true, true, false, false);
    const state = walk(pattern.slice(0, MIN_QUESTIONS + 4));
    expect(state.reversals).toBeGreaterThanOrEqual(3);
    expect(shouldStop(state)).toBe(true);
  });
});

describe('estimateLevel', () => {
  it('places a learner at the highest level they passed', () => {
    const state = walk([true, true, true, true, false, false]);
    // A2 and B1 both answered well; B2 was reached and failed.
    expect(state.tally['B1']?.correct).toBe(2);
    expect(estimateLevel(state)).toBe('B1');
  });

  it('falls back to A1 when nothing was answered well', () => {
    expect(estimateLevel(walk([false, false, false, false]))).toBe('A1');
  });

  it('ignores a level with only one question asked', () => {
    let state = emptyAdaptiveState('B2');
    state = advanceAdaptive(state, { exerciseId: 'a', level: 'B2', isCorrect: true });
    expect(estimateLevel(state)).toBe('A1');
  });
});

describe('skillOutcomes', () => {
  const answers = (
    entries: [string, CefrLevel, boolean][],
  ): { skill: never; cefr: CefrLevel; isCorrect: boolean }[] =>
    entries.map(([skill, cefr, isCorrect]) => ({ skill: skill as never, cefr, isCorrect }));

  it('leaves an unmeasured skill out entirely', () => {
    const outcomes = skillOutcomes(answers([['GRAMMAR', 'A2', true]]));
    expect(outcomes.map((entry) => entry.skill)).toEqual(['GRAMMAR']);
  });

  it('scores accuracy out of a hundred', () => {
    const outcomes = skillOutcomes(
      answers([
        ['READING', 'B1', true],
        ['READING', 'B1', true],
        ['READING', 'B1', false],
        ['READING', 'B1', false],
      ]),
    );
    expect(outcomes[0]?.score).toBe(50);
    expect(outcomes[0]?.asked).toBe(4);
    expect(outcomes[0]?.correct).toBe(2);
  });

  it('rates a perfect run at B2 above a perfect run at A1', () => {
    const easy = skillOutcomes(answers([
      ['GRAMMAR', 'A1', true],
      ['GRAMMAR', 'A1', true],
    ]));
    const hard = skillOutcomes(answers([
      ['GRAMMAR', 'B2', true],
      ['GRAMMAR', 'B2', true],
    ]));
    expect(easy[0]?.score).toBe(hard[0]?.score);
    // Same accuracy, different difficulty — the level must separate them.
    expect(hard[0]?.cefr).not.toBe(easy[0]?.cefr);
  });

  it('does not let failed hard questions raise the level', () => {
    const outcomes = skillOutcomes(
      answers([
        ['LISTENING', 'A1', true],
        ['LISTENING', 'C1', false],
        ['LISTENING', 'C1', false],
      ]),
    );
    expect(outcomes[0]?.cefr).toBe('A1');
  });

  it('separates skills asked in the same test', () => {
    const outcomes = skillOutcomes(
      answers([
        ['GRAMMAR', 'B1', true],
        ['READING', 'B1', false],
      ]),
    );
    expect(outcomes).toHaveLength(2);
    expect(outcomes.find((entry) => entry.skill === 'GRAMMAR')?.score).toBe(100);
    expect(outcomes.find((entry) => entry.skill === 'READING')?.score).toBe(0);
  });
});
