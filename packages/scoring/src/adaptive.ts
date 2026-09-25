import { CEFR_LEVELS, CEFR_ORDER, cefrFromScore, stepCefr } from '@sprout/shared';
import type { CefrLevel, Skill } from '@sprout/shared';

/**
 * §7 placement test — an adaptive walk up and down the CEFR ladder.
 *
 * The rule is deliberately simple and legible rather than an IRT model: two
 * right in a row moves up a level, two wrong in a row moves down, and the test
 * stops once the learner has bounced between the same two levels enough times
 * for the answer to be stable. A learner can see why they got the level they
 * got, which matters more here than a decimal place of precision.
 */

export const PLACEMENT_START: CefrLevel = 'A2';
/** Consecutive right answers needed to move up, and wrong answers to move down. */
export const STEP_STREAK = 2;
export const MIN_QUESTIONS = 12;
export const MAX_QUESTIONS = 30;
/** Stop once the level has changed direction this many times. */
export const SETTLE_REVERSALS = 3;

export interface AdaptiveState {
  /** The level the next question should be drawn from. */
  level: CefrLevel;
  correctStreak: number;
  wrongStreak: number;
  asked: string[];
  /** How many times the walk has changed direction. */
  reversals: number;
  /** -1 down, 0 none yet, 1 up. */
  lastDirection: -1 | 0 | 1;
  /** Per level: how many asked and how many right, for the final estimate. */
  tally: Record<string, { asked: number; correct: number }>;
}

export function emptyAdaptiveState(start: CefrLevel = PLACEMENT_START): AdaptiveState {
  return {
    level: start,
    correctStreak: 0,
    wrongStreak: 0,
    asked: [],
    reversals: 0,
    lastDirection: 0,
    tally: {},
  };
}

/** Folds one graded answer into the walk. */
export function advanceAdaptive(
  state: AdaptiveState,
  params: { exerciseId: string; level: CefrLevel; isCorrect: boolean },
): AdaptiveState {
  const tally = { ...state.tally };
  const bucket = tally[params.level] ?? { asked: 0, correct: 0 };
  tally[params.level] = {
    asked: bucket.asked + 1,
    correct: bucket.correct + (params.isCorrect ? 1 : 0),
  };

  const correctStreak = params.isCorrect ? state.correctStreak + 1 : 0;
  const wrongStreak = params.isCorrect ? 0 : state.wrongStreak + 1;

  let level = state.level;
  let direction: -1 | 0 | 1 = 0;
  if (correctStreak >= STEP_STREAK) {
    level = stepCefr(state.level, 1);
    direction = 1;
  } else if (wrongStreak >= STEP_STREAK) {
    level = stepCefr(state.level, -1);
    direction = -1;
  }

  // Bumping against C2 or A1 is not a direction change, it is a ceiling.
  const moved = level !== state.level;
  const reversed =
    moved && state.lastDirection !== 0 && direction !== 0 && direction !== state.lastDirection;

  return {
    level,
    // A step resets both streaks: the next question is at a new difficulty, so
    // the evidence for the previous one no longer applies.
    correctStreak: moved ? 0 : correctStreak,
    wrongStreak: moved ? 0 : wrongStreak,
    asked: [...state.asked, params.exerciseId],
    reversals: state.reversals + (reversed ? 1 : 0),
    lastDirection: moved ? direction : state.lastDirection,
    tally,
  };
}

export function shouldStop(state: AdaptiveState): boolean {
  if (state.asked.length >= MAX_QUESTIONS) return true;
  if (state.asked.length < MIN_QUESTIONS) return false;
  return state.reversals >= SETTLE_REVERSALS;
}

/**
 * The level the learner has settled at: the highest level where they answered
 * at least 60 percent correctly with two or more questions asked.
 *
 * Falling back to A1 rather than null keeps the result usable — a learner who
 * got nothing right is placed at A1, which is the honest answer.
 */
export function estimateLevel(state: AdaptiveState): CefrLevel {
  let best: CefrLevel = 'A1';
  for (const level of CEFR_LEVELS) {
    const bucket = state.tally[level];
    if (!bucket || bucket.asked < 2) continue;
    if (bucket.correct / bucket.asked >= 0.6 && CEFR_ORDER[level] >= CEFR_ORDER[best]) {
      best = level;
    }
  }
  return best;
}

export interface SkillOutcome {
  skill: Skill;
  correct: number;
  asked: number;
  /** 0..100, the normalised score fed to §9.7 as a test observation. */
  score: number;
  cefr: CefrLevel;
}

/**
 * Turns per-skill tallies into a score and a level. A skill with no questions
 * is left out entirely rather than reported as zero, because "not measured" and
 * "measured as bad" must not look the same on the results screen.
 */
export function skillOutcomes(
  answers: { skill: Skill; cefr: CefrLevel; isCorrect: boolean }[],
): SkillOutcome[] {
  const buckets = new Map<Skill, { correct: number; asked: number; levelSum: number }>();

  for (const answer of answers) {
    const bucket = buckets.get(answer.skill) ?? { correct: 0, asked: 0, levelSum: 0 };
    bucket.asked += 1;
    if (answer.isCorrect) {
      bucket.correct += 1;
      // Only questions answered correctly count towards the level, so a run of
      // failed C1 questions does not drag the estimate upwards.
      bucket.levelSum += CEFR_ORDER[answer.cefr];
    }
    buckets.set(answer.skill, bucket);
  }

  return [...buckets].map(([skill, bucket]) => {
    const accuracy = bucket.asked === 0 ? 0 : bucket.correct / bucket.asked;
    const score = Math.round(accuracy * 100);
    const meanLevel = bucket.correct === 0 ? 0 : bucket.levelSum / bucket.correct;
    // Blend what they got right with how hard it was: a perfect run at A1 is
    // not the same as a perfect run at B2.
    const difficultyBonus = Math.round((meanLevel / (CEFR_LEVELS.length - 1)) * 25);
    return {
      skill,
      correct: bucket.correct,
      asked: bucket.asked,
      score,
      cefr: cefrFromScore(Math.min(100, score * 0.75 + difficultyBonus)),
    };
  });
}
