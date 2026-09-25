import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { slugParamSchema, writingListQuerySchema, writingSubmitSchema } from '@sprout/shared';
import type { WritingListQuery, WritingSubmitInput } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { WritingService } from './writing.service';

const idParam = z.object({ id: z.string().min(1) });
const historyQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

@ApiTags('writing')
@Controller('writing')
export class WritingController {
  constructor(private readonly writing: WritingService) {}

  @Get('prompts')
  @ApiOperation({ summary: 'Writing prompts by kind and level' })
  prompts(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(writingListQuerySchema)) query: WritingListQuery,
  ) {
    return this.writing.prompts(userId, query);
  }

  @Get('submissions')
  @ApiOperation({ summary: 'What this learner has written before' })
  history(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(historyQuery)) query: { limit: number },
  ) {
    return this.writing.history(userId, query.limit);
  }

  @Get('submissions/:id')
  @ApiOperation({ summary: 'One submission with its feedback' })
  submission(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(idParam)) params: { id: string },
  ) {
    return this.writing.submission(userId, params.id);
  }

  @Get('prompts/:slug')
  @ApiOperation({ summary: 'One prompt; the sample answer appears after a first attempt' })
  prompt(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.writing.prompt(userId, params.slug);
  }

  @Post('submissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a piece of writing and get it graded' })
  submit(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(writingSubmitSchema)) body: WritingSubmitInput,
  ) {
    return this.writing.submit(userId, body);
  }
}
