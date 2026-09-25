import { Injectable } from '@nestjs/common';
import {
  coinsFromXp,
  daysBetweenDayKeys,
  levelFromXp,
  studyDayKey,
  treeStageFromXp,
} from '@sprout/shared';
import type { RewardSummary, XpSource } from '@sprout/shared';
import {
  applyObservation,
  computeXpAward,
  dayCountsForStreak,
  emptySkillScore,
  updateStreak,
  OBSERVATION_WEIGHTS,
} from '@sprout/scoring';
import type { ActivityKind } from '@sprout/scoring';
import type { Skill } from '@prisma/client';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';
import { AchievementsService } from './achievements.service';
import type { UnlockedAchievement } from './achievements.service';
import { StudyDayService } from './study-day.service';
import type { StudyDay } from './study-day.service';

export interface AwardParams {
  userId: string;
  source: XpSource;
  /** Which skill the activity trains, for the daily breakdown and SkillScore. */
  skill?: Skill;
  refType?: string;
  refId?: string;
  /** 0..1, for lesson-style activities. */
  accuracy?: number;
  /** 0..100, for speaking and writing. */
  score?: number;
  isCorrect?: boolean;
  testWeight?: number;
  /** How many identical awards to pay at once, e.g. twenty new words. */
  quantity?: number;
  wordsLearned?: number;
  wordsReviewed?: number;
  studySeconds?: number;
  /** Feeds the §9.7 skill estimate; omit when the activity is not assessable. */
  observationScore?: number;
  now?: Date;
}

/**
 * §9.2 and §9.4 — the single place XP, coins, levels, the tree, the streak, the
 * daily rollup and achievements move. Every feature that rewards the learner
 * calls this, so the rules live in exactly one file.
 */
@Injectable()
export class GamificationService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly studyDay: StudyDayService,
    private readonly achievements: AchievementsService,
  ) {}

  async award(params: AwardParams): Promise<RewardSummary> {
    const now = params.now ?? new Date();
    const { userId } = params;

    const [progress, settings, clock] = await Promise.all([
      this.prisma.userProgress.findUnique({ where: { userId } }),
      this.prisma.userSettings.findUnique({ where: { userId } }),
      this.studyDay.clockFor(userId),
    ]);
    if (!progress || !settings) throw AppException.notFound('Tiến độ');

    const day = this.studyDay.resolve(clock, now);
    const reviewXpToday = await this.reviewXpToday(userId, day);

    const award = computeXpAward({
      source: params.source,
      accuracy: params.accuracy,
      score: params.score,
      isCorrect: params.isCorrect,
      testWeight: params.testWeight,
      streakDays: progress.currentStreak,
      reviewXpToday,
    });

    // Twenty new words in one session is one award of twenty times the base,
    // not twenty separate passes through the achievement engine.
    const quantity = Math.max(1, Math.round(params.quantity ?? 1));
    if (quantity > 1) {
      award.amount *= quantity;
      award.coins = coinsFromXp(award.amount);
    }

    const totalXp = progress.totalXp + award.amount;
    const level = levelFromXp(totalXp);
    const treeStage = treeStageFromXp(totalXp).stage;
    const studyMinutes = Math.round((params.studySeconds ?? 0) / 60);

    await this.prisma.$transaction(async (tx) => {
      if (award.amount > 0) {
        await tx.xpEvent.create({
          data: {
            userId,
            source: params.source,
            amount: award.amount,
            multiplier: award.multiplier,
            refType: params.refType ?? null,
            refId: params.refId ?? null,
            createdAt: now,
          },
        });
      }

      if (award.coins > 0) {
        await tx.coinTransaction.create({
          data: {
            userId,
            amount: award.coins,
            reason: params.source,
            refId: params.refId ?? null,
            createdAt: now,
          },
        });
      }

      await tx.userProgress.update({
        where: { userId },
        data: {
          totalXp,
          level,
          treeStage,
          coins: { increment: award.coins },
          wordsLearned: { increment: params.wordsLearned ?? 0 },
          totalStudyMin: { increment: studyMinutes },
        },
      });
    });

    await this.rollUpDay(params, day, award.amount, studyMinutes, settings.dailyGoalXp);

    const streak = await this.advanceStreak(userId, day, settings.dailyGoalXp);

    if (params.skill && typeof params.observationScore === 'number') {
      await this.observe(userId, params.skill, params.observationScore, params.source);
    }

    const unlocked = await this.achievements.evaluate({
      userId,
      now,
      day,
      daysSinceLastStudyDay: streak.daysSinceLastStudyDay,
    });

    let bonusXp = 0;
    let bonusCoins = 0;
    for (const achievement of unlocked) {
      bonusXp += achievement.xpReward;
      bonusCoins += achievement.coinReward;
    }

    let finalXp = totalXp;
    let finalLevel = level;
    let finalTree = treeStage;

    if (bonusXp > 0 || bonusCoins > 0) {
      finalXp = totalXp + bonusXp;
      finalLevel = levelFromXp(finalXp);
      finalTree = treeStageFromXp(finalXp).stage;
      await this.prisma.$transaction(async (tx) => {
        await tx.xpEvent.create({
          data: {
            userId,
            source: 'ACHIEVEMENT',
            amount: bonusXp,
            refType: 'achievement',
            refId: unlocked.map((item) => item.slug).join(','),
            createdAt: now,
          },
        });
        if (bonusCoins > 0) {
          await tx.coinTransaction.create({
            data: { userId, amount: bonusCoins, reason: 'ACHIEVEMENT', createdAt: now },
          });
        }
        await tx.userProgress.update({
          where: { userId },
          data: {
            totalXp: finalXp,
            level: finalLevel,
            treeStage: finalTree,
            coins: { increment: bonusCoins },
          },
        });
        await tx.dailyStat.update({
          where: { userId_date: { userId, date: day.statDate } },
          data: { xpEarned: { increment: bonusXp } },
        });
      });
    }

    return {
      xpEarned: award.amount + bonusXp,
      coinsEarned: award.coins + bonusCoins,
      totalXp: finalXp,
      level: finalLevel,
      leveledUp: finalLevel > progress.level,
      treeStage: finalTree,
      treeGrew: finalTree > progress.treeStage,
      streak: {
        current: streak.currentStreak,
        longest: streak.longestStreak,
        freezesRemaining: streak.freezesRemaining,
        freezeUsed: streak.freezeUsed,
        milestoneReached: streak.milestoneReached,
      },
      cappedByDailyReviewLimit: award.cappedByDailyReviewLimit,
      achievementsUnlocked: unlocked,
    };
  }

  /** §9.2 — how much review XP the anti-grind ceiling has already absorbed. */
  private async reviewXpToday(userId: string, day: StudyDay): Promise<number> {
    const total = await this.prisma.xpEvent.aggregate({
      where: { userId, source: 'REVIEW', createdAt: { gte: day.start, lt: day.end } },
      _sum: { amount: true },
    });
    return total._sum.amount ?? 0;
  }

  /** §5.8 — keep the daily rollup current so analytics never scans event tables. */
  private async rollUpDay(
    params: AwardParams,
    day: StudyDay,
    xpEarned: number,
    studyMinutes: number,
    dailyGoalXp: number,
  ): Promise<void> {
    const { userId } = params;
    const existing = await this.prisma.dailyStat.findUnique({
      where: { userId_date: { userId, date: day.statDate } },
    });

    const breakdown = { ...((existing?.skillBreakdown ?? {}) as Record<string, number>) };
    if (params.skill && studyMinutes > 0) {
      breakdown[params.skill] = (Number(breakdown[params.skill]) || 0) + studyMinutes;
    }

    const totalXp = (existing?.xpEarned ?? 0) + xpEarned;
    const accuracy = await this.dayAccuracy(userId, day);

    await this.prisma.dailyStat.upsert({
      where: { userId_date: { userId, date: day.statDate } },
      create: {
        userId,
        date: day.statDate,
        xpEarned,
        studyMinutes,
        wordsLearned: params.wordsLearned ?? 0,
        wordsReviewed: params.wordsReviewed ?? 0,
        accuracy,
        skillBreakdown: breakdown,
        goalMet: totalXp >= dailyGoalXp,
      },
      update: {
        xpEarned: { increment: xpEarned },
        studyMinutes: { increment: studyMinutes },
        wordsLearned: { increment: params.wordsLearned ?? 0 },
        wordsReviewed: { increment: params.wordsReviewed ?? 0 },
        accuracy,
        skillBreakdown: breakdown,
        goalMet: totalXp >= dailyGoalXp,
      },
    });
  }

  /**
   * Recomputed rather than averaged incrementally: a running mean would need a
   * denominator the table does not keep, and would drift.
   */
  private async dayAccuracy(userId: string, day: StudyDay): Promise<number | null> {
    const window = { gte: day.start, lt: day.end };
    const [reviews, attempts] = await Promise.all([
      this.prisma.reviewLog.findMany({
        where: { userId, reviewedAt: window },
        select: { grade: true },
      }),
      this.prisma.exerciseAttempt.findMany({
        where: { userId, attemptedAt: window },
        select: { isCorrect: true },
      }),
    ]);

    const total = reviews.length + attempts.length;
    if (total === 0) return null;
    const correct =
      reviews.filter((log) => log.grade > 0).length +
      attempts.filter((attempt) => attempt.isCorrect).length;
    return Math.round((correct / total) * 1000) / 1000;
  }

  /**
   * §9.4 — the streak advances at most once per study day, and only when the
   * day actually qualifies. Crossing midnight does nothing on its own: what
   * matters is the learner's local day key, so a session at 01:00 still belongs
   * to the day before.
   */
  private async advanceStreak(
    userId: string,
    day: StudyDay,
    dailyGoalXp: number,
  ): Promise<{
    currentStreak: number;
    longestStreak: number;
    freezesRemaining: number;
    freezeUsed: boolean;
    milestoneReached: number | null;
    daysSinceLastStudyDay: number | null;
  }> {
    const [progress, today, lessonsToday] = await Promise.all([
      this.prisma.userProgress.findUnique({ where: { userId } }),
      this.prisma.dailyStat.findUnique({
        where: { userId_date: { userId, date: day.statDate } },
      }),
      this.prisma.lessonProgress.count({
        where: { userId, status: 'completed', completedAt: { gte: day.start, lt: day.end } },
      }),
    ]);

    if (!progress) throw AppException.notFound('Tiến độ');

    const lastKey = progress.lastStudyDate
      ? studyDayKey(progress.lastStudyDate, day.timeZone, day.rolloverHour)
      : null;
    const daysSince = lastKey === null ? null : daysBetweenDayKeys(lastKey, day.key);

    const unchanged = {
      currentStreak: progress.currentStreak,
      longestStreak: progress.longestStreak,
      freezesRemaining: progress.streakFreezes,
      freezeUsed: false,
      milestoneReached: null,
      daysSinceLastStudyDay: daysSince,
    };

    // Already counted today.
    if (lastKey === day.key) return unchanged;

    const qualifies = dayCountsForStreak({
      xpEarned: today?.xpEarned ?? 0,
      dailyGoalXp,
      lessonsCompleted: lessonsToday,
      cardsReviewed: today?.wordsReviewed ?? 0,
    });
    if (!qualifies) return unchanged;

    const update = updateStreak({
      currentStreak: progress.currentStreak,
      longestStreak: progress.longestStreak,
      freezesRemaining: progress.streakFreezes,
      // A learner with no history starts a fresh streak of one.
      daysSinceLastStudyDay: daysSince ?? 1,
    });

    await this.prisma.userProgress.update({
      where: { userId },
      data: {
        currentStreak: update.currentStreak,
        longestStreak: update.longestStreak,
        streakFreezes: update.freezesRemaining,
        lastStudyDate: day.start,
        streakLostAt: update.streakBroken ? new Date() : progress.streakLostAt,
        streakRepairedAt: update.freezeUsed ? new Date() : progress.streakRepairedAt,
      },
    });

    return { ...update, daysSinceLastStudyDay: daysSince };
  }

  /**
   * Study time that earned its XP elsewhere — a review session pays per card,
   * so the session only contributes minutes, the skill estimate and any
   * achievement those two unlock.
   */
  async recordStudyTime(params: {
    userId: string;
    skill: Skill;
    seconds: number;
    observationScore?: number;
    now?: Date;
  }): Promise<{ minutes: number; achievementsUnlocked: UnlockedAchievement[] }> {
    const now = params.now ?? new Date();
    const clock = await this.studyDay.clockFor(params.userId);
    const day = this.studyDay.resolve(clock, now);
    const minutes = Math.round(params.seconds / 60);

    if (minutes > 0) {
      const existing = await this.prisma.dailyStat.findUnique({
        where: { userId_date: { userId: params.userId, date: day.statDate } },
      });
      const breakdown = { ...((existing?.skillBreakdown ?? {}) as Record<string, number>) };
      breakdown[params.skill] = (Number(breakdown[params.skill]) || 0) + minutes;

      await this.prisma.$transaction([
        this.prisma.dailyStat.upsert({
          where: { userId_date: { userId: params.userId, date: day.statDate } },
          create: {
            userId: params.userId,
            date: day.statDate,
            studyMinutes: minutes,
            skillBreakdown: breakdown,
          },
          update: { studyMinutes: { increment: minutes }, skillBreakdown: breakdown },
        }),
        this.prisma.userProgress.update({
          where: { userId: params.userId },
          data: { totalStudyMin: { increment: minutes } },
        }),
      ]);
    }

    if (typeof params.observationScore === 'number') {
      await this.observe(params.userId, params.skill, params.observationScore, 'REVIEW');
    }

    const achievementsUnlocked = await this.achievements.evaluate({
      userId: params.userId,
      now,
      day,
      daysSinceLastStudyDay: null,
    });

    return { minutes, achievementsUnlocked };
  }

  /** §9.7 — fold one assessed activity into the running skill estimate. */
  async observe(
    userId: string,
    skill: Skill,
    score: number,
    source: XpSource,
  ): Promise<void> {
    const kind = OBSERVATION_KIND[source] ?? 'exercise';
    const weight = OBSERVATION_WEIGHTS[kind];

    const [existing, recentWeight] = await Promise.all([
      this.prisma.skillScore.findUnique({ where: { userId_skill: { userId, skill } } }),
      this.recentObservationWeight(userId, skill),
    ]);

    const current = existing
      ? {
          score: existing.score,
          confidence: existing.confidence,
          observations: existing.observations,
          cefrEstimate: existing.cefrEstimate,
        }
      : emptySkillScore();

    const update = applyObservation(
      current,
      { normalizedScore: score, weight },
      recentWeight,
    );

    await this.prisma.skillScore.upsert({
      where: { userId_skill: { userId, skill } },
      create: {
        userId,
        skill,
        score: update.score,
        confidence: update.confidence,
        observations: update.observations,
        cefrEstimate: update.cefrEstimate,
      },
      update: {
        score: update.score,
        confidence: update.confidence,
        observations: update.observations,
        cefrEstimate: update.cefrEstimate,
      },
    });
  }

  /**
   * §9.7 — confidence comes from how much assessed work the last 30 days hold,
   * weighted by how much each activity kind tells us about the skill.
   */
  private async recentObservationWeight(userId: string, skill: Skill): Promise<number> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [tests, lessons, exercises, reviews] = await Promise.all([
      this.prisma.testAttempt.count({ where: { userId, submittedAt: { gte: since } } }),
      this.prisma.lessonProgress.count({
        where: { userId, status: 'completed', completedAt: { gte: since }, lesson: { skill } },
      }),
      this.prisma.exerciseAttempt.count({
        where: { userId, attemptedAt: { gte: since }, exercise: { skill } },
      }),
      skill === 'VOCABULARY'
        ? this.prisma.reviewLog.count({ where: { userId, reviewedAt: { gte: since } } })
        : Promise.resolve(0),
    ]);

    return (
      tests * OBSERVATION_WEIGHTS.test +
      lessons * OBSERVATION_WEIGHTS.lesson +
      exercises * OBSERVATION_WEIGHTS.exercise +
      reviews * OBSERVATION_WEIGHTS.flashcard
    );
  }
}

/** Which §9.7 weight class each XP source belongs to. */
const OBSERVATION_KIND: Partial<Record<XpSource, ActivityKind>> = {
  TEST: 'test',
  LESSON: 'lesson',
  READING: 'lesson',
  LISTENING: 'lesson',
  WRITING: 'lesson',
  SPEAKING: 'exercise',
  QUIZ: 'exercise',
  REVIEW: 'flashcard',
  NEW_WORD: 'flashcard',
};
