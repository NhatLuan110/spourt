import { Injectable } from '@nestjs/common';
import { GRADE_LABEL_VI, formatIntervalVi } from '@sprout/shared';
import type {
  SrsBulkReviewInput,
  SrsQueueCard,
  SrsQueueQuery,
  SrsReviewInput,
  SrsReviewResult,
} from '@sprout/shared';
import { buildQueue, forecast, isMastered, previewIntervals, review } from '@sprout/srs';
import type { QueueCandidate, ReviewGrade, SrsCard } from '@sprout/srs';
import type { Prisma, UserWord } from '@prisma/client';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';
import { GamificationService } from '../gamification/gamification.service';
import { StudyDayService } from '../gamification/study-day.service';
import type { StudyDay } from '../gamification/study-day.service';

const CARD_INCLUDE = {
  word: {
    include: {
      senses: {
        orderBy: { order: 'asc' },
        take: 2,
        include: {
          examples: { take: 2, orderBy: { id: 'asc' } },
          relations: {
            where: { kind: 'synonym' },
            include: { toSense: { include: { word: { select: { lemma: true } } } } },
          },
        },
      },
    },
  },
} satisfies Prisma.UserWordInclude;

type CardRow = Prisma.UserWordGetPayload<{ include: typeof CARD_INCLUDE }>;

/** §9.1 — the review queue, grading, forecast and statistics. */
@Injectable()
export class SrsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
    private readonly studyDay: StudyDayService,
  ) {}

  /**
   * §9.1 — due cards first, one new card after every four reviews, both capped
   * by what the learner has already done today so the daily limits mean
   * something across several sessions.
   */
  async queue(userId: string, query: SrsQueueQuery, now = new Date()): Promise<{
    items: SrsQueueCard[];
    meta: {
      dueCount: number;
      newCount: number;
      totalDueAvailable: number;
      backlogWarning: boolean;
      reviewsDoneToday: number;
      newIntroducedToday: number;
    };
  }> {
    const clock = await this.studyDay.clockFor(userId);
    const day = this.studyDay.resolve(clock, now);
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) throw AppException.notFound('Cài đặt');
    const wordFilter: Prisma.WordWhereInput = {};
    if (query.topicSlug) wordFilter.topics = { some: { slug: query.topicSlug } };
    if (query.deckId) wordFilter.deckItems = { some: { deckId: query.deckId } };

    const where: Prisma.UserWordWhereInput = { userId };
    if (Object.keys(wordFilter).length > 0) where.word = wordFilter;

    const [rows, reviewsDoneToday, newIntroducedToday] = await Promise.all([
      this.prisma.userWord.findMany({
        where: { ...where, state: { not: 'SUSPENDED' } },
        include: CARD_INCLUDE,
        // Enough to fill any queue without loading a whole collection.
        take: 600,
        orderBy: { dueAt: 'asc' },
      }),
      this.prisma.reviewLog.count({
        where: { userId, reviewedAt: { gte: day.start, lt: day.end }, prevState: { not: 'NEW' } },
      }),
      this.prisma.reviewLog.count({
        where: { userId, reviewedAt: { gte: day.start, lt: day.end }, prevState: 'NEW' },
      }),
    ]);

    const candidates: QueueCandidate[] = rows.map((row) => ({
      userWordId: row.id,
      wordId: row.wordId,
      dueAt: row.dueAt,
      state: row.state,
      frequencyRank: row.word.frequencyRank,
      inActiveTopic: Boolean(query.topicSlug),
    }));

    const result = buildQueue({
      candidates,
      dueBefore: now,
      options: {
        maxReviewsPerDay: Math.max(0, settings.maxReviewsPerDay - reviewsDoneToday),
        newWordsPerDay: Math.max(0, settings.newWordsPerDay - newIntroducedToday),
        limit: query.limit,
      },
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    const cards = result.cards
      .map((candidate) => byId.get(candidate.userWordId))
      .filter((row): row is CardRow => Boolean(row))
      .map((row) => this.toQueueCard(row, day, now));

    return {
      items: cards,
      meta: {
        dueCount: result.dueCount,
        newCount: result.newCount,
        totalDueAvailable: result.totalDueAvailable,
        backlogWarning: result.backlogWarning,
        reviewsDoneToday,
        newIntroducedToday,
      },
    };
  }

  private toQueueCard(row: CardRow, day: StudyDay, now: Date): SrsQueueCard {
    const card = toSrsCard(row);
    const preview = previewIntervals(card, {
      now,
      timeZone: day.timeZone,
      dayRolloverHour: day.rolloverHour,
    });

    return {
      userWordId: row.id,
      wordId: row.wordId,
      lemma: row.word.lemma,
      slug: row.word.slug,
      ipaUs: row.word.ipaUs,
      ipaUk: row.word.ipaUk,
      audioUsUrl: row.word.audioUsUrl,
      audioUkUrl: row.word.audioUkUrl,
      state: row.state,
      isNew: row.state === 'NEW',
      dueAt: row.dueAt.toISOString(),
      intervalDays: row.intervalDays,
      senses: row.word.senses.map((sense) => ({
        pos: sense.pos,
        definitionVi: sense.definitionVi,
        definitionEn: sense.definitionEn,
        examples: sense.examples.map((example) => ({
          textEn: example.textEn,
          textVi: example.textVi,
          highlightStart: example.highlightStart,
          highlightEnd: example.highlightEnd,
        })),
      })),
      synonyms: [
        ...new Set(
          row.word.senses.flatMap((sense) =>
            sense.relations.map((relation) => relation.toSense.word.lemma),
          ),
        ),
      ],
      intervalPreview: {
        '0': preview[0],
        '1': preview[1],
        '2': preview[2],
        '3': preview[3],
      },
    };
  }

  /**
   * §9.1 — grade one card. The scheduler is pure, so this method only reads the
   * card, asks the package where it goes next, and writes both the new state
   * and the audit row the analytics screens read.
   */
  async review(
    userId: string,
    input: SrsReviewInput,
    now = new Date(),
  ): Promise<SrsReviewResult & { reward: Awaited<ReturnType<GamificationService['award']>> }> {
    const clock = await this.studyDay.clockFor(userId);
    const day = this.studyDay.resolve(clock, now);

    const row = await this.prisma.userWord.findUnique({
      where: { id: input.userWordId },
      include: { word: { select: { lemma: true } } },
    });
    if (!row || row.userId !== userId) throw AppException.notFound('Thẻ ôn tập');

    const outcome = review(toSrsCard(row), input.grade as ReviewGrade, {
      now,
      timeZone: day.timeZone,
      dayRolloverHour: day.rolloverHour,
    });

    const mastered = isMastered(outcome.card);
    const nextState = mastered ? 'MASTERED' : outcome.card.state;

    await this.prisma.$transaction([
      this.prisma.userWord.update({
        where: { id: row.id },
        data: {
          state: nextState,
          ease: outcome.card.ease,
          intervalDays: outcome.card.intervalDays,
          repetitions: outcome.card.repetitions,
          lapses: outcome.card.lapses,
          learningStep: outcome.card.learningStep,
          totalReviews: outcome.card.totalReviews,
          correctReviews: outcome.card.correctReviews,
          dueAt: outcome.dueAt,
          lastReviewedAt: now,
        },
      }),
      this.prisma.reviewLog.create({
        data: {
          userWordId: row.id,
          userId,
          grade: input.grade,
          responseMs: input.responseMs,
          prevInterval: outcome.previous.intervalDays,
          newInterval: outcome.intervalDays,
          prevEase: outcome.previous.ease,
          newEase: outcome.card.ease,
          prevState: outcome.previous.state,
          newState: nextState,
          reviewedAt: now,
        },
      }),
    ]);

    // A wrong answer still earns something: showing up is the habit we reward.
    // The one-off NEW_WORD award was paid when the learner met the card in the
    // learn flow, so grading only ever pays the review rate.
    const reward = await this.gamification.award({
      userId,
      source: 'REVIEW',
      skill: 'VOCABULARY',
      refType: 'user_word',
      refId: row.id,
      isCorrect: outcome.isCorrect,
      wordsReviewed: 1,
      now,
    });

    if (!outcome.isCorrect) {
      await this.prisma.mistakeLog.create({
        data: {
          userId,
          skill: 'VOCABULARY',
          category: 'vocabulary-recall',
          detail: row.word.lemma,
          sourceType: 'srs',
          sourceId: row.id,
          occurredAt: now,
        },
      });
    }

    const remaining = await this.prisma.userWord.count({
      where: {
        userId,
        dueAt: { lte: now },
        state: { notIn: ['SUSPENDED', 'NEW'] },
      },
    });

    return {
      userWordId: row.id,
      state: nextState,
      intervalDays: outcome.intervalDays,
      nextDueAt: outcome.dueAt.toISOString(),
      ease: outcome.card.ease,
      lapses: outcome.card.lapses,
      xpEarned: reward.xpEarned,
      remainingInQueue: remaining,
      reward,
    };
  }

  /** §11 PWA — replay reviews captured while the device was offline. */
  async bulkReview(userId: string, input: SrsBulkReviewInput) {
    const results = [];
    for (const item of input.reviews) {
      const at = item.reviewedAt ? new Date(item.reviewedAt) : new Date();
      results.push(await this.review(userId, item, at));
    }
    return { applied: results.length, results };
  }
  /**
   * §7.3.5 — a review session. Starting one lets the app record how long the
   * learner actually studied and turn a run of gradings into one skill
   * observation, instead of treating every card as a separate judgement.
   */
  async startSession(userId: string) {
    const session = await this.prisma.studySession.create({
      data: { userId, skill: 'VOCABULARY' },
    });
    return { id: session.id, startedAt: session.startedAt.toISOString() };
  }

  async finishSession(userId: string, sessionId: string, now = new Date()) {
    const session = await this.prisma.studySession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw AppException.notFound('Phiên ôn tập');
    if (session.endedAt) {
      throw AppException.conflict('ATTEMPT_ALREADY_SUBMITTED', 'Phiên này đã kết thúc.');
    }

    const logs = await this.prisma.reviewLog.findMany({
      where: { userId, reviewedAt: { gte: session.startedAt, lte: now } },
      select: { grade: true },
    });

    const durationSec = Math.max(1, Math.round((now.getTime() - session.startedAt.getTime()) / 1000));
    const accuracy = logs.length === 0 ? null : logs.filter((log) => log.grade > 0).length / logs.length;

    await this.prisma.studySession.update({
      where: { id: sessionId },
      data: { endedAt: now, durationSec, itemsCompleted: logs.length },
    });

    const outcome = await this.gamification.recordStudyTime({
      userId,
      skill: 'VOCABULARY',
      seconds: durationSec,
      observationScore: accuracy === null ? undefined : Math.round(accuracy * 100),
      now,
    });

    return {
      sessionId,
      reviewed: logs.length,
      durationSec,
      minutes: outcome.minutes,
      accuracy: accuracy === null ? null : Math.round(accuracy * 1000) / 1000,
      achievementsUnlocked: outcome.achievementsUnlocked,
    };
  }

  /** §7.3.5 — the 30 day wave chart. */
  async forecast(userId: string, days = 30, now = new Date()) {
    const clock = await this.studyDay.clockFor(userId);
    const rows = await this.prisma.userWord.findMany({
      where: { userId, state: { notIn: ['SUSPENDED', 'NEW'] } },
      select: { dueAt: true },
    });

    return forecast({
      dueDates: rows.map((row) => row.dueAt),
      from: now,
      days,
      timeZone: clock.timeZone,
      dayRolloverHour: clock.rolloverHour,
    });
  }

  /** §7.3.6 — the collection screen: how the whole deck is doing. */
  async stats(userId: string, now = new Date()) {
    const [byState, due, leeches, reviews, accuracy] = await Promise.all([
      this.prisma.userWord.groupBy({
        by: ['state'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.userWord.count({
        where: { userId, dueAt: { lte: now }, state: { notIn: ['SUSPENDED', 'NEW'] } },
      }),
      this.prisma.userWord.count({ where: { userId, lapses: { gte: 3 } } }),
      this.prisma.reviewLog.count({ where: { userId } }),
      this.prisma.userWord.aggregate({
        where: { userId, totalReviews: { gt: 0 } },
        _sum: { totalReviews: true, correctReviews: true },
      }),
    ]);

    const counts: Record<string, number> = {
      NEW: 0,
      LEARNING: 0,
      REVIEW: 0,
      RELEARNING: 0,
      MASTERED: 0,
      SUSPENDED: 0,
    };
    for (const group of byState) counts[group.state] = group._count._all;

    const totalReviews = accuracy._sum.totalReviews ?? 0;
    return {
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      due,
      leeches,
      reviewsLogged: reviews,
      lifetimeAccuracy:
        totalReviews === 0
          ? null
          : Math.round(((accuracy._sum.correctReviews ?? 0) / totalReviews) * 1000) / 1000,
    };
  }

  /** §7.3.6 — suspend a card, wake it up, or star it. */
  async updateCard(
    userId: string,
    userWordId: string,
    input: { isFavorite?: boolean; state?: 'SUSPENDED' | 'REVIEW' },
  ) {
    const row = await this.prisma.userWord.findUnique({ where: { id: userWordId } });
    if (!row || row.userId !== userId) throw AppException.notFound('Thẻ ôn tập');

    return this.prisma.userWord.update({
      where: { id: userWordId },
      data: {
        isFavorite: input.isFavorite ?? row.isFavorite,
        state: input.state ?? row.state,
      },
      select: { id: true, state: true, isFavorite: true, dueAt: true },
    });
  }

  /** §7.3.6 — start a leech over from scratch. */
  async reset(userId: string, userWordId: string, now = new Date()) {
    const row = await this.prisma.userWord.findUnique({ where: { id: userWordId } });
    if (!row || row.userId !== userId) throw AppException.notFound('Thẻ ôn tập');

    return this.prisma.userWord.update({
      where: { id: userWordId },
      data: {
        state: 'NEW',
        ease: 2.5,
        intervalDays: 0,
        repetitions: 0,
        learningStep: 0,
        dueAt: now,
      },
      select: { id: true, state: true, dueAt: true },
    });
  }
}

/** The persisted columns are exactly the scheduler's card shape. */
export function toSrsCard(row: UserWord): SrsCard {
  return {
    state: row.state,
    ease: row.ease,
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    lapses: row.lapses,
    learningStep: row.learningStep,
    totalReviews: row.totalReviews,
    correctReviews: row.correctReviews,
  };
}

/** "Được → 4 ngày" on the grading buttons. */
export function gradeButtonLabel(grade: ReviewGrade, intervalDays: number): string {
  return `${GRADE_LABEL_VI[grade]} → ${formatIntervalVi(intervalDays)}`;
}
