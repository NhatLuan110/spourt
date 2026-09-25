import type { XpSource } from './skills.js';

/** §9.2 — base XP awards. Values that depend on accuracy are computed in packages/scoring. */
export const XP_BASE = {
  NEW_WORD: 5,
  REVIEW_CORRECT: 2,
  REVIEW_WRONG: 1,
  GRAMMAR_LESSON: 20,
  GRAMMAR_ACCURACY_BONUS: 15,
  READING_LESSON: 20,
  READING_ACCURACY_BONUS: 15,
  LISTENING_LESSON: 15,
  LISTENING_ACCURACY_BONUS: 10,
  DICTATION_COMPLETE: 25,
  SPEAKING_PASS: 20,
  SPEAKING_EXCELLENT: 30,
  ROLEPLAY_SESSION: 40,
  WRITING_SUBMISSION: 30,
  WRITING_SCORE_BONUS: 20,
  DAILY_GOAL_BONUS: 50,
  DAILY_CHALLENGE: 30,
  WEEKLY_CHALLENGE: 150,
} as const;

/** §9.2 — anti-grind ceiling: review activity alone cannot exceed this per day. */
export const XP_DAILY_REVIEW_CAP = 300;

/** §9.2 — streak multiplier, hard-capped at 1.5. */
export const STREAK_MULTIPLIER_CAP = 1.5;

export function streakMultiplier(streakDays: number): number {
  if (streakDays >= 100) return 1.3;
  if (streakDays >= 30) return 1.2;
  if (streakDays >= 7) return 1.1;
  return 1.0;
}

/** §9.2 — xpToReach(L) = 50 x (L-1) x L */
export function xpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * (level - 1) * level;
}

/** §9.2 — level(xp) = floor((1 + sqrt(1 + xp/12.5)) / 2) */
export function levelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 1;
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + totalXp / 12.5)) / 2));
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPct: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromXp(totalXp);
  const floorXp = xpToReachLevel(level);
  const ceilingXp = xpToReachLevel(level + 1);
  const span = Math.max(1, ceilingXp - floorXp);
  const xpIntoLevel = Math.max(0, totalXp - floorXp);
  return {
    level,
    xpIntoLevel,
    xpForNextLevel: span,
    progressPct: Math.min(100, Math.round((xpIntoLevel / span) * 100)),
  };
}

/** §9.2 — 1 coin per 10 XP earned. */
export function coinsFromXp(xp: number): number {
  return Math.floor(xp / 10);
}

export interface TreeStage {
  stage: number;
  key: string;
  nameVi: string;
  emoji: string;
  minXp: number;
  descriptionVi: string;
}

/** §3.5 — six growth stages of the learning tree. */
export const TREE_STAGES: TreeStage[] = [
  { stage: 1, key: 'seed', nameVi: 'Hạt', emoji: '🌰', minXp: 0, descriptionVi: 'Hạt trong đất' },
  { stage: 2, key: 'sprout', nameVi: 'Mầm', emoji: '🌱', minXp: 300, descriptionVi: 'Hai lá mầm' },
  {
    stage: 3,
    key: 'sapling',
    nameVi: 'Cây non',
    emoji: '🪴',
    minXp: 1500,
    descriptionVi: 'Thân nhỏ, 6-8 lá',
  },
  { stage: 4, key: 'tree', nameVi: 'Cây', emoji: '🌳', minXp: 5000, descriptionVi: 'Tán lá đầy' },
  {
    stage: 5,
    key: 'ancient',
    nameVi: 'Cổ thụ',
    emoji: '🌲',
    minXp: 15000,
    descriptionVi: 'Thân dày, có hoa',
  },
  {
    stage: 6,
    key: 'garden',
    nameVi: 'Vườn',
    emoji: '🏞️',
    minXp: 40000,
    descriptionVi: 'Nhiều cây và chim',
  },
];

export function treeStageFromXp(totalXp: number): TreeStage {
  let current = TREE_STAGES[0] as TreeStage;
  for (const stage of TREE_STAGES) {
    if (totalXp >= stage.minXp) current = stage;
  }
  return current;
}

/**
 * §3.5 — health reflects missed days but never destroys the tree.
 * 0 missed days = healthy, 1-2 = leaves yellowing, 3+ = wilting with a "water me" CTA.
 */
export type TreeHealth = 'healthy' | 'yellowing' | 'wilting';

export function treeHealth(daysSinceLastStudy: number): TreeHealth {
  if (daysSinceLastStudy >= 3) return 'wilting';
  if (daysSinceLastStudy >= 1) return 'yellowing';
  return 'healthy';
}

/** §7.12 — coin shop. */
export interface ShopItem {
  slug: string;
  nameVi: string;
  price: number;
  descriptionVi: string;
  repeatable: boolean;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    slug: 'streak-freeze',
    nameVi: 'Streak Freeze',
    price: 50,
    descriptionVi: 'Giữ chuỗi ngày học khi bạn lỡ một ngày. Tối đa giữ 3 cái.',
    repeatable: true,
  },
  {
    slug: 'hint-pack',
    nameVi: 'Gói gợi ý x10',
    price: 30,
    descriptionVi: 'Thêm 10 lượt gợi ý trong bài tập.',
    repeatable: true,
  },
  {
    slug: 'seasonal-theme',
    nameVi: 'Giao diện theo mùa',
    price: 200,
    descriptionVi: 'Mở khoá bảng màu bốn mùa cho cây của bạn.',
    repeatable: false,
  },
  {
    slug: 'tree-skin',
    nameVi: 'Skin cây',
    price: 300,
    descriptionVi: 'Đổi hình dáng cây học tập.',
    repeatable: false,
  },
  {
    slug: 'ai-messages',
    nameVi: 'Thêm 10 tin nhắn AI',
    price: 40,
    descriptionVi: 'Tăng hạn mức trò chuyện với AI Tutor hôm nay.',
    repeatable: true,
  },
  {
    slug: 'rename-garden',
    nameVi: 'Đổi tên vườn',
    price: 100,
    descriptionVi: 'Đặt tên riêng cho khu vườn của bạn.',
    repeatable: true,
  },
];

/** §9.4 — streak rules. */
export const STREAK = {
  MAX_FREEZES: 3,
  FREEZE_PRICE: 50,
  REPAIR_PRICE: 100,
  REPAIR_WINDOW_HOURS: 48,
  MIN_CARDS_FOR_DAY: 5,
  MILESTONES: [7, 30, 100, 365],
} as const;

/** §10.1 — free-tier AI quotas per day. */
export const AI_DAILY_QUOTA = {
  TUTOR_MESSAGES: 20,
  WRITING_SUBMISSIONS: 3,
  ROLEPLAY_TURNS: 10,
} as const;

export const XP_SOURCE_LABEL_VI: Record<XpSource, string> = {
  NEW_WORD: 'Từ mới',
  REVIEW: 'Ôn tập',
  LESSON: 'Bài học',
  QUIZ: 'Bài kiểm tra nhanh',
  LISTENING: 'Nghe',
  SPEAKING: 'Nói',
  WRITING: 'Viết',
  READING: 'Đọc',
  TEST: 'Bài thi',
  CHALLENGE: 'Thử thách',
  STREAK_BONUS: 'Thưởng chuỗi ngày',
  ACHIEVEMENT: 'Thành tựu',
};
