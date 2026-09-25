import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';

export interface TopicCard {
  id: string;
  slug: string;
  nameEn: string;
  nameVi: string;
  emoji: string;
  colorToken: string;
  description: string;
  wordCount: number;
  learnedCount: number;
  masteredCount: number;
  dueCount: number;
  subtopicCount: number;
  /** 0..100 — how much of the topic the learner has started. */
  progressPct: number;
}

export interface SubtopicCard {
  id: string;
  slug: string;
  nameVi: string;
  nameEn: string;
  emoji: string;
  wordCount: number;
  learnedCount: number;
}

/** §7.3.1 — the topic grid and one topic's detail page. */
@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<TopicCard[]> {
    const topics = await this.prisma.topic.findMany({
      where: { parentId: null },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { words: true, subtopics: true } },
      },
    });

    return Promise.all(topics.map((topic) => this.toCard(userId, topic)));
  }

  async detail(
    userId: string,
    slug: string,
  ): Promise<TopicCard & { subtopics: SubtopicCard[] }> {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      include: {
        _count: { select: { words: true, subtopics: true } },
        subtopics: {
          orderBy: { order: 'asc' },
          include: { _count: { select: { words: true } } },
        },
      },
    });

    if (!topic) throw AppException.notFound('Chủ đề');

    const card = await this.toCard(userId, topic);
    const subtopics = await Promise.all(
      topic.subtopics.map(async (sub) => ({
        id: sub.id,
        slug: sub.slug,
        nameVi: sub.nameVi,
        nameEn: sub.nameEn,
        emoji: sub.emoji,
        wordCount: sub._count.words,
        learnedCount: await this.prisma.userWord.count({
          where: { userId, word: { topics: { some: { id: sub.id } } } },
        }),
      })),
    );

    return { ...card, subtopics };
  }

  private async toCard(
    userId: string,
    topic: {
      id: string;
      slug: string;
      nameEn: string;
      nameVi: string;
      emoji: string;
      colorToken: string;
      description: string;
      _count: { words: number; subtopics: number };
    },
  ): Promise<TopicCard> {
    const inTopic = { topics: { some: { id: topic.id } } };
    const [learnedCount, masteredCount, dueCount] = await Promise.all([
      this.prisma.userWord.count({ where: { userId, word: inTopic } }),
      this.prisma.userWord.count({ where: { userId, state: 'MASTERED', word: inTopic } }),
      this.prisma.userWord.count({
        where: {
          userId,
          word: inTopic,
          dueAt: { lte: new Date() },
          state: { notIn: ['NEW', 'SUSPENDED'] },
        },
      }),
    ]);

    return {
      id: topic.id,
      slug: topic.slug,
      nameEn: topic.nameEn,
      nameVi: topic.nameVi,
      emoji: topic.emoji,
      colorToken: topic.colorToken,
      description: topic.description,
      wordCount: topic._count.words,
      learnedCount,
      masteredCount,
      dueCount,
      subtopicCount: topic._count.subtopics,
      progressPct:
        topic._count.words === 0
          ? 0
          : Math.min(100, Math.round((learnedCount / topic._count.words) * 100)),
    };
  }
}
