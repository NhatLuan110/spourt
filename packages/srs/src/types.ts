export type SrsState = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING' | 'MASTERED' | 'SUSPENDED';

/** §9.1 — 0 Again, 1 Hard, 2 Good, 3 Easy. */
export type ReviewGrade = 0 | 1 | 2 | 3;

export const GRADES: readonly ReviewGrade[] = [0, 1, 2, 3];

/** The scheduling state of one card. Mirrors the persisted UserWord columns. */
export interface SrsCard {
  state: SrsState;
  /** Ease factor, never below config.minEase. */
  ease: number;
  /** Current interval in days. Sub-day learning steps keep the pre-lapse value. */
  intervalDays: number;
  repetitions: number;
  lapses: number;
  learningStep: number;
  totalReviews: number;
  correctReviews: number;
}

export interface SchedulerConfig {
  /** §9.1 LEARNING STEPS — minutes. */
  learningStepsMinutes: number[];
  /** §9.1 RELEARNING STEPS — minutes. */
  relearningStepsMinutes: number[];
  /** Interval a card graduates with after the last learning step. */
  graduatingIntervalDays: number;
  /** Interval when a learner presses Easy while still in learning. */
  easyGraduatingIntervalDays: number;
  minEase: number;
  maxEase: number;
  maxIntervalDays: number;
  hardMultiplier: number;
  easyBonus: number;
  againEasePenalty: number;
  hardEasePenalty: number;
  easyEaseBonus: number;
  /** Fraction of the pre-lapse interval kept when a relearning card graduates. */
  lapseIntervalFactor: number;
  fuzzMin: number;
  fuzzMax: number;
  /** Fuzz is pointless below this interval because due dates are day-aligned. */
  fuzzMinIntervalDays: number;
  masteredIntervalDays: number;
  masteredMaxLapses: number;
  masteredMinAccuracy: number;
}

export interface ReviewContext {
  now: Date;
  timeZone: string;
  dayRolloverHour: number;
  /** Injectable RNG so tests are deterministic. */
  random?: () => number;
  config?: Partial<SchedulerConfig>;
}

export interface ReviewOutcome {
  card: SrsCard;
  /** Interval actually scheduled, in days (sub-day for learning steps). */
  intervalDays: number;
  dueAt: Date;
  previous: {
    state: SrsState;
    ease: number;
    intervalDays: number;
  };
  graduated: boolean;
  lapsed: boolean;
  isCorrect: boolean;
}

export interface QueueCandidate {
  userWordId: string;
  wordId: string;
  dueAt: Date;
  state: SrsState;
  /** Lower rank = taught earlier. Comes from Word.frequencyRank. */
  frequencyRank: number | null;
  /** True when the learner is currently working through this word's topic. */
  inActiveTopic?: boolean;
}

export interface QueueOptions {
  maxReviewsPerDay: number;
  newWordsPerDay: number;
  /** §9.1 — one new card is injected after every N review cards. */
  newCardEveryNReviews?: number;
  limit?: number;
}

export interface QueueResult {
  cards: QueueCandidate[];
  dueCount: number;
  newCount: number;
  /** True when the backlog is more than twice the daily review limit. */
  backlogWarning: boolean;
  totalDueAvailable: number;
}
