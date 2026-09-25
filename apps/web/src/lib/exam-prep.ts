import type { ExamCatalog, ExamPack, ExamAttemptSummary } from '@sprout/shared';
import { api } from './api-client';

export const examKeys = {
  catalog: ['exam-prep', 'catalog'] as const,
  pack: (exam: string, level: string) => ['exam-prep', exam, level] as const,
  history: ['exam-prep', 'history'] as const,
};
export const examFetchers = {
  catalog: () => api.get<ExamCatalog>('/exam-prep'),
  pack: (exam: string, level: string) => api.get<ExamPack>(`/exam-prep/${encodeURIComponent(exam)}/${encodeURIComponent(level)}`),
  history: () => api.get<ExamAttemptSummary[]>('/exam-prep/history'),
};
export const EXAM_SKILLS = ['vocabulary', 'reading', 'listening', 'writing', 'speaking'] as const;
export type ExamSkillTab = typeof EXAM_SKILLS[number];
export const EXAM_SKILL_LABELS: Record<ExamSkillTab, string> = {
  vocabulary: 'Từ vựng', reading: 'Đọc', listening: 'Nghe', writing: 'Viết', speaking: 'Nói',
};
export function formatExamTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
