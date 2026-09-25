import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { SrsModule } from '../srs/srs.module';
import { VocabularyController } from './vocabulary.controller';
import { LearnService } from './learn.service';
import { PracticeService } from './practice.service';
import { UserWordsService } from './user-words.service';
import { FlashcardsService } from './flashcards.service';

@Module({
  imports: [GamificationModule, SrsModule],
  controllers: [VocabularyController],
  providers: [LearnService, PracticeService, UserWordsService, FlashcardsService],
  exports: [LearnService, PracticeService, UserWordsService],
})
export class VocabularyModule {}
