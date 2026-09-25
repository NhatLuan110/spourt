import { Injectable } from '@nestjs/common';
import type { ListeningTrack, Prisma, TranscriptSegment } from '@prisma/client';
import { gradeDictation } from '@sprout/scoring';
import type {
  ActivityResult,
  DictationLineResult,
  ExerciseSubmitInput,
  ListeningAccent,
  ListeningCard,
  ListeningDetail,
  ListeningFormat,
  ListeningListQuery,
  ListeningPlayback,
  PaginationMeta,
  TranscriptSegmentView,
  TranscriptWord,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { LearningEngineService } from '../learning/learning-engine.service';
import { toLessonExercises } from '../learning/exercise-mapper';

export interface ListeningResult extends ActivityResult {
  dictation: DictationLineResult[];
}

@Injectable()
export class ListeningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: LearningEngineService,
  ) {}

  async list(
    userId: string,
    query: ListeningListQuery,
  ): Promise<{ items: ListeningCard[]; meta: PaginationMeta }> {
    const where: Prisma.ListeningTrackWhereInput = { isPublished: true };
    if (query.cefr) where.cefr = query.cefr;
    if (query.topic) where.topic = { slug: query.topic };
    if (query.accent) where.accent = query.accent;
    if (query.format) where.format = query.format;

    const [rows, total] = await Promise.all([
      this.prisma.listeningTrack.findMany({
        where,
        orderBy: [{ cefr: 'asc' }, { title: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          topic: { select: { slug: true, nameVi: true } },
          exercises: { select: { id: true, type: true } },
        },
      }),
      this.prisma.listeningTrack.count({ where }),
    ]);

    const best = await this.bestAccuracyByTrack(
      userId,
      rows.map((row) => row.id),
    );

    return {
      items: rows.map((row) =>
        this.toCard(
          row,
          row.topic,
          row.exercises.filter((exercise) => exercise.type !== 'DICTATION').length,
          row.exercises.some((exercise) => exercise.type === 'DICTATION'),
          best.get(row.id) ?? null,
        ),
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        hasMore: query.page * query.limit < total,
      },
    };
  }

  async detail(userId: string, slug: string): Promise<ListeningDetail> {
    const track = await this.prisma.listeningTrack.findUnique({
      where: { slug },
      include: {
        topic: { select: { slug: true, nameVi: true } },
        transcript: { orderBy: { order: 'asc' } },
        exercises: { orderBy: { order: 'asc' } },
      },
    });
    if (!track || !track.isPublished) throw AppException.notFound('Bài nghe');

    const comprehension = track.exercises.filter((exercise) => exercise.type !== 'DICTATION');
    const dictation = track.exercises.filter((exercise) => exercise.type === 'DICTATION');
    const best = await this.bestAccuracyByTrack(userId, [track.id]);

    return {
      ...this.toCard(
        track,
        track.topic,
        comprehension.length,
        dictation.length > 0,
        best.get(track.id) ?? null,
      ),
      transcript: track.transcript.map((segment) => this.toSegment(segment)),
      questions: toLessonExercises(comprehension, track.durationSec),
      dictation: toLessonExercises(dictation, track.durationSec),
    };
  }

  async start(userId: string, slug: string, now = new Date()): Promise<{ sessionId: string }> {
    await this.requireTrack(slug);
    const session = await this.engine.startSession(userId, 'LISTENING', now);
    return { sessionId: session.id };
  }

  /**
   * Grades comprehension and dictation together. The playback settings are
   * stored on each attempt so §12.3's "listened at 0.75x" achievement and the
   * analytics page read a real number rather than a guess.
   */
  async submit(
    userId: string,
    slug: string,
    input: ExerciseSubmitInput,
    playback: ListeningPlayback,
    now = new Date(),
  ): Promise<ListeningResult> {
    const track = await this.requireTrack(slug);
    const exercises = await this.prisma.exercise.findMany({
      where: { trackId: track.id },
      select: { id: true, type: true, answer: true },
    });

    const result = await this.engine.submit({
      userId,
      input,
      skill: 'LISTENING',
      xpSource: 'LISTENING',
      sourceType: 'listening-track',
      sourceId: track.id,
      allowedExerciseIds: exercises.map((exercise) => exercise.id),
      now,
    });

    await this.recordPlayback(userId, exercises.map((exercise) => exercise.id), playback, now);

    const dictationIds = new Set(
      exercises.filter((exercise) => exercise.type === 'DICTATION').map((exercise) => exercise.id),
    );
    const answerById = new Map(exercises.map((exercise) => [exercise.id, exercise.answer]));

    const dictation: DictationLineResult[] = [];
    for (const answer of input.answers) {
      if (!dictationIds.has(answer.exerciseId)) continue;
      const stored = (answerById.get(answer.exerciseId) ?? {}) as { text?: unknown };
      const reference = typeof stored.text === 'string' ? stored.text : '';
      const graded = gradeDictation(reference, answer.answer);
      dictation.push({
        exerciseId: answer.exerciseId,
        score: graded.score,
        reference,
        answer: answer.answer,
        tokens: graded.tokens,
        homophoneWarnings: graded.homophoneWarnings,
      });
    }

    return { ...result, dictation };
  }

  /**
   * Writes how the learner listened onto the attempts just recorded. Kept as a
   * follow-up update rather than a field on the engine, because playback is a
   * listening concern and no other skill has one.
   */
  private async recordPlayback(
    userId: string,
    exerciseIds: string[],
    playback: ListeningPlayback,
    now: Date,
  ): Promise<void> {
    const attempts = await this.prisma.exerciseAttempt.findMany({
      where: { userId, exerciseId: { in: exerciseIds }, attemptedAt: now },
      select: { id: true, userAnswer: true },
    });

    for (const attempt of attempts) {
      const existing = (attempt.userAnswer ?? {}) as Record<string, unknown>;
      await this.prisma.exerciseAttempt.update({
        where: { id: attempt.id },
        data: {
          userAnswer: {
            ...existing,
            playbackRate: playback.playbackRate,
            replays: playback.replays,
            transcriptShown: playback.transcriptShown,
          },
        },
      });
    }
  }

  private async requireTrack(slug: string): Promise<ListeningTrack> {
    const track = await this.prisma.listeningTrack.findUnique({ where: { slug } });
    if (!track || !track.isPublished) throw AppException.notFound('Bài nghe');
    return track;
  }

  private async bestAccuracyByTrack(
    userId: string,
    trackIds: string[],
  ): Promise<Map<string, number>> {
    if (trackIds.length === 0) return new Map();
    const attempts = await this.prisma.exerciseAttempt.findMany({
      where: { userId, exercise: { trackId: { in: trackIds } } },
      select: { score: true, exercise: { select: { trackId: true } } },
    });

    const totals = new Map<string, { sum: number; count: number }>();
    for (const attempt of attempts) {
      const id = attempt.exercise.trackId;
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

  private toSegment(segment: TranscriptSegment): TranscriptSegmentView {
    const words = Array.isArray(segment.words) ? segment.words : [];
    return {
      id: segment.id,
      order: segment.order,
      startMs: segment.startMs,
      endMs: segment.endMs,
      speaker: segment.speaker,
      text: segment.text,
      words: words.flatMap((entry): TranscriptWord[] => {
        const word = entry as { w?: unknown; startMs?: unknown; endMs?: unknown; wordId?: unknown };
        if (typeof word.w !== 'string') return [];
        return [
          {
            w: word.w,
            startMs: typeof word.startMs === 'number' ? word.startMs : 0,
            endMs: typeof word.endMs === 'number' ? word.endMs : 0,
            wordId: typeof word.wordId === 'string' ? word.wordId : null,
          },
        ];
      }),
      translationVi: segment.translationVi,
    };
  }

  private toCard(
    track: ListeningTrack,
    topic: { slug: string; nameVi: string } | null,
    questionCount: number,
    hasDictation: boolean,
    bestAccuracy: number | null,
  ): ListeningCard {
    return {
      slug: track.slug,
      title: track.title,
      titleVi: track.titleVi,
      cefr: track.cefr,
      durationSec: track.durationSec,
      accent: track.accent as ListeningAccent,
      format: track.format as ListeningFormat,
      speakerCount: track.speakerCount,
      topicSlug: topic?.slug ?? null,
      topicName: topic?.nameVi ?? null,
      audioUrl: track.audioUrl,
      questionCount,
      hasDictation,
      bestAccuracy,
      completed: bestAccuracy !== null,
    };
  }
}
