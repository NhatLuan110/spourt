import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { ReadingController } from './reading.controller';
import { ReadingService } from './reading.service';

@Module({
  imports: [LearningModule],
  controllers: [ReadingController],
  providers: [ReadingService],
})
export class ReadingModule {}
