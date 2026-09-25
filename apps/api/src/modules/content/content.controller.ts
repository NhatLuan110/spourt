import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { slugParamSchema, wordListQuerySchema } from '@sprout/shared';
import type { WordListQuery } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { TopicsService } from './topics.service';
import { WordsService } from './words.service';

@ApiTags('content')
@Controller()
export class ContentController {
  constructor(
    private readonly topics: TopicsService,
    private readonly words: WordsService,
  ) {}

  @Get('topics')
  @ApiOperation({ summary: 'The eight topics with the learner progress on each' })
  listTopics(@CurrentUser('id') userId: string) {
    return this.topics.list(userId);
  }

  @Get('topics/:slug')
  topic(@CurrentUser('id') userId: string, @Param(zodPipe(slugParamSchema)) params: { slug: string }) {
    return this.topics.detail(userId, params.slug);
  }

  @Get('topics/:slug/words')
  @ApiOperation({ summary: 'Words in a topic, filtered and paginated' })
  topicWords(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(slugParamSchema)) params: { slug: string },
    @Query(zodPipe(wordListQuerySchema)) query: WordListQuery,
  ) {
    return this.words.list(userId, { ...query, topicSlug: params.slug });
  }

  @Get('words')
  @ApiOperation({ summary: 'Dictionary search across every topic' })
  search(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(wordListQuerySchema)) query: WordListQuery,
  ) {
    return this.words.list(userId, query);
  }

  @Get('words/:slug')
  @ApiOperation({ summary: 'One dictionary entry: senses, examples, family, SRS state' })
  word(@CurrentUser('id') userId: string, @Param(zodPipe(slugParamSchema)) params: { slug: string }) {
    return this.words.detail(userId, params.slug);
  }
}
