import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { GamificationModule } from '../gamification/gamification.module';
import { WritingController } from './writing.controller';
import { WritingService } from './writing.service';

@Module({
  imports: [AiModule, GamificationModule],
  controllers: [WritingController],
  providers: [WritingService],
})
export class WritingModule {}
