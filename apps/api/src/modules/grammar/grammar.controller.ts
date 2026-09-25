import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  exerciseSubmitSchema,
  lessonListQuerySchema,
  lessonSectionReadSchema,
  slugParamSchema,
} from '@sprout/shared';
import type { ExerciseSubmitInput, LessonListQuery } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { GrammarService } from './grammar.service';

@ApiTags('grammar')
@Controller('grammar')
export class GrammarController {
  constructor(private readonly grammar: GrammarService) {}

  @Get('lessons')
  @ApiOperation({ summary: 'Grammar lessons with progress and prerequisite locks' })
  list(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(lessonListQuerySchema)) query: LessonListQuery,
  ) {
    return this.grammar.list(userId, query);
  }

  @Get('lessons/:slug')
  @ApiOperation({ summary: 'One lesson with its sections and exercises' })
  detail(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.grammar.detail(userId, params.slug);
  }

  @Post('lessons/:slug/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open a lesson and start timing the session' })
  start(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.grammar.start(userId, params.slug);
  }

  @Post('lessons/:slug/sections')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a section as read' })
  section(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
    @Body(zodPipe(lessonSectionReadSchema)) body: { sectionId: string },
  ) {
    return this.grammar.markSectionRead(userId, params.slug, body.sectionId);
  }

  @Post('lessons/:slug/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grade the lesson exercises and award XP' })
  submit(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
    @Body(zodPipe(exerciseSubmitSchema)) body: ExerciseSubmitInput,
  ) {
    return this.grammar.submit(userId, params.slug, body);
  }
}
