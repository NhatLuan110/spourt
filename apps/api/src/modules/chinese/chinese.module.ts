import { Module } from '@nestjs/common';
import { ChineseController } from './chinese.controller';
import { ChineseService } from './chinese.service';
import { WorksheetService } from './worksheet.service';
import { ChineseSrsService } from './chinese-srs.service';

@Module({
  controllers: [ChineseController],
  providers: [ChineseService, WorksheetService, ChineseSrsService],
  exports: [ChineseService, WorksheetService, ChineseSrsService],
})
export class ChineseModule {}
