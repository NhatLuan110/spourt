import { api } from '@/lib/api-client';
import type {
  DashboardResponse,
  DeckDetail,
  DeckSummary,
  FamilySummary,
  LearnCard,
  LearnCardsResponse,
  LessonCard,
  LessonDetail,
  ListeningCard,
  ListeningDetail,
  MyWordRow,
  Paged,
  ReadingCard,
  ReadingDetail,
  SrsQueueResponse,
  TestCard,
  TestDetail,
  TestResult,
  WritingPromptCard,
  WritingSubmissionView,
  FlashcardDeckView,
  AdminOverview,
  AdminContentIssue,
  AdminUserRow,
  RewriteSet,
  RewriteItem,
  SpeakingDrillCard,
  SpeakingAttemptView,
  SpeakingScenarioCard,
  PronunciationIssueView,
  SrsStats,
  SuffixRuleView,
  TopicCard,
  TopicDetail,
  WordDetail,
  WordFamilyView,
  WordSummary,
} from '@/lib/api-types';
import type {
  AiQuotaView,
  AnalyticsResponse,
  ConversationDetail,
  ConversationSummary,
  PaginationMeta,
} from '@sprout/shared';

/** Every read the app performs, in one place, so screens never build URLs. */
export const fetchers = {
  dashboard: () => api.get<DashboardResponse>('/me/dashboard'),

  topics: () => api.get<TopicCard[]>('/topics'),

  topic: (slug: string) => api.get<TopicDetail>(`/topics/${slug}`),

  topicWords: (slug: string, params: Record<string, string | number | undefined>) =>
    api.getWithMeta<WordSummary[], PaginationMeta>(
      `/topics/${slug}/words?${toQuery(params)}`,
    ) as Promise<Paged<WordSummary>>,

  searchWords: (params: Record<string, string | number | undefined>) =>
    api.getWithMeta<WordSummary[], PaginationMeta>(`/words?${toQuery(params)}`) as Promise<
      Paged<WordSummary>
    >,

  word: (slug: string) => api.get<WordDetail>(`/words/${slug}`),

  learnCards: (params: Record<string, string | number | undefined>) =>
    api.getWithMeta<LearnCard[], LearnCardsResponse['meta']>(
      `/learn/cards?${toQuery(params)}`,
    ) as Promise<LearnCardsResponse>,

  srsQueue: (params: Record<string, string | number | undefined>) =>
    api.getWithMeta<SrsQueueResponse['data'], SrsQueueResponse['meta']>(
      `/srs/queue?${toQuery(params)}`,
    ) as Promise<SrsQueueResponse>,

  srsStats: () => api.get<SrsStats>('/srs/stats'),

  srsForecast: (days = 30) =>
    api.get<{ date: string; count: number }[]>(`/srs/forecast?days=${days}`),

  myWords: (params: Record<string, string | number | undefined>) =>
    api.getWithMeta<MyWordRow[], PaginationMeta>(`/me/words?${toQuery(params)}`) as Promise<
      Paged<MyWordRow>
    >,

  decks: () => api.get<DeckSummary[]>('/me/decks'),

  deck: (deckId: string) => api.get<DeckDetail>(`/me/decks/${deckId}`),

  suffixRules: () => api.get<SuffixRuleView[]>('/word-class/suffix-rules'),

  families: () => api.get<FamilySummary[]>('/word-class/families'),

  family: (rootSlug: string) => api.get<WordFamilyView>(`/word-class/families/${rootSlug}`),

  grammarLessons: (params: Record<string, string | number | undefined>) =>
    api.get<LessonCard[]>(`/grammar/lessons?${toQuery(params)}`),

  grammarLesson: (slug: string) => api.get<LessonDetail>(`/grammar/lessons/${slug}`),

  readingPassages: (params: Record<string, string | number | undefined>) =>
    api.getWithMeta<ReadingCard[], PaginationMeta>(
      `/reading/passages?${toQuery(params)}`,
    ) as Promise<Paged<ReadingCard>>,

  readingPassage: (slug: string) => api.get<ReadingDetail>(`/reading/passages/${slug}`),

  listeningTracks: (params: Record<string, string | number | undefined>) =>
    api.getWithMeta<ListeningCard[], PaginationMeta>(
      `/listening/tracks?${toQuery(params)}`,
    ) as Promise<Paged<ListeningCard>>,

  listeningTrack: (slug: string) => api.get<ListeningDetail>(`/listening/tracks/${slug}`),

  tests: (params: Record<string, string | number | undefined>) =>
    api.get<TestCard[]>(`/tests?${toQuery(params)}`),

  test: (slug: string) => api.get<TestDetail>(`/tests/${slug}`),

  testAttempt: (attemptId: string) => api.get<TestResult>(`/tests/attempts/${attemptId}`),

  analytics: (period: string) => api.get<AnalyticsResponse>(`/me/analytics?period=${period}`),

  writingPrompts: (params: Record<string, string | number | undefined>) =>
    api.get<WritingPromptCard[]>(`/writing/prompts?${toQuery(params)}`),

  writingPrompt: (slug: string) => api.get<WritingPromptCard>(`/writing/prompts/${slug}`),

  writingSubmissions: (limit = 20) =>
    api.get<WritingSubmissionView[]>(`/writing/submissions?limit=${limit}`),

  writingSubmission: (id: string) =>
    api.get<WritingSubmissionView>(`/writing/submissions/${id}`),

  tutorQuota: () => api.get<AiQuotaView>('/tutor/quota'),

  conversations: () => api.get<ConversationSummary[]>('/tutor/conversations'),

  conversation: (id: string) => api.get<ConversationDetail>(`/tutor/conversations/${id}`),

  speakingCapabilities: () =>
    api.get<{ canTranscribe: boolean; canSpeak: boolean; provider: string }>(
      '/speaking/capabilities',
    ),

  speakingDrills: (params: Record<string, string | number | boolean | undefined>) =>
    api.get<SpeakingDrillCard[]>(`/speaking/drills?${toQuery(params)}`),

  speakingDrill: (slug: string) => api.get<SpeakingDrillCard>(`/speaking/drills/${slug}`),

  speakingAttempts: (limit = 20) =>
    api.get<SpeakingAttemptView[]>(`/speaking/attempts?limit=${limit}`),

  pronunciationIssues: () => api.get<PronunciationIssueView[]>('/speaking/issues'),

  scenarios: () => api.get<SpeakingScenarioCard[]>('/speaking/scenarios'),

  scenario: (slug: string) => api.get<SpeakingScenarioCard>(`/speaking/scenarios/${slug}`),

  flashcards: (params: Record<string, string | number | boolean | undefined>) =>
    api.get<FlashcardDeckView>(`/flashcards?${toQuery(params)}`),

  rewriteSets: () => api.get<RewriteSet[]>('/sentence/sets'),

  rewritePractice: (params: Record<string, string | number | boolean | undefined>) =>
    api.get<RewriteItem[]>(`/sentence/practice?${toQuery(params)}`),

  adminOverview: () => api.get<AdminOverview>('/admin/overview'),

  adminContentIssues: () => api.get<AdminContentIssue[]>('/admin/content-issues'),

  adminUsers: (params: Record<string, string | number | boolean | undefined>) =>
    api.getWithMeta<AdminUserRow[], PaginationMeta>(`/admin/users?${toQuery(params)}`) as Promise<
      Paged<AdminUserRow>
    >,

  achievements: () =>
    api.get<
      {
        slug: string;
        nameVi: string;
        descriptionVi: string;
        icon: string;
        tier: string;
        xpReward: number;
        coinReward: number;
        isSecret: boolean;
        unlockedAt: string | null;
        progressPct: number | null;
      }[]
    >('/me/achievements'),
};

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // A false flag is dropped rather than sent as "false": every boolean query
    // parameter in this API means "on when present", so sending the string
    // "false" would switch the filter on.
    if (value === undefined || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  return search.toString();
}
