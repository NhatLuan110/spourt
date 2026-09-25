import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  chineseWordListQuerySchema,
  hanziListQuerySchema,
  hskLevelSchema,
  updateUserHanziSchema,
  worksheetQuerySchema,
} from '@sprout/shared';
import type {
  ChineseWordListQuery,
  HanziListQuery,
  UpdateUserHanziInput,
  WorksheetQuery,
} from '@sprout/shared';
import { z } from 'zod';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { ChineseService } from './chinese.service';
import { ChineseSrsService } from './chinese-srs.service';
import { WorksheetService } from './worksheet.service';

const levelParamSchema = z.object({ level: hskLevelSchema });
const wordIdParamSchema = z.object({ wordId: z.string().min(1) });
const learnQuerySchema = z.object({
  hsk: hskLevelSchema.default('HSK1'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const reviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const forecastQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
const gradeSchema = z.object({
  /** 0 Quên | 1 Khó | 2 Được | 3 Dễ — cùng thang với ngăn tiếng Anh. */
  grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  responseMs: z.coerce.number().int().min(0).max(600000).default(0),
});
/** Một chữ Hán duy nhất trên đường dẫn, ví dụ /chinese/hanzi/爱. */
const characterParamSchema = z.object({ character: z.string().min(1).max(2) });

@ApiTags('chinese')
@Controller('chinese')
export class ChineseController {
  constructor(
    private readonly chinese: ChineseService,
    private readonly worksheets: WorksheetService,
    private readonly srs: ChineseSrsService,
  ) {}

  @Get('levels')
  @ApiOperation({ summary: 'Sáu cấp HSK kèm tiến độ của người học' })
  levels(@CurrentUser('id') userId: string) {
    return this.chinese.levels(userId);
  }

  @Get('levels/:level/words')
  @ApiOperation({ summary: 'Từ vựng của một cấp HSK, lọc và phân trang' })
  words(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(levelParamSchema)) params: { level: 'HSK1' },
    @Query(zodPipe(chineseWordListQuerySchema)) query: ChineseWordListQuery,
  ) {
    return this.chinese.words(userId, params.level, query);
  }

  @Get('hanzi')
  @ApiOperation({ summary: 'Danh sách chữ Hán để chọn tập viết' })
  hanziList(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(hanziListQuerySchema)) query: HanziListQuery,
  ) {
    return this.chinese.hanziList(userId, query);
  }

  @Get('hanzi/:character')
  @ApiOperation({ summary: 'Một chữ Hán: âm đọc, số nét, các từ chứa nó' })
  hanzi(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(characterParamSchema)) params: { character: string },
  ) {
    return this.chinese.hanziDetail(userId, params.character);
  }

  @Patch('hanzi/:character')
  @ApiOperation({ summary: 'Đánh dấu đã viết thuộc một chữ' })
  markHanzi(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(characterParamSchema)) params: { character: string },
    @Body(zodPipe(updateUserHanziSchema)) body: UpdateUserHanziInput,
  ) {
    return this.chinese.markHanzi(userId, params.character, body.canWrite ?? true);
  }

  @Get('worksheet')
  @ApiOperation({ summary: 'Dữ liệu một tờ tập viết A4' })
  worksheet(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(worksheetQuerySchema)) query: WorksheetQuery,
  ) {
    return this.worksheets.build(userId, query);
  }

  // ---- học và ôn tập -------------------------------------------------------

  @Get('learn')
  @ApiOperation({ summary: 'Thẻ từ mới của một cấp HSK' })
  learn(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(learnQuerySchema)) query: { hsk: 'HSK1'; limit: number },
  ) {
    return this.srs.newCards(userId, query.hsk, query.limit);
  }

  @Get('review')
  @ApiOperation({ summary: 'Hàng đợi ôn tập hôm nay' })
  reviewQueue(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(reviewQuerySchema)) query: { limit: number },
  ) {
    return this.srs.dueCards(userId, query.limit);
  }

  @Post('review/:wordId')
  @ApiOperation({ summary: 'Chấm một thẻ và dời lịch ôn' })
  grade(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(wordIdParamSchema)) params: { wordId: string },
    @Body(zodPipe(gradeSchema)) body: { grade: 0 | 1 | 2 | 3; responseMs: number },
  ) {
    return this.srs.grade(userId, params.wordId, body.grade, body.responseMs);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Số liệu tiến độ của ngăn tiếng Trung' })
  stats(@CurrentUser('id') userId: string) {
    return this.srs.stats(userId);
  }

  @Get('forecast')
  @ApiOperation({ summary: 'Lịch ôn sắp tới theo ngày' })
  forecast(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(forecastQuerySchema)) query: { days: number },
  ) {
    return this.srs.forecast(userId, query.days);
  }
}
