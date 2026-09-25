import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TutorController } from './tutor.controller';
import { TutorService } from './tutor.service';

@Module({
  imports: [AiModule],
  controllers: [TutorController],
  providers: [TutorService],
})
export class TutorModule {}
