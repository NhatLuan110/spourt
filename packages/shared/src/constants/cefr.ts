export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const CEFR_ORDER: Record<CefrLevel, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
};

export const CEFR_LABEL_VI: Record<CefrLevel, string> = {
  A1: 'Mới bắt đầu',
  A2: 'Sơ cấp',
  B1: 'Trung cấp',
  B2: 'Trung cấp trên',
  C1: 'Cao cấp',
  C2: 'Thành thạo',
};

/** §9.7 — SkillScore 0..100 mapped onto a CEFR band. */
export function cefrFromScore(score: number): CefrLevel {
  if (score < 25) return 'A1';
  if (score < 40) return 'A2';
  if (score < 58) return 'B1';
  if (score < 75) return 'B2';
  if (score <= 88) return 'C1';
  return 'C2';
}

export function stepCefr(level: CefrLevel, delta: number): CefrLevel {
  const index = Math.min(CEFR_LEVELS.length - 1, Math.max(0, CEFR_ORDER[level] + delta));
  return CEFR_LEVELS[index] as CefrLevel;
}

export function compareCefr(a: CefrLevel, b: CefrLevel): number {
  return CEFR_ORDER[a] - CEFR_ORDER[b];
}
