import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { wordClassPracticeRequestSchema, wordClassSubmitSchema } from '@sprout/shared';
import type { WordClassPracticeRequest, WordClassSubmitInput } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { WordClassService } from './wordclass.service';

const rootParamSchema = z.object({ rootSlug: z.string().min(1) });

@ApiTags('word-class')
@Controller('word-class')
export class WordClassController {
  constructor(private readonly wordClass: WordClassService) {}

  @Get('suffix-rules')
  @ApiOperation({ summary: 'The §7.4.2 suffix table with reliability and exceptions' })
  suffixRules() {
    return this.wordClass.suffixRules();
  }

  @Get('families')
  families(@CurrentUser('id') userId: string) {
    return this.wordClass.families(userId);
  }

  @Get('families/:rootSlug')
  @ApiOperation({ summary: 'One word family across every part of speech' })
  family(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(rootParamSchema)) params: { rootSlug: string },
  ) {
    return this.wordClass.family(userId, params.rootSlug);
  }

  @Get('practice')
  @ApiOperation({ summary: 'Generate word form gap exercises' })
  practice(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(wordClassPracticeRequestSchema)) query: WordClassPracticeRequest,
  ) {
    return this.wordClass.practice(userId, query);
  }

  @Post('practice/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(wordClassSubmitSchema)) body: WordClassSubmitInput,
  ) {
    return this.wordClass.submit(userId, body);
  }
}
