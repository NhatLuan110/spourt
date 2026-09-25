import type { Skill } from '@sprout/shared';
import type { IconName } from '@/components/ui/icon';

export interface NavItem {
  key: string;
  href: string;
  icon: IconName;
  skill?: Skill;
  /** Routes not built yet render as disabled rather than 404. */
  ready: boolean;
  /** Only shown to administrators; the API refuses it for anyone else anyway. */
  adminOnly?: boolean;
  /**
   * Màu nhấn của mục, lấy từ bảng token. Mỗi mục một sắc riêng để thanh điều
   * hướng đọc được bằng màu chứ không chỉ bằng chữ.
   */
  tint: string;
}

/** §3.4 — desktop sidebar order. */
export const SIDEBAR_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', icon: 'home', ready: true, tint: '--primary' },
  { key: 'vocabulary', href: '/vocabulary', icon: 'vocabulary', skill: 'VOCABULARY', ready: true, tint: '--success' },
  { key: 'wordClass', href: '/word-class', icon: 'wordClass', skill: 'VOCABULARY', ready: true, tint: '--moss' },
  { key: 'listening', href: '/listening', icon: 'listening', skill: 'LISTENING', ready: true, tint: '--info' },
  { key: 'speaking', href: '/speaking', icon: 'speaking', skill: 'SPEAKING', ready: true, tint: '--clay' },
  { key: 'writing', href: '/writing', icon: 'writing', skill: 'WRITING', ready: true, tint: '--accent' },
  { key: 'grammar', href: '/grammar', icon: 'grammar', skill: 'GRAMMAR', ready: true, tint: '--bark' },
  { key: 'reading', href: '/reading', icon: 'reading', skill: 'READING', ready: true, tint: '--info' },
  { key: 'sentence', href: '/sentence', icon: 'sentence', skill: 'GRAMMAR', ready: true, tint: '--moss' },
  { key: 'tutor', href: '/tutor', icon: 'tutor', ready: true, tint: '--primary' },
  { key: 'tests', href: '/tests', icon: 'tests', ready: true, tint: '--warning' },
  { key: 'examPrep', href: '/exam-prep', icon: 'tests', ready: true, tint: '--accent' },
  { key: 'analytics', href: '/analytics', icon: 'analytics', ready: true, tint: '--clay' },
  { key: 'admin', href: '/admin', icon: 'admin', ready: true, adminOnly: true, tint: '--text-muted' },
];

/** §3.4 — five items only on mobile. */
export const BOTTOM_BAR_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', icon: 'home', ready: true, tint: '--primary' },
  { key: 'learn', href: '/vocabulary', icon: 'vocabulary', ready: true, tint: '--success' },
  { key: 'speaking', href: '/speaking', icon: 'speaking', ready: true, tint: '--clay' },
  { key: 'tutor', href: '/tutor', icon: 'tutor', ready: true, tint: '--primary' },
  { key: 'me', href: '/settings', icon: 'user', ready: true, tint: '--text-muted' },
];

/**
 * D-101 — sidebar khi người học đang ở ngăn tiếng Trung. Danh sách tiếng Anh ở
 * trên giữ nguyên không đụng tới; layout chọn một trong hai theo đường dẫn.
 */
export const CHINESE_SIDEBAR_ITEMS: NavItem[] = [
  { key: 'chineseHome', href: '/chinese', icon: 'route', ready: true, tint: '--danger' },
  { key: 'chinesePinyin', href: '/chinese/pinyin', icon: 'tone', ready: true, tint: '--accent' },
  { key: 'chineseVocabulary', href: '/chinese/vocabulary', icon: 'vocabulary', ready: true, tint: '--success' },
  { key: 'chineseListening', href: '/chinese/listening', icon: 'listening', ready: true, tint: '--info' },
  { key: 'chineseSpeaking', href: '/chinese/speaking', icon: 'speaking', ready: true, tint: '--clay' },
  { key: 'chineseWriting', href: '/chinese/writing', icon: 'brush', ready: true, tint: '--bark' },
  { key: 'chineseGrammar', href: '/chinese/grammar', icon: 'grammar', ready: true, tint: '--moss' },
  { key: 'chineseReading', href: '/chinese/reading', icon: 'reading', ready: true, tint: '--info' },
  { key: 'chineseSentence', href: '/chinese/sentence', icon: 'sentence', ready: true, tint: '--moss' },
  { key: 'chineseRadicals', href: '/chinese/radicals', icon: 'radical', ready: true, tint: '--clay' },
  { key: 'chineseTutor', href: '/chinese/tutor', icon: 'tutor', ready: true, tint: '--primary' },
  { key: 'chineseTests', href: '/chinese/tests', icon: 'tests', ready: true, tint: '--warning' },
  { key: 'chineseAnalytics', href: '/chinese/analytics', icon: 'analytics', ready: true, tint: '--accent' },
  { key: 'chineseHanzi', href: '/chinese/hanzi', icon: 'search', ready: true, tint: '--text-muted' },
];

/** Thanh dưới trên điện thoại khi ở ngăn tiếng Trung. */
export const CHINESE_BOTTOM_BAR_ITEMS: NavItem[] = [
  { key: 'chineseHome', href: '/chinese', icon: 'route', ready: true, tint: '--danger' },
  { key: 'chineseVocabulary', href: '/chinese/vocabulary', icon: 'vocabulary', ready: true, tint: '--success' },
  { key: 'chineseSpeaking', href: '/chinese/speaking', icon: 'speaking', ready: true, tint: '--clay' },
  { key: 'chineseWriting', href: '/chinese/writing', icon: 'brush', ready: true, tint: '--bark' },
  { key: 'me', href: '/settings', icon: 'user', ready: true, tint: '--text-muted' },
];
