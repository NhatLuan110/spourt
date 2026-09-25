import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  idParamSchema,
  srsBulkReviewSchema,
  srsQueueQuerySchema,
  srsReviewSchema,
  updateUserWordSchema,
} from '@sprout/shared';
import type {
  SrsBulkReviewInput,
  SrsQueueQuery,
  SrsReviewInput,
  UpdateUserWordInput,
} from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { SrsService } from './srs.service';

const forecastQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

@ApiTags('srs')
@Controller('srs')
export class SrsController {
  constructor(private readonly srs: SrsService) {}

  @Get('queue')
  @ApiOperation({ summary: 'Due cards mixed with new ones, 4:1 (§9.1)' })
  queue(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(srsQueueQuerySchema)) query: SrsQueueQuery,
  ) {
    return this.srs.queue(userId, query);
  }

  @Post('review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grade one card and schedule the next repetition' })
  review(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(srsReviewSchema)) body: SrsReviewInput,
  ) {
    return this.srs.review(userId, body);
  }

  @Post('reviews/bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replay reviews recorded while offline' })
  bulk(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(srsBulkReviewSchema)) body: SrsBulkReviewInput,
  ) {
    return this.srs.bulkReview(userId, body);
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a review session so time and accuracy are recorded' })
  startSession(@CurrentUser('id') userId: string) {
    return this.srs.startSession(userId);
  }

  @Post('sessions/:id/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a review session and fold it into the skill estimate' })
  finishSession(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.srs.finishSession(userId, params.id);
  }

  @Get('forecast')
  @ApiOperation({ summary: 'How many cards fall due on each of the next days' })
  forecast(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(forecastQuerySchema)) query: { days: number },
  ) {
    return this.srs.forecast(userId, query.days);
  }

  @Get('stats')
  stats(@CurrentUser('id') userId: string) {
    return this.srs.stats(userId);
  }

  @Patch('cards/:id')
  @ApiOperation({ summary: 'Star a card or take it out of rotation' })
  update(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(updateUserWordSchema)) body: UpdateUserWordInput,
  ) {
    return this.srs.updateCard(userId, params.id, body);
  }

  @Post('cards/:id/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a leech over from scratch' })
  reset(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.srs.reset(userId, params.id);
  }
}
