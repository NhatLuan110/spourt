import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  cefrLevelSchema,
  roleplayTurnSchema,
  slugParamSchema,
  speakingAttemptSchema,
  speakingListQuerySchema,
} from '@sprout/shared';
import type {
  CefrLevel,
  RoleplayTurnInput,
  SpeakingAttemptInput,
  SpeakingListQuery,
} from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { SpeakingService } from './speaking.service';
import { RoleplayService } from './roleplay.service';

const historyQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
const scenarioQuery = z.object({ cefr: cefrLevelSchema.optional() });

@ApiTags('speaking')
@Controller('speaking')
export class SpeakingController {
  constructor(
    private readonly speaking: SpeakingService,
    private readonly roleplay: RoleplayService,
  ) {}

  @Get('capabilities')
  @ApiOperation({ summary: 'Whether recording and scoring are usable at all' })
  capabilities() {
    return this.speaking.capabilities();
  }

  @Get('drills')
  @ApiOperation({ summary: 'Pronunciation drills, optionally only the learner’s weak sounds' })
  drills(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(speakingListQuerySchema)) query: SpeakingListQuery,
  ) {
    return this.speaking.drills(userId, query);
  }

  @Get('drills/:slug')
  drill(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
  ) {
    return this.speaking.drill(userId, params.slug);
  }

  @Get('attempts')
  @ApiOperation({ summary: 'Past attempts with their scores' })
  history(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(historyQuery)) query: { limit: number },
  ) {
    return this.speaking.history(userId, query.limit);
  }

  @Get('issues')
  @ApiOperation({ summary: 'The sounds this learner keeps getting wrong (§7.6.3)' })
  issues(@CurrentUser('id') userId: string) {
    return this.speaking.issues(userId);
  }

  @Post('attempts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Score a recording against the sentence it was reading' })
  assess(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(speakingAttemptSchema)) body: SpeakingAttemptInput,
  ) {
    return this.speaking.assess(userId, body);
  }

  @Get('scenarios')
  @ApiOperation({ summary: 'Role-play scenarios' })
  scenarios(@Query(zodPipe(scenarioQuery)) query: { cefr?: CefrLevel }) {
    return this.roleplay.scenarios(query);
  }

  @Get('scenarios/:slug')
  scenario(@Param(zodPipe(slugParamSchema)) params: { slug: string }) {
    return this.roleplay.scenario(params.slug);
  }

  @Post('roleplay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'One turn of role-play, typed or spoken' })
  turn(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(roleplayTurnSchema)) body: RoleplayTurnInput,
  ) {
    return this.roleplay.turn(userId, body);
  }
}
