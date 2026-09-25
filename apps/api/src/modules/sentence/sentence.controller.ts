import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { rewriteCheckSchema, rewriteQuerySchema, rewriteSubmitSchema } from '@sprout/shared';
import type { RewriteCheckInput, RewriteQuery, RewriteSubmitInput } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { SentenceService } from './sentence.service';

@ApiTags('sentence')
@Controller('sentence')
export class SentenceController {
  constructor(private readonly sentence: SentenceService) {}

  @Get('sets')
  @ApiOperation({ summary: 'Transformation patterns, with how many the learner has solved' })
  sets(@CurrentUser('id') userId: string) {
    return this.sentence.sets(userId);
  }

  @Get('practice')
  @ApiOperation({ summary: 'Items to rewrite; the accepted answers stay on the server' })
  practice(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(rewriteQuerySchema)) query: RewriteQuery,
  ) {
    return this.sentence.practice(userId, query);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grade rewrites: meaning and cue are scored separately' })
  submit(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(rewriteSubmitSchema)) body: RewriteSubmitInput,
  ) {
    return this.sentence.submit(userId, body);
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check one answer as you write it; awards nothing' })
  check(@Body(zodPipe(rewriteCheckSchema)) body: RewriteCheckInput) {
    return this.sentence.check(body);
  }
}
