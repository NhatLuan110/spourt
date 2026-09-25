import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { WordClassController } from './wordclass.controller';
import { WordClassService } from './wordclass.service';

@Module({
  imports: [GamificationModule],
  controllers: [WordClassController],
  providers: [WordClassService],
  exports: [WordClassService],
})
export class WordClassModule {}
