import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { join } from 'node:path';
import { validateEnv } from './infra/config/env';
import { PrismaModule } from './infra/prisma/prisma.module';
import { CryptoModule } from './infra/crypto/crypto.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { ContentModule } from './modules/content/content.module';
import { SrsModule } from './modules/srs/srs.module';
import { VocabularyModule } from './modules/vocabulary/vocabulary.module';
import { DecksModule } from './modules/decks/decks.module';
import { WordClassModule } from './modules/wordclass/wordclass.module';
import { StatsModule } from './modules/stats/stats.module';
import { GrammarModule } from './modules/grammar/grammar.module';
import { ReadingModule } from './modules/reading/reading.module';
import { ListeningModule } from './modules/listening/listening.module';
import { TestsModule } from './modules/tests/tests.module';
import { AiModule } from './modules/ai/ai.module';
import { WritingModule } from './modules/writing/writing.module';
import { TutorModule } from './modules/tutor/tutor.module';
import { SpeakingModule } from './modules/speaking/speaking.module';
import { SentenceModule } from './modules/sentence/sentence.module';
import { AdminModule } from './modules/admin/admin.module';
import { ChineseModule } from './modules/chinese/chinese.module';
import { ExamPrepModule } from './modules/exam-prep/exam-prep.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // A single .env at the repository root drives both apps.
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '../../.env')],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: (config.get<number>('RATE_LIMIT_TTL_SEC') ?? 60) * 1000,
            limit: config.get<number>('RATE_LIMIT_MAX') ?? 100,
          },
        ],
        // The integration suite registers dozens of accounts from one address;
        // rate limiting is verified on its own rather than throttling the suite.
        skipIf: () => config.get<string>('NODE_ENV') === 'test',
      }),
    }),
    // Global so the JwtAuthGuard registered below can verify tokens everywhere.
    JwtModule.register({ global: true }),
    PrismaModule,
    CryptoModule,
    AuthModule,
    UsersModule,
    HealthModule,
    GamificationModule,
    ContentModule,
    SrsModule,
    VocabularyModule,
    DecksModule,
    WordClassModule,
    StatsModule,
    GrammarModule,
    ReadingModule,
    ListeningModule,
    TestsModule,
    AiModule,
    WritingModule,
    TutorModule,
    SpeakingModule,
    SentenceModule,
    AdminModule,
    ChineseModule,
    ExamPrepModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
