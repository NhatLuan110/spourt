import { Injectable } from '@nestjs/common';
import type { HskLevel, Prisma, SrsState } from '@prisma/client';
import { review as applyReview, createCard, buildQueue } from '@sprout/srs';
import type { ReviewGrade, SrsCard } from '@sprout/srs';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';

export interface ChineseCard {
  id: string;
  simplified: string;
  traditional: string | null;
  pinyin: string;
  hanViet: string | null;
  meaningVi: string;
  meaningEn: string | null;
  hskLevel: HskLevel;
  classifiers: string[];
  srsState: SrsState | null;
  /** Ba từ khác cùng cấp, làm đáp án nhiễu cho câu hỏi trắc nghiệm. */
  distractors: string[];
}

/**
 * Lịch ôn của ngăn tiếng Trung. Dùng lại đúng bộ lập lịch `@sprout/srs` của
 * ngăn tiếng Anh — thuật toán không phụ thuộc ngôn ngữ — nhưng ghi vào bảng
 * `UserChineseWord` riêng, nên hai ngăn không giành nhau hàng đợi ôn.
 */
@Injectable()
export class ChineseSrsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Từ mới của một cấp mà người học chưa từng mở. */
  async newCards(userId: string, hskLevel: HskLevel, limit: number): Promise<ChineseCard[]> {
    const rows = await this.prisma.chineseWord.findMany({
      where: { hskLevel, userWords: { none: { userId } } },
      orderBy: [{ frequencyRank: 'asc' }, { simplified: 'asc' }],
      take: limit,
    });
    return this.decorate(rows, hskLevel);
  }

  /** Hàng đợi ôn: thẻ tới hạn, xếp theo thứ tự của bộ lập lịch chung. */
  async dueCards(userId: string, limit: number): Promise<ChineseCard[]> {
    const rows = await this.prisma.userChineseWord.findMany({
      where: { userId, state: { not: 'SUSPENDED' }, dueAt: { lte: new Date() } },
      include: { word: true },
      take: limit * 2,
    });

    const queue = buildQueue({
      candidates: rows.map((row) => ({
        userWordId: row.id,
        wordId: row.wordId,
        dueAt: row.dueAt,
        state: row.state,
        frequencyRank: row.word.frequencyRank,
      })),
      dueBefore: new Date(),
      // Từ mới đi qua màn "Học từ mới" riêng, hàng đợi này chỉ xếp thẻ tới hạn.
      options: { maxReviewsPerDay: limit, newWordsPerDay: 0, limit },
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    const picked = queue.cards
      .map((item) => byId.get(item.userWordId))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    return this.decorate(
      picked.map((row) => row.word),
      null,
      new Map(picked.map((row) => [row.word.id, row.state])),
    );
  }

  /** Chấm một thẻ và dời lịch ôn. */
  async grade(userId: string, wordId: string, grade: ReviewGrade, responseMs: number) {
    const word = await this.prisma.chineseWord.findUnique({ where: { id: wordId } });
    if (!word) throw AppException.notFound('Từ tiếng Trung');

    const existing = await this.prisma.userChineseWord.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    const card: SrsCard = existing
      ? {
          state: existing.state,
          ease: existing.ease,
          intervalDays: existing.intervalDays,
          repetitions: existing.repetitions,
          lapses: existing.lapses,
          learningStep: existing.learningStep,
          totalReviews: existing.totalReviews,
          correctReviews: existing.correctReviews,
        }
      : createCard();

    // Ngày học mới bắt đầu lúc 4 giờ sáng giờ Việt Nam, giống ngăn tiếng Anh —
    // học khuya vẫn tính vào ngày hôm trước.
    const outcome = applyReview(card, grade, {
      now: new Date(),
      timeZone: 'Asia/Ho_Chi_Minh',
      dayRolloverHour: 4,
    });

    const data = {
      state: outcome.card.state,
      ease: outcome.card.ease,
      intervalDays: outcome.card.intervalDays,
      repetitions: outcome.card.repetitions,
      lapses: outcome.card.lapses,
      learningStep: outcome.card.learningStep,
      totalReviews: outcome.card.totalReviews,
      correctReviews: outcome.card.correctReviews,
      dueAt: outcome.dueAt,
      lastReviewedAt: new Date(),
    };

    const saved = await this.prisma.userChineseWord.upsert({
      where: { userId_wordId: { userId, wordId } },
      update: data,
      create: { userId, wordId, ...data },
    });

    return {
      wordId,
      state: saved.state,
      dueAt: saved.dueAt,
      intervalDays: saved.intervalDays,
      // Người học thấy ngay lần ôn kế rơi vào khi nào, giống bên tiếng Anh.
      nextReviewIn: describeInterval(saved.intervalDays, saved.state),
      responseMs,
    };
  }

  /** Số liệu cho màn thống kê của ngăn. */
  async stats(userId: string) {
    const now = new Date();
    const [byState, dueNow, totalWords, hanziWritten, totalHanzi, byLevel] = await Promise.all([
      this.prisma.userChineseWord.groupBy({ by: ['state'], _count: true, where: { userId } }),
      this.prisma.userChineseWord.count({
        where: { userId, dueAt: { lte: now }, state: { not: 'SUSPENDED' } },
      }),
      this.prisma.chineseWord.count(),
      this.prisma.userHanzi.count({ where: { userId, canWrite: true } }),
      this.prisma.hanzi.count(),
      this.prisma.chineseWord.groupBy({
        by: ['hskLevel'],
        _count: true,
        where: { userWords: { some: { userId } } },
      }),
    ]);

    const count = (state: SrsState): number =>
      byState.find((row) => row.state === state)?._count ?? 0;

    const accuracy = await this.prisma.userChineseWord.aggregate({
      where: { userId, totalReviews: { gt: 0 } },
      _sum: { totalReviews: true, correctReviews: true },
    });
    const total = accuracy._sum.totalReviews ?? 0;
    const correct = accuracy._sum.correctReviews ?? 0;

    return {
      learnedTotal: byState.reduce((sum, row) => sum + row._count, 0),
      totalWords,
      newCount: count('NEW'),
      learningCount: count('LEARNING') + count('RELEARNING'),
      reviewCount: count('REVIEW'),
      masteredCount: count('MASTERED'),
      dueNow,
      hanziWritten,
      totalHanzi,
      accuracyPct: total === 0 ? 0 : Math.round((correct / total) * 100),
      byLevel: byLevel.map((row) => ({ hskLevel: row.hskLevel, learned: row._count })),
    };
  }

  /** Lịch ôn sắp tới, mỗi ngày một cột. */
  async forecast(userId: string, days: number) {
    const rows = await this.prisma.userChineseWord.findMany({
      where: { userId, state: { not: 'SUSPENDED' } },
      select: { dueAt: true },
    });

    const buckets = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let offset = 0; offset < days; offset += 1) {
      const day = new Date(today);
      day.setDate(day.getDate() + offset);
      buckets.set(day.toISOString().slice(0, 10), 0);
    }

    for (const row of rows) {
      // Thẻ đã quá hạn dồn hết vào hôm nay chứ không rơi ra ngoài biểu đồ.
      const due = row.dueAt < today ? today : row.dueAt;
      const key = due.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return [...buckets].map(([date, count]) => ({ date, count }));
  }

  /**
   * Gắn ba đáp án nhiễu cho mỗi thẻ. Lấy từ cùng cấp để câu hỏi có độ khó thật:
   * trộn từ HSK 6 vào bài HSK 1 thì đoán mò cũng đúng.
   */
  private async decorate(
    words: { id: string; hskLevel: HskLevel }[],
    hskLevel: HskLevel | null,
    states?: Map<string, SrsState>,
  ): Promise<ChineseCard[]> {
    if (words.length === 0) return [];

    const levels = hskLevel ? [hskLevel] : [...new Set(words.map((word) => word.hskLevel))];
    const pool = await this.prisma.chineseWord.findMany({
      where: { hskLevel: { in: levels } },
      select: { id: true, meaningVi: true },
      take: 400,
      orderBy: { frequencyRank: 'asc' },
    });

    const full = words as unknown as Prisma.ChineseWordGetPayload<object>[];
    return full.map((word) => {
      const others = pool.filter((item) => item.id !== word.id);
      const distractors: string[] = [];
      // Bốc ngẫu nhiên không lặp; pool luôn lớn hơn 3 nên vòng lặp kết thúc nhanh.
      while (distractors.length < 3 && others.length > 0) {
        const index = Math.floor(Math.random() * others.length);
        const [picked] = others.splice(index, 1);
        if (picked && !distractors.includes(picked.meaningVi)) distractors.push(picked.meaningVi);
      }

      return {
        id: word.id,
        simplified: word.simplified,
        traditional: word.traditional,
        pinyin: word.pinyin,
        hanViet: word.hanViet,
        meaningVi: word.meaningVi,
        meaningEn: word.meaningEn,
        hskLevel: word.hskLevel,
        classifiers: word.classifiers,
        srsState: states?.get(word.id) ?? null,
        distractors,
      };
    });
  }
}

/** "2 ngày nữa", "10 phút nữa" — cho người học biết lần ôn kế. */
function describeInterval(intervalDays: number, state: SrsState): string {
  if (state === 'LEARNING' || state === 'RELEARNING') {
    const minutes = Math.max(1, Math.round(intervalDays * 24 * 60));
    return minutes < 60 ? `${minutes} phút nữa` : `${Math.round(minutes / 60)} giờ nữa`;
  }
  const days = Math.max(1, Math.round(intervalDays));
  if (days < 30) return `${days} ngày nữa`;
  if (days < 365) return `${Math.round(days / 30)} tháng nữa`;
  return `${(days / 365).toFixed(1)} năm nữa`;
}
