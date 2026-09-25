import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { slugParamSchema, testListQuerySchema, testSubmitSchema } from '@sprout/shared';
import type { TestListQuery, TestSubmitInput } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { TestsService } from './tests.service';

const attemptParamSchema = z.object({ attemptId: z.string().min(1) });

@ApiTags('tests')
@Controller('tests')
export class TestsController {
  constructor(private readonly tests: TestsService) {}

  @Get()
  @ApiOperation({ summary: 'Available tests with the learner’s last result' })
  list(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(testListQuerySchema)) query: TestListQuery,
  ) {
    return this.tests.list(userId, query);
  }

  @Get('attempts/:attemptId')
  @ApiOperation({ summary: 'The result of a finished attempt' })
  result(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(attemptParamSchema)) params: { attemptId: string },
  ) {
    return this.tests.result(userId, params.attemptId);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One test with its sections' })
  detail(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.tests.detail(userId, params.slug);
  }

  @Post(':slug/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open an attempt, or resume one already in flight' })
  start(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.tests.start(userId, params.slug);
  }

  @Post(':slug/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Answer, and receive the next question the walk chooses' })
  answer(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
    @Body(zodPipe(testSubmitSchema)) body: TestSubmitInput,
  ) {
    return this.tests.answer(userId, params.slug, body);
  }

  @Post(':slug/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close the attempt, score it, and set the CEFR level' })
  finish(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.tests.finish(userId, params.slug);
  }
}
