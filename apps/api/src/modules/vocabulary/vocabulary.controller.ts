import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  learnCommitSchema,
  learnSessionQuerySchema,
  myWordsQuerySchema,
  practiceSubmitSchema,
  vocabPracticeRequestSchema,
  flashcardQuerySchema,
  flashcardRateSchema,
} from '@sprout/shared';
import type {
  LearnCommitInput,
  LearnSessionQuery,
  MyWordsQuery,
  PracticeSubmitInput,
  VocabPracticeRequest,
  FlashcardQuery,
  FlashcardRateInput,
} from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { LearnService } from './learn.service';
import { PracticeService } from './practice.service';
import { UserWordsService } from './user-words.service';
import { FlashcardsService } from './flashcards.service';

@ApiTags('vocabulary')
@Controller()
export class VocabularyController {
  constructor(
    private readonly learn: LearnService,
    private readonly practice: PracticeService,
    private readonly userWords: UserWordsService,
    private readonly flashcardsService: FlashcardsService,
  ) {}

  @Get('learn/cards')
  @ApiOperation({ summary: 'The next new words to teach, capped by the daily allowance' })
  cards(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(learnSessionQuerySchema)) query: LearnSessionQuery,
  ) {
    return this.learn.cards(userId, query);
  }

  @Post('learn/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add the words just studied to the review schedule' })
  commit(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(learnCommitSchema)) body: LearnCommitInput,
  ) {
    return this.learn.commit(userId, body);
  }

  @Post('practice')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a practice set in the five §7.3.4 formats' })
  createPractice(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(vocabPracticeRequestSchema)) body: VocabPracticeRequest,
  ) {
    return this.practice.create(userId, body);
  }

  @Post('practice/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grade a practice set, log every attempt and pay out XP' })
  submitPractice(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(practiceSubmitSchema)) body: PracticeSubmitInput,
  ) {
    return this.practice.submit(userId, body);
  }

  @Get('me/words')
  @ApiOperation({ summary: 'The learner collection, filterable and sortable' })
  myWords(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(myWordsQuerySchema)) query: MyWordsQuery,
  ) {
    return this.userWords.list(userId, query);
  }

  @Get('flashcards')
  @ApiOperation({ summary: 'A browsable deck of cards, either direction (§7.3)' })
  flashcards(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(flashcardQuerySchema)) query: FlashcardQuery,
  ) {
    return this.flashcardsService.deck(userId, query);
  }

  @Post('flashcards/rate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Self-rate a card; not-known enqueues it for review' })
  rateFlashcard(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(flashcardRateSchema)) body: FlashcardRateInput,
  ) {
    return this.flashcardsService.rate(userId, body);
  }
}
