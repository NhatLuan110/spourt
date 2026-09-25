/**
 * §10 names Claude. Claude has no free tier, and this project has to be
 * runnable by a learner with no card, so the provider is an interface and the
 * choice is configuration (D-044).
 *
 * Everything a feature needs goes through here. No feature imports a provider
 * directly, which is what makes the swap a one-line change.
 */

export type AiRole = 'system' | 'user' | 'assistant';

export interface AiMessageInput {
  role: AiRole;
  content: string;
}

/** DEEP for writing feedback, FAST for conversation. */
export type AiTier = 'deep' | 'fast';

export interface CompletionRequest {
  tier: AiTier;
  messages: AiMessageInput[];
  /** Prepended as the system instruction; providers differ in how. */
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /**
   * Ask for strict JSON. Providers that support a response schema use it;
   * the rest get an instruction and the caller still validates with Zod.
   */
  json?: boolean;
  /** JSON Schema for providers that support constrained structured output. */
  responseSchema?: Record<string, unknown>;
}

export interface CompletionResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface SpeechRequest {
  text: string;
  /** "US" | "UK" | "AU" — advisory; not every provider honours it. */
  accent?: string;
  /** 0.5 to 1.5. Providers without a rate control get a spoken instruction. */
  rate?: number;
}

export interface SpeechResult {
  /** WAV bytes, ready to write to storage or stream. */
  audio: Buffer;
  mimeType: string;
  model: string;
  durationSec: number;
}

export interface TranscriptionRequest {
  audio: Buffer;
  mimeType: string;
  /** What the learner was asked to say, when there is a reference text. */
  expected?: string;
}

export interface TranscriptionResult {
  text: string;
  model: string;
}

/**
 * Thrown when the provider itself refuses. The code is what the caller maps to
 * an HTTP status, so a quota problem never reads as a bug in Sprout.
 */
export class AiProviderError extends Error {
  constructor(
    readonly kind: 'not-configured' | 'quota' | 'overloaded' | 'bad-request' | 'unknown',
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface AiProvider {
  readonly name: string;
  /** False when the key is missing; the feature then says so rather than failing. */
  isConfigured(): boolean;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /** Undefined when the provider cannot speak. */
  speak?(request: SpeechRequest): Promise<SpeechResult>;
  /** Undefined when the provider cannot listen. */
  transcribe?(request: TranscriptionRequest): Promise<TranscriptionResult>;
}
