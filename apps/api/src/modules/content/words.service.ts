import { Injectable } from '@nestjs/common';
import { POS_LABEL_VI } from '@sprout/shared';
import type { PaginationMeta, WordListQuery, WordSummary } from '@sprout/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';

const SUMMARY_INCLUDE = {
  senses: {
    orderBy: { order: 'asc' },
    take: 1,
    select: { pos: true, definitionVi: true },
  },
} satisfies Prisma.WordInclude;

export interface WordDetail extends WordSummary {
  syllables: string | null;
  stressPattern: string | null;
  frequencyRank: number | null;
  topics: { slug: string; nameVi: string; emoji: string }[];
  senses: {
    id: string;
    pos: string;
    posLabelVi: string;
    definitionEn: string;
    definitionVi: string;
    register: string | null;
    examples: {
      textEn: string;
      textVi: string;
      highlightStart: number;
      highlightEnd: number;
    }[];
    synonyms: string[];
    antonyms: string[];
  }[];
  family: {
    rootSlug: string;
    glossVi: string;
    members: { lemma: string; slug: string; pos: string; posLabelVi: string; suffix: string | null }[];
  } | null;
  userWord: {
    state: string;
    dueAt: string;
    intervalDays: number;
    ease: number;
    lapses: number;
    totalReviews: number;
    correctReviews: number;
    isFavorite: boolean;
  } | null;
}

/** §7.3 — browsing the dictionary and reading one entry. */
@Injectable()
export class WordsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: WordListQuery & { topicSlug?: string },
  ): Promise<{ items: WordSummary[]; meta: PaginationMeta }> {
    const where: Prisma.WordWhereInput = {};

    if (query.topicSlug) where.topics = { some: { slug: query.topicSlug } };
    if (query.subtopic) {
      where.topics = { some: { slug: query.subtopic } };
    }
    if (query.cefr) where.cefr = query.cefr;
    if (query.search) {
      where.OR = [
        { lemma: { contains: query.search, mode: 'insensitive' } },
        { senses: { some: { definitionVi: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const skip = (query.page - 1) * query.limit;

    if (query.sort === 'learned') {
      return this.listByLearnedFirst(userId, where, skip, query);
    }

    const orderBy = this.orderFor(query.sort);
    const [total, rows] = await Promise.all([
      this.prisma.word.count({ where }),
      this.prisma.word.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        include: SUMMARY_INCLUDE,
      }),
    ]);

    return {
      items: await this.decorate(userId, rows),
      meta: this.meta(query, total),
    };
  }

  /**
   * "Words I have started" first, then the rest, both alphabetical. Prisma
   * cannot order by a per-user relation, so the two buckets are paged by hand
   * rather than loading the whole topic into memory.
   */
  private async listByLearnedFirst(
    userId: string,
    where: Prisma.WordWhereInput,
    skip: number,
    query: WordListQuery,
  ): Promise<{ items: WordSummary[]; meta: PaginationMeta }> {
    const learnedWhere: Prisma.WordWhereInput = {
      ...where,
      userWords: { some: { userId } },
    };
    const freshWhere: Prisma.WordWhereInput = {
      ...where,
      userWords: { none: { userId } },
    };

    const [learnedTotal, freshTotal] = await Promise.all([
      this.prisma.word.count({ where: learnedWhere }),
      this.prisma.word.count({ where: freshWhere }),
    ]);

    const rows: Prisma.WordGetPayload<{ include: typeof SUMMARY_INCLUDE }>[] = [];

    if (skip < learnedTotal) {
      rows.push(
        ...(await this.prisma.word.findMany({
          where: learnedWhere,
          orderBy: { lemma: 'asc' },
          skip,
          take: query.limit,
          include: SUMMARY_INCLUDE,
        })),
      );
    }

    if (rows.length < query.limit) {
      const freshSkip = Math.max(0, skip - learnedTotal);
      rows.push(
        ...(await this.prisma.word.findMany({
          where: freshWhere,
          orderBy: { lemma: 'asc' },
          skip: freshSkip,
          take: query.limit - rows.length,
          include: SUMMARY_INCLUDE,
        })),
      );
    }

    return {
      items: await this.decorate(userId, rows),
      meta: this.meta(query, learnedTotal + freshTotal),
    };
  }

  private orderFor(sort: WordListQuery['sort']): Prisma.WordOrderByWithRelationInput[] {
    switch (sort) {
      case 'alphabet':
        return [{ lemma: 'asc' }];
      case 'cefr':
        return [{ cefr: 'asc' }, { frequencyRank: { sort: 'asc', nulls: 'last' } }];
      default:
        // Frequency order is the teaching order: common words first.
        return [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { lemma: 'asc' }];
    }
  }

  private meta(query: WordListQuery, total: number): PaginationMeta {
    return {
      page: query.page,
      limit: query.limit,
      total,
      hasMore: query.page * query.limit < total,
      nextCursor: null,
    };
  }

  private async decorate(
    userId: string,
    rows: Prisma.WordGetPayload<{ include: typeof SUMMARY_INCLUDE }>[],
  ): Promise<WordSummary[]> {
    if (rows.length === 0) return [];

    const states = await this.prisma.userWord.findMany({
      where: { userId, wordId: { in: rows.map((row) => row.id) } },
      select: { wordId: true, state: true },
    });
    const byWord = new Map(states.map((row) => [row.wordId, row.state]));

    return rows.map((row) => ({
      id: row.id,
      lemma: row.lemma,
      slug: row.slug,
      cefr: row.cefr,
      ipaUs: row.ipaUs,
      ipaUk: row.ipaUk,
      audioUsUrl: row.audioUsUrl,
      audioUkUrl: row.audioUkUrl,
      primaryPos: row.senses[0]?.pos ?? null,
      definitionVi: row.senses[0]?.definitionVi ?? null,
      learnState: byWord.get(row.id) ?? null,
    }));
  }

  /** §7.3.3 — one dictionary entry with everything the word card shows. */
  async detail(userId: string, slug: string): Promise<WordDetail> {
    const word = await this.prisma.word.findUnique({
      where: { slug },
      include: {
        topics: { select: { slug: true, nameVi: true, emoji: true, parentId: true } },
        senses: {
          orderBy: { order: 'asc' },
          include: {
            examples: { orderBy: { id: 'asc' } },
            relations: { include: { toSense: { include: { word: true } } } },
          },
        },
        forms: {
          include: {
            family: {
              include: {
                members: { include: { word: { select: { lemma: true, slug: true } } } },
              },
            },
          },
        },
      },
    });

    if (!word) throw AppException.notFound('Từ');

    const userWord = await this.prisma.userWord.findUnique({
      where: { userId_wordId: { userId, wordId: word.id } },
    });

    const family = word.forms[0]?.family ?? null;

    return {
      id: word.id,
      lemma: word.lemma,
      slug: word.slug,
      cefr: word.cefr,
      ipaUs: word.ipaUs,
      ipaUk: word.ipaUk,
      audioUsUrl: word.audioUsUrl,
      audioUkUrl: word.audioUkUrl,
      syllables: word.syllables,
      stressPattern: word.stressPattern,
      frequencyRank: word.frequencyRank,
      primaryPos: word.senses[0]?.pos ?? null,
      definitionVi: word.senses[0]?.definitionVi ?? null,
      learnState: userWord?.state ?? null,
      topics: word.topics
        .filter((topic) => topic.parentId === null)
        .map((topic) => ({ slug: topic.slug, nameVi: topic.nameVi, emoji: topic.emoji })),
      senses: word.senses.map((sense) => ({
        id: sense.id,
        pos: sense.pos,
        posLabelVi: POS_LABEL_VI[sense.pos],
        definitionEn: sense.definitionEn,
        definitionVi: sense.definitionVi,
        register: sense.register,
        examples: sense.examples.map((example) => ({
          textEn: example.textEn,
          textVi: example.textVi,
          highlightStart: example.highlightStart,
          highlightEnd: example.highlightEnd,
        })),
        synonyms: sense.relations
          .filter((relation) => relation.kind === 'synonym')
          .map((relation) => relation.toSense.word.lemma),
        antonyms: sense.relations
          .filter((relation) => relation.kind === 'antonym')
          .map((relation) => relation.toSense.word.lemma),
      })),
      family: family
        ? {
            rootSlug: family.rootSlug,
            glossVi: family.glossVi,
            members: family.members.map((member) => ({
              lemma: member.word.lemma,
              slug: member.word.slug,
              pos: member.pos,
              posLabelVi: POS_LABEL_VI[member.pos],
              suffix: member.suffix,
            })),
          }
        : null,
      userWord: userWord
        ? {
            state: userWord.state,
            dueAt: userWord.dueAt.toISOString(),
            intervalDays: userWord.intervalDays,
            ease: userWord.ease,
            lapses: userWord.lapses,
            totalReviews: userWord.totalReviews,
            correctReviews: userWord.correctReviews,
            isFavorite: userWord.isFavorite,
          }
        : null,
    };
  }
}
