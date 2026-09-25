/**
 * D-101 — Sprout chia thành các ngăn học độc lập. Mỗi ngăn có kho nội dung, lịch
 * ôn và bộ điều hướng riêng; đổi ngăn không đụng gì tới tiến độ của ngăn kia.
 */
export const LEARNING_TRACKS = ['ENGLISH', 'CHINESE'] as const;
export type LearningTrack = (typeof LEARNING_TRACKS)[number];

export interface TrackMeta {
  key: LearningTrack;
  /** Tiền tố đường dẫn. Ngăn tiếng Anh giữ nguyên các route cũ nên để rỗng. */
  basePath: string;
  labelVi: string;
  shortVi: string;
  emoji: string;
  description: string;
}

export const TRACKS: Record<LearningTrack, TrackMeta> = {
  ENGLISH: {
    key: 'ENGLISH',
    basePath: '',
    labelVi: 'Tiếng Anh',
    shortVi: 'Anh',
    emoji: '🌱',
    description: 'Từ vựng, ngữ pháp, nghe nói đọc viết theo khung CEFR.',
  },
  CHINESE: {
    key: 'CHINESE',
    basePath: '/chinese',
    labelVi: 'Tiếng Trung',
    shortVi: 'Trung',
    emoji: '🀄',
    description: 'Pinyin, chữ Hán, từ vựng và tập viết theo khung HSK 1–6.',
  },
};

export const TRACK_LIST: TrackMeta[] = [TRACKS.ENGLISH, TRACKS.CHINESE];

// ---------------------------------------------------------------------------
// HSK
// ---------------------------------------------------------------------------

export const HSK_LEVELS = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'] as const;
export type HskLevel = (typeof HSK_LEVELS)[number];

export interface HskLevelMeta {
  key: HskLevel;
  number: number;
  /** Số từ mới của riêng cấp này theo chuẩn HSK 2.0. */
  wordCount: number;
  labelVi: string;
  description: string;
  emoji: string;
  colorToken: string;
}

/**
 * Số từ lấy đúng theo bộ đề HSK 2.0: 150 / 150 / 300 / 600 / 1300 / 2500. Kho
 * thực tế lệch vài từ ở HSK 2 và 3 vì bộ dữ liệu gốc gộp một số mục trùng, nên
 * màn hình luôn hiển thị số đếm từ cơ sở dữ liệu chứ không dùng số này.
 */
export const HSK_LEVEL_LIST: HskLevelMeta[] = [
  {
    key: 'HSK1',
    number: 1,
    wordCount: 150,
    labelVi: 'HSK 1 · Nhập môn',
    description: 'Chào hỏi, số đếm, gia đình. Đủ để nói những câu đầu tiên.',
    emoji: '🌱',
    colorToken: '--primary',
  },
  {
    key: 'HSK2',
    number: 2,
    wordCount: 150,
    labelVi: 'HSK 2 · Sơ cấp',
    description: 'Mua sắm, thời gian, đi lại. Giao tiếp ngắn trong sinh hoạt.',
    emoji: '🌿',
    colorToken: '--success',
  },
  {
    key: 'HSK3',
    number: 3,
    wordCount: 300,
    labelVi: 'HSK 3 · Sơ trung cấp',
    description: 'Kể chuyện đời thường, học tập, công việc, sức khoẻ.',
    emoji: '🌳',
    colorToken: '--info',
  },
  {
    key: 'HSK4',
    number: 4,
    wordCount: 600,
    labelVi: 'HSK 4 · Trung cấp',
    description: 'Bàn luận, nêu ý kiến, đọc bài báo ngắn.',
    emoji: '🏮',
    colorToken: '--warning',
  },
  {
    key: 'HSK5',
    number: 5,
    wordCount: 1300,
    labelVi: 'HSK 5 · Trung cao cấp',
    description: 'Đọc báo, xem phim, trình bày quan điểm mạch lạc.',
    emoji: '🐉',
    colorToken: '--accent',
  },
  {
    key: 'HSK6',
    number: 6,
    wordCount: 2500,
    labelVi: 'HSK 6 · Cao cấp',
    description: 'Thành ngữ, văn viết, nghe hiểu gần như người bản ngữ.',
    emoji: '🎐',
    colorToken: '--danger',
  },
];

export const HSK_LEVELS_BY_KEY: Record<HskLevel, HskLevelMeta> = Object.fromEntries(
  HSK_LEVEL_LIST.map((level) => [level.key, level]),
) as Record<HskLevel, HskLevelMeta>;

export function hskLevelFromNumber(value: number): HskLevel | null {
  const found = HSK_LEVEL_LIST.find((level) => level.number === value);
  return found?.key ?? null;
}

// ---------------------------------------------------------------------------
// Pinyin
// ---------------------------------------------------------------------------

/**
 * Bốn thanh cộng thanh nhẹ. Màu thanh điệu dùng thống nhất ở mọi chỗ hiển thị
 * pinyin để người học nhớ thanh bằng mắt trước khi nhớ bằng tai.
 */
export const PINYIN_TONES = [
  { tone: 1, mark: 'ā', nameVi: 'Thanh 1 — cao và đều', hint: 'Giữ giọng cao, kéo ngang.', colorToken: '--tone-1' },
  { tone: 2, mark: 'á', nameVi: 'Thanh 2 — đi lên', hint: 'Như khi hỏi lại "hả?".', colorToken: '--tone-2' },
  { tone: 3, mark: 'ǎ', nameVi: 'Thanh 3 — xuống rồi lên', hint: 'Hạ giọng thật thấp rồi nhấc lên.', colorToken: '--tone-3' },
  { tone: 4, mark: 'à', nameVi: 'Thanh 4 — đi xuống', hint: 'Dứt khoát như ra lệnh.', colorToken: '--tone-4' },
  { tone: 5, mark: 'a', nameVi: 'Thanh nhẹ', hint: 'Đọc nhẹ và ngắn, không nhấn.', colorToken: '--tone-5' },
] as const;

/** Số thanh của một âm tiết pinyin ghi kiểu "hao3" → 3, "de5"/"de" → 5. */
export function toneOf(pinyinNumeric: string): number {
  const digit = /([1-5])$/.exec(pinyinNumeric.trim());
  return digit ? Number(digit[1]) : 5;
}
