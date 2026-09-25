/**
 * Lớp gọi API của ngăn tiếng Trung. Tách khỏi `queries.ts` để kho tiếng Anh
 * không phải gánh thêm kiểu dữ liệu của một ngăn mà nó không dùng.
 */
import { api } from '@/lib/api-client';
import type { HskLevel } from '@sprout/shared';

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
  canWriteCount: number;
  progressPct: number;
  recommended: boolean;
}

export interface ChineseWordRow {
  id: string;
  simplified: string;
  traditional: string | null;
  pinyin: string;
  hanViet: string | null;
  meaningVi: string;
  meaningEn: string | null;
  hskLevel: HskLevel;
  pos: string[];
  classifiers: string[];
  frequencyRank: number | null;
  srsState: string | null;
  dueAt: string | null;
  isFavorite: boolean;
}

export interface HanziRow {
  character: string;
  pinyinNumeric: string | null;
  hanViet: string | null;
  strokeCount: number | null;
  meaningVi: string | null;
  hskLevel: HskLevel;
  canWrite: boolean;
}

export interface HanziDetail extends HanziRow {
  traditional: string | null;
  sheetsPrinted: number;
  words: { simplified: string; pinyin: string; hanViet: string | null; meaningVi: string; hskLevel: HskLevel }[];
}

export interface WorksheetCell {
  character: string;
  pinyinNumeric: string | null;
  hanViet: string | null;
  meaningVi: string | null;
  strokeCount: number | null;
  sampleWord: { simplified: string; pinyin: string; meaningVi: string } | null;
}

export interface Worksheet {
  title: string;
  subtitle: string;
  cells: WorksheetCell[];
  totalAvailable: number;
  offset: number;
}

export interface PagedChinese<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

type Params = Record<string, string | number | boolean | undefined>;

function toQuery(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

/**
 * Danh sách trả về theo dạng `{ items, page, total… }` chứ không phải phong bì
 * `{ data, meta }` như các endpoint tiếng Anh, nên chuẩn hoá lại một lần ở đây.
 */
interface ListEnvelope<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function normalise<T>(payload: ListEnvelope<T>): PagedChinese<T> {
  return {
    data: payload.items,
    meta: {
      page: payload.page,
      limit: payload.limit,
      total: payload.total,
      totalPages: payload.totalPages,
    },
  };
}

export const chineseApi = {
  levels: () => api.get<HskLevelCard[]>('/chinese/levels'),

  words: async (level: HskLevel, params: Params) =>
    normalise(await api.get<ListEnvelope<ChineseWordRow>>(`/chinese/levels/${level}/words?${toQuery(params)}`)),

  hanziList: async (params: Params) =>
    normalise(await api.get<ListEnvelope<HanziRow>>(`/chinese/hanzi?${toQuery(params)}`)),

  hanzi: (character: string) =>
    api.get<HanziDetail>(`/chinese/hanzi/${encodeURIComponent(character)}`),

  markHanzi: (character: string, canWrite: boolean) =>
    api.patch<{ character: string; canWrite: boolean }>(
      `/chinese/hanzi/${encodeURIComponent(character)}`,
      { canWrite },
    ),

  worksheet: (params: Params) => api.get<Worksheet>(`/chinese/worksheet?${toQuery(params)}`),

  learn: (hsk: HskLevel, limit = 10) =>
    api.get<ChineseCard[]>(`/chinese/learn?hsk=${hsk}&limit=${limit}`),

  reviewQueue: (limit = 20) => api.get<ChineseCard[]>(`/chinese/review?limit=${limit}`),

  grade: (wordId: string, grade: 0 | 1 | 2 | 3, responseMs: number) =>
    api.post<GradeResult>(`/chinese/review/${wordId}`, { grade, responseMs }),

  stats: () => api.get<ChineseStats>('/chinese/stats'),

  forecast: (days = 30) =>
    api.get<{ date: string; count: number }[]>(`/chinese/forecast?days=${days}`),
};

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
  srsState: string | null;
  /** Ba nghĩa sai cùng cấp, dùng làm đáp án nhiễu. */
  distractors: string[];
}

export interface GradeResult {
  wordId: string;
  state: string;
  dueAt: string;
  intervalDays: number;
  nextReviewIn: string;
}

export interface ChineseStats {
  learnedTotal: number;
  totalWords: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  masteredCount: number;
  dueNow: number;
  hanziWritten: number;
  totalHanzi: number;
  accuracyPct: number;
  byLevel: { hskLevel: HskLevel; learned: number }[];
}

export const chineseKeys = {
  levels: ['chinese', 'levels'] as const,
  words: (level: string, params: Params) => ['chinese', 'words', level, params] as const,
  hanziList: (params: Params) => ['chinese', 'hanzi', params] as const,
  hanzi: (character: string) => ['chinese', 'hanzi', character] as const,
  worksheet: (params: Params) => ['chinese', 'worksheet', params] as const,
  learn: (hsk: string) => ['chinese', 'learn', hsk] as const,
  reviewQueue: ['chinese', 'review'] as const,
  stats: ['chinese', 'stats'] as const,
  forecast: (days: number) => ['chinese', 'forecast', days] as const,
};

// ---------------------------------------------------------------------------
// Nét bút
// ---------------------------------------------------------------------------

export interface StrokeData {
  /** Đường SVG của từng nét, theo hệ toạ độ 1024×1024 của hanzi-writer. */
  strokes: string[];
  /** Đường trung tuyến mỗi nét, dùng để vẽ mũi tên hướng bút. */
  medians: [number, number][][];
}

const strokeCache = new Map<string, Promise<StrokeData | null>>();

/**
 * Nét bút nằm ở tệp tĩnh cạnh trang web, không đi qua API. Nhờ vậy trình duyệt
 * tự lo phần cache, và một tờ tập viết 40 chữ chỉ tốn 40 request nhỏ nạp song song.
 */
export function loadStrokes(character: string): Promise<StrokeData | null> {
  const cached = strokeCache.get(character);
  if (cached) return cached;

  const request = fetch(`/hanzi-data/${encodeURIComponent(character)}.json`)
    .then((response) => (response.ok ? (response.json() as Promise<StrokeData>) : null))
    .catch(() => null);

  strokeCache.set(character, request);
  return request;
}
