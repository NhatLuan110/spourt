import { Injectable } from '@nestjs/common';
import type { WorksheetQuery } from '@sprout/shared';
import { HSK_LEVELS_BY_KEY } from '@sprout/shared';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';

export interface WorksheetCell {
  character: string;
  pinyinNumeric: string | null;
  hanViet: string | null;
  meaningVi: string | null;
  strokeCount: number | null;
  /** Từ tiêu biểu chứa chữ này, in ở cuối dòng để chữ có ngữ cảnh. */
  sampleWord: { simplified: string; pinyin: string; meaningVi: string } | null;
}

export interface Worksheet {
  title: string;
  subtitle: string;
  cells: WorksheetCell[];
  /** Tổng số chữ của nguồn, để biết còn bao nhiêu trang nữa. */
  totalAvailable: number;
  offset: number;
}

const HAN = /\p{Script=Han}/u;

/**
 * Dựng dữ liệu cho bảng tập viết A4. Bản thân nét bút không đi qua API — trang
 * in tự nạp `/hanzi-data/<chữ>.json` — nên phản hồi ở đây luôn nhỏ và in được
 * cả khi ngoại tuyến sau lần nạp đầu.
 */
@Injectable()
export class WorksheetService {
  constructor(private readonly prisma: PrismaService) {}

  async build(userId: string, query: WorksheetQuery): Promise<Worksheet> {
    const { characters, title, subtitle, totalAvailable } = await this.resolve(userId, query);
    const cells = await this.decorate(characters);
    return { title, subtitle, cells, totalAvailable, offset: query.offset };
  }

  /** Chọn ra danh sách chữ theo nguồn, đã cắt theo offset/limit. */
  private async resolve(userId: string, query: WorksheetQuery) {
    switch (query.source) {
      case 'custom': {
        const all = this.uniqueHan(query.chars ?? '');
        if (all.length === 0) throw AppException.validation(null, 'Chưa nhập chữ Hán nào để tập viết.');
        return {
          characters: all.slice(query.offset, query.offset + query.limit),
          title: 'Bảng tập viết tự chọn',
          subtitle: `${all.length} chữ do bạn nhập`,
          totalAvailable: all.length,
        };
      }

      case 'word': {
        const words = (query.words ?? '')
          .split(',')
          .map((word) => word.trim())
          .filter(Boolean);
        if (words.length === 0) throw AppException.validation(null, 'Chưa chọn từ nào để tập viết.');

        const rows = await this.prisma.chineseWord.findMany({
          where: { simplified: { in: words } },
          select: { simplified: true },
        });
        const all = this.uniqueHan(rows.map((row) => row.simplified).join(''));
        return {
          characters: all.slice(query.offset, query.offset + query.limit),
          title: 'Bảng tập viết theo từ',
          subtitle: words.slice(0, 8).join(' · ') + (words.length > 8 ? ' …' : ''),
          totalAvailable: all.length,
        };
      }

      case 'due': {
        // Chữ chưa đánh dấu viết được, dễ trước khó sau: ít nét học trước.
        const [total, rows] = await Promise.all([
          this.prisma.hanzi.count({
            where: {
              ...(query.hsk ? { hskLevel: query.hsk } : {}),
              userHanzi: { none: { userId, canWrite: true } },
            },
          }),
          this.prisma.hanzi.findMany({
            where: {
              ...(query.hsk ? { hskLevel: query.hsk } : {}),
              userHanzi: { none: { userId, canWrite: true } },
            },
            orderBy: [{ hskLevel: 'asc' }, { strokeCount: 'asc' }, { character: 'asc' }],
            skip: query.offset,
            take: query.limit,
            select: { character: true },
          }),
        ]);
        return {
          characters: rows.map((row) => row.character),
          title: 'Bảng tập viết — chữ chưa thuộc',
          subtitle: `Còn ${total} chữ chưa đánh dấu viết được`,
          totalAvailable: total,
        };
      }

      case 'hsk':
      default: {
        const level = query.hsk ?? 'HSK1';
        const where = { hskLevel: level };
        const [total, rows] = await Promise.all([
          this.prisma.hanzi.count({ where }),
          this.prisma.hanzi.findMany({
            where,
            orderBy: [{ strokeCount: 'asc' }, { character: 'asc' }],
            skip: query.offset,
            take: query.limit,
            select: { character: true },
          }),
        ]);
        const meta = HSK_LEVELS_BY_KEY[level];
        return {
          characters: rows.map((row) => row.character),
          title: `Bảng tập viết ${meta.labelVi}`,
          subtitle: `${total} chữ Hán · xếp từ ít nét đến nhiều nét`,
          totalAvailable: total,
        };
      }
    }
  }

  /** Gắn âm đọc, nghĩa và một từ ví dụ cho từng chữ. */
  private async decorate(characters: string[]): Promise<WorksheetCell[]> {
    if (characters.length === 0) return [];

    const rows = await this.prisma.hanzi.findMany({
      where: { character: { in: characters } },
      include: {
        words: {
          orderBy: { word: { frequencyRank: 'asc' } },
          take: 1,
          include: {
            word: { select: { simplified: true, pinyin: true, meaningVi: true } },
          },
        },
      },
    });

    const byChar = new Map(rows.map((row) => [row.character, row]));
    // Giữ đúng thứ tự người dùng chọn, không theo thứ tự cơ sở dữ liệu trả về.
    return characters.map((character) => {
      const row = byChar.get(character);
      const sample = row?.words[0]?.word ?? null;
      return {
        character,
        pinyinNumeric: row?.pinyinNumeric ?? null,
        hanViet: row?.hanViet ?? null,
        meaningVi: row?.meaningVi ?? null,
        strokeCount: row?.strokeCount ?? null,
        sampleWord: sample
          ? { simplified: sample.simplified, pinyin: sample.pinyin, meaningVi: sample.meaningVi }
          : null,
      };
    });
  }

  private uniqueHan(source: string): string[] {
    const seen = new Set<string>();
    for (const char of source) if (HAN.test(char)) seen.add(char);
    return [...seen];
  }
}
