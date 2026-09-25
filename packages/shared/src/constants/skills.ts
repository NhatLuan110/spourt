export const SKILLS = [
  'VOCABULARY',
  'GRAMMAR',
  'LISTENING',
  'SPEAKING',
  'READING',
  'WRITING',
] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABEL_VI: Record<Skill, string> = {
  VOCABULARY: 'Từ vựng',
  GRAMMAR: 'Ngữ pháp',
  LISTENING: 'Nghe',
  SPEAKING: 'Nói',
  READING: 'Đọc',
  WRITING: 'Viết',
};

/** §3.2 — one colour token per skill, used across charts, badges and icons. */
export const SKILL_COLOR_TOKEN: Record<Skill, string> = {
  VOCABULARY: '--primary',
  LISTENING: '--info',
  SPEAKING: '--clay',
  WRITING: '--bark',
  READING: '--moss',
  GRAMMAR: '--accent',
};

export const PARTS_OF_SPEECH = [
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'ADVERB',
  'PRONOUN',
  'PREPOSITION',
  'CONJUNCTION',
  'DETERMINER',
  'INTERJECTION',
  'PHRASAL_VERB',
  'IDIOM',
] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

export const POS_LABEL_VI: Record<PartOfSpeech, string> = {
  NOUN: 'danh từ',
  VERB: 'động từ',
  ADJECTIVE: 'tính từ',
  ADVERB: 'trạng từ',
  PRONOUN: 'đại từ',
  PREPOSITION: 'giới từ',
  CONJUNCTION: 'liên từ',
  DETERMINER: 'từ hạn định',
  INTERJECTION: 'thán từ',
  PHRASAL_VERB: 'cụm động từ',
  IDIOM: 'thành ngữ',
};

export const POS_SHORT: Record<PartOfSpeech, string> = {
  NOUN: 'n.',
  VERB: 'v.',
  ADJECTIVE: 'adj.',
  ADVERB: 'adv.',
  PRONOUN: 'pron.',
  PREPOSITION: 'prep.',
  CONJUNCTION: 'conj.',
  DETERMINER: 'det.',
  INTERJECTION: 'interj.',
  PHRASAL_VERB: 'phr.v.',
  IDIOM: 'idiom',
};

export const EXERCISE_TYPES = [
  'MCQ',
  'GAP_FILL',
  'MATCHING',
  'REORDER',
  'DICTATION',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'REWRITE',
  'WORD_FORM',
  'SPEAKING_REPEAT',
  'SPEAKING_FREE',
  'WRITING',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const SRS_STATES = [
  'NEW',
  'LEARNING',
  'REVIEW',
  'RELEARNING',
  'MASTERED',
  'SUSPENDED',
] as const;
export type SrsState = (typeof SRS_STATES)[number];

export const XP_SOURCES = [
  'NEW_WORD',
  'REVIEW',
  'LESSON',
  'QUIZ',
  'LISTENING',
  'SPEAKING',
  'WRITING',
  'READING',
  'TEST',
  'CHALLENGE',
  'STREAK_BONUS',
  'ACHIEVEMENT',
] as const;
export type XpSource = (typeof XP_SOURCES)[number];
