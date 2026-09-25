import type { Env } from '@app/infra/config/env';
import { aiApiKey } from '@app/infra/config/env';
import {
  AiProviderError,
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
} from './provider.interface';

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * Groq, OpenRouter, Ollama and GitHub Models all speak the OpenAI
 * chat-completions shape, so one class covers four providers and the
 * differences stay in the constructor.
 *
 * None of them does speech, so `speak` and `transcribe` are absent rather than
 * throwing: `AiService` checks for the method and falls back to the browser.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  constructor(
    readonly name: 'groq' | 'openrouter' | 'ollama' | 'github',
    private readonly env: Env,
    private readonly config: {
      baseUrl: string;
      deepModel: string;
      fastModel: string;
      /** Ollama runs locally and authenticates nothing. */
      requiresKey: boolean;
      headers?: Record<string, string>;
    },
  ) {}

  isConfigured(): boolean {
    return this.config.requiresKey ? Boolean(aiApiKey(this.env)) : true;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const key = aiApiKey(this.env);
    if (this.config.requiresKey && !key) {
      throw new AiProviderError('not-configured', 'Chưa cấu hình khoá AI.');
    }

    const model = request.tier === 'deep' ? this.config.deepModel : this.config.fastModel;
    const messages = request.system
      ? [{ role: 'system', content: request.system }, ...request.messages]
      : request.messages;

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(key ? { authorization: `Bearer ${key}` } : {}),
          ...this.config.headers,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: request.maxOutputTokens ?? 1024,
          temperature: request.temperature ?? 0.7,
          ...(request.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch {
      throw new AiProviderError('overloaded', `Không kết nối được tới ${this.name}.`);
    }

    const json = (await response.json()) as ChatResponse;
    if (!response.ok) {
      throw new AiProviderError(
        kindFromStatus(response.status),
        json.error?.message ?? `HTTP ${response.status}`,
        response.status,
      );
    }

    const text = json.choices?.[0]?.message?.content ?? '';
    if (text.length === 0) {
      throw new AiProviderError('unknown', `${this.name} trả về rỗng.`);
    }

    return {
      text,
      model,
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
    };
  }
}

function kindFromStatus(status: number): AiProviderError['kind'] {
  if (status === 429) return 'quota';
  if (status >= 500) return 'overloaded';
  if (status === 400 || status === 404) return 'bad-request';
  if (status === 401 || status === 403) return 'not-configured';
  return 'unknown';
}

export function createGroq(env: Env): AiProvider {
  return new OpenAiCompatibleProvider('groq', env, {
    baseUrl: 'https://api.groq.com/openai/v1',
    deepModel: env.GROQ_MODEL_DEEP,
    fastModel: env.GROQ_MODEL_FAST,
    requiresKey: true,
  });
}

export function createOpenRouter(env: Env): AiProvider {
  return new OpenAiCompatibleProvider('openrouter', env, {
    baseUrl: 'https://openrouter.ai/api/v1',
    deepModel: env.OPENROUTER_MODEL_DEEP,
    fastModel: env.OPENROUTER_MODEL_FAST,
    requiresKey: true,
    // OpenRouter asks callers to identify themselves; it affects rate limits.
    headers: { 'HTTP-Referer': env.WEB_ORIGIN, 'X-Title': 'Sprout' },
  });
}

export function createOllama(env: Env): AiProvider {
  return new OpenAiCompatibleProvider('ollama', env, {
    baseUrl: `${env.OLLAMA_BASE_URL.replace(/\/$/, '')}/v1`,
    deepModel: env.OLLAMA_MODEL_DEEP,
    fastModel: env.OLLAMA_MODEL_FAST,
    requiresKey: false,
  });
}

/**
 * GitHub Models — free inference for developers, authenticated with an ordinary
 * GitHub personal access token rather than a separate signup or a card.
 *
 * Text only, like the others here: speech stays with Gemini (D-045).
 */
export function createGithub(env: Env): AiProvider {
  return new OpenAiCompatibleProvider('github', env, {
    baseUrl: env.GITHUB_MODELS_BASE_URL.replace(/\/$/, ''),
    deepModel: env.GITHUB_MODEL_DEEP,
    fastModel: env.GITHUB_MODEL_FAST,
    requiresKey: true,
  });
}
