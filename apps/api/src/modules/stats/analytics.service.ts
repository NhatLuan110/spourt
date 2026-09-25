import { Injectable } from '@nestjs/common';
import type { Skill } from '@prisma/client';
import { LOW_CONFIDENCE_THRESHOLD, overallCefr, rankWeakTopics } from '@sprout/scoring';
import {
  PERIOD_DAYS,
  SKILL_LABEL_VI,
  SKILLS,
  addDaysToDayKey,
  zonedParts,
} from '@sprout/shared';
import type {
  AnalyticsQuery,
  AnalyticsResponse,
  DailyPoint,
  MistakeGroup,
  SkillBreakdown,
  StudyHabit,
} from '@sprout/shared';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { StudyDayService, keyFromStatDate, statDateFromKey } from '../gamification/study-day.service';

/**
 * A topic is only worth calling out when the learner is actually getting it
 * wrong. rankWeakTopics returns the lowest-scoring topics whatever their
 * scores, so without this the page would name a topic at 90 percent as a
 * weakness purely because it happened to be the lowest of a strong set.
 */
const WEAK_SPOT_CEILING = 0.7;

/**
 * §7 Analytics — what the learner actually did, and what it says about where
 * they are weak.
 *
 * Everything here is read from rows that already exist: `DailyStat` for the
 * per-day series, `ExerciseAttempt` and `ReviewLog` for accuracy, `MistakeLog`
 * for the error breakdown, `SkillScore` for §9.7. Nothing is stored just to
 * make this page work, so the numbers cannot drift away from the activity that
 * produced them.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studyDay: StudyDayService,
  ) {}

  async build(userId: string, query: AnalyticsQuery): Promise<AnalyticsResponse> {
    const clock = await this.studyDay.clockFor(userId);
    const today = this.studyDay.resolve(clock);
    const days = PERIOD_DAYS[query.period];
    const fromKey = addDaysToDayKey(today.key, -(days - 1));
    const from = statDateFromKey(fromKey);
    const to = statDateFromKey(today.key);
    // The window as real instants, for tables keyed by timestamp rather than day.
    const windowStart = new Date(from.getTime());
    const windowEnd = new Date(to.getTime() + 24 * 60 * 60 * 1000);

    const [stats, progress, scores] = await Promise.all([
      this.prisma.dailyStat.findMany({
        where: { userId, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.userProgress.findUnique({ where: { userId } }),
      this.prisma.skillScore.findMany({ where: { userId } }),
    ]);

    const byKey = new Map(stats.map((row) => [keyFromStatDate(row.date), row]));
    const daily: DailyPoint[] = [];
    for (let offset = 0; offset < days; offset += 1) {
      const key = addDaysToDayKey(fromKey, offset);
      const row = byKey.get(key);
      daily.push({
        date: key,
        xp: row?.xpEarned ?? 0,
        minutes: row?.studyMinutes ?? 0,
        wordsLearned: row?.wordsLearned ?? 0,
        wordsReviewed: row?.wordsReviewed ?? 0,
        accuracy: row?.accuracy ?? null,
      });
    }

    const totals = {
      xp: daily.reduce((sum, point) => sum + point.xp, 0),
      minutes: daily.reduce((sum, point) => sum + point.minutes, 0),
      activeDays: daily.filter((point) => point.xp > 0).length,
      wordsLearned: daily.reduce((sum, point) => sum + point.wordsLearned, 0),
      wordsReviewed: daily.reduce((sum, point) => sum + point.wordsReviewed, 0),
      accuracy: meanAccuracy(daily),
      currentStreak: progress?.currentStreak ?? 0,
      longestStreak: progress?.longestStreak ?? 0,
    };

    const [skills, mistakes, weakSpots, habits] = await Promise.all([
      this.skillBreakdown(userId, scores, windowStart, windowEnd),
      this.mistakeGroups(userId, windowStart, windowEnd),
      this.weakSpots(userId, windowStart, windowEnd),
      this.habits(userId, clock.timeZone, windowStart, windowEnd),
    ]);

    return {
      period: query.period,
      from: fromKey,
      to: today.key,
      totals,
      daily,
      skills,
      overall: overallCefr(
        scores.map((row) => ({ skill: row.skill, score: row.score, confidence: row.confidence })),
      ),
      mistakes,
      weakSpots,
      habits,
      insightsVi: buildInsights(totals, skills, mistakes, habits, days),
    };
  }

  /**
   * The §9.7 score for each skill, plus the accuracy actually observed in the
   * window. A skill with no attempts reports null rather than zero: not
   * practised and practised badly must not look the same.
   */
  private async skillBreakdown(
    userId: string,
    scores: { skill: Skill; score: number; confidence: number; cefrEstimate: string | null }[],
    from: Date,
    to: Date,
  ): Promise<SkillBreakdown[]> {
    const attempts = await this.prisma.exerciseAttempt.findMany({
      where: { userId, attemptedAt: { gte: from, lt: to } },
      select: { score: true, exercise: { select: { skill: true } } },
    });

    const observed = new Map<Skill, { sum: number; count: number }>();
    for (const attempt of attempts) {
      const bucket = observed.get(attempt.exercise.skill) ?? { sum: 0, count: 0 };
      bucket.sum += attempt.score;
      bucket.count += 1;
      observed.set(attempt.exercise.skill, bucket);
    }

    const bySkill = new Map(scores.map((row) => [row.skill, row]));

    return SKILLS.map((skill) => {
      const score = bySkill.get(skill);
      const bucket = observed.get(skill);
      return {
        skill,
        score: score?.score ?? 0,
        cefrEstimate: (score?.cefrEstimate ?? null) as SkillBreakdown['cefrEstimate'],
        confidence: score?.confidence ?? 0,
        lowConfidence: (score?.confidence ?? 0) < LOW_CONFIDENCE_THRESHOLD,
        periodAccuracy: bucket ? Math.round((bucket.sum / bucket.count) * 1000) / 1000 : null,
        attempts: bucket?.count ?? 0,
      };
    });
  }

  /** Mistakes grouped by the category the logging code wrote. */
  private async mistakeGroups(userId: string, from: Date, to: Date): Promise<MistakeGroup[]> {
    const rows = await this.prisma.mistakeLog.findMany({
      where: { userId, occurredAt: { gte: from, lt: to } },
      select: { category: true, skill: true, resolvedAt: true },
    });

    const groups = new Map<string, MistakeGroup>();
    for (const row of rows) {
      const existing = groups.get(row.category) ?? {
        category: row.category,
        labelVi: mistakeLabel(row.category, row.skill),
        skill: row.skill,
        count: 0,
        resolved: 0,
      };
      existing.count += 1;
      if (row.resolvedAt !== null) existing.resolved += 1;
      groups.set(row.category, existing);
    }

    return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }

  /**
   * §9.6 — the topics the learner gets wrong most often, over their vocabulary
   * attempts. `rankWeakTopics` needs at least five attempts on a topic before
   * it will call it weak, which stops one bad day naming a topic.
   */
  private async weakSpots(userId: string, from: Date, to: Date) {
    const attempts = await this.prisma.exerciseAttempt.findMany({
      where: { userId, attemptedAt: { gte: from, lt: to } },
      select: { isCorrect: true, exercise: { select: { tags: true, skill: true } } },
    });

    const buckets = new Map<string, { correct: number; attempts: number }>();
    for (const attempt of attempts) {
      for (const tag of attempt.exercise.tags) {
        // 'test' and a test's own slug are bookkeeping, not topics a learner
        // could go and revise, so they never appear as a weak spot.
        if (tag === 'test' || tag === 'comprehension' || tag === 'dictation') continue;
        const bucket = buckets.get(tag) ?? { correct: 0, attempts: 0 };
        bucket.attempts += 1;
        if (attempt.isCorrect) bucket.correct += 1;
        buckets.set(tag, bucket);
      }
    }

    return rankWeakTopics(
      [...buckets].map(([key, bucket]) => ({
        key,
        label: key.replace(/-/g, ' '),
        correct: bucket.correct,
        attempts: bucket.attempts,
      })),
    ).filter((spot) => spot.accuracy < WEAK_SPOT_CEILING);
  }

  /** Which hour of the day the learner studies, in their own timezone. */
  private async habits(
    userId: string,
    timeZone: string,
    from: Date,
    to: Date,
  ): Promise<StudyHabit[]> {
    const sessions = await this.prisma.studySession.findMany({
      where: { userId, startedAt: { gte: from, lt: to } },
      select: { startedAt: true, durationSec: true },
    });

    const hours = new Map<number, number>();
    for (const session of sessions) {
      const hour = zonedParts(session.startedAt, timeZone).hour;
      hours.set(hour, (hours.get(hour) ?? 0) + session.durationSec);
    }

    return [...hours]
      .map(([hour, seconds]) => ({ hour, minutes: Math.round(seconds / 60) }))
      .filter((entry) => entry.minutes > 0)
      .sort((a, b) => a.hour - b.hour);
  }
}

function meanAccuracy(daily: DailyPoint[]): number | null {
  const measured = daily.filter((point) => point.accuracy !== null);
  if (measured.length === 0) return null;
  const sum = measured.reduce((total, point) => total + (point.accuracy ?? 0), 0);
  return Math.round((sum / measured.length) * 1000) / 1000;
}

/** Turns "grammar-lesson-mcq" into something a learner would recognise. */
function mistakeLabel(category: string, skill: Skill): string {
  const FORMAT_VI: Record<string, string> = {
    mcq: 'trắc nghiệm',
    gap_fill: 'điền vào chỗ trống',
    true_false: 'đúng/sai',
    reorder: 'sắp xếp câu',
    short_answer: 'trả lời ngắn',
    dictation: 'chép chính tả',
    matching: 'nối từ',
    word_form: 'dạng của từ',
  };
  const format = Object.keys(FORMAT_VI).find((key) => category.endsWith(key));
  return format
    ? `${SKILL_LABEL_VI[skill]} · ${FORMAT_VI[format]}`
    : `${SKILL_LABEL_VI[skill]} · ${category}`;
}

/**
 * Plain sentences about what the numbers mean. Deliberately conservative: an
 * insight is only produced when there is enough data to support it, because a
 * confident sentence about three data points is worse than no sentence.
 */
function buildInsights(
  totals: AnalyticsResponse['totals'],
  skills: SkillBreakdown[],
  mistakes: MistakeGroup[],
  habits: StudyHabit[],
  days: number,
): string[] {
  const insights: string[] = [];

  if (totals.activeDays === 0) {
    return ['Chưa có buổi học nào trong khoảng thời gian này.'];
  }

  insights.push(
    `Bạn học ${totals.activeDays}/${days} ngày, tổng ${totals.minutes} phút và ${totals.xp} XP.`,
  );

  const measured = skills.filter((skill) => skill.attempts >= 5);
  if (measured.length >= 2) {
    const sorted = [...measured].sort(
      (a, b) => (a.periodAccuracy ?? 0) - (b.periodAccuracy ?? 0),
    );
    const weakest = sorted[0];
    const strongest = sorted.at(-1);
    if (weakest && strongest && weakest.skill !== strongest.skill) {
      insights.push(
        `${SKILL_LABEL_VI[weakest.skill]} đang là điểm yếu: ${Math.round((weakest.periodAccuracy ?? 0) * 100)}% trên ${weakest.attempts} câu, so với ${Math.round((strongest.periodAccuracy ?? 0) * 100)}% ở ${SKILL_LABEL_VI[strongest.skill]}.`,
      );
    }
  } else if (skills.every((skill) => skill.attempts < 5)) {
    insights.push('Chưa đủ bài làm để so sánh giữa các kỹ năng — cần ít nhất 5 câu mỗi kỹ năng.');
  }

  const worst = mistakes[0];
  if (worst && worst.count >= 3) {
    insights.push(
      `Dạng bài sai nhiều nhất là ${worst.labelVi}: ${worst.count} lỗi trong kỳ này.`,
    );
  }

  const best = [...habits].sort((a, b) => b.minutes - a.minutes)[0];
  if (best && habits.length >= 3) {
    insights.push(
      `Bạn học nhiều nhất vào khoảng ${String(best.hour).padStart(2, '0')}:00 — ${best.minutes} phút.`,
    );
  }

  if (totals.currentStreak >= 3) {
    insights.push(`Chuỗi hiện tại ${totals.currentStreak} ngày, dài nhất từng đạt ${totals.longestStreak} ngày.`);
  }

  return insights;
}
