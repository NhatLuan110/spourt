import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { analyticsQuerySchema } from '@sprout/shared';
import type { AnalyticsQuery } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { DashboardService } from './dashboard.service';
import { AnalyticsService } from './analytics.service';

@ApiTags('stats')
@Controller()
export class StatsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('me/dashboard')
  @ApiOperation({ summary: 'Everything the home screen renders, in one call' })
  home(@CurrentUser('id') userId: string) {
    return this.dashboard.build(userId);
  }

  @Get('me/skills')
  @ApiOperation({ summary: 'The six skill estimates and the overall CEFR (§9.7)' })
  skills(@CurrentUser('id') userId: string) {
    return this.dashboard.skills(userId);
  }

  @Get('me/analytics')
  @ApiOperation({ summary: 'Activity, skills, mistakes and habits over a period' })
  analyticsFor(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analytics.build(userId, query);
  }
}
