import { Injectable } from '@nestjs/common';
import type { HskLevel, Prisma } from '@prisma/client';
import { HSK_LEVEL_LIST } from '@sprout/shared';
import type { ChineseWordListQuery, HanziListQuery } from '@sprout/shared';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';

export interface HskLevelCard {
  key: HskLevel;
  number: number;
  labelVi: string;
  description: string;
  emoji: string;
  colorToken: string;
  wordCount: number;
  hanziCount: number;
  learnedCount: number;
  masteredCount: number;
  dueCount: number;
  /** Số chữ người học đã đánh dấu viết được. */
  canWriteCount: number;
  progressPct: number;
  /** Cấp trước đó phải đạt 60% mới nên mở, nhưng không chặn cứng. */
  recommended: boolean;
}

@Injectable()
export class ChineseService {
  constructor(private readonly prisma: PrismaService) {}

  /** Trang chủ ngăn tiếng Trung: sáu cấp HSK kèm tiến độ. */
  async levels(userId: string): Promise<HskLevelCard[]> {
    const [wordCounts, hanziCounts, learned, mastered, due, canWrite] = await Promise.all([
      this.prisma.chineseWord.groupBy({ by: ['hskLevel'], _count: true }),
      this.prisma.hanzi.groupBy({ by: ['hskLevel'], _count: true }),
      this.prisma.chineseWord.groupBy({
        by: ['hskLevel'],
        _count: true,
        where: { userWords: { some: { userId } } },
      }),
      this.prisma.chineseWord.groupBy({
        by: ['hskLevel'],
        _count: true,
        where: { userWords: { some: { userId, state: 'MASTERED' } } },
      }),
      this.prisma.chineseWord.groupBy({
        by: ['hskLevel'],
        _count: true,
        where: { userWords: { some: { userId, dueAt: { lte: new Date() }, state: { not: 'SUSPENDED' } } } },
      }),
      this.prisma.hanzi.groupBy({
        by: ['hskLevel'],
        _count: true,
        where: { userHanzi: { some: { userId, canWrite: true } } },
      }),
    ]);

    const pick = (rows: { hskLevel: HskLevel; _count: number }[], key: HskLevel): number =>
      rows.find((row) => row.hskLevel === key)?._count ?? 0;

    let previousProgress = 100;
    return HSK_LEVEL_LIST.map((level) => {
      const wordCount = pick(wordCounts, level.key);
      const learnedCount = pick(learned, level.key);
      const progressPct = wordCount === 0 ? 0 : Math.round((learnedCount / wordCount) * 100);
      const card: HskLevelCard = {
        key: level.key,
        number: level.number,
        labelVi: level.labelVi,
        description: level.description,
        emoji: level.emoji,
        colorToken: level.colorToken,
        wordCount,
        hanziCount: pick(hanziCounts, level.key),
        learnedCount,
        masteredCount: pick(mastered, level.key),
        dueCount: pick(due, level.key),
        canWriteCount: pick(canWrite, level.key),
        progressPct,
        recommended: previousProgress >= 60 && progressPct < 100,
      };
      previousProgress = progressPct;
      return card;
    });
  }

  /** Danh sách từ của một cấp, kèm trạng thái SRS của người học. */
  async words(userId: string, hskLevel: HskLevel, query: ChineseWordListQuery) {
    const search = query.search?.trim();
    const where: Prisma.ChineseWordWhereInput = {
      hskLevel,
      ...(search
        ? {
            OR: [
              { simplified: { contains: search } },
              { pinyin: { contains: search, mode: 'insensitive' } },
              { pinyinNumeric: { contains: search, mode: 'insensitive' } },
              { hanViet: { contains: search, mode: 'insensitive' } },
              { meaningVi: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.state === 'new' ? { userWords: { none: { userId } } } : {}),
      ...(query.state === 'learning'
        ? { userWords: { some: { userId, state: { in: ['LEARNING', 'REVIEW', 'RELEARNING'] } } } }
        : {}),
      ...(query.state === 'mastered' ? { userWords: { some: { userId, state: 'MASTERED' } } } : {}),
    };

    const orderBy: Prisma.ChineseWordOrderByWithRelationInput[] =
      query.sort === 'pinyin'
        ? [{ pinyinNumeric: 'asc' }]
        : query.sort === 'strokes'
          ? [{ simplified: 'asc' }]
          : [{ frequencyRank: 'asc' }, { simplified: 'asc' }];

    const [total, rows] = await Promise.all([
      this.prisma.chineseWord.count({ where }),
      this.prisma.chineseWord.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          userWords: { where: { userId }, select: { state: true, dueAt: true, isFavorite: true } },
        },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        simplified: row.simplified,
        traditional: row.traditional,
        pinyin: row.pinyin,
        hanViet: row.hanViet,
        meaningVi: row.meaningVi,
        meaningEn: row.meaningEn,
        hskLevel: row.hskLevel,
        pos: row.pos,
        classifiers: row.classifiers,
        frequencyRank: row.frequencyRank,
        srsState: row.userWords[0]?.state ?? null,
        dueAt: row.userWords[0]?.dueAt ?? null,
        isFavorite: row.userWords[0]?.isFavorite ?? false,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /** Một chữ Hán: âm đọc, số nét, các từ chứa nó. */
  async hanziDetail(userId: string, character: string) {
    const hanzi = await this.prisma.hanzi.findUnique({
      where: { character },
      include: {
        userHanzi: { where: { userId }, select: { canWrite: true, sheetsPrinted: true } },
        words: {
          orderBy: { word: { frequencyRank: 'asc' } },
          take: 12,
          include: {
            word: {
              select: {
                simplified: true, pinyin: true, hanViet: true, meaningVi: true, hskLevel: true,
              },
            },
          },
        },
      },
    });

    if (!hanzi) throw AppException.notFound('Chữ Hán');

    return {
      character: hanzi.character,
      traditional: hanzi.traditional,
      pinyinNumeric: hanzi.pinyinNumeric,
      hanViet: hanzi.hanViet,
      strokeCount: hanzi.strokeCount,
      meaningVi: hanzi.meaningVi,
      hskLevel: hanzi.hskLevel,
      canWrite: hanzi.userHanzi[0]?.canWrite ?? false,
      sheetsPrinted: hanzi.userHanzi[0]?.sheetsPrinted ?? 0,
      words: hanzi.words.map((link) => link.word),
    };
  }

  /** Danh sách chữ, dùng cho màn chọn chữ tập viết. */
  async hanziList(userId: string, query: HanziListQuery) {
    const search = query.search?.trim();
    const where: Prisma.HanziWhereInput = {
      ...(query.hsk ? { hskLevel: query.hsk } : {}),
      ...(search
        ? {
            OR: [
              { character: { contains: search } },
              { hanViet: { contains: search, mode: 'insensitive' } },
              { meaningVi: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.onlyUnwritten ? { userHanzi: { none: { userId, canWrite: true } } } : {}),
    };

    const orderBy: Prisma.HanziOrderByWithRelationInput[] =
      query.sort === 'strokes'
        ? [{ strokeCount: 'asc' }, { character: 'asc' }]
        : query.sort === 'pinyin'
          ? [{ pinyinNumeric: 'asc' }]
          : [{ hskLevel: 'asc' }, { strokeCount: 'asc' }];

    const [total, rows] = await Promise.all([
      this.prisma.hanzi.count({ where }),
      this.prisma.hanzi.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { userHanzi: { where: { userId }, select: { canWrite: true } } },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        character: row.character,
        pinyinNumeric: row.pinyinNumeric,
        hanViet: row.hanViet,
        strokeCount: row.strokeCount,
        meaningVi: row.meaningVi,
        hskLevel: row.hskLevel,
        canWrite: row.userHanzi[0]?.canWrite ?? false,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /** Người học tự đánh dấu đã viết thuộc một chữ. */
  async markHanzi(userId: string, character: string, canWrite: boolean) {
    const hanzi = await this.prisma.hanzi.findUnique({ where: { character }, select: { id: true } });
    if (!hanzi) throw AppException.notFound('Chữ Hán');

    const row = await this.prisma.userHanzi.upsert({
      where: { userId_hanziId: { userId, hanziId: hanzi.id } },
      update: { canWrite, lastReviewedAt: new Date() },
      create: { userId, hanziId: hanzi.id, canWrite, dueAt: new Date() },
    });
    return { character, canWrite: row.canWrite };
  }
}
