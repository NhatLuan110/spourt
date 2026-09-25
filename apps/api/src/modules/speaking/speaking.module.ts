import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { GamificationModule } from '../gamification/gamification.module';
import { SpeakingController } from './speaking.controller';
import { SpeakingService } from './speaking.service';
import { RoleplayService } from './roleplay.service';

@Module({
  imports: [AiModule, GamificationModule],
  controllers: [SpeakingController],
  providers: [SpeakingService, RoleplayService],
})
export class SpeakingModule {}
