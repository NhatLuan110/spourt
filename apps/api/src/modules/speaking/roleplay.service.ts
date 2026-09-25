import { Injectable } from '@nestjs/common';
import type { Prisma, SpeakingScenario } from '@prisma/client';
import {
  roleplayReplySchema,
  type CefrLevel,
  type RoleplayState,
  type RoleplayTurn,
  type RoleplayTurnInput,
  type SpeakingScenarioCard,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class RoleplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly gamification: GamificationService,
  ) {}

  async scenarios(query: { cefr?: CefrLevel }): Promise<SpeakingScenarioCard[]> {
    const rows = await this.prisma.speakingScenario.findMany({
      where: query.cefr ? { cefr: query.cefr } : {},
      orderBy: [{ cefr: 'asc' }, { title: 'asc' }],
    });
    return rows.map(toScenarioCard);
  }

  async scenario(slug: string): Promise<SpeakingScenarioCard> {
    const row = await this.prisma.speakingScenario.findUnique({ where: { slug } });
    if (!row) throw AppException.notFound('Tình huống hội thoại');
    return toScenarioCard(row);
  }

  /**
   * One turn of role-play. The learner can type or speak; audio is transcribed
   * first and the transcript is what the model sees, so both paths converge.
   */
  async turn(userId: string, input: RoleplayTurnInput, now = new Date()): Promise<RoleplayState> {
    const scenario = await this.prisma.speakingScenario.findUnique({
      where: { slug: input.scenarioSlug },
    });
    if (!scenario) throw AppException.notFound('Tình huống hội thoại');

    const said = await this.resolveMessage(userId, input);

    const conversation = input.conversationId
      ? await this.requireConversation(userId, input.conversationId)
      : await this.prisma.aiConversation.create({
          data: {
            userId,
            kind: 'roleplay',
            scenarioId: scenario.id,
            title: scenario.titleVi,
            createdAt: now,
          },
        });

    const previous = await this.prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });
    const turnsUsed = previous.filter((message) => message.role === 'user').length;

    if (turnsUsed >= scenario.maxTurns) {
      throw AppException.conflict(
        'ATTEMPT_ALREADY_SUBMITTED',
        `Cuộc hội thoại này đã đủ ${scenario.maxTurns} lượt. Bắt đầu cuộc mới nhé.`,
      );
    }

    await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: said.text,
        createdAt: now,
      },
    });

    const { value } = await this.ai.completeJson(
      { userId, feature: 'roleplay' },
      {
        tier: 'fast',
        system: buildRoleplayPrompt(scenario, turnsUsed + 1),
        messages: [
          ...previous
            .filter((message) => message.role !== 'system')
            .map((message) => ({
              role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
              content: message.content,
            })),
          { role: 'user' as const, content: said.text },
        ],
        maxOutputTokens: 1024,
        temperature: 0.8,
      },
      (raw) => roleplayReplySchema.parse(raw),
    );

    const reply = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: value.reply,
        corrections: value.corrections as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    const finished = value.finished || turnsUsed + 1 >= scenario.maxTurns;
    if (finished) {
      // Paid once the conversation ends, not per turn: a role-play is one
      // activity, and per-turn XP would reward padding it out.
      await this.gamification.award({
        userId,
        source: 'SPEAKING',
        skill: 'SPEAKING',
        refType: 'roleplay',
        refId: conversation.id,
        score: Math.round((value.objectivesMet.length / Math.max(1, scenario.objectives.length)) * 100),
        observationScore: Math.round(
          (value.objectivesMet.length / Math.max(1, scenario.objectives.length)) * 100,
        ),
        studySeconds: Math.max(60, (turnsUsed + 1) * 30),
        now,
      });
    }

    const turns: RoleplayTurn[] = [
      ...previous
        .filter((message) => message.role !== 'system')
        .map(
          (message): RoleplayTurn => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content,
            corrections: readCorrections(message.corrections),
          }),
        ),
      { role: 'user', content: said.text, ...(said.spoken ? { transcript: said.text } : {}) },
      { role: 'assistant', content: reply.content, corrections: value.corrections },
    ];

    return {
      conversationId: conversation.id,
      scenarioSlug: scenario.slug,
      turns,
      turnsUsed: turnsUsed + 1,
      maxTurns: scenario.maxTurns,
      finished,
      objectivesMet: value.objectivesMet,
    };
  }

  /** Text as typed, or audio transcribed into text. */
  private async resolveMessage(
    userId: string,
    input: RoleplayTurnInput,
  ): Promise<{ text: string; spoken: boolean }> {
    if (input.message) return { text: input.message, spoken: false };

    if (!input.audioBase64 || !input.mimeType) {
      throw AppException.validation(
        { message: 'required' },
        'Cần nhập câu trả lời hoặc ghi âm.',
      );
    }
    if (!this.ai.canTranscribe()) {
      throw AppException.conflict(
        'AI_PROVIDER_ERROR',
        'Nhận dạng giọng nói chưa được cấu hình. Bạn vẫn gõ chữ được.',
      );
    }

    const heard = await this.ai.transcribe(
      { userId, feature: 'speaking' },
      { audio: Buffer.from(input.audioBase64, 'base64'), mimeType: input.mimeType },
    );
    if (heard.text.trim().length === 0) {
      throw AppException.conflict('AI_PROVIDER_ERROR', 'Không nghe được gì. Thử ghi âm lại nhé.');
    }
    return { text: heard.text.trim(), spoken: true };
  }

  private async requireConversation(userId: string, id: string) {
    const row = await this.prisma.aiConversation.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw AppException.notFound('Cuộc hội thoại');
    return row;
  }
}

/**
 * The instruction that makes the model a character rather than an assistant.
 *
 * Two rules do most of the work: stay in role even when the learner writes
 * badly, and never switch to Vietnamese. A model that helpfully translates
 * removes the whole point of the exercise.
 */
export function buildRoleplayPrompt(scenario: SpeakingScenario, turn: number): string {
  return [
    scenario.aiPersona,
    '',
    `Trình độ người học: ${scenario.cefr}. Đây là lượt ${turn}/${scenario.maxTurns}.`,
    '',
    'Mục tiêu người học cần đạt trong cuộc hội thoại này:',
    ...scenario.objectives.map((objective, index) => `  ${index + 1}. ${objective}`),
    '',
    'Quy tắc:',
    '- LUÔN nói bằng tiếng Anh, kể cả khi người học viết tiếng Việt. Bạn là nhân vật',
    '  trong tình huống, không phải giáo viên dịch bài.',
    '- Giữ đúng vai. Đừng nhận xét về ngữ pháp trong lời thoại.',
    `- Câu trả lời ngắn như đời thật, hợp trình độ ${scenario.cefr}. Tối đa 3 câu.`,
    '- Nếu người học nói chưa rõ, hãy hỏi lại như người thật sẽ hỏi.',
    '',
    'Ngoài lời thoại, trả về:',
    '- "corrections": lỗi tiếng Anh đáng kể trong câu người học vừa nói. Tối đa 2 lỗi',
    '  một lượt, chỉ lỗi thật sự sai, mỗi lỗi kèm lý do bằng TIẾNG VIỆT. Không có thì để rỗng.',
    '- "objectivesMet": những mục tiêu ở trên mà người học ĐÃ đạt được tính đến giờ,',
    '  chép nguyên văn từ danh sách trên.',
    '- "finished": true khi tình huống đã kết thúc tự nhiên (đã chốt đơn, đã chào tạm biệt).',
    '',
    'Trả về JSON: {"reply":"...","corrections":[{"original":"...","corrected":"...","whyVi":"..."}],',
    '"objectivesMet":["..."],"finished":false}',
  ].join('\n');
}

function toScenarioCard(row: SpeakingScenario): SpeakingScenarioCard {
  return {
    slug: row.slug,
    title: row.title,
    titleVi: row.titleVi,
    cefr: row.cefr,
    category: row.category,
    coverImageUrl: row.coverImageUrl,
    objectives: row.objectives,
    usefulPhrases: Array.isArray(row.usefulPhrases)
      ? (row.usefulPhrases as unknown as SpeakingScenarioCard['usefulPhrases'])
      : [],
    maxTurns: row.maxTurns,
  };
}

function readCorrections(value: unknown): RoleplayTurn['corrections'] {
  return Array.isArray(value) ? (value as unknown as RoleplayTurn['corrections']) : [];
}
