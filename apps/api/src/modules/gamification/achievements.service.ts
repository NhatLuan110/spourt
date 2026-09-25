import { Injectable, Logger } from '@nestjs/common';
import { SKILLS, compareCefr, zonedParts } from '@sprout/shared';
import type { AchievementView } from '@sprout/shared';
import { overallCefr } from '@sprout/scoring';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import type { StudyDay } from './study-day.service';

export interface AchievementContext {
  userId: string;
  now: Date;
  day: StudyDay;
  /** Whole study days between the previous counted day and today, if known. */
  daysSinceLastStudyDay: number | null;
}

export interface UnlockedAchievement {
  slug: string;
  nameVi: string;
  icon: string;
  tier: string;
  xpReward: number;
  coinReward: number;
}

/**
 * §12.3 — the achievement engine. Every condition is answered by a real query;
 * conditions that describe content built in a later phase simply return zero
 * today and start counting the moment that content exists.
 */
@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check every locked achievement and record the ones that now hold.
   * Returns what was unlocked so the caller can pay out the reward once.
   */
  async evaluate(context: AchievementContext): Promise<UnlockedAchievement[]> {
    const [all, owned] = await Promise.all([
      this.prisma.achievement.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.userAchievement.findMany({
        where: { userId: context.userId },
        select: { achievementId: true },
      }),
    ]);

    const ownedIds = new Set(owned.map((row) => row.achievementId));
    const locked = all.filter((achievement) => !ownedIds.has(achievement.id));
    if (locked.length === 0) return [];

    const metrics = new MetricCache(this.prisma, context);
    const unlocked: UnlockedAchievement[] = [];

    for (const achievement of locked) {
      const condition = achievement.condition as Record<string, unknown> | null;
      if (!condition || typeof condition.type !== 'string') {
        this.logger.warn(`Achievement ${achievement.slug} has no readable condition`);
        continue;
      }

      let holds = false;
      try {
        holds = await metrics.satisfied(condition as unknown as Condition);
      } catch (error) {
        this.logger.error(
          `Could not evaluate ${achievement.slug}: ${(error as Error).message}`,
        );
        continue;
      }
      if (!holds) continue;

      // A concurrent request may have unlocked the same badge; the compound
      // primary key makes the second insert a no-op rather than a duplicate.
      const created = await this.prisma.userAchievement.createMany({
        data: [{ userId: context.userId, achievementId: achievement.id }],
        skipDuplicates: true,
      });
      if (created.count === 0) continue;

      unlocked.push({
        slug: achievement.slug,
        nameVi: achievement.nameVi,
        icon: achievement.icon,
        tier: achievement.tier,
        xpReward: achievement.xpReward,
        coinReward: achievement.coinReward,
      });
    }

    return unlocked;
  }

  /** §7.11 — the trophy shelf: every badge, locked ones included. */
  async list(userId: string): Promise<AchievementView[]> {
    const [all, owned, progress, wordsLearned] = await Promise.all([
      this.prisma.achievement.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.userAchievement.findMany({ where: { userId } }),
      this.prisma.userProgress.findUnique({ where: { userId } }),
      this.prisma.userWord.count({ where: { userId } }),
    ]);

    const unlockedAt = new Map(owned.map((row) => [row.achievementId, row.unlockedAt]));

    return all.map((achievement) => {
      const condition = (achievement.condition ?? {}) as { type?: string; value?: number };
      const unlocked = unlockedAt.get(achievement.id) ?? null;

      // Only the two counters we already hold can show a live progress bar;
      // the rest stay null rather than showing an invented percentage.
      let progressPct: number | null = null;
      if (!unlocked && typeof condition.value === 'number' && condition.value > 0) {
        if (condition.type === 'streak') {
          progressPct = Math.min(
            100,
            Math.round(((progress?.currentStreak ?? 0) / condition.value) * 100),
          );
        } else if (condition.type === 'words_learned') {
          progressPct = Math.min(100, Math.round((wordsLearned / condition.value) * 100));
        }
      }

      return {
        slug: achievement.slug,
        nameVi: achievement.nameVi,
        descriptionVi: achievement.descriptionVi,
        icon: achievement.icon,
        tier: achievement.tier,
        xpReward: achievement.xpReward,
        coinReward: achievement.coinReward,
        isSecret: achievement.isSecret,
        unlockedAt: unlocked ? unlocked.toISOString() : null,
        progressPct: unlocked ? 100 : progressPct,
      };
    });
  }
}

interface Condition {
  type: string;
  value?: number | string;
  count?: number;
  level?: string;
  kind?: string;
  phoneme?: string;
}

/**
 * Answers one condition at a time, remembering each metric it computes so a
 * single evaluation pass never runs the same query twice.
 */
class MetricCache {
  private readonly cache = new Map<string, Promise<number>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AchievementContext,
  ) {}

  async satisfied(condition: Condition): Promise<boolean> {
    const target = typeof condition.value === 'number' ? condition.value : 1;

    switch (condition.type) {
      case 'streak':
        return (await this.metric('streak', () => this.currentStreak())) >= target;
      case 'words_learned':
        return (await this.metric('words_learned', () => this.wordsLearned())) >= target;
      case 'review_sessions':
        return (await this.metric('review_sessions', () => this.reviewSessions())) >= target;
      case 'easy_streak':
        return (await this.metric('easy_streak', () => this.easyStreak())) >= target;
      case 'topic_mastered':
        return (await this.metric('topic_mastered', () => this.topicsMastered())) >= target;
      case 'lessons_completed':
        return (await this.metric('lessons', () => this.lessonsCompleted())) >= target;
      case 'listening_lessons':
        return (
          (await this.metric('lessons_LISTENING', () => this.lessonsCompleted('LISTENING'))) >=
          target
        );
      case 'reading_lessons':
        return (
          (await this.metric('lessons_READING', () => this.lessonsCompleted('READING'))) >= target
        );
      case 'grammar_level_complete':
        return this.grammarLevelComplete(String(condition.level ?? 'A1'));
      case 'dictation_above':
        return (
          (await this.metric(`dictation_${target}`, () => this.dictationsAbove(target))) >=
          (condition.count ?? 1)
        );
      case 'listening_slow_speed':
        return (await this.metric('slow_listening', () => this.slowListening())) >= target;
      case 'speaking_attempts':
        return (await this.metric('speaking', () => this.speakingAttempts())) >= target;
      case 'speaking_above':
        return (
          (await this.metric(`speaking_${target}`, () => this.speakingAbove(target))) >=
          (condition.count ?? 1)
        );
      case 'roleplay_sessions':
        return (await this.metric('roleplay', () => this.roleplaySessions())) >= target;
      case 'phoneme_streak':
        return (
          (await this.metric(`phoneme_${condition.phoneme}`, () =>
            this.phonemeStreak(String(condition.phoneme ?? '')),
          )) >= target
        );
      case 'writing_submissions':
        return (await this.metric('writing', () => this.writingSubmissions())) >= target;
      case 'writing_above':
        return (
          (await this.metric(`writing_${target}`, () => this.writingAbove(target))) >=
          (condition.count ?? 1)
        );
      case 'writing_kind':
        return (
          (await this.metric(`writing_kind_${condition.kind}`, () =>
            this.writingOfKind(String(condition.kind ?? '')),
          )) >= target
        );
      case 'mistakes_resolved':
        return (await this.metric('mistakes', () => this.mistakesResolved())) >= target;
      case 'all_skills_one_day':
        return (await this.metric('all_skills', () => this.allSkillsInOneDay())) >= target;
      case 'placement_completed':
        return (await this.metric('placement', () => this.placementAttempts())) >= target;
      case 'cefr_increased':
        return this.cefrIncreased();
      case 'study_hour_after':
        return this.studiedInSmallHours(target);
      case 'study_hour_before':
        return this.studiedBeforeHour(target);
      case 'streak_no_freeze':
        return this.streakWithoutFreeze(target);
      case 'return_after_days':
        return (this.context.daysSinceLastStudyDay ?? 0) >= target;
      default:
        return false;
    }
  }

  private metric(key: string, compute: () => Promise<number>): Promise<number> {
    const existing = this.cache.get(key);
    if (existing) return existing;
    const pending = compute();
    this.cache.set(key, pending);
    return pending;
  }

  // --- metrics -------------------------------------------------------------

  private async currentStreak(): Promise<number> {
    const progress = await this.prisma.userProgress.findUnique({
      where: { userId: this.context.userId },
      select: { currentStreak: true },
    });
    return progress?.currentStreak ?? 0;
  }

  /** Every word in the collection, matching the UserProgress.wordsLearned counter. */
  private async wordsLearned(): Promise<number> {
    return this.prisma.userWord.count({ where: { userId: this.context.userId } });
  }

  /** A session counts once it has ended with at least one card answered. */
  private async reviewSessions(): Promise<number> {
    return this.prisma.studySession.count({
      where: {
        userId: this.context.userId,
        skill: 'VOCABULARY',
        endedAt: { not: null },
        itemsCompleted: { gt: 0 },
      },
    });
  }

  /** The run of Easy grades ending at the most recent review. */
  private async easyStreak(): Promise<number> {
    const recent = await this.prisma.reviewLog.findMany({
      where: { userId: this.context.userId },
      orderBy: { reviewedAt: 'desc' },
      take: 200,
      select: { grade: true },
    });
    let run = 0;
    for (const log of recent) {
      if (log.grade !== 3) break;
      run += 1;
    }
    return run;
  }

  /** A topic is mastered when every one of its words is MASTERED for this user. */
  private async topicsMastered(): Promise<number> {
    const topics = await this.prisma.topic.findMany({
      where: { parentId: null },
      select: { id: true, _count: { select: { words: true } } },
    });

    let mastered = 0;
    for (const topic of topics) {
      if (topic._count.words === 0) continue;
      const count = await this.prisma.userWord.count({
        where: {
          userId: this.context.userId,
          state: 'MASTERED',
          word: { topics: { some: { id: topic.id } } },
        },
      });
      if (count >= topic._count.words) mastered += 1;
    }
    return mastered;
  }

  private async lessonsCompleted(skill?: string): Promise<number> {
    return this.prisma.lessonProgress.count({
      where: {
        userId: this.context.userId,
        status: 'completed',
        ...(skill ? { lesson: { skill: skill as never } } : {}),
      },
    });
  }

  private async grammarLevelComplete(level: string): Promise<boolean> {
    const total = await this.prisma.lesson.count({
      where: { skill: 'GRAMMAR', cefr: level as never, isPublished: true },
    });
    if (total === 0) return false;
    const done = await this.prisma.lessonProgress.count({
      where: {
        userId: this.context.userId,
        status: 'completed',
        lesson: { skill: 'GRAMMAR', cefr: level as never, isPublished: true },
      },
    });
    return done >= total;
  }

  private async dictationsAbove(minScore: number): Promise<number> {
    return this.prisma.exerciseAttempt.count({
      where: {
        userId: this.context.userId,
        score: { gte: minScore },
        exercise: { type: 'DICTATION' },
      },
    });
  }

  /**
   * The listening player records the playback rate it was using inside the
   * attempt payload, so "finished a lesson at 0.75x" is a real query.
   */
  private async slowListening(): Promise<number> {
    return this.prisma.exerciseAttempt.count({
      where: {
        userId: this.context.userId,
        isCorrect: true,
        exercise: { skill: 'LISTENING' },
        userAnswer: { path: ['playbackRate'], lte: 0.75 },
      },
    });
  }

  private async speakingAttempts(): Promise<number> {
    return this.prisma.speakingAttempt.count({ where: { userId: this.context.userId } });
  }

  private async speakingAbove(minScore: number): Promise<number> {
    return this.prisma.speakingAttempt.count({
      where: { userId: this.context.userId, overallScore: { gte: minScore } },
    });
  }

  private async roleplaySessions(): Promise<number> {
    return this.prisma.aiConversation.count({
      where: { userId: this.context.userId, kind: 'roleplay' },
    });
  }

  /**
   * How many recent speaking attempts in a row contained the phoneme and were
   * not flagged for it. `PronunciationIssue` keeps running totals rather than
   * per-attempt rows, so the streak is measured from the attempts themselves:
   * the run ends at the last attempt whose word scores flagged that phoneme.
   */
  private async phonemeStreak(phoneme: string): Promise<number> {
    if (!phoneme) return 0;
    const attempts = await this.prisma.speakingAttempt.findMany({
      where: { userId: this.context.userId, status: 'scored' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { wordScores: true },
    });

    let run = 0;
    for (const attempt of attempts) {
      const words = Array.isArray(attempt.wordScores) ? attempt.wordScores : [];
      let contained = false;
      let failed = false;
      for (const entry of words) {
        const phonemes = (entry as { phonemes?: { p?: string; score?: number }[] }).phonemes ?? [];
        for (const item of phonemes) {
          if (item.p !== phoneme) continue;
          contained = true;
          if ((item.score ?? 100) < 60) failed = true;
        }
      }
      if (!contained) continue;
      if (failed) break;
      run += 1;
    }
    return run;
  }

  private async writingSubmissions(): Promise<number> {
    return this.prisma.writingSubmission.count({
      where: { userId: this.context.userId, status: 'graded' },
    });
  }

  private async writingAbove(minScore: number): Promise<number> {
    return this.prisma.writingSubmission.count({
      where: { userId: this.context.userId, overallScore: { gte: minScore } },
    });
  }

  private async writingOfKind(kind: string): Promise<number> {
    if (!kind) return 0;
    return this.prisma.writingSubmission.count({
      where: { userId: this.context.userId, status: 'graded', prompt: { kind } },
    });
  }

  private async mistakesResolved(): Promise<number> {
    return this.prisma.mistakeLog.count({
      where: { userId: this.context.userId, resolvedAt: { not: null } },
    });
  }

  /** One calendar day whose skill breakdown records minutes for all six skills. */
  private async allSkillsInOneDay(): Promise<number> {
    const days = await this.prisma.dailyStat.findMany({
      where: { userId: this.context.userId },
      select: { skillBreakdown: true },
      orderBy: { date: 'desc' },
      take: 400,
    });

    return days.filter((day) => {
      const breakdown = (day.skillBreakdown ?? {}) as Record<string, unknown>;
      return SKILLS.every((skill) => Number(breakdown[skill] ?? 0) > 0);
    }).length;
  }

  private async placementAttempts(): Promise<number> {
    return this.prisma.testAttempt.count({
      where: {
        userId: this.context.userId,
        submittedAt: { not: null },
        test: { kind: 'placement' },
      },
    });
  }

  /**
   * The measured level has passed the level the learner started from.
   *
   * One strong session in one skill is not a CEFR jump: the estimate only
   * counts once at least three skills have been measured with real confidence,
   * because §9.7 blends the mean with the weakest skill and a single number
   * would otherwise be both the mean and the weakest.
   */
  private async cefrIncreased(): Promise<boolean> {
    const [profile, scores] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId: this.context.userId },
        select: { currentLevel: true },
      }),
      this.prisma.skillScore.findMany({
        where: { userId: this.context.userId },
        select: { skill: true, score: true, confidence: true },
      }),
    ]);

    if (!profile) return false;
    const confident = scores.filter((row) => row.confidence >= 0.3);
    if (confident.length < 3) return false;

    const measured = overallCefr(
      confident.map((row) => ({ skill: row.skill, score: row.score, confidence: row.confidence })),
    );
    return compareCefr(measured.cefr, profile.currentLevel) > 0;
  }

  /** Between midnight and the day rollover — the hours that feel like "late". */
  private studiedInSmallHours(fromHour: number): boolean {
    const hour = this.localHour();
    return hour >= fromHour && hour < this.context.day.rolloverHour;
  }

  private studiedBeforeHour(beforeHour: number): boolean {
    const hour = this.localHour();
    return hour >= this.context.day.rolloverHour && hour < beforeHour;
  }

  private localHour(): number {
    return zonedParts(this.context.now, this.context.day.timeZone).hour;
  }

  /** A clean run: long enough, and no freeze spent inside it. */
  private async streakWithoutFreeze(days: number): Promise<boolean> {
    const progress = await this.prisma.userProgress.findUnique({
      where: { userId: this.context.userId },
      select: { currentStreak: true, streakRepairedAt: true },
    });
    if (!progress || progress.currentStreak < days) return false;
    if (!progress.streakRepairedAt) return true;

    const streakStart = new Date(
      this.context.day.start.getTime() - (progress.currentStreak - 1) * 86_400_000,
    );
    return progress.streakRepairedAt.getTime() < streakStart.getTime();
  }
}
