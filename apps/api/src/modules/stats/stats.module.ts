import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { StatsController } from './stats.controller';
import { DashboardService } from './dashboard.service';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [GamificationModule],
  controllers: [StatsController],
  providers: [DashboardService, AnalyticsService],
  exports: [DashboardService, AnalyticsService],
})
export class StatsModule {}
