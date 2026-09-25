import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { TopicsService } from './topics.service';
import { WordsService } from './words.service';

@Module({
  controllers: [ContentController],
  providers: [TopicsService, WordsService],
  exports: [TopicsService, WordsService],
})
export class ContentModule {}
