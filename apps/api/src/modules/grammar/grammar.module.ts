import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { GrammarController } from './grammar.controller';
import { GrammarService } from './grammar.service';

@Module({
  imports: [LearningModule],
  controllers: [GrammarController],
  providers: [GrammarService],
})
export class GrammarModule {}
