import { z } from 'zod';

/** §5.7 — what a conversation with the AI is for. */
export const CONVERSATION_KINDS = ['tutor', 'roleplay', 'writing-feedback'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

/**
 * A correction attached to something the learner wrote in chat. The tutor
 * answers the question first and corrects second, so a learner asking about
 * one thing is not derailed by being marked on another.
 */
export interface TutorCorrection {
  original: string;
  corrected: string;
  whyVi: string;
}

export interface TutorMessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  corrections: TutorCorrection[];
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  title: string;
  messageCount: number;
  updatedAt: string;
  /** First line of the last message, for the list. */
  preview: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: TutorMessageView[];
}

/** What the learner has left of today's allowance (§10.1). */
export interface AiQuotaView {
  used: number;
  limit: number;
  remaining: number;
  /** False when no key is configured; the UI says so instead of failing. */
  available: boolean;
  provider: string;
}

export const tutorAskSchema = z.object({
  /** Omitted to start a new conversation. */
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1).max(2000),
  /**
   * Context the learner is asking from, so "why is this wrong?" can be
   * answered without them retyping the sentence.
   */
  context: z
    .object({
      kind: z.enum(['word', 'lesson', 'exercise', 'writing', 'reading', 'listening']),
      /** Slug or id of the thing being asked about. */
      ref: z.string().min(1).max(200),
      /** The sentence or definition itself, when the client already has it. */
      excerpt: z.string().max(1000).optional(),
    })
    .optional(),
});
export type TutorAskInput = z.infer<typeof tutorAskSchema>;

export interface TutorReply {
  conversationId: string;
  /** Both turns, so the client can render without a refetch. */
  userMessage: TutorMessageView;
  reply: TutorMessageView;
  quota: AiQuotaView;
}

export const conversationListQuerySchema = z.object({
  kind: z.enum(CONVERSATION_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

/** The AI's answer, validated before it is stored or shown. */
export const tutorReplySchema = z.object({
  answerVi: z.string().min(1).max(4000),
  corrections: z
    .array(
      z.object({
        original: z.string().min(1).max(300),
        corrected: z.string().max(300),
        whyVi: z.string().min(1).max(400),
      }),
    )
    .max(6)
    .default([]),
});
export type TutorReplyPayload = z.infer<typeof tutorReplySchema>;
