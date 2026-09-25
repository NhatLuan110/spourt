import { Injectable } from '@nestjs/common';
import {
  TREE_STAGES,
  daysBetweenDayKeys,
  levelProgress,
  studyDayKey,
  treeHealth,
  treeStageFromXp,
  zonedParts,
} from '@sprout/shared';
import type { DashboardResponse, SkillScoreView } from '@sprout/shared';
import { LOW_CONFIDENCE_THRESHOLD, overallCefr, recommend } from '@sprout/scoring';
import type { RecommendationCandidate } from '@sprout/scoring';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';
import { StudyDayService, keyFromStatDate } from '../gamification/study-day.service';

/** §7.2 — one request builds the whole dashboard. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studyDay: StudyDayService,
  ) {}

  async build(userId: string, now = new Date()): Promise<DashboardResponse> {
    const clock = await this.studyDay.clockFor(userId);
    const day = this.studyDay.resolve(clock, now);

    const [progress, settings, today, dueNow, learningCount, masteredCount] = await Promise.all([
      this.prisma.userProgress.findUnique({ where: { userId } }),
      this.prisma.userSettings.findUnique({ where: { userId } }),
      this.prisma.dailyStat.findUnique({
        where: { userId_date: { userId, date: day.statDate } },
      }),
      this.prisma.userWord.count({
        where: { userId, dueAt: { lte: now }, state: { notIn: ['NEW', 'SUSPENDED'] } },
      }),
      this.prisma.userWord.count({
        where: { userId, state: { in: ['NEW', 'LEARNING', 'RELEARNING', 'REVIEW'] } },
      }),
      this.prisma.userWord.count({ where: { userId, state: 'MASTERED' } }),
    ]);

    if (!progress || !settings) throw AppException.notFound('Tiến độ');

    const introducedToday = await this.prisma.userWord.count({
      where: { userId, createdAt: { gte: day.start, lt: day.end } },
    });
    const untouched = await this.prisma.word.count({ where: { userWords: { none: { userId } } } });
    const newAvailable = Math.min(
      untouched,
      Math.max(0, settings.newWordsPerDay - introducedToday),
    );

    const lastKey = progress.lastStudyDate
      ? studyDayKey(progress.lastStudyDate, day.timeZone, day.rolloverHour)
      : null;
    const daysSinceStudy = lastKey === null ? 0 : daysBetweenDayKeys(lastKey, day.key);

    const tree = treeStageFromXp(progress.totalXp);
    const [achievementCount, recentAchievements, week, skillScores] = await Promise.all([
      this.prisma.userAchievement.count({ where: { userId } }),
      this.prisma.userAchievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
        take: 3,
        include: { achievement: true },
      }),
      this.weekOf(userId, day.statDate),
      this.prisma.skillScore.findMany({ where: { userId } }),
    ]);

    const scoreMap = Object.fromEntries(
      skillScores.map((row) => [row.skill, row.score]),
    ) as Partial<Record<(typeof skillScores)[number]['skill'], number>>;

    const candidates = this.candidates(dueNow, newAvailable);
    const recommendations = recommend(candidates, {
      dueCount: dueNow,
      skillScores: scoreMap,
      completedTodayBySkill: {},
      dailyGoalMinutes: settings.dailyGoalMinutes,
    });

    return {
      greetingHour: zonedParts(now, day.timeZone).hour,
      progress: {
        totalXp: progress.totalXp,
        coins: progress.coins,
        level: levelProgress(progress.totalXp),
        currentStreak: progress.currentStreak,
        longestStreak: progress.longestStreak,
        streakFreezes: progress.streakFreezes,
        wordsLearned: progress.wordsLearned,
      },
      tree: {
        stage: tree.stage,
        key: tree.key,
        nameVi: tree.nameVi,
        emoji: tree.emoji,
        health: treeHealth(daysSinceStudy),
        nextStageXp: TREE_STAGES.find((stage) => stage.minXp > progress.totalXp)?.minXp ?? null,
        // §3.4 — one flower per achievement, one bird per full week of streak.
        flowers: achievementCount,
        birds: Math.floor(progress.currentStreak / 7),
      },
      today: {
        dayKey: day.key,
        xpEarned: today?.xpEarned ?? 0,
        goalXp: settings.dailyGoalXp,
        goalMet: today?.goalMet ?? false,
        studyMinutes: today?.studyMinutes ?? 0,
        wordsLearned: today?.wordsLearned ?? 0,
        wordsReviewed: today?.wordsReviewed ?? 0,
        accuracy: today?.accuracy ?? null,
      },
      srs: {
        dueNow,
        newAvailable,
        backlogWarning: dueNow > 2 * settings.maxReviewsPerDay,
        learningCount,
        masteredCount,
      },
      recommendations: recommendations.map((item) => ({
        id: item.id,
        kind: item.kind,
        titleVi: item.title,
        reasonVi: item.reasonVi,
        href: item.href,
        score: Math.round(item.score),
      })),
      week,
      recentAchievements: recentAchievements.map((row) => ({
        slug: row.achievement.slug,
        nameVi: row.achievement.nameVi,
        icon: row.achievement.icon,
        tier: row.achievement.tier,
        unlockedAt: row.unlockedAt.toISOString(),
      })),
    };
  }

  /**
   * §9.6 — what the learner could do right now. Only actions that actually
   * exist are offered: an empty review queue produces no review card.
   */
  private candidates(dueNow: number, newAvailable: number): RecommendationCandidate[] {
    const list: RecommendationCandidate[] = [];

    if (dueNow > 0) {
      list.push({
        id: 'review',
        kind: 'review',
        skill: 'VOCABULARY',
        title: `Ôn ${dueNow} thẻ đến hạn`,
        href: '/review',
        estimatedMinutes: Math.max(3, Math.round(dueNow / 6)),
      });
    }

    if (newAvailable > 0) {
      list.push({
        id: 'learn',
        kind: 'drill',
        skill: 'VOCABULARY',
        title: `Học ${newAvailable} từ mới`,
        href: '/learn',
        estimatedMinutes: Math.max(3, Math.round(newAvailable / 3)),
        matchesGoal: true,
      });
    }

    list.push({
      id: 'word-class',
      kind: 'drill',
      skill: 'GRAMMAR',
      title: 'Luyện word form',
      href: '/word-class',
      estimatedMinutes: 5,
    });

    return list;
  }

  /** The last seven study days, oldest first, gaps filled with real zeros. */
  private async weekOf(userId: string, statDate: Date) {
    const from = new Date(statDate.getTime() - 6 * 86_400_000);
    const rows = await this.prisma.dailyStat.findMany({
      where: { userId, date: { gte: from, lte: statDate } },
    });
    const byKey = new Map(rows.map((row) => [keyFromStatDate(row.date), row]));

    return Array.from({ length: 7 }, (_unused, index) => {
      const key = keyFromStatDate(new Date(from.getTime() + index * 86_400_000));
      const row = byKey.get(key);
      return {
        dayKey: key,
        xpEarned: row?.xpEarned ?? 0,
        goalMet: row?.goalMet ?? false,
        minutes: row?.studyMinutes ?? 0,
      };
    });
  }

  /** §9.7 — the six skill bars, with provisional ones marked as such. */
  async skills(userId: string): Promise<{ skills: SkillScoreView[]; overall: { score: number; cefr: string } }> {
    const rows = await this.prisma.skillScore.findMany({ where: { userId } });

    return {
      skills: rows.map((row) => ({
        skill: row.skill,
        score: row.score,
        confidence: row.confidence,
        cefrEstimate: row.cefrEstimate,
        observations: row.observations,
        lowConfidence: row.confidence < LOW_CONFIDENCE_THRESHOLD,
      })),
      overall: overallCefr(
        rows.map((row) => ({ skill: row.skill, score: row.score, confidence: row.confidence })),
      ),
    };
  }
}
