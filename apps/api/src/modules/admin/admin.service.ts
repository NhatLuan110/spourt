import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { VIETNAMESE_ERROR_PATTERNS } from '@sprout/scoring';
import type {
  AdminContentIssue,
  AdminOverview,
  AdminRoleInput,
  AdminUserQuery,
  AdminUserRow,
  PaginationMeta,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AiService } from '../ai/ai.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async overview(now = new Date()): Promise<AdminOverview> {
    const weekAgo = new Date(now.getTime() - WEEK_MS);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newThisWeek,
      activeThisWeek,
      activeToday,
      words,
      topics,
      lessons,
      passages,
      tracks,
      drills,
      scenarios,
      writingPrompts,
      rewriteItems,
      exercises,
      tests,
      sessions,
      reviews,
      attempts,
      submissions,
      speaking,
      ownKeys,
      usage,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.userProgress.count({ where: { lastStudyDate: { gte: weekAgo } } }),
      this.prisma.userProgress.count({ where: { lastStudyDate: { gte: dayAgo } } }),
      this.prisma.word.count(),
      this.prisma.topic.count({ where: { parentId: null } }),
      this.prisma.lesson.count(),
      this.prisma.readingPassage.count(),
      this.prisma.listeningTrack.count(),
      this.prisma.speakingDrill.count(),
      this.prisma.speakingScenario.count(),
      this.prisma.writingPrompt.count(),
      this.prisma.exercise.count({ where: { type: 'REWRITE' } }),
      this.prisma.exercise.count(),
      this.prisma.test.count(),
      this.prisma.studySession.count({ where: { startedAt: { gte: weekAgo } } }),
      this.prisma.reviewLog.count({ where: { reviewedAt: { gte: weekAgo } } }),
      this.prisma.exerciseAttempt.count({ where: { attemptedAt: { gte: weekAgo } } }),
      this.prisma.writingSubmission.count({ where: { submittedAt: { gte: weekAgo } } }),
      this.prisma.speakingAttempt.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.userSettings.count({ where: { aiApiKeyEncrypted: { not: null } } }),
      this.prisma.aiUsageLog.groupBy({
        by: ['feature'],
        where: { createdAt: { gte: weekAgo } },
        _count: { _all: true },
        _sum: { tokensIn: true, tokensOut: true },
      }),
    ]);

    return {
      users: { total: totalUsers, newThisWeek, activeThisWeek, activeToday },
      content: {
        words,
        topics,
        lessons,
        passages,
        tracks,
        drills,
        scenarios,
        writingPrompts,
        rewriteItems,
        exercises,
        tests,
      },
      activity: {
        sessions,
        reviews,
        exerciseAttempts: attempts,
        writingSubmissions: submissions,
        speakingAttempts: speaking,
      },
      ai: {
        provider: this.ai.providerName,
        speechProvider: this.ai.speechProviderName,
        configured: this.ai.isConfigured(),
        callsByFeature: usage.map((row) => ({
          feature: row.feature,
          calls: row._count._all,
          tokensIn: row._sum.tokensIn ?? 0,
          tokensOut: row._sum.tokensOut ?? 0,
        })),
        learnersWithOwnKey: ownKeys,
      },
    };
  }

  async users(
    query: AdminUserQuery,
    now = new Date(),
  ): Promise<{ rows: AdminUserRow[]; meta: PaginationMeta }> {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { profile: { displayName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.activeOnly) {
      where.progress = { lastStudyDate: { gte: new Date(now.getTime() - WEEK_MS) } };
    }

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { profile: true, progress: true, settings: true },
      }),
    ]);

    return {
      rows: rows.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.profile?.displayName ?? '—',
        role: user.role,
        level: user.profile?.currentLevel ?? 'A1',
        totalXp: user.progress?.totalXp ?? 0,
        currentStreak: user.progress?.currentStreak ?? 0,
        wordsLearned: user.progress?.wordsLearned ?? 0,
        createdAt: user.createdAt.toISOString(),
        lastStudyDate: user.progress?.lastStudyDate?.toISOString() ?? null,
        ownAiKey: user.settings?.aiApiKeyEncrypted !== null && user.settings?.aiApiKeyEncrypted !== undefined,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        hasMore: query.page * query.limit < total,
      },
    };
  }

  /**
   * Changes a learner's role.
   *
   * Refuses to remove the last administrator. Locking everyone out of the admin
   * screen is a one-click mistake that can only be undone with database access,
   * which is exactly the kind of thing a guard rail is for.
   */
  async setRole(actorId: string, userId: string, input: AdminRoleInput): Promise<AdminUserRow> {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw AppException.notFound('Người dùng');

    if (target.role === 'ADMIN' && input.role !== 'ADMIN') {
      const admins = await this.prisma.user.count({ where: { role: 'ADMIN' } });
      if (admins <= 1) {
        throw AppException.conflict(
          'FORBIDDEN',
          'Đây là quản trị viên cuối cùng. Cấp quyền cho người khác trước khi hạ quyền tài khoản này.',
        );
      }
      if (target.id === actorId) {
        throw AppException.conflict('FORBIDDEN', 'Không thể tự hạ quyền của chính mình.');
      }
    }

    await this.prisma.user.update({ where: { id: userId }, data: { role: input.role } });
    const page = await this.users({ page: 1, limit: 1, search: target.email });
    const row = page.rows[0];
    if (!row) throw AppException.notFound('Người dùng');
    return row;
  }

  /**
   * Content problems only the database can see.
   *
   * `pnpm check:content` validates the YAML; this checks what survived seeding.
   * The two catch different things — a seeder that deletes rows it does not own
   * passes the file check and fails here, which is a bug this app has actually
   * had.
   */
  async contentIssues(): Promise<AdminContentIssue[]> {
    const issues: AdminContentIssue[] = [];

    const lessons = await this.prisma.lesson.findMany({
      select: { slug: true, titleVi: true, _count: { select: { exercises: true } } },
    });
    for (const lesson of lessons) {
      if (lesson._count.exercises === 0) {
        issues.push({
          kind: 'lesson-no-exercises',
          ref: lesson.slug,
          detailVi: `Bài học "${lesson.titleVi}" không có bài tập nào.`,
        });
      }
    }

    const topics = await this.prisma.topic.findMany({
      where: { parentId: null },
      select: { slug: true, nameVi: true, _count: { select: { words: true } } },
    });
    for (const topic of topics) {
      if (topic._count.words === 0) {
        issues.push({
          kind: 'topic-no-words',
          ref: topic.slug,
          detailVi: `Chủ đề "${topic.nameVi}" không có từ nào.`,
        });
      }
    }

    const wordsWithoutSense = await this.prisma.word.findMany({
      where: { senses: { none: {} } },
      select: { lemma: true },
      take: 20,
    });
    for (const word of wordsWithoutSense) {
      issues.push({
        kind: 'word-no-sense',
        ref: word.lemma,
        detailVi: `Từ "${word.lemma}" không có nghĩa nào.`,
      });
    }

    const tracks = await this.prisma.listeningTrack.findMany({
      where: { transcript: { none: {} } },
      select: { slug: true, titleVi: true },
    });
    for (const track of tracks) {
      issues.push({
        kind: 'track-no-transcript',
        ref: track.slug,
        detailVi: `Bài nghe "${track.titleVi}" không có transcript.`,
      });
    }

    const focuses = new Set(VIETNAMESE_ERROR_PATTERNS.map((pattern) => pattern.drillFocus));
    const drills = await this.prisma.speakingDrill.findMany({ select: { slug: true, focus: true } });
    for (const drill of drills) {
      if (!focuses.has(drill.focus)) {
        issues.push({
          kind: 'drill-unknown-focus',
          ref: drill.slug,
          detailVi: `Bài luyện "${drill.slug}" nhắm vào nhóm lỗi "${drill.focus}" không có trong bảng §7.6.3, nên sẽ không bao giờ được gợi ý.`,
        });
      }
    }

    return issues;
  }
}
