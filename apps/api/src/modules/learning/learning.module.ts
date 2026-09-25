import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { LearningEngineService } from './learning-engine.service';

/** The shared grading engine behind grammar, reading and listening. */
@Module({
  imports: [GamificationModule],
  providers: [LearningEngineService],
  exports: [LearningEngineService],
})
export class LearningModule {}
