import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { ListeningController } from './listening.controller';
import { ListeningService } from './listening.service';

@Module({
  imports: [LearningModule],
  controllers: [ListeningController],
  providers: [ListeningService],
})
export class ListeningModule {}
