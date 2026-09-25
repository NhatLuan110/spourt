import { Injectable } from '@nestjs/common';
import type { AiMessage, Prisma } from '@prisma/client';
import {
  tutorReplySchema,
  type AiQuotaView,
  type CefrLevel,
  type ConversationDetail,
  type ConversationKind,
  type ConversationListQuery,
  type ConversationSummary,
  type TutorAskInput,
  type TutorCorrection,
  type TutorMessageView,
  type TutorReply,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { buildTutorPrompt } from '../writing/writing.prompt';

/** How many earlier turns are replayed to the model. */
const CONTEXT_TURNS = 12;

@Injectable()
export class TutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async quota(userId: string): Promise<AiQuotaView> {
    const { used, limit } = await this.ai.remaining(userId, 'tutor');
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      available: this.ai.isConfigured(),
      provider: this.ai.providerName,
    };
  }

  async conversations(
    userId: string,
    query: ConversationListQuery,
  ): Promise<ConversationSummary[]> {
    const rows = await this.prisma.aiConversation.findMany({
      where: { userId, ...(query.kind ? { kind: query.kind } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: query.limit,
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as ConversationKind,
      title: row.title ?? 'Cuộc trò chuyện',
      messageCount: row._count.messages,
      updatedAt: row.updatedAt.toISOString(),
      preview: firstLine(row.messages[0]?.content ?? ''),
    }));
  }

  async conversation(userId: string, id: string): Promise<ConversationDetail> {
    const row = await this.prisma.aiConversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    });
    if (!row || row.userId !== userId) throw AppException.notFound('Cuộc trò chuyện');

    return {
      id: row.id,
      kind: row.kind as ConversationKind,
      title: row.title ?? 'Cuộc trò chuyện',
      messageCount: row._count.messages,
      updatedAt: row.updatedAt.toISOString(),
      preview: firstLine(row.messages.at(-1)?.content ?? ''),
      // The system turn is an implementation detail, not part of the chat.
      messages: row.messages.filter((message) => message.role !== 'system').map(toMessageView),
    };
  }

  async remove(userId: string, id: string): Promise<{ id: string }> {
    const row = await this.prisma.aiConversation.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw AppException.notFound('Cuộc trò chuyện');
    await this.prisma.aiConversation.delete({ where: { id } });
    return { id };
  }

  /**
   * One turn of tutoring.
   *
   * The learner's message is stored before the model is called, so a failed
   * call leaves the question in the history rather than losing it. The reply is
   * stored only once it has been validated.
   */
  async ask(userId: string, input: TutorAskInput, now = new Date()): Promise<TutorReply> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { displayName: true, currentLevel: true },
    });

    const conversation = input.conversationId
      ? await this.requireConversation(userId, input.conversationId)
      : await this.prisma.aiConversation.create({
          data: { userId, kind: 'tutor', title: titleFrom(input.message), createdAt: now },
        });

    const question = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: input.message,
        createdAt: now,
      },
    });

    const history = await this.prisma.aiMessage.findMany({
      where: { conversationId: conversation.id, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_TURNS,
    });

    const { value, result } = await this.ai.completeJson(
      { userId, feature: 'tutor' },
      {
        tier: 'fast',
        system: buildTutorPrompt({
          cefr: (profile?.currentLevel ?? 'A2') as CefrLevel,
          displayName: profile?.displayName ?? 'bạn',
        }),
        messages: buildTurns(history, input.context),
        maxOutputTokens: 3072,
        temperature: 0.6,
        responseSchema: TUTOR_RESPONSE_SCHEMA,
      },
      (raw) => tutorReplySchema.parse(raw),
    );

    const reply = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: value.answerVi,
        corrections: value.corrections as unknown as Prisma.InputJsonValue,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        model: result.model,
      },
    });

    await this.prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // A correction the tutor made is a real mistake the learner made, so it
    // belongs in the same ledger the analytics page reads.
    for (const correction of value.corrections) {
      await this.prisma.mistakeLog.create({
        data: {
          userId,
          skill: 'WRITING',
          category: 'tutor-correction',
          detail: correction.original,
          sourceType: 'tutor',
          sourceId: conversation.id,
          occurredAt: now,
        },
      });
    }

    return {
      conversationId: conversation.id,
      userMessage: toMessageView(question),
      reply: toMessageView(reply),
      quota: await this.quota(userId),
    };
  }

  private async requireConversation(userId: string, id: string) {
    const row = await this.prisma.aiConversation.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw AppException.notFound('Cuộc trò chuyện');
    return row;
  }
}

export const TUTOR_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    answerVi: { type: 'string' },
    corrections: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          original: { type: 'string' },
          corrected: { type: 'string' },
          whyVi: { type: 'string' },
        },
        required: ['original', 'corrected', 'whyVi'],
        additionalProperties: false,
      },
    },
  },
  required: ['answerVi', 'corrections'],
  additionalProperties: false,
};

/**
 * Replays the conversation oldest-first, with the context attached to the
 * CURRENT question rather than to the front of the thread.
 *
 * Putting it first looked equivalent and was not: the model reads to the end,
 * finds the previous exchange sitting closer to the question than the context
 * is, and answers about that instead. "Tại sao câu này sai?" then explains the
 * wrong sentence.
 */
export function buildTurns(
  newestFirst: { role: string; content: string }[],
  context?: TutorAskInput['context'],
): { role: 'user' | 'assistant'; content: string }[] {
  const turns = [...newestFirst].reverse().map((message) => ({
    role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: message.content,
  }));

  const current = turns.at(-1);
  if (context && current) {
    turns[turns.length - 1] = {
      ...current,
      content: `${contextLine(context)}\n\n${current.content}`,
    };
  }

  return turns;
}

/**
 * Turns the thing the learner is asking about into a line the model can read,
 * so "câu này sai chỗ nào?" works without them retyping the sentence.
 */
function contextLine(context: NonNullable<TutorAskInput['context']>): string {
  const label: Record<string, string> = {
    word: 'từ',
    lesson: 'bài học',
    exercise: 'bài tập',
    writing: 'bài viết',
    reading: 'bài đọc',
    listening: 'bài nghe',
  };
  const excerpt = context.excerpt ? `\nNội dung: "${context.excerpt}"` : '';
  return `[Bối cảnh] Người học đang xem ${label[context.kind] ?? context.kind}: ${context.ref}${excerpt}`;
}

function toMessageView(message: AiMessage): TutorMessageView {
  return {
    id: message.id,
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content,
    corrections: Array.isArray(message.corrections)
      ? (message.corrections as unknown as TutorCorrection[])
      : [],
    createdAt: message.createdAt.toISOString(),
  };
}

/** The first question becomes the conversation's name in the sidebar. */
export function titleFrom(message: string): string {
  const line = firstLine(message);
  return line.length <= 60 ? line : `${line.slice(0, 57)}…`;
}

function firstLine(text: string): string {
  const line = text.trim().split('\n')[0]?.trim() ?? '';
  return line.length <= 120 ? line : `${line.slice(0, 117)}…`;
}
