import type { SchedulerConfig, SrsCard } from './types.js';

/** §9.1 — defaults are the spec values; everything is overridable per call for tests. */
export const DEFAULT_CONFIG: SchedulerConfig = {
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  graduatingIntervalDays: 1,
  easyGraduatingIntervalDays: 4,
  minEase: 1.3,
  maxEase: 3.5,
  maxIntervalDays: 365,
  hardMultiplier: 1.2,
  easyBonus: 1.3,
  againEasePenalty: 0.2,
  hardEasePenalty: 0.15,
  easyEaseBonus: 0.15,
  lapseIntervalFactor: 0.5,
  fuzzMin: 0.95,
  fuzzMax: 1.05,
  fuzzMinIntervalDays: 2,
  masteredIntervalDays: 180,
  masteredMaxLapses: 2,
  masteredMinAccuracy: 0.9,
};

export function resolveConfig(overrides?: Partial<SchedulerConfig>): SchedulerConfig {
  return overrides ? { ...DEFAULT_CONFIG, ...overrides } : DEFAULT_CONFIG;
}

export function createCard(overrides: Partial<SrsCard> = {}): SrsCard {
  return {
    state: 'NEW',
    ease: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    learningStep: 0,
    totalReviews: 0,
    correctReviews: 0,
    ...overrides,
  };
}
