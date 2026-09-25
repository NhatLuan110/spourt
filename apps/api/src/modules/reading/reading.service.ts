import { Injectable } from '@nestjs/common';
import type { Prisma, ReadingPassage } from '@prisma/client';
import { READING_WPM_TARGET, readingSpeedBand, readingWpm } from '@sprout/scoring';
import type {
  ActivityResult,
  ExerciseSubmitInput,
  GlossaryEntry,
  ReadingCard,
  ReadingDetail,
  ReadingListQuery,
  ReadingSpeedView,
} from '@sprout/shared';
import type { PaginationMeta } from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { LearningEngineService } from '../learning/learning-engine.service';
import { toLessonExercises } from '../learning/exercise-mapper';

export interface ReadingResult extends ActivityResult {
  speed: ReadingSpeedView;
}

interface StoredGlossaryEntry {
  wordId?: unknown;
  lemma?: unknown;
  surface?: unknown;
  offsetStart?: unknown;
  offsetEnd?: unknown;
  definitionVi?: unknown;
  pos?: unknown;
  ipa?: unknown;
}

@Injectable()
export class ReadingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: LearningEngineService,
  ) {}

  async list(
    userId: string,
    query: ReadingListQuery,
  ): Promise<{ items: ReadingCard[]; meta: PaginationMeta }> {
    const where: Prisma.ReadingPassageWhereInput = { isPublished: true };
    if (query.cefr) where.cefr = query.cefr;
    if (query.topic) where.topic = { slug: query.topic };

    const [rows, total] = await Promise.all([
      this.prisma.readingPassage.findMany({
        where,
        orderBy: [{ cefr: 'asc' }, { title: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          topic: { select: { slug: true, nameVi: true } },
          _count: { select: { questions: true } },
        },
      }),
      this.prisma.readingPassage.count({ where }),
    ]);

    const best = await this.bestAccuracyByPassage(
      userId,
      rows.map((row) => row.id),
    );

    let items = rows.map((row) =>
      this.toCard(row, row.topic, row._count.questions, best.get(row.id) ?? null),
    );
    if (query.completed !== undefined) {
      items = items.filter((card) => card.completed === query.completed);
    }

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        hasMore: query.page * query.limit < total,
      },
    };
  }

  async detail(userId: string, slug: string): Promise<ReadingDetail> {
    const passage = await this.prisma.readingPassage.findUnique({
      where: { slug },
      include: {
        topic: { select: { slug: true, nameVi: true } },
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { questions: true } },
      },
    });
    if (!passage || !passage.isPublished) throw AppException.notFound('Bài đọc');

    const best = await this.bestAccuracyByPassage(userId, [passage.id]);
    const card = this.toCard(
      passage,
      passage.topic,
      passage._count.questions,
      best.get(passage.id) ?? null,
    );

    return {
      ...card,
      bodyMdx: passage.bodyMdx,
      ttsAudioUrl: passage.ttsAudioUrl,
      glossary: await this.glossaryFor(userId, passage.glossary),
      questions: toLessonExercises(passage.questions, passage.wordCount),
    };
  }

  async start(userId: string, slug: string, now = new Date()): Promise<{ sessionId: string }> {
    // Validates the slug before opening a session, so a typo does not leave an
    // orphan session running. The session is what times the read, which is why
    // the WPM cannot be inflated by a client sending a tiny elapsedMs.
    await this.requirePassage(slug);
    const session = await this.engine.startSession(userId, 'READING', now);
    return { sessionId: session.id };
  }

  async submit(
    userId: string,
    slug: string,
    input: ExerciseSubmitInput,
    now = new Date(),
  ): Promise<ReadingResult> {
    const passage = await this.requirePassage(slug);
    const questions = await this.prisma.exercise.findMany({
      where: { passageId: passage.id },
      select: { id: true },
    });

    const result = await this.engine.submit({
      userId,
      input,
      skill: 'READING',
      xpSource: 'READING',
      sourceType: 'reading-passage',
      sourceId: passage.id,
      allowedExerciseIds: questions.map((question) => question.id),
      now,
    });

    const wpm = readingWpm(passage.wordCount, result.durationSec * 1000);
    return {
      ...result,
      speed: {
        wpm,
        targetWpm: READING_WPM_TARGET[passage.cefr],
        band: readingSpeedBand(wpm, passage.cefr, result.accuracy),
      },
    };
  }

  private async requirePassage(slug: string): Promise<ReadingPassage> {
    const passage = await this.prisma.readingPassage.findUnique({ where: { slug } });
    if (!passage || !passage.isPublished) throw AppException.notFound('Bài đọc');
    return passage;
  }

  /**
   * The learner's best run at each passage, as the mean score of their attempts
   * on that passage's questions grouped by the day they attempted them. Using
   * the best rather than the latest means re-reading a passage never lowers a
   * number the learner has already earned.
   */
  private async bestAccuracyByPassage(
    userId: string,
    passageIds: string[],
  ): Promise<Map<string, number>> {
    if (passageIds.length === 0) return new Map();
    const attempts = await this.prisma.exerciseAttempt.findMany({
      where: { userId, exercise: { passageId: { in: passageIds } } },
      select: { score: true, exercise: { select: { passageId: true } } },
    });

    const totals = new Map<string, { sum: number; count: number }>();
    for (const attempt of attempts) {
      const id = attempt.exercise.passageId;
      if (!id) continue;
      const entry = totals.get(id) ?? { sum: 0, count: 0 };
      entry.sum += attempt.score;
      entry.count += 1;
      totals.set(id, entry);
    }

    return new Map(
      [...totals].map(([id, entry]) => [id, Math.round((entry.sum / entry.count) * 1000) / 1000]),
    );
  }

  /** Marks which glossary words the learner already collected. */
  private async glossaryFor(userId: string, stored: unknown): Promise<GlossaryEntry[]> {
    if (!Array.isArray(stored)) return [];
    const entries = stored as StoredGlossaryEntry[];
    const wordIds = entries
      .map((entry) => entry.wordId)
      .filter((id): id is string => typeof id === 'string');

    const known = new Set(
      (
        await this.prisma.userWord.findMany({
          where: { userId, wordId: { in: wordIds } },
          select: { wordId: true },
        })
      ).map((row) => row.wordId),
    );

    return entries.flatMap((entry) => {
      if (typeof entry.lemma !== 'string') return [];
      const wordId = typeof entry.wordId === 'string' ? entry.wordId : null;
      return [
        {
          wordId,
          lemma: entry.lemma,
          surface: typeof entry.surface === 'string' ? entry.surface : entry.lemma,
          offsetStart: typeof entry.offsetStart === 'number' ? entry.offsetStart : 0,
          offsetEnd: typeof entry.offsetEnd === 'number' ? entry.offsetEnd : 0,
          definitionVi: typeof entry.definitionVi === 'string' ? entry.definitionVi : '',
          pos: typeof entry.pos === 'string' ? entry.pos : null,
          ipa: typeof entry.ipa === 'string' ? entry.ipa : null,
          known: wordId !== null && known.has(wordId),
        },
      ];
    });
  }

  private toCard(
    passage: ReadingPassage,
    topic: { slug: string; nameVi: string } | null,
    questionCount: number,
    bestAccuracy: number | null,
  ): ReadingCard {
    return {
      slug: passage.slug,
      title: passage.title,
      titleVi: passage.titleVi,
      cefr: passage.cefr,
      wordCount: passage.wordCount,
      estimatedMinutes: passage.estimatedMinutes,
      topicSlug: topic?.slug ?? null,
      topicName: topic?.nameVi ?? null,
      imageUrl: passage.imageUrl,
      source: passage.source,
      questionCount,
      bestAccuracy,
      completed: bestAccuracy !== null,
    };
  }
}
