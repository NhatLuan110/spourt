import type { Skill } from '@sprout/shared';

/** §9.6 — one candidate action the learner could take next. */
export interface RecommendationCandidate {
  id: string;
  kind: 'review' | 'lesson' | 'drill' | 'test' | 'roleplay' | 'writing';
  skill: Skill;
  title: string;
  href: string;
  estimatedMinutes: number;
  /** Position in the level curriculum, 0 = the next lesson to take. */
  curriculumDistance?: number;
  matchesGoal?: boolean;
  daysSinceTouched?: number;
  locked?: boolean;
}

export interface RecommendationContext {
  dueCount: number;
  skillScores: Partial<Record<Skill, number>>;
  /** Lessons already completed today, per skill. */
  completedTodayBySkill: Partial<Record<Skill, number>>;
  dailyGoalMinutes: number;
}

export interface Recommendation extends RecommendationCandidate {
  score: number;
  reasonVi: string;
}

export const WEIGHTS = {
  urgency: 40,
  weakness: 25,
  curriculum: 15,
  goalMatch: 10,
  novelty: 5,
  fatigue: -20,
  locked: -30,
} as const;

const SKILL_LABEL_VI: Record<Skill, string> = {
  VOCABULARY: 'Từ vựng',
  GRAMMAR: 'Ngữ pháp',
  LISTENING: 'Nghe',
  SPEAKING: 'Nói',
  READING: 'Đọc',
  WRITING: 'Viết',
};

function scoreCandidate(
  candidate: RecommendationCandidate,
  context: RecommendationContext,
): { score: number; reasonVi: string } {
  const urgency = candidate.kind === 'review' ? Math.min(1, context.dueCount / 50) : 0;
  const skillScore = context.skillScores[candidate.skill] ?? 50;
  const weakness = Math.max(0, 1 - skillScore / 100);
  const curriculum =
    candidate.curriculumDistance === undefined
      ? 0
      : Math.max(0, 1 - candidate.curriculumDistance / 5);
  const goalMatch = candidate.matchesGoal ? 1 : 0;
  const novelty = (candidate.daysSinceTouched ?? 99) >= 7 ? 1 : 0;
  const fatigue = (context.completedTodayBySkill[candidate.skill] ?? 0) >= 3 ? 1 : 0;
  const locked = candidate.locked ? 1 : 0;

  const score =
    WEIGHTS.urgency * urgency +
    WEIGHTS.weakness * weakness +
    WEIGHTS.curriculum * curriculum +
    WEIGHTS.goalMatch * goalMatch +
    WEIGHTS.novelty * novelty +
    WEIGHTS.fatigue * fatigue +
    WEIGHTS.locked * locked;

  return { score: Number(score.toFixed(2)), reasonVi: buildReason(candidate, context, weakness) };
}

/** §9.6 — every suggestion must carry a sentence explaining why it is here. */
function buildReason(
  candidate: RecommendationCandidate,
  context: RecommendationContext,
  weakness: number,
): string {
  if (candidate.kind === 'review' && context.dueCount > 0) {
    return `Bạn có ${context.dueCount} thẻ đến hạn ôn hôm nay`;
  }
  if (weakness >= 0.45) {
    return `Vì ${SKILL_LABEL_VI[candidate.skill]} đang là kỹ năng yếu nhất của bạn`;
  }
  if (candidate.curriculumDistance === 0) {
    return 'Đây là bài tiếp theo trong lộ trình của bạn';
  }
  if (candidate.matchesGoal) {
    return 'Khớp với mục tiêu học bạn đã chọn';
  }
  if ((candidate.daysSinceTouched ?? 0) >= 7) {
    return `Bạn chưa luyện ${SKILL_LABEL_VI[candidate.skill]} một tuần rồi`;
  }
  return 'Phù hợp với trình độ hiện tại của bạn';
}

/**
 * §9.6 — rank candidates, keep the skills distinct, and stop once the suggested
 * work fills the daily goal. Review always wins while cards are due.
 */
export function recommend(
  candidates: RecommendationCandidate[],
  context: RecommendationContext,
  limit = 3,
): Recommendation[] {
  const scored = candidates
    .map((candidate) => {
      const result = scoreCandidate(candidate, context);
      // §9.6 — review is not merely weighted highest, it always wins while cards
      // are due: a learner who skips reviews loses words they already paid for.
      const overdueBoost = candidate.kind === 'review' && context.dueCount > 0 ? 1000 : 0;
      return { ...candidate, ...result, score: result.score + overdueBoost };
    })
    .sort((a, b) => b.score - a.score);

  const picked: Recommendation[] = [];
  const usedSkills = new Set<Skill>();
  let minutes = 0;

  for (const candidate of scored) {
    if (picked.length >= limit) break;
    if (usedSkills.has(candidate.skill)) continue;
    if (picked.length > 0 && minutes + candidate.estimatedMinutes > context.dailyGoalMinutes) {
      continue;
    }
    picked.push(candidate);
    usedSkills.add(candidate.skill);
    minutes += candidate.estimatedMinutes;
  }

  return picked;
}

/** The single primary action behind the "Học tiếp" button on the dashboard. */
export function primaryAction(
  candidates: RecommendationCandidate[],
  context: RecommendationContext,
): Recommendation | null {
  const [first] = recommend(candidates, context, 1);
  return first ?? null;
}
