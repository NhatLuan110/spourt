import type { BadgeTone } from '@/components/ui/badge';

/** §7.3.6 — one Vietnamese label and colour per SRS state, used everywhere. */
export const STATE_LABEL_VI: Record<string, string> = {
  NEW: 'Mới',
  LEARNING: 'Đang học',
  REVIEW: 'Đang ôn',
  RELEARNING: 'Học lại',
  MASTERED: 'Đã thuộc',
  SUSPENDED: 'Tạm dừng',
};

export const STATE_TONE: Record<string, BadgeTone> = {
  NEW: 'info',
  LEARNING: 'primary',
  REVIEW: 'primary',
  RELEARNING: 'warning',
  MASTERED: 'success',
  SUSPENDED: 'neutral',
};

/** §9.1 grading buttons, in the order they are shown. */
export const GRADES = [
  { grade: 0 as const, key: 'againLabel', tone: 'danger' as const },
  { grade: 1 as const, key: 'hardLabel', tone: 'warning' as const },
  { grade: 2 as const, key: 'goodLabel', tone: 'primary' as const },
  { grade: 3 as const, key: 'easyLabel', tone: 'success' as const },
];
