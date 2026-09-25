import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { examHistoryQuerySchema, examSubmitSchema } from '@sprout/shared';
import type { ExamHistoryQuery, ExamSubmitInput } from '@sprout/shared';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { ExamPrepService } from './exam-prep.service';

@ApiTags('exam-prep')
@Controller('exam-prep')
export class ExamPrepController {
  constructor(private readonly exams: ExamPrepService) {}

  @Get()
  catalog() {
    return this.exams.catalog();
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query(zodPipe(examHistoryQuerySchema)) query: ExamHistoryQuery) {
    return this.exams.history(userId, query);
  }

  @Get(':exam/:level')
  detail(@Param('exam') exam: string, @Param('level') level: string) {
    return this.exams.detail(exam, level);
  }

  @Post(':exam/:level/activities/:activityId/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentUser('id') userId: string,
    @Param('exam') exam: string,
    @Param('level') level: string,
    @Param('activityId') activityId: string,
    @Body(zodPipe(examSubmitSchema)) input: ExamSubmitInput,
  ) {
    return this.exams.submit(userId, exam, level, activityId, input);
  }
}
