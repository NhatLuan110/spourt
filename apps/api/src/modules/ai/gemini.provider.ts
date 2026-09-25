import type { Env } from '@app/infra/config/env';
import { aiApiKey, speechApiKey } from '@app/infra/config/env';
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

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Google Gemini. Chosen as the default because the free tier needs no card,
 * and because the same key does text, speech and transcription (D-045).
 *
 * Two things worth knowing about this API:
 *  - 3.5 Flash thinks by default, and thinking tokens come out of the same
 *    output budget, so an unbounded thinking budget truncates a long answer.
 *    FAST turns thinking off; DEEP caps it at 1024 tokens.
 *  - Audio comes back as raw 24 kHz PCM, not a playable file, so a WAV header
 *    is added here rather than in every caller.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';

  /**
   * The role decides which key this instance authenticates with. Speech runs on
   * its own key so text can be pointed at another provider entirely (D-053).
   */
  constructor(
    private readonly env: Env,
    private readonly role: 'text' | 'speech' = 'text',
  ) {}

  private key(): string | undefined {
    return this.role === 'speech' ? speechApiKey(this.env) : aiApiKey(this.env);
  }

  isConfigured(): boolean {
    return Boolean(this.key());
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const model =
      request.tier === 'deep' ? this.env.GEMINI_MODEL_DEEP : this.env.GEMINI_MODEL_FAST;

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: request.maxOutputTokens ?? 1024,
      temperature: request.temperature ?? 0.7,
    };
    // Thinking tokens come out of the same budget as the answer, so an
    // unbounded thinking budget truncates long JSON mid-object. FAST turns it
    // off for latency; DEEP caps it so the answer always has room left.
    generationConfig['thinkingConfig'] =
      request.tier === 'fast' ? { thinkingBudget: 0 } : { thinkingBudget: 1024 };
    if (request.json) generationConfig['responseMimeType'] = 'application/json';
    if (request.json && request.responseSchema) {
      generationConfig['responseJsonSchema'] = request.responseSchema;
    }

    const body: Record<string, unknown> = {
      contents: request.messages.map((message) => ({
        // Gemini has no "assistant"; the other side of the conversation is "model".
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      generationConfig,
    };
    if (request.system) {
      body['systemInstruction'] = { parts: [{ text: request.system }] };
    }

    const json = await this.call(model, body);
    const text = textOf(json);
    if (text.length === 0) {
      const reason = json.candidates?.[0]?.finishReason ?? 'unknown';
      throw new AiProviderError('unknown', `Gemini trả về rỗng (finishReason: ${reason}).`);
    }

    return {
      text,
      model,
      tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
      tokensOut:
        (json.usageMetadata?.candidatesTokenCount ?? 0) +
        (json.usageMetadata?.thoughtsTokenCount ?? 0),
    };
  }

  async speak(request: SpeechRequest): Promise<SpeechResult> {
    const model = this.env.GEMINI_MODEL_TTS;
    // The model has no rate parameter, so pace is asked for in words.
    const pace = (request.rate ?? 1) < 0.9 ? 'slowly and very clearly' : 'clearly';
    const accent = request.accent === 'UK' ? ' in a British accent' : '';

    const json = await this.call(model, {
      contents: [{ parts: [{ text: `Say ${pace}${accent}: ${request.text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: request.accent === 'UK' ? 'Puck' : 'Kore' } },
        },
      },
    });

    const inline = json.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
    if (!inline?.data) throw new AiProviderError('unknown', 'Gemini không trả về audio.');

    const pcm = Buffer.from(inline.data, 'base64');
    const sampleRate = rateFromMime(inline.mimeType);
    return {
      audio: pcmToWav(pcm, sampleRate),
      mimeType: 'audio/wav',
      model,
      // 16-bit mono: two bytes per sample.
      durationSec: Number((pcm.length / 2 / sampleRate).toFixed(2)),
    };
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const model = this.env.GEMINI_MODEL_STT;
    // Transcription models are trained to produce fluent text, so left to
    // themselves they hear what the speaker MEANT and silently repair the
    // pronunciation. For assessment that is exactly backwards, which is why the
    // wording is this insistent and the temperature is zero (D-051).
    const instruction = request.expected
      ? [
          'You are a phonetic transcriber, not a helpful assistant.',
          `The speaker was asked to say: "${request.expected}"`,
          'Write down the sounds you ACTUALLY hear, spelled as English words.',
          'If they said "sink", write sink — even though "think" was intended.',
          'If they said "sree", write sree. Invent a spelling when no word fits.',
          'Never repair, normalise, or guess the intended word.',
          'Reply with the transcription only, no punctuation.',
        ].join('\n')
      : 'Transcribe this audio exactly as spoken, word for word, correcting nothing. Reply with the transcription only.';

    const json = await this.call(model, {
      contents: [
        {
          parts: [
            { text: instruction },
            {
              inlineData: {
                mimeType: request.mimeType,
                data: request.audio.toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 512,
        // Any creativity here is the model improving the learner's
        // pronunciation on their behalf.
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return { text: textOf(json).trim(), model };
  }

  private async call(model: string, body: unknown): Promise<GeminiResponse> {
    const key = this.key();
    if (!key) throw new AiProviderError('not-configured', 'Chưa cấu hình khoá AI.');

    let response: Response;
    try {
      response = await fetch(`${BASE}/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (cause) {
      throw new AiProviderError('overloaded', 'Không kết nối được tới Gemini.', undefined);
    }

    // An overloaded gateway can return HTML instead of a JSON error body.
    const json = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (response.ok) return json;

    const message = json.error?.message ?? `HTTP ${response.status}`;
    throw new AiProviderError(kindFromStatus(response.status), message, response.status);
  }
}

function kindFromStatus(status: number): AiProviderError['kind'] {
  if (status === 429) return 'quota';
  if (status === 408 || status >= 500) return 'overloaded';
  if (status === 400 || status === 404) return 'bad-request';
  if (status === 401 || status === 403) return 'not-configured';
  return 'unknown';
}

function textOf(json: GeminiResponse): string {
  return (json.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('');
}

/** "audio/L16;codec=pcm;rate=24000" -> 24000 */
function rateFromMime(mimeType: string): number {
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? Number(match[1]) : 24000;
}

/** Gemini returns headerless PCM; browsers need the 44-byte RIFF header. */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
