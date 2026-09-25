import type {
  ActivityResult,
  DashboardResponse,
  DeckDetail,
  DeckSummary,
  DictationLineResult,
  LearnCard,
  LessonCard,
  LessonDetail,
  ListeningCard,
  ListeningDetail,
  PaginationMeta,
  PracticeResult,
  PracticeSet,
  ReadingCard,
  ReadingDetail,
  ReadingSpeedView,
  RewardSummary,
  SrsQueueCard,
  SrsReviewResult,
  TestCard,
  TestDetail,
  TestResult,
  TestRunState,
  AiQuotaView,
  ConversationDetail,
  ConversationSummary,
  TutorMessageView,
  TutorReply,
  WritingFeedback,
  WritingIssue,
  WritingPromptCard,
  WritingSubmissionView,
  FlashcardDeckView,
  AdminOverview,
  AdminContentIssue,
  AdminUserRow,
  RewriteSet,
  RewriteItem,
  RewriteFeedback,
  RewriteResult,
  FlashcardView,
  FlashcardDirection,
  FlashcardSource,
  FlashcardRateResult,
  PronunciationIssueView,
  RoleplayState,
  SpeakingAttemptView,
  SpeakingDrillCard,
  SpeakingScenarioCard,
  SpeakingWordScore,
  SuffixRuleView,
  WordFamilyView,
  WordFormSet,
  WordSummary,
} from '@sprout/shared';

/** §6.1 — list endpoints answer with the envelope, not a bare array. */
export interface Paged<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface TopicCard {
  id: string;
  slug: string;
  nameEn: string;
  nameVi: string;
  emoji: string;
  colorToken: string;
  description: string;
  wordCount: number;
  learnedCount: number;
  masteredCount: number;
  dueCount: number;
  subtopicCount: number;
  progressPct: number;
}

export interface SubtopicCard {
  id: string;
  slug: string;
  nameVi: string;
  nameEn: string;
  emoji: string;
  wordCount: number;
  learnedCount: number;
}

export type TopicDetail = TopicCard & { subtopics: SubtopicCard[] };

export interface WordDetail extends WordSummary {
  syllables: string | null;
  stressPattern: string | null;
  frequencyRank: number | null;
  topics: { slug: string; nameVi: string; emoji: string }[];
  senses: {
    id: string;
    pos: string;
    posLabelVi: string;
    definitionEn: string;
    definitionVi: string;
    register: string | null;
    examples: { textEn: string; textVi: string; highlightStart: number; highlightEnd: number }[];
    synonyms: string[];
    antonyms: string[];
  }[];
  family: {
    rootSlug: string;
    glossVi: string;
    members: { lemma: string; slug: string; pos: string; posLabelVi: string; suffix: string | null }[];
  } | null;
  userWord: {
    state: string;
    dueAt: string;
    intervalDays: number;
    ease: number;
    lapses: number;
    totalReviews: number;
    correctReviews: number;
    isFavorite: boolean;
  } | null;
}

export interface LearnCardsResponse {
  data: LearnCard[];
  meta: { remainingToday: number; dailyAllowance: number; introducedToday: number };
}

export interface LearnCommitResponse {
  added: number;
  skipped: number;
  remainingToday: number;
  reward: RewardSummary | null;
}

export interface SrsQueueResponse {
  data: SrsQueueCard[];
  meta: {
    dueCount: number;
    newCount: number;
    totalDueAvailable: number;
    backlogWarning: boolean;
    reviewsDoneToday: number;
    newIntroducedToday: number;
  };
}

export type SrsReviewResponse = SrsReviewResult & { reward: RewardSummary };

export interface SrsStats {
  counts: Record<string, number>;
  total: number;
  due: number;
  leeches: number;
  reviewsLogged: number;
  lifetimeAccuracy: number | null;
}

export interface SessionSummary {
  sessionId: string;
  reviewed: number;
  durationSec: number;
  minutes: number;
  accuracy: number | null;
  achievementsUnlocked: { slug: string; nameVi: string; icon: string; tier: string }[];
}

export interface MyWordRow {
  userWordId: string;
  wordId: string;
  lemma: string;
  slug: string;
  cefr: string;
  ipaUs: string | null;
  audioUsUrl: string | null;
  definitionVi: string | null;
  pos: string | null;
  state: string;
  dueAt: string;
  dueLabelVi: string;
  intervalDays: number;
  ease: number;
  lapses: number;
  accuracy: number | null;
  isLeech: boolean;
  isFavorite: boolean;
}

export interface FamilySummary {
  rootSlug: string;
  glossVi: string;
  memberCount: number;
  knownCount: number;
  posList: string[];
}

export interface WordFormResult {
  sessionId: string;
  results: {
    itemId: string;
    isCorrect: boolean;
    isNear: boolean;
    score: number;
    correctAnswer: string;
    explanationVi: string;
  }[];
  correct: number;
  total: number;
  accuracy: number;
  xpEarned: number;
  coinsEarned: number;
  durationSec: number;
}

/** A reading submission is an activity result plus the speed block. */
export interface ReadingActivityResult extends ActivityResult {
  speed: ReadingSpeedView;
}

/** A listening submission adds the per-line dictation diff. */
export interface ListeningActivityResult extends ActivityResult {
  dictation: DictationLineResult[];
}

export type {
  ActivityResult,
  DashboardResponse,
  DeckDetail,
  DeckSummary,
  LearnCard,
  LessonCard,
  LessonDetail,
  ListeningCard,
  ListeningDetail,
  PracticeResult,
  PracticeSet,
  ReadingCard,
  ReadingDetail,
  RewardSummary,
  SrsQueueCard,
  SuffixRuleView,
  TestCard,
  TestDetail,
  TestResult,
  TestRunState,
  AiQuotaView,
  ConversationDetail,
  ConversationSummary,
  TutorMessageView,
  TutorReply,
  WritingFeedback,
  WritingIssue,
  WritingPromptCard,
  WritingSubmissionView,
  FlashcardDeckView,
  AdminOverview,
  AdminContentIssue,
  AdminUserRow,
  RewriteSet,
  RewriteItem,
  RewriteFeedback,
  RewriteResult,
  FlashcardView,
  FlashcardDirection,
  FlashcardSource,
  FlashcardRateResult,
  PronunciationIssueView,
  RoleplayState,
  SpeakingAttemptView,
  SpeakingDrillCard,
  SpeakingScenarioCard,
  SpeakingWordScore,
  WordFamilyView,
  WordFormSet,
  WordSummary,
};
