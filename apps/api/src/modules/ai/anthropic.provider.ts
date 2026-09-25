import type { Env } from '@app/infra/config/env';
import { aiApiKey } from '@app/infra/config/env';
import {
  AiProviderError,
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
} from './provider.interface';

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

/**
 * The provider §10 originally specified. Not the default because Claude has no
 * free tier, but kept complete so switching to it is only a change to
 * `AI_PROVIDER` (D-044).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';

  constructor(private readonly env: Env) {}

  isConfigured(): boolean {
    return Boolean(aiApiKey(this.env));
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const key = aiApiKey(this.env);
    if (!key) throw new AiProviderError('not-configured', 'Chưa cấu hình khoá AI.');

    const model =
      request.tier === 'deep' ? this.env.ANTHROPIC_MODEL_DEEP : this.env.ANTHROPIC_MODEL_FAST;

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxOutputTokens ?? 1024,
          temperature: request.temperature ?? 0.7,
          // Anthropic takes the system prompt as its own field, not a message.
          ...(request.system ? { system: request.system } : {}),
          messages: request.messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({ role: message.role, content: message.content })),
        }),
      });
    } catch {
      throw new AiProviderError('overloaded', 'Không kết nối được tới Anthropic.');
    }

    const json = (await response.json()) as AnthropicResponse;
    if (!response.ok) {
      throw new AiProviderError(
        kindFromStatus(response.status),
        json.error?.message ?? `HTTP ${response.status}`,
        response.status,
      );
    }

    const text = (json.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    if (text.length === 0) throw new AiProviderError('unknown', 'Anthropic trả về rỗng.');

    return {
      text,
      model,
      tokensIn: json.usage?.input_tokens ?? 0,
      tokensOut: json.usage?.output_tokens ?? 0,
    };
  }
}

function kindFromStatus(status: number): AiProviderError['kind'] {
  if (status === 429) return 'quota';
  if (status >= 500 || status === 529) return 'overloaded';
  if (status === 400 || status === 404) return 'bad-request';
  if (status === 401 || status === 403) return 'not-configured';
  return 'unknown';
}
