import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { exerciseSubmitSchema, readingListQuerySchema, slugParamSchema } from '@sprout/shared';
import type { ExerciseSubmitInput, ReadingListQuery } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { ReadingService } from './reading.service';

@ApiTags('reading')
@Controller('reading')
export class ReadingController {
  constructor(private readonly reading: ReadingService) {}

  @Get('passages')
  @ApiOperation({ summary: 'Reading passages by level and topic' })
  list(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(readingListQuerySchema)) query: ReadingListQuery,
  ) {
    return this.reading.list(userId, query);
  }

  @Get('passages/:slug')
  @ApiOperation({ summary: 'One passage with its glossary and questions' })
  detail(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.reading.detail(userId, params.slug);
  }

  @Post('passages/:slug/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start timing the read, for words per minute' })
  start(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.reading.start(userId, params.slug);
  }

  @Post('passages/:slug/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grade the comprehension questions and report reading speed' })
  submit(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
    @Body(zodPipe(exerciseSubmitSchema)) body: ExerciseSubmitInput,
  ) {
    return this.reading.submit(userId, params.slug, body);
  }
}
