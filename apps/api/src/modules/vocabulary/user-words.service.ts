import { Injectable } from '@nestjs/common';
import { formatIntervalVi } from '@sprout/shared';
import type { MyWordsQuery, PaginationMeta } from '@sprout/shared';
import { cardAccuracy, isLeech } from '@sprout/srs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { toSrsCard } from '../srs/srs.service';

export interface MyWordRow {
  userWordId: string;
  wordId: string;
  lemma: string;
  slug: string;
  cefr: string;
  ipaUs: string | null;
  audioUsUrl: string | null;
  definitionVi: string | null;
  pos: string | null;
  state: string;
  dueAt: string;
  dueLabelVi: string;
  intervalDays: number;
  ease: number;
  lapses: number;
  accuracy: number | null;
  isLeech: boolean;
  isFavorite: boolean;
}

/** §7.3.6 — "Bộ từ của tôi": everything the learner has collected. */
@Injectable()
export class UserWordsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: MyWordsQuery,
    now = new Date(),
  ): Promise<{ items: MyWordRow[]; meta: PaginationMeta }> {
    const where = this.whereFor(userId, query);
    const skip = (query.page - 1) * query.limit;

    if (query.sort === 'accuracy') {
      return this.listByAccuracy(where, query, now);
    }

    const [total, rows] = await Promise.all([
      this.prisma.userWord.count({ where }),
      this.prisma.userWord.findMany({
        where,
        orderBy: this.orderFor(query.sort),
        skip,
        take: query.limit,
        include: WORD_SELECT,
      }),
    ]);

    return { items: rows.map((row) => toRow(row, now)), meta: meta(query, total) };
  }

  private whereFor(userId: string, query: MyWordsQuery): Prisma.UserWordWhereInput {
    const where: Prisma.UserWordWhereInput = { userId };

    switch (query.state) {
      case 'learning':
        where.state = { in: ['NEW', 'LEARNING', 'RELEARNING', 'REVIEW'] };
        break;
      case 'mastered':
        where.state = 'MASTERED';
        break;
      case 'suspended':
        where.state = 'SUSPENDED';
        break;
      case 'leech':
        where.lapses = { gte: 3 };
        break;
      case 'favorite':
        where.isFavorite = true;
        break;
      default:
        break;
    }

    const wordFilter: Prisma.WordWhereInput = {};
    if (query.topic) wordFilter.topics = { some: { slug: query.topic } };
    if (query.search) {
      wordFilter.OR = [
        { lemma: { contains: query.search, mode: 'insensitive' } },
        { senses: { some: { definitionVi: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }
    if (Object.keys(wordFilter).length > 0) where.word = wordFilter;

    return where;
  }

  private orderFor(sort: MyWordsQuery['sort']): Prisma.UserWordOrderByWithRelationInput[] {
    switch (sort) {
      case 'alphabet':
        return [{ word: { lemma: 'asc' } }];
      case 'recent':
        return [{ createdAt: 'desc' }];
      default:
        return [{ dueAt: 'asc' }];
    }
  }

  /**
   * Accuracy is a ratio of two columns, which Prisma cannot order by. The ids
   * are ranked in SQL and the rows are then loaded and put back in that order,
   * so paging stays correct without pulling the whole collection into memory.
   */
  private async listByAccuracy(
    where: Prisma.UserWordWhereInput,
    query: MyWordsQuery,
    now: Date,
  ): Promise<{ items: MyWordRow[]; meta: PaginationMeta }> {
    const candidates = await this.prisma.userWord.findMany({
      where,
      select: { id: true, totalReviews: true, correctReviews: true },
    });

    const ranked = candidates
      .map((row) => ({
        id: row.id,
        // Never reviewed sorts last: there is nothing to be weak at yet.
        accuracy: row.totalReviews === 0 ? 2 : row.correctReviews / row.totalReviews,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice((query.page - 1) * query.limit, query.page * query.limit);

    const rows = await this.prisma.userWord.findMany({
      where: { id: { in: ranked.map((row) => row.id) } },
      include: WORD_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    return {
      items: ranked
        .map((row) => byId.get(row.id))
        .filter((row): row is (typeof rows)[number] => Boolean(row))
        .map((row) => toRow(row, now)),
      meta: meta(query, candidates.length),
    };
  }
}

const WORD_SELECT = {
  word: {
    include: {
      senses: { orderBy: { order: 'asc' }, take: 1, select: { pos: true, definitionVi: true } },
    },
  },
} satisfies Prisma.UserWordInclude;

type Row = Prisma.UserWordGetPayload<{ include: typeof WORD_SELECT }>;

function toRow(row: Row, now: Date): MyWordRow {
  const card = toSrsCard(row);
  const overdueDays = (now.getTime() - row.dueAt.getTime()) / 86_400_000;

  return {
    userWordId: row.id,
    wordId: row.wordId,
    lemma: row.word.lemma,
    slug: row.word.slug,
    cefr: row.word.cefr,
    ipaUs: row.word.ipaUs,
    audioUsUrl: row.word.audioUsUrl,
    definitionVi: row.word.senses[0]?.definitionVi ?? null,
    pos: row.word.senses[0]?.pos ?? null,
    state: row.state,
    dueAt: row.dueAt.toISOString(),
    dueLabelVi:
      overdueDays >= 0 ? 'Đến hạn' : `Sau ${formatIntervalVi(Math.abs(overdueDays))}`,
    intervalDays: row.intervalDays,
    ease: row.ease,
    lapses: row.lapses,
    accuracy: row.totalReviews === 0 ? null : Math.round(cardAccuracy(card) * 1000) / 1000,
    isLeech: isLeech(card),
    isFavorite: row.isFavorite,
  };
}

function meta(query: MyWordsQuery, total: number): PaginationMeta {
  return {
    page: query.page,
    limit: query.limit,
    total,
    hasMore: query.page * query.limit < total,
    nextCursor: null,
  };
}
