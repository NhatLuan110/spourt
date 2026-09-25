import { Injectable, Logger } from '@nestjs/common';
import type { Env } from '@app/infra/config/env';
import { isProviderConfigured, speechProviderName, validateEnv } from '@app/infra/config/env';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { SecretBoxService } from '@app/infra/crypto/secret-box.service';
import { StudyDayService } from '../gamification/study-day.service';
import { GeminiProvider } from './gemini.provider';
import { AnthropicProvider } from './anthropic.provider';
import {
  createGithub,
  createGroq,
  createOllama,
  createOpenRouter,
} from './openai-compatible.provider';
import {
  AiProviderError,
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
  type SpeechRequest,
  type SpeechResult,
  type TranscriptionRequest,
  type TranscriptionResult,
} from './provider.interface';

/** §10.1 — the three metered features, each with its own daily allowance. */
export type AiFeature = 'tutor' | 'writing' | 'roleplay' | 'speaking' | 'tts';

export interface AiCallContext {
  userId: string;
  feature: AiFeature;
  /** Skip the quota check for calls the learner did not initiate. */
  metered?: boolean;
}

/**
 * The only door to any AI provider.
 *
 * It owns three things no feature should reimplement: choosing the provider,
 * enforcing the daily free allowance in the learner's own timezone, and
 * recording every call in `AiUsageLog` so the cost table in the README can be
 * checked against reality rather than estimated.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: AiProvider;
  /** Separate from the text provider, because only Gemini speaks (D-053). */
  private readonly speech: AiProvider | null;
  private readonly env: Env;
  /** Providers built from a learner's own key, cached per key (D-052). */
  private readonly perUser = new Map<string, AiProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly studyDay: StudyDayService,
    private readonly secrets: SecretBoxService,
  ) {
    // ConfigModule has already loaded the .env files into process.env and
    // validated them with this same schema, so re-parsing here yields the same
    // object — including the defaults — as one plain typed value rather than
    // twenty separate `config.get` calls.
    this.env = validateEnv(process.env);
    this.provider = createProvider(this.env);
    this.speech = createSpeechProvider(this.env);
    this.logger.log(
      `AI: text=${this.provider.name}${this.provider.isConfigured() ? '' : ' (chưa có khoá)'}` +
        ` speech=${this.speech ? this.speech.name : 'tắt'}`,
    );
  }

  get providerName(): string {
    return this.provider.name;
  }

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  get speechProviderName(): string {
    return this.speech?.name ?? 'none';
  }

  canSpeak(): boolean {
    return typeof this.speech?.speak === 'function' && this.speech.isConfigured();
  }

  canTranscribe(): boolean {
    return typeof this.speech?.transcribe === 'function' && this.speech.isConfigured();
  }

  /** How many of today's allowance is left, for the UI to show before spending it. */
  async remaining(userId: string, feature: AiFeature): Promise<{ used: number; limit: number }> {
    // A learner on their own key has no Sprout-imposed limit to report.
    if (await this.keyFor(userId)) {
      return { used: 0, limit: Number.POSITIVE_INFINITY };
    }
    const limit = this.limitFor(feature);
    if (limit === null) return { used: 0, limit: Number.POSITIVE_INFINITY };
    return { used: await this.usedToday(userId, feature), limit };
  }

  /**
   * The provider a given call should use.
   *
   * A learner who has saved their own key spends their own quota, on their own
   * provider (D-052). Everyone else shares the server key. The instances are
   * cached by key so a chatty session does not rebuild one per message.
   */
  private providerFor(override: { key: string; provider: string } | null): AiProvider {
    if (!override) return this.provider;

    const cacheKey = `${override.provider}:${override.key}`;
    const cached = this.perUser.get(cacheKey);
    if (cached) return cached;

    const scoped = createProvider({
      ...this.env,
      AI_PROVIDER: override.provider as Env['AI_PROVIDER'],
      AI_API_KEY: override.key,
      // The learner's key must not be reachable as a speech key by accident.
      AI_SPEECH_API_KEY: undefined,
    });
    this.perUser.set(cacheKey, scoped);
    return scoped;
  }

  async complete(context: AiCallContext, request: CompletionRequest): Promise<CompletionResult> {
    const provider = await this.prepareCompletion(context);
    const result = await this.run(() => provider.complete(request));
    await this.record(context, result.model, result.tokensIn, result.tokensOut);
    return result;
  }

  private async prepareCompletion(context: AiCallContext): Promise<AiProvider> {
    // Looked up once and reused: a second call would decrypt the same row again
    // for no reason.
    const own = await this.keyFor(context.userId);
    if (!own) this.requireConfigured();
    if (context.metered !== false) {
      await this.requireQuota(context.userId, context.feature, own !== null);
    }

    return this.providerFor(own);
  }

  async speak(context: AiCallContext, request: SpeechRequest): Promise<SpeechResult> {
    if (!this.speech?.speak) {
      throw AppException.conflict(
        'AI_PROVIDER_ERROR',
        'Chưa cấu hình giọng nói. Đặt AI_SPEECH_PROVIDER và AI_SPEECH_API_KEY trong .env.',
      );
    }
    const speak = this.speech.speak.bind(this.speech);
    const result = await this.run(() => speak(request));
    // Audio is billed by characters, not tokens; the character count is stored
    // in tokensIn so the usage log stays one shape.
    await this.record(context, result.model, request.text.length, 0);
    return result;
  }

  async transcribe(
    context: AiCallContext,
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    if (!this.speech?.transcribe) {
      throw AppException.conflict(
        'AI_PROVIDER_ERROR',
        'Chưa cấu hình nhận dạng giọng nói. Đặt AI_SPEECH_PROVIDER và AI_SPEECH_API_KEY trong .env.',
      );
    }
    if (context.metered !== false) await this.requireQuota(context.userId, context.feature);

    const transcribe = this.speech.transcribe.bind(this.speech);
    const result = await this.run(() => transcribe(request));
    await this.record(context, result.model, Math.round(request.audio.length / 1024), 0);
    return result;
  }

  /**
   * Asks for JSON and parses it. Models wrap JSON in code fences often enough
   * that stripping them here is worth more than a stern prompt.
   */
  async completeJson<T>(
    context: AiCallContext,
    request: CompletionRequest,
    parse: (value: unknown) => T,
  ): Promise<{ value: T; result: CompletionResult }> {
    const provider = await this.prepareCompletion(context);
    for (let attempt = 0; attempt < 2; attempt++) {
      const originalBudget = request.maxOutputTokens ?? 1024;
      const result = await this.run(() => provider.complete({
        ...request,
        json: true,
        maxOutputTokens: attempt === 0
          ? originalBudget
          : Math.max(originalBudget, Math.min(originalBudget * 2, 8192)),
      }));

      let value: T;
      try {
        value = parse(JSON.parse(stripCodeFence(result.text)) as unknown);
      } catch {
        this.logger.warn(`${provider.name} trả về JSON hỏng hoặc sai cấu trúc cho ${context.feature}`);
        // Keep provider token usage for auditing, but do not spend a learner's
        // daily allowance on an answer they cannot read. No schema change needed.
        await this.record(context, result.model, result.tokensIn, result.tokensOut, false);
        if (attempt === 0) continue;
        throw AppException.conflict('AI_PROVIDER_ERROR', 'AI chưa trả lời được đúng định dạng. Lượt này không bị trừ; bạn thử lại nhé.');
      }

      await this.record(context, result.model, result.tokensIn, result.tokensOut);
      return { value, result };
    }
    throw new Error('Completion attempts exhausted');
  }

  private requireConfigured(): void {
    if (!isProviderConfigured(this.env, 'ai')) {
      throw AppException.conflict(
        'AI_PROVIDER_ERROR',
        'Tính năng AI chưa được cấu hình. Thêm AI_API_KEY vào .env để bật.',
      );
    }
  }

  /** Translates a provider failure into something the learner can act on. */
  private async run<T>(call: () => Promise<T>): Promise<T> {
    try {
      // Retry temporary failures only. Bad credentials and quota limits must
      // not trigger repeated calls that make the provider's limit worse.
      for (let attempt = 0; ; attempt++) {
        try {
          return await call();
        } catch (error) {
          if (!(error instanceof AiProviderError) || error.kind !== 'overloaded' || attempt >= 2) throw error;
          const waitMs = 1000 * 2 ** attempt + Math.floor(Math.random() * 250);
          this.logger.warn(`AI tạm quá tải; thử lại ${attempt + 1}/2 sau ${waitMs}ms`);
          await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        }
      }
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      this.logger.warn(`${this.provider.name}: ${error.kind} — ${error.message}`);

      switch (error.kind) {
        case 'quota':
          throw AppException.conflict(
            'AI_QUOTA_EXCEEDED',
            'Nhà cung cấp AI đang giới hạn lượt gọi. Đợi một lúc rồi thử lại hoặc kiểm tra hạn mức API của bạn.',
          );
        case 'overloaded':
          throw AppException.conflict(
            'AI_PROVIDER_ERROR',
            'AI đang quá tải. Thử lại sau ít phút nhé.',
          );
        case 'not-configured':
          throw AppException.conflict(
            'AI_PROVIDER_ERROR',
            'Khoá AI không hợp lệ hoặc đã bị thu hồi.',
          );
        default:
          throw AppException.conflict('AI_PROVIDER_ERROR', 'AI gặp lỗi. Thử lại nhé.');
      }
    }
  }

  private limitFor(feature: AiFeature): number | null {
    switch (feature) {
      case 'tutor':
        return this.env.AI_DAILY_TUTOR_MESSAGES;
      case 'writing':
        return this.env.AI_DAILY_WRITING_SUBMISSIONS;
      case 'roleplay':
        return this.env.AI_DAILY_ROLEPLAY_SESSIONS;
      default:
        // Speaking assessment and text-to-speech are not separately metered:
        // they are already bounded by the activity that triggers them.
        return null;
    }
  }

  /**
   * The §10.1 allowance exists to protect the shared server key. A learner
   * spending their own quota is not competing with anyone, so `ownKey` lifts
   * the limit entirely — the provider's own rate limit is the real ceiling
   * then, and it reaches them as a 429 with a clear message (D-052).
   */
  private async requireQuota(
    userId: string,
    feature: AiFeature,
    ownKey = false,
  ): Promise<void> {
    if (ownKey) return;

    const limit = this.limitFor(feature);
    if (limit === null) return;

    const used = await this.usedToday(userId, feature);
    if (used >= limit) {
      throw AppException.conflict(
        'AI_QUOTA_EXCEEDED',
        `Bạn đã dùng hết ${limit} lượt ${FEATURE_VI[feature]} hôm nay. ` +
          'Hạn mức làm mới vào 4 giờ sáng, hoặc thêm khoá AI của riêng bạn trong Cài đặt để dùng không giới hạn.',
      );
    }
  }

  /** The learner's own key, decrypted, or null when they have not saved one. */
  private async keyFor(userId: string): Promise<{ key: string; provider: string } | null> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { aiApiKeyEncrypted: true, aiProvider: true },
    });
    if (!settings?.aiApiKeyEncrypted) return null;

    const key = this.secrets.decrypt(settings.aiApiKeyEncrypted);
    if (key === null) {
      // The encryption key changed. Falling back to the server key keeps the
      // learner working; settings tells them to re-enter theirs.
      this.logger.warn(`Không giải mã được khoá AI của người dùng ${userId}`);
      return null;
    }
    return { key, provider: settings.aiProvider ?? 'gemini' };
  }

  /** Counted over the study day, so the reset matches the streak rollover. */
  private async usedToday(userId: string, feature: AiFeature): Promise<number> {
    const day = await this.studyDay.today(userId);
    return this.prisma.aiUsageLog.count({
      where: { userId, feature, createdAt: { gte: day.start, lt: day.end } },
    });
  }

  private async record(
    context: AiCallContext,
    model: string,
    tokensIn: number,
    tokensOut: number,
    successful = true,
  ): Promise<void> {
    await this.prisma.aiUsageLog.create({
      data: {
        userId: context.userId,
        feature: successful ? context.feature : `${context.feature}:invalid-response`,
        model,
        tokensIn,
        tokensOut,
        // Zero on a free tier, and honest: the column exists so a paid
        // deployment can fill it, not so this one can invent a number.
        costUsd: 0,
      },
    });
  }
}

const FEATURE_VI: Record<AiFeature, string> = {
  tutor: 'hỏi gia sư',
  writing: 'chấm bài viết',
  roleplay: 'hội thoại',
  speaking: 'luyện nói',
  tts: 'đọc văn bản',
};

/**
 * The provider that handles speech, which is chosen separately from text.
 *
 * Only Gemini does speech on a free tier (D-045), so pointing text at Groq or
 * GitHub Models and leaving speech here is what stops the tutor from spending
 * the quota pronunciation scoring needs (D-053). Null means speech is off, and
 * every speaking feature reports that rather than failing at the first call.
 */
export function createSpeechProvider(env: Env): AiProvider | null {
  switch (speechProviderName(env)) {
    case 'gemini':
      return new GeminiProvider(env, 'speech');
    case 'azure':
      // Azure Pronunciation Assessment is not implemented yet; saying so here
      // is better than silently falling back to Gemini on the wrong key.
      return null;
    default:
      return null;
  }
}

export function createProvider(env: Env): AiProvider {
  switch (env.AI_PROVIDER) {
    case 'groq':
      return createGroq(env);
    case 'openrouter':
      return createOpenRouter(env);
    case 'ollama':
      return createOllama(env);
    case 'github':
      return createGithub(env);
    case 'anthropic':
      return new AnthropicProvider(env);
    default:
      return new GeminiProvider(env);
  }
}

/** Models fence JSON in markdown often enough to be worth handling. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}
