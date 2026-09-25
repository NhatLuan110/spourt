import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { SentenceController } from './sentence.controller';
import { SentenceService } from './sentence.service';

@Module({
  imports: [GamificationModule],
  controllers: [SentenceController],
  providers: [SentenceService],
})
export class SentenceModule {}
