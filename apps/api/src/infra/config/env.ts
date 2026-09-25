import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at boot so a
 * misconfigured deployment fails immediately instead of at the first request.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().default('api/v1'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECRET: z.string().min(16).default('sprout-dev-cookie-secret-change-me'),
  /**
   * Encrypts secrets the server must read back, currently only a learner's own
   * AI key (D-052). Falls back to COOKIE_SECRET so development needs no setup;
   * a production deployment should set it, because rotating COOKIE_SECRET would
   * otherwise silently orphan every saved key.
   */
  SECRET_ENCRYPTION_KEY: z.string().min(16).optional(),

  /// RS256 key pair. Generated into .keys/ on first dev boot when absent.
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  REDIS_URL: z.string().optional(),

  /**
   * §10 names Claude, but Claude has no free tier and this project has to run
   * without one (D-044). The provider is chosen here and every feature talks to
   * the same interface, so switching is a one-line change.
   */
  AI_PROVIDER: z
    .enum(['gemini', 'groq', 'openrouter', 'ollama', 'github', 'anthropic'])
    .default('gemini'),
  AI_API_KEY: z.string().optional(),

  /**
   * Speech is chosen separately, because Gemini is the only free provider that
   * can do it (D-045). Pointing text at Groq or GitHub Models and leaving
   * speech on Gemini stops the tutor from spending the quota that pronunciation
   * scoring depends on (D-053). Unset means "same provider and key as text".
   */
  AI_SPEECH_PROVIDER: z.enum(['gemini', 'azure', 'none']).optional(),
  AI_SPEECH_API_KEY: z.string().optional(),

  GEMINI_MODEL_DEEP: z.string().default('gemini-3.5-flash'),
  GEMINI_MODEL_FAST: z.string().default('gemini-3.5-flash'),
  GEMINI_MODEL_TTS: z.string().default('gemini-2.5-flash-preview-tts'),
  GEMINI_MODEL_STT: z.string().default('gemini-3.5-flash'),

  GROQ_MODEL_DEEP: z.string().default('llama-3.3-70b-versatile'),
  GROQ_MODEL_FAST: z.string().default('llama-3.1-8b-instant'),

  OPENROUTER_MODEL_DEEP: z.string().default('deepseek/deepseek-chat-v3.1:free'),
  OPENROUTER_MODEL_FAST: z.string().default('deepseek/deepseek-chat-v3.1:free'),

  /** GitHub Models authenticates with an ordinary GitHub personal access token. */
  GITHUB_MODELS_BASE_URL: z.string().default('https://models.github.ai/inference'),
  GITHUB_MODEL_DEEP: z.string().default('openai/gpt-4.1'),
  GITHUB_MODEL_FAST: z.string().default('openai/gpt-4.1-mini'),

  /** Ollama runs locally and needs no key at all. */
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL_DEEP: z.string().default('qwen2.5:3b'),
  OLLAMA_MODEL_FAST: z.string().default('qwen2.5:3b'),

  /** Kept for compatibility: ANTHROPIC_API_KEY still works as AI_API_KEY. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_DEEP: z.string().default('claude-opus-5'),
  ANTHROPIC_MODEL_FAST: z.string().default('claude-sonnet-5'),

  /** §10.1 daily free allowances, per learner per study day. */
  AI_DAILY_TUTOR_MESSAGES: z.coerce.number().int().min(0).default(20),
  AI_DAILY_WRITING_SUBMISSIONS: z.coerce.number().int().min(0).default(3),
  AI_DAILY_ROLEPLAY_SESSIONS: z.coerce.number().int().min(0).default(10),

  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.storage'),
  STORAGE_PUBLIC_URL: z.string().default('http://localhost:4000/media'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Sprout <no-reply@sprout.local>'),

  RATE_LIMIT_TTL_SEC: z.coerce.number().int().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().default(100),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** The key the chosen text provider uses, or undefined when unset. */
export function aiApiKey(env: Env): string | undefined {
  // ANTHROPIC_API_KEY predates AI_API_KEY and still works, so an existing
  // deployment does not break when it upgrades.
  return env.AI_API_KEY ?? env.ANTHROPIC_API_KEY;
}

/**
 * Which provider handles speech, defaulting to the text one when it can.
 *
 * Azure is nameable but not implemented, and `SPEECH_IMPLEMENTED` is what keeps
 * that honest: `isProviderConfigured` will not claim speech works just because
 * an Azure key happens to be present.
 */
export function speechProviderName(env: Env): 'gemini' | 'azure' | 'none' {
  if (env.AI_SPEECH_PROVIDER) return env.AI_SPEECH_PROVIDER;
  if (env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION) return 'azure';
  return env.AI_PROVIDER === 'gemini' ? 'gemini' : 'none';
}

/** The speech providers that actually have an implementation behind them. */
const SPEECH_IMPLEMENTED = new Set(['gemini']);

/**
 * The key speech uses. A separate `AI_SPEECH_API_KEY` is what makes the split
 * worth having: text can run on a Groq key while speech runs on a Gemini one.
 */
export function speechApiKey(env: Env): string | undefined {
  if (env.AI_SPEECH_API_KEY) return env.AI_SPEECH_API_KEY;
  return env.AI_PROVIDER === 'gemini' ? aiApiKey(env) : undefined;
}

export function isProviderConfigured(
  env: Env,
  provider: 'ai' | 'azure' | 'deepgram' | 'tts' | 'stt' | 'mail',
): boolean {
  switch (provider) {
    case 'ai':
      // Ollama runs on the learner's own machine, so it needs no key.
      return env.AI_PROVIDER === 'ollama' ? true : Boolean(aiApiKey(env));
    case 'azure':
      return Boolean(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION);
    case 'deepgram':
      return Boolean(env.DEEPGRAM_API_KEY);
    case 'tts':
    case 'stt': {
      // Speech has its own provider and key, so text can run elsewhere without
      // taking pronunciation scoring down with it (D-053).
      //
      // Only providers that are actually implemented count. Reporting true for
      // an Azure or ElevenLabs key that nothing reads would light up the record
      // button and fail on the first press.
      const speech = speechProviderName(env);
      if (!SPEECH_IMPLEMENTED.has(speech)) return false;
      return Boolean(speechApiKey(env));
    }
    case 'mail':
      return Boolean(env.RESEND_API_KEY);
    default:
      return false;
  }
}
