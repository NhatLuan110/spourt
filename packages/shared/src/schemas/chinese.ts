import { z } from 'zod';
import { paginationQuerySchema } from './common.js';
import { HSK_LEVELS, LEARNING_TRACKS } from '../constants/tracks.js';

export const hskLevelSchema = z.enum(HSK_LEVELS);
export const learningTrackSchema = z.enum(LEARNING_TRACKS);

export const chineseWordListQuerySchema = paginationQuerySchema.extend({
  /** Tìm được cả bằng chữ Hán, pinyin, âm Hán Việt lẫn nghĩa tiếng Việt. */
  search: z.string().trim().max(64).optional(),
  sort: z.enum(['frequency', 'strokes', 'pinyin', 'learned']).default('frequency'),
  state: z.enum(['all', 'new', 'learning', 'mastered']).default('all'),
});
export type ChineseWordListQuery = z.infer<typeof chineseWordListQuerySchema>;

export const hanziListQuerySchema = paginationQuerySchema.extend({
  hsk: hskLevelSchema.optional(),
  search: z.string().trim().max(64).optional(),
  sort: z.enum(['hsk', 'strokes', 'pinyin']).default('hsk'),
  /** Chỉ lấy chữ người học chưa đánh dấu viết được, để dựng bảng tập viết. */
  onlyUnwritten: z.coerce.boolean().default(false),
});
export type HanziListQuery = z.infer<typeof hanziListQuerySchema>;

// ---------------------------------------------------------------------------
// Bảng tập viết A4
// ---------------------------------------------------------------------------

/** Kiểu ô kẻ: 田 chia bốn, 米 chia tám, hoặc ô trơn cho người đã quen. */
export const GRID_STYLES = ['tian', 'mi', 'blank'] as const;
export type GridStyle = (typeof GRID_STYLES)[number];

export const WORKSHEET_SOURCES = ['hsk', 'word', 'custom', 'due'] as const;

export const worksheetQuerySchema = z.object({
  source: z.enum(WORKSHEET_SOURCES).default('hsk'),
  /** Với source=hsk. */
  hsk: hskLevelSchema.optional(),
  /** Với source=word: danh sách từ, ngăn bằng dấu phẩy. */
  words: z.string().trim().max(400).optional(),
  /** Với source=custom: chuỗi chữ Hán người học tự gõ. */
  chars: z.string().trim().max(400).optional(),
  /** Bỏ qua bao nhiêu chữ đầu, để in tiếp trang sau của cùng một cấp. */
  offset: z.coerce.number().int().min(0).default(0),
  /** Số chữ trên một tờ. Mỗi chữ chiếm một dòng. */
  limit: z.coerce.number().int().min(1).max(60).default(12),
  grid: z.enum(GRID_STYLES).default('tian'),
  /** Số ô tô theo nét mờ ở đầu dòng, phần còn lại để trống tự viết. */
  traceCount: z.coerce.number().int().min(0).max(12).default(3),
  /** In kèm pinyin, âm Hán Việt và nghĩa ở đầu mỗi dòng. */
  showMeta: z.coerce.boolean().default(true),
  /** In dải thứ tự nét ở đầu dòng. */
  showStrokeOrder: z.coerce.boolean().default(true),
});
export type WorksheetQuery = z.infer<typeof worksheetQuerySchema>;

export const updateUserHanziSchema = z.object({
  canWrite: z.boolean().optional(),
});
export type UpdateUserHanziInput = z.infer<typeof updateUserHanziSchema>;

export const learnChineseWordSchema = z.object({
  source: z.enum(['hsk', 'manual', 'worksheet']).default('hsk'),
});
export type LearnChineseWordInput = z.infer<typeof learnChineseWordSchema>;
