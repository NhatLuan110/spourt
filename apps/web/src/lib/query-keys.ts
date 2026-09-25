/** One place for cache keys so invalidation never guesses (§15 state rules). */
export const queryKeys = {
  me: ['me'] as const,
  progress: ['me', 'progress'] as const,
  dashboard: ['dashboard'] as const,
  topics: ['topics'] as const,
  topic: (slug: string) => ['topics', slug] as const,
  topicWords: (slug: string, params: Record<string, unknown>) =>
    ['topics', slug, 'words', params] as const,
  word: (slug: string) => ['words', slug] as const,
  myWords: (params: Record<string, unknown>) => ['me', 'words', params] as const,
  srsQueue: (params: Record<string, unknown>) => ['srs', 'queue', params] as const,
  srsForecast: ['srs', 'forecast'] as const,
  decks: ['me', 'decks'] as const,
  achievements: ['me', 'achievements'] as const,
  analytics: (period: string) => ['me', 'analytics', period] as const,
};

/** Keys added with the vocabulary module (P1). */
export const vocabKeys = {
  flashcards: (params: Record<string, unknown>) => ['flashcards', params] as const,
  words: (params: Record<string, unknown>) => ['words', params] as const,
  learnCards: (params: Record<string, unknown>) => ['learn', 'cards', params] as const,
  srsStats: ['srs', 'stats'] as const,
  deck: (id: string) => ['me', 'decks', id] as const,
  suffixRules: ['word-class', 'suffix-rules'] as const,
  families: ['word-class', 'families'] as const,
  family: (rootSlug: string) => ['word-class', 'families', rootSlug] as const,
};

/** Keys added with grammar, reading and listening (P2). */
export const lessonKeys = {
  grammarLessons: (params: Record<string, unknown>) => ['grammar', 'lessons', params] as const,
  grammarLesson: (slug: string) => ['grammar', 'lessons', slug] as const,
  readingPassages: (params: Record<string, unknown>) => ['reading', 'passages', params] as const,
  readingPassage: (slug: string) => ['reading', 'passages', slug] as const,
  listeningTracks: (params: Record<string, unknown>) => ['listening', 'tracks', params] as const,
  listeningTrack: (slug: string) => ['listening', 'tracks', slug] as const,
};

/** Keys added with tests and analytics (P5). */
export const testKeys = {
  list: (params: Record<string, unknown>) => ['tests', params] as const,
  detail: (slug: string) => ['tests', slug] as const,
  attempt: (attemptId: string) => ['tests', 'attempts', attemptId] as const,
};

/** Keys added with writing and the tutor (P3). */
export const aiKeys = {
  writingPrompts: (params: Record<string, unknown>) => ['writing', 'prompts', params] as const,
  writingPrompt: (slug: string) => ['writing', 'prompts', slug] as const,
  submissions: ['writing', 'submissions'] as const,
  submission: (id: string) => ['writing', 'submissions', id] as const,
  tutorQuota: ['tutor', 'quota'] as const,
  conversations: ['tutor', 'conversations'] as const,
  conversation: (id: string) => ['tutor', 'conversations', id] as const,
};

/** Keys added with speaking (P4). */
export const speakingKeys = {
  capabilities: ['speaking', 'capabilities'] as const,
  drills: (params: Record<string, unknown>) => ['speaking', 'drills', params] as const,
  drill: (slug: string) => ['speaking', 'drills', slug] as const,
  attempts: ['speaking', 'attempts'] as const,
  issues: ['speaking', 'issues'] as const,
  scenarios: ['speaking', 'scenarios'] as const,
  scenario: (slug: string) => ['speaking', 'scenarios', slug] as const,
};

/** Keys for sentence transformation (viết lại câu). */
export const sentenceKeys = {
  sets: ['sentence', 'sets'] as const,
  practice: (params: Record<string, unknown>) => ['sentence', 'practice', params] as const,
};

/** Admin screens (§12). */
export const adminKeys = {
  overview: ['admin', 'overview'] as const,
  issues: ['admin', 'issues'] as const,
  users: (params: Record<string, unknown>) => ['admin', 'users', params] as const,
};
