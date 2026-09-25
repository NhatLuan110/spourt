import { cefrFromScore } from '@sprout/shared';
import type { CefrLevel, Skill } from '@sprout/shared';

/** §9.7 — every activity produces one weighted observation. */
export interface SkillObservation {
  skill: Skill;
  /** 0..100 */
  normalizedScore: number;
  weight: number;
  timestamp: Date;
}

export type ActivityKind = 'test' | 'lesson' | 'exercise' | 'flashcard';

export const OBSERVATION_WEIGHTS: Record<ActivityKind, number> = {
  test: 3,
  lesson: 2,
  exercise: 1,
  flashcard: 0.5,
};

export const EMA_ALPHA = 0.15;
/** Total weight over 30 days needed for full confidence. */
export const CONFIDENCE_WEIGHT_TARGET = 40;
export const LOW_CONFIDENCE_THRESHOLD = 0.3;

export interface SkillScoreState {
  score: number;
  confidence: number;
  observations: number;
  cefrEstimate: CefrLevel | null;
}

export interface SkillScoreUpdate extends SkillScoreState {
  /** UI shows "ước lượng sơ bộ" instead of a hard number below the threshold. */
  isProvisional: boolean;
  delta: number;
}

/** §9.7 — exponential moving average, alpha 0.15. */
export function applyObservation(
  current: SkillScoreState,
  observation: { normalizedScore: number; weight: number },
  recentWeight30d: number,
): SkillScoreUpdate {
  const clamped = Math.max(0, Math.min(100, observation.normalizedScore));
  // A heavier observation moves the score further, but never past the value itself.
  const alpha = Math.min(0.6, EMA_ALPHA * Math.max(0.5, observation.weight));
  const score = current.observations === 0 ? clamped : current.score + alpha * (clamped - current.score);
  const rounded = Number(Math.max(0, Math.min(100, score)).toFixed(2));
  const confidence = Number(
    Math.min(1, (recentWeight30d + observation.weight) / CONFIDENCE_WEIGHT_TARGET).toFixed(3),
  );

  return {
    score: rounded,
    confidence,
    observations: current.observations + 1,
    cefrEstimate: cefrFromScore(rounded),
    isProvisional: confidence < LOW_CONFIDENCE_THRESHOLD,
    delta: Number((rounded - current.score).toFixed(2)),
  };
}

/**
 * §9.7 — skills the learner has abandoned drift down 2% per week after a two
 * week gap, but never by more than 15% of the original score.
 */
export function applyDecay(params: {
  score: number;
  daysSinceLastActivity: number;
  graceDays?: number;
  weeklyRate?: number;
  maxDecayFraction?: number;
}): number {
  const grace = params.graceDays ?? 14;
  if (params.daysSinceLastActivity <= grace) return Number(params.score.toFixed(2));

  const weeks = (params.daysSinceLastActivity - grace) / 7;
  const rate = params.weeklyRate ?? 0.02;
  const maxFraction = params.maxDecayFraction ?? 0.15;
  const decayFraction = Math.min(maxFraction, weeks * rate);
  return Number((params.score * (1 - decayFraction)).toFixed(2));
}

export function emptySkillScore(): SkillScoreState {
  return { score: 0, confidence: 0, observations: 0, cefrEstimate: null };
}

/** Overall CEFR is the weighted mean of the six skills, favouring the weakest. */
export function overallCefr(scores: { skill: Skill; score: number; confidence: number }[]): {
  score: number;
  cefr: CefrLevel;
} {
  const usable = scores.filter((entry) => entry.confidence > 0);
  if (usable.length === 0) return { score: 0, cefr: 'A1' };

  const mean = usable.reduce((sum, entry) => sum + entry.score, 0) / usable.length;
  const weakest = Math.min(...usable.map((entry) => entry.score));
  // 70% average, 30% weakest link: a learner is only as fluent as their worst skill.
  const blended = Number((mean * 0.7 + weakest * 0.3).toFixed(2));
  return { score: blended, cefr: cefrFromScore(blended) };
}

export interface WeakTopic {
  key: string;
  label: string;
  accuracy: number;
  attempts: number;
  reasonVi: string;
}

/** §7.14.5 — weak topics must always explain themselves. */
export function rankWeakTopics(
  entries: { key: string; label: string; correct: number; attempts: number }[],
  minAttempts = 5,
  limit = 5,
): WeakTopic[] {
  return entries
    .filter((entry) => entry.attempts >= minAttempts)
    .map((entry) => {
      const accuracy = entry.attempts === 0 ? 0 : entry.correct / entry.attempts;
      return {
        key: entry.key,
        label: entry.label,
        accuracy: Number(accuracy.toFixed(3)),
        attempts: entry.attempts,
        reasonVi: `Độ chính xác ${Math.round(accuracy * 100)}% trên ${entry.attempts} câu về ${entry.label}`,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}
