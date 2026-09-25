import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { AiService } from './ai.service';

/**
 * The provider-agnostic AI layer (D-044). Every feature that talks to a model
 * imports this, never a provider directly.
 */
@Module({
  imports: [GamificationModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
