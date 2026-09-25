import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { conversationListQuerySchema, tutorAskSchema } from '@sprout/shared';
import type { ConversationListQuery, TutorAskInput } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { TutorService } from './tutor.service';

const idParam = z.object({ id: z.string().min(1) });

@ApiTags('tutor')
@Controller('tutor')
export class TutorController {
  constructor(private readonly tutor: TutorService) {}

  @Get('quota')
  @ApiOperation({ summary: 'How much of today’s free allowance is left (§10.1)' })
  quota(@CurrentUser('id') userId: string) {
    return this.tutor.quota(userId);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Past conversations, most recent first' })
  conversations(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(conversationListQuerySchema)) query: ConversationListQuery,
  ) {
    return this.tutor.conversations(userId, query);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'One conversation with every turn' })
  conversation(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(idParam)) params: { id: string },
  ) {
    return this.tutor.conversation(userId, params.id);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete a conversation and its messages' })
  remove(@CurrentUser('id') userId: string, @Param(zodPipe(idParam)) params: { id: string }) {
    return this.tutor.remove(userId, params.id);
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask a question; the answer comes back with corrections' })
  ask(@CurrentUser('id') userId: string, @Body(zodPipe(tutorAskSchema)) body: TutorAskInput) {
    return this.tutor.ask(userId, body);
  }
}
