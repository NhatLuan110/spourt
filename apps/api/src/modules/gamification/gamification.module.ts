import { Module } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';
import { AchievementsService } from './achievements.service';
import { StudyDayService } from './study-day.service';

@Module({
  controllers: [GamificationController],
  providers: [GamificationService, AchievementsService, StudyDayService],
  exports: [GamificationService, AchievementsService, StudyDayService],
})
export class GamificationModule {}
