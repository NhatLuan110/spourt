import { describe, expect, it } from 'vitest';
import { levelFromXp, treeStageFromXp, xpToReachLevel } from '@sprout/shared';
import {
  applyDecay,
  applyObservation,
  applyXp,
  baseXpFor,
  computeXpAward,
  dayCountsForStreak,
  emptySkillScore,
  overallCefr,
  primaryAction,
  rankWeakTopics,
  recommend,
  updateStreak,
} from '../src/index.js';
import type { RecommendationCandidate, RecommendationContext } from '../src/index.js';

describe('XP awards', () => {
  it('uses the base values from the specification', () => {
    expect(baseXpFor({ source: 'NEW_WORD', streakDays: 0 })).toBe(5);
    expect(baseXpFor({ source: 'REVIEW', isCorrect: true, streakDays: 0 })).toBe(2);
    expect(baseXpFor({ source: 'REVIEW', isCorrect: false, streakDays: 0 })).toBe(1);
    expect(baseXpFor({ source: 'LESSON', accuracy: 1, streakDays: 0 })).toBe(35);
    expect(baseXpFor({ source: 'LESSON', accuracy: 0.5, streakDays: 0 })).toBe(28);
    expect(baseXpFor({ source: 'READING', accuracy: 0.8, streakDays: 0 })).toBe(32);
    expect(baseXpFor({ source: 'LISTENING', accuracy: 0.8, streakDays: 0 })).toBe(23);
    expect(baseXpFor({ source: 'WRITING', score: 80, streakDays: 0 })).toBe(46);
    expect(baseXpFor({ source: 'CHALLENGE', streakDays: 0 })).toBe(30);
    expect(baseXpFor({ source: 'STREAK_BONUS', streakDays: 0 })).toBe(50);
    expect(baseXpFor({ source: 'ACHIEVEMENT', streakDays: 0 })).toBe(0);
  });

  it('rewards speaking by band', () => {
    expect(baseXpFor({ source: 'SPEAKING', score: 90, streakDays: 0 })).toBe(30);
    expect(baseXpFor({ source: 'SPEAKING', score: 70, streakDays: 0 })).toBe(20);
    expect(baseXpFor({ source: 'SPEAKING', score: 40, streakDays: 0 })).toBe(0);
  });

  it('clamps test XP into the 50 to 100 band', () => {
    expect(baseXpFor({ source: 'TEST', testWeight: 10, streakDays: 0 })).toBe(50);
    expect(baseXpFor({ source: 'TEST', testWeight: 500, streakDays: 0 })).toBe(100);
  });

  it('applies the streak multiplier tiers', () => {
    expect(computeXpAward({ source: 'NEW_WORD', streakDays: 3 }).multiplier).toBe(1);
    expect(computeXpAward({ source: 'NEW_WORD', streakDays: 10 }).multiplier).toBe(1.1);
    expect(computeXpAward({ source: 'NEW_WORD', streakDays: 50 }).multiplier).toBe(1.2);
    expect(computeXpAward({ source: 'NEW_WORD', streakDays: 300 }).multiplier).toBe(1.3);
  });

  it('caps review XP at 300 per day', () => {
    const award = computeXpAward({
      source: 'REVIEW',
      isCorrect: true,
      streakDays: 0,
      reviewXpToday: 299,
    });
    expect(award.amount).toBe(1);
    expect(award.cappedByDailyReviewLimit).toBe(true);

    const exhausted = computeXpAward({
      source: 'REVIEW',
      isCorrect: true,
      streakDays: 0,
      reviewXpToday: 300,
    });
    expect(exhausted.amount).toBe(0);
  });

  it('does not cap non-review sources', () => {
    const award = computeXpAward({
      source: 'LESSON',
      accuracy: 1,
      streakDays: 0,
      reviewXpToday: 5000,
    });
    expect(award.cappedByDailyReviewLimit).toBe(false);
    expect(award.amount).toBe(35);
  });

  it('grants one coin per ten XP', () => {
    expect(computeXpAward({ source: 'WRITING', score: 100, streakDays: 0 }).coins).toBe(5);
  });
});

describe('levels and the tree', () => {
  it('matches the level table in the specification', () => {
    expect(xpToReachLevel(2)).toBe(100);
    expect(xpToReachLevel(3)).toBe(300);
    expect(xpToReachLevel(5)).toBe(1000);
    expect(xpToReachLevel(10)).toBe(4500);
    expect(xpToReachLevel(20)).toBe(19000);
    expect(xpToReachLevel(50)).toBe(122500);
  });

  it('inverts the level formula consistently', () => {
    for (const level of [2, 3, 5, 10, 20, 30, 50]) {
      expect(levelFromXp(xpToReachLevel(level))).toBe(level);
      expect(levelFromXp(xpToReachLevel(level) - 1)).toBe(level - 1);
    }
  });

  it('grows the tree through the six stages', () => {
    expect(treeStageFromXp(0).stage).toBe(1);
    expect(treeStageFromXp(299).stage).toBe(1);
    expect(treeStageFromXp(300).stage).toBe(2);
    expect(treeStageFromXp(1500).stage).toBe(3);
    expect(treeStageFromXp(5000).stage).toBe(4);
    expect(treeStageFromXp(15000).stage).toBe(5);
    expect(treeStageFromXp(40000).stage).toBe(6);
    expect(treeStageFromXp(999999).stage).toBe(6);
  });

  it('reports level ups and tree growth', () => {
    const update = applyXp(
      { totalXp: 295, level: 2, treeStage: 1 },
      computeXpAward({ source: 'NEW_WORD', streakDays: 0 }),
    );
    expect(update.totalXp).toBe(300);
    expect(update.treeGrew).toBe(true);
    expect(update.leveledUp).toBe(true);
  });
});

describe('streaks', () => {
  it('counts a day that reaches the XP goal', () => {
    expect(
      dayCountsForStreak({ xpEarned: 30, dailyGoalXp: 30, lessonsCompleted: 0, cardsReviewed: 0 }),
    ).toBe(true);
  });

  it('counts a finished lesson or five reviewed cards', () => {
    expect(
      dayCountsForStreak({ xpEarned: 0, dailyGoalXp: 30, lessonsCompleted: 1, cardsReviewed: 0 }),
    ).toBe(true);
    expect(
      dayCountsForStreak({ xpEarned: 0, dailyGoalXp: 30, lessonsCompleted: 0, cardsReviewed: 5 }),
    ).toBe(true);
    expect(
      dayCountsForStreak({ xpEarned: 5, dailyGoalXp: 30, lessonsCompleted: 0, cardsReviewed: 4 }),
    ).toBe(false);
  });

  it('extends the streak on consecutive days', () => {
    const update = updateStreak({
      currentStreak: 3,
      longestStreak: 10,
      freezesRemaining: 2,
      daysSinceLastStudyDay: 1,
    });
    expect(update.currentStreak).toBe(4);
    expect(update.longestStreak).toBe(10);
    expect(update.freezeUsed).toBe(false);
  });

  it('spends a freeze to absorb one missed day', () => {
    const update = updateStreak({
      currentStreak: 9,
      longestStreak: 9,
      freezesRemaining: 2,
      daysSinceLastStudyDay: 2,
    });
    expect(update.currentStreak).toBe(10);
    expect(update.freezeUsed).toBe(true);
    expect(update.freezesRemaining).toBe(1);
    expect(update.streakBroken).toBe(false);
  });

  it('breaks the streak when there is no freeze left', () => {
    const update = updateStreak({
      currentStreak: 9,
      longestStreak: 20,
      freezesRemaining: 0,
      daysSinceLastStudyDay: 2,
    });
    expect(update.streakBroken).toBe(true);
    expect(update.currentStreak).toBe(1);
    expect(update.longestStreak).toBe(20);
  });

  it('breaks the streak after three or more missed days even with freezes', () => {
    const update = updateStreak({
      currentStreak: 40,
      longestStreak: 40,
      freezesRemaining: 3,
      daysSinceLastStudyDay: 4,
    });
    expect(update.streakBroken).toBe(true);
    expect(update.freezesRemaining).toBe(3);
  });

  it('grants a freeze at every seven day milestone, capped at three', () => {
    const seven = updateStreak({
      currentStreak: 6,
      longestStreak: 6,
      freezesRemaining: 1,
      daysSinceLastStudyDay: 1,
    });
    expect(seven.milestoneReached).toBe(7);
    expect(seven.freezesRemaining).toBe(2);

    const capped = updateStreak({
      currentStreak: 6,
      longestStreak: 6,
      freezesRemaining: 3,
      daysSinceLastStudyDay: 1,
    });
    expect(capped.freezesRemaining).toBe(3);
  });

  it('does nothing when the day is already counted', () => {
    const update = updateStreak({
      currentStreak: 5,
      longestStreak: 5,
      freezesRemaining: 1,
      daysSinceLastStudyDay: 0,
    });
    expect(update).toEqual({
      currentStreak: 5,
      longestStreak: 5,
      freezesRemaining: 1,
      freezeUsed: false,
      streakBroken: false,
      milestoneReached: null,
    });
  });
});

describe('skill scores', () => {
  it('takes the first observation at face value', () => {
    const update = applyObservation(emptySkillScore(), { normalizedScore: 72, weight: 2 }, 0);
    expect(update.score).toBe(72);
    expect(update.cefrEstimate).toBe('B2');
    expect(update.observations).toBe(1);
  });

  it('moves gradually afterwards', () => {
    const first = applyObservation(emptySkillScore(), { normalizedScore: 50, weight: 1 }, 0);
    const second = applyObservation(first, { normalizedScore: 100, weight: 1 }, 1);
    expect(second.score).toBeGreaterThan(50);
    expect(second.score).toBeLessThan(70);
  });

  it('marks low confidence as provisional', () => {
    const update = applyObservation(emptySkillScore(), { normalizedScore: 80, weight: 1 }, 2);
    expect(update.confidence).toBeLessThan(0.3);
    expect(update.isProvisional).toBe(true);
  });

  it('reaches full confidence with enough recent activity', () => {
    const update = applyObservation(emptySkillScore(), { normalizedScore: 80, weight: 3 }, 60);
    expect(update.confidence).toBe(1);
    expect(update.isProvisional).toBe(false);
  });

  it('leaves scores alone inside the grace period', () => {
    expect(applyDecay({ score: 80, daysSinceLastActivity: 14 })).toBe(80);
  });

  it('decays neglected skills but never past 15 percent', () => {
    expect(applyDecay({ score: 80, daysSinceLastActivity: 21 })).toBeCloseTo(78.4, 1);
    expect(applyDecay({ score: 80, daysSinceLastActivity: 999 })).toBe(68);
  });

  it('blends the average with the weakest skill', () => {
    const result = overallCefr([
      { skill: 'LISTENING', score: 80, confidence: 0.8 },
      { skill: 'SPEAKING', score: 40, confidence: 0.5 },
    ]);
    expect(result.score).toBeCloseTo(54, 1);
    expect(result.cefr).toBe('B1');
  });

  it('returns A1 when there is no data at all', () => {
    expect(overallCefr([{ skill: 'READING', score: 90, confidence: 0 }])).toEqual({
      score: 0,
      cefr: 'A1',
    });
  });

  it('explains why a topic is weak', () => {
    const weak = rankWeakTopics([
      { key: 'present-perfect', label: 'thì hoàn thành', correct: 11, attempts: 23 },
      { key: 'articles', label: 'mạo từ', correct: 9, attempts: 10 },
      { key: 'tiny', label: 'ít dữ liệu', correct: 0, attempts: 2 },
    ]);
    expect(weak).toHaveLength(2);
    expect(weak[0]?.key).toBe('present-perfect');
    expect(weak[0]?.reasonVi).toContain('48%');
    expect(weak[0]?.reasonVi).toContain('23 câu');
  });
});

describe('recommendations', () => {
  const context: RecommendationContext = {
    dueCount: 24,
    skillScores: { LISTENING: 35, VOCABULARY: 70, GRAMMAR: 65, SPEAKING: 55 },
    completedTodayBySkill: {},
    dailyGoalMinutes: 30,
  };

  const candidates: RecommendationCandidate[] = [
    {
      id: 'review',
      kind: 'review',
      skill: 'VOCABULARY',
      title: 'Ôn tập',
      href: '/vocabulary/review',
      estimatedMinutes: 8,
    },
    {
      id: 'listening-1',
      kind: 'lesson',
      skill: 'LISTENING',
      title: 'At the airport',
      href: '/listening/at-the-airport',
      estimatedMinutes: 10,
      curriculumDistance: 0,
    },
    {
      id: 'grammar-1',
      kind: 'lesson',
      skill: 'GRAMMAR',
      title: 'Present perfect',
      href: '/grammar/present-perfect',
      estimatedMinutes: 12,
      curriculumDistance: 1,
      matchesGoal: true,
    },
    {
      id: 'locked-1',
      kind: 'lesson',
      skill: 'WRITING',
      title: 'Essay',
      href: '/writing/essay',
      estimatedMinutes: 20,
      locked: true,
    },
  ];

  it('puts review first while cards are due', () => {
    const results = recommend(candidates, context);
    expect(results[0]?.id).toBe('review');
    expect(results[0]?.reasonVi).toContain('24 thẻ');
  });

  it('never repeats a skill', () => {
    const results = recommend(candidates, context);
    const skills = results.map((item) => item.skill);
    expect(new Set(skills).size).toBe(skills.length);
  });

  it('explains the weakest skill suggestion', () => {
    const results = recommend(candidates, context);
    const listening = results.find((item) => item.id === 'listening-1');
    expect(listening?.reasonVi).toContain('Nghe');
  });

  it('keeps the plan within the daily goal', () => {
    const results = recommend(candidates, { ...context, dailyGoalMinutes: 15 });
    const total = results.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    expect(total).toBeLessThanOrEqual(15 + 8);
  });

  it('ranks a locked lesson below an available one', () => {
    const locked = candidates.find((item) => item.id === 'locked-1') as RecommendationCandidate;
    const open = { ...locked, id: 'open-1', skill: 'READING' as const, locked: false };
    const results = recommend([locked, open], { ...context, dailyGoalMinutes: 90 }, 2);
    expect(results.map((item) => item.id)).toEqual(['open-1', 'locked-1']);
  });

  it('leaves a locked lesson out of a full plan when better work exists', () => {
    const results = recommend(candidates, context, 4);
    expect(results.map((item) => item.id)).not.toContain('locked-1');
  });

  it('penalises a skill already drilled three times today', () => {
    const tired = recommend(candidates, {
      ...context,
      dueCount: 0,
      completedTodayBySkill: { LISTENING: 3 },
    });
    expect(tired[0]?.id).not.toBe('listening-1');
  });

  it('returns a single primary action, or null when there is nothing to do', () => {
    expect(primaryAction(candidates, context)?.id).toBe('review');
    expect(primaryAction([], context)).toBeNull();
  });
});
