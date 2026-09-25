import { Injectable } from '@nestjs/common';
import type { Lesson, LessonProgress } from '@prisma/client';
import type {
  ActivityResult,
  ExerciseSubmitInput,
  LessonCard,
  LessonDetail,
  LessonListQuery,
  LessonSectionKind,
  LessonStatus,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { LearningEngineService } from '../learning/learning-engine.service';
import { toLessonExercises } from '../learning/exercise-mapper';

/** §7.8 — grammar lessons, with prerequisites that actually gate. */
@Injectable()
export class GrammarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: LearningEngineService,
  ) {}

  async list(userId: string, query: LessonListQuery): Promise<LessonCard[]> {
    const lessons = await this.prisma.lesson.findMany({
      where: { skill: 'GRAMMAR', isPublished: true, ...(query.cefr ? { cefr: query.cefr } : {}) },
      orderBy: [{ cefr: 'asc' }, { order: 'asc' }],
      include: { _count: { select: { exercises: true } } },
    });

    const progress = await this.prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessons.map((lesson) => lesson.id) } },
    });
    const progressBy = new Map(progress.map((row) => [row.lessonId, row]));
    const titleBySlug = new Map(lessons.map((lesson) => [lesson.slug, lesson]));

    // A prerequisite counts as met when its own progress row says completed.
    const completedSlugs = new Set(
      progress
        .filter((row) => row.status === 'completed')
        .map((row) => lessons.find((lesson) => lesson.id === row.lessonId)?.slug)
        .filter((slug): slug is string => typeof slug === 'string'),
    );

    const cards = lessons.map((lesson) =>
      this.toCard(lesson, lesson._count.exercises, progressBy.get(lesson.id), completedSlugs, titleBySlug),
    );

    switch (query.status) {
      case 'available':
        return cards.filter((card) => !card.lock.locked && card.status !== 'completed');
      case 'completed':
        return cards.filter((card) => card.status === 'completed');
      case 'in_progress':
        return cards.filter((card) => card.status === 'in_progress');
      default:
        return cards;
    }
  }

  async detail(userId: string, slug: string): Promise<LessonDetail> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { slug },
      include: {
        sections: { orderBy: { order: 'asc' } },
        exercises: { orderBy: { order: 'asc' } },
        _count: { select: { exercises: true } },
      },
    });
    if (!lesson || !lesson.isPublished || lesson.skill !== 'GRAMMAR') {
      throw AppException.notFound('Bài học ngữ pháp');
    }

    const [progress, siblings] = await Promise.all([
      this.prisma.lessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId: lesson.id } },
      }),
      this.prisma.lesson.findMany({
        where: { skill: 'GRAMMAR', slug: { in: lesson.prerequisiteIds } },
      }),
    ]);

    const completedSlugs = await this.completedSlugs(userId);
    const card = this.toCard(
      lesson,
      lesson._count.exercises,
      progress,
      completedSlugs,
      new Map(siblings.map((row) => [row.slug, row])),
    );

    return {
      ...card,
      sections: lesson.sections.map((section) => ({
        id: section.id,
        order: section.order,
        kind: section.kind as LessonSectionKind,
        title: section.title,
        bodyMdx: section.bodyMdx,
      })),
      // Seeded from the lesson id so the option order is stable while a learner
      // reads the page, and different between lessons.
      exercises: toLessonExercises(lesson.exercises, hashSeed(lesson.id)),
    };
  }

  /** Opens the lesson: marks it in progress and starts a timed session. */
  async start(userId: string, slug: string, now = new Date()): Promise<{ sessionId: string }> {
    const lesson = await this.requireUnlocked(userId, slug);
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      update: { status: 'in_progress' },
      create: { userId, lessonId: lesson.id, status: 'in_progress', progressPct: 0, startedAt: now },
    });
    const session = await this.engine.startSession(userId, 'GRAMMAR', now);
    return { sessionId: session.id };
  }

  /** Records that a section has been read, so a half-finished lesson resumes. */
  async markSectionRead(userId: string, slug: string, sectionId: string): Promise<LessonCard> {
    const lesson = await this.requireUnlocked(userId, slug);
    const sections = await this.prisma.lessonSection.findMany({
      where: { lessonId: lesson.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    const index = sections.findIndex((section) => section.id === sectionId);
    if (index < 0) throw AppException.notFound('Phần của bài học');

    // Reading is worth up to half the lesson; the exercises earn the rest.
    const pct = Math.round(((index + 1) / Math.max(1, sections.length)) * 50);
    const progress = await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      update: {
        lastSectionId: sectionId,
        progressPct: { set: pct },
        status: 'in_progress',
      },
      create: {
        userId,
        lessonId: lesson.id,
        lastSectionId: sectionId,
        progressPct: pct,
        status: 'in_progress',
      },
    });

    const count = await this.prisma.exercise.count({ where: { lessonId: lesson.id } });
    return this.toCard(lesson, count, progress, await this.completedSlugs(userId), new Map());
  }

  async submit(
    userId: string,
    slug: string,
    input: ExerciseSubmitInput,
    now = new Date(),
  ): Promise<ActivityResult> {
    const lesson = await this.requireUnlocked(userId, slug);
    const exercises = await this.prisma.exercise.findMany({
      where: { lessonId: lesson.id },
      select: { id: true },
    });

    const result = await this.engine.submit({
      userId,
      input,
      skill: 'GRAMMAR',
      xpSource: 'LESSON',
      sourceType: 'grammar-lesson',
      sourceId: lesson.id,
      allowedExerciseIds: exercises.map((exercise) => exercise.id),
      now,
    });

    // §7.8 — the lesson is complete once the exercises have been attempted; a
    // low score still completes it, and the accuracy is what gets recorded.
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      update: {
        status: 'completed',
        progressPct: 100,
        accuracy: result.accuracy,
        completedAt: now,
      },
      create: {
        userId,
        lessonId: lesson.id,
        status: 'completed',
        progressPct: 100,
        accuracy: result.accuracy,
        completedAt: now,
      },
    });

    return result;
  }

  private async requireUnlocked(userId: string, slug: string): Promise<Lesson> {
    const lesson = await this.prisma.lesson.findUnique({ where: { slug } });
    if (!lesson || !lesson.isPublished || lesson.skill !== 'GRAMMAR') {
      throw AppException.notFound('Bài học ngữ pháp');
    }
    if (lesson.prerequisiteIds.length > 0) {
      const done = await this.completedSlugs(userId);
      const missing = lesson.prerequisiteIds.filter((required) => !done.has(required));
      if (missing.length > 0) {
        throw AppException.forbidden(
          `Cần hoàn thành trước: ${missing.join(', ')}.`,
        );
      }
    }
    return lesson;
  }

  private async completedSlugs(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.lessonProgress.findMany({
      where: { userId, status: 'completed' },
      include: { lesson: { select: { slug: true } } },
    });
    return new Set(rows.map((row) => row.lesson.slug));
  }

  private toCard(
    lesson: Lesson,
    exerciseCount: number,
    progress: LessonProgress | null | undefined,
    completedSlugs: Set<string>,
    lessonBySlug: Map<string, Lesson>,
  ): LessonCard {
    const missing = lesson.prerequisiteIds.filter((slug) => !completedSlugs.has(slug));
    return {
      slug: lesson.slug,
      title: lesson.title,
      titleVi: lesson.titleVi,
      summary: lesson.summary,
      cefr: lesson.cefr,
      estimatedMinutes: lesson.estimatedMinutes,
      xpReward: lesson.xpReward,
      exerciseCount,
      order: lesson.order,
      status: (progress?.status as LessonStatus | undefined) ?? 'not_started',
      progressPct: progress?.progressPct ?? 0,
      accuracy: progress?.accuracy ?? null,
      lock: {
        locked: missing.length > 0,
        requires: missing.map((slug) => {
          const required = lessonBySlug.get(slug);
          return {
            slug,
            title: required?.title ?? slug,
            titleVi: required?.titleVi ?? slug,
          };
        }),
      },
    };
  }
}

/** A stable numeric seed from a cuid, for shuffling options deterministically. */
function hashSeed(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}
