import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';

@Module({
  imports: [GamificationModule],
  controllers: [TestsController],
  providers: [TestsService],
})
export class TestsModule {}
