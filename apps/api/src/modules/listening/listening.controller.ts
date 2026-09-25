import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { listeningListQuerySchema, listeningSubmitSchema, slugParamSchema } from '@sprout/shared';
import type { ListeningListQuery, ListeningSubmitInput } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { ListeningService } from './listening.service';

@ApiTags('listening')
@Controller('listening')
export class ListeningController {
  constructor(private readonly listening: ListeningService) {}

  @Get('tracks')
  @ApiOperation({ summary: 'Listening tracks by level, accent and format' })
  list(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(listeningListQuerySchema)) query: ListeningListQuery,
  ) {
    return this.listening.list(userId, query);
  }

  @Get('tracks/:slug')
  @ApiOperation({ summary: 'One track with transcript, questions and dictation lines' })
  detail(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.listening.detail(userId, params.slug);
  }

  @Post('tracks/:slug/start')
  @HttpCode(HttpStatus.OK)
  start(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.listening.start(userId, params.slug);
  }

  @Post('tracks/:slug/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grade comprehension and dictation, and record how it was played' })
  submit(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
    @Body(zodPipe(listeningSubmitSchema)) body: ListeningSubmitInput,
  ) {
    const { playback, ...input } = body;
    return this.listening.submit(userId, params.slug, input, playback);
  }
}
