import { Module } from '@nestjs/common';
import { ExamPrepController } from './exam-prep.controller';
import { ExamPrepService } from './exam-prep.service';

@Module({ controllers: [ExamPrepController], providers: [ExamPrepService] })
export class ExamPrepModule {}
