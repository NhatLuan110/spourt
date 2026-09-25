import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SHOP_ITEMS, xpHistoryQuerySchema } from '@sprout/shared';
import type { XpHistoryQuery } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AchievementsService } from './achievements.service';
import { StudyDayService, keyFromStatDate } from './study-day.service';

@ApiTags('gamification')
@Controller()
export class GamificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly achievements: AchievementsService,
    private readonly studyDay: StudyDayService,
  ) {}

  @Get('me/achievements')
  @ApiOperation({ summary: 'Every badge with unlock state and progress' })
  list(@CurrentUser('id') userId: string) {
    return this.achievements.list(userId);
  }

  @Get('me/xp-history')
  @ApiOperation({ summary: 'Daily XP and study minutes for the activity chart' })
  async history(
    @CurrentUser('id') userId: string,
    @Query(zodPipe(xpHistoryQuerySchema)) query: XpHistoryQuery,
  ) {
    const today = await this.studyDay.today(userId);
    const from = new Date(today.statDate.getTime() - (query.days - 1) * 86_400_000);

    const rows = await this.prisma.dailyStat.findMany({
      where: { userId, date: { gte: from, lte: today.statDate } },
      orderBy: { date: 'asc' },
    });

    const byKey = new Map(rows.map((row) => [keyFromStatDate(row.date), row]));
    const days: {
      dayKey: string;
      xpEarned: number;
      studyMinutes: number;
      wordsLearned: number;
      wordsReviewed: number;
      accuracy: number | null;
      goalMet: boolean;
    }[] = [];

    // Days with no activity are real zeros, not gaps: the chart must show them.
    for (let offset = query.days - 1; offset >= 0; offset -= 1) {
      const date = new Date(today.statDate.getTime() - offset * 86_400_000);
      const key = keyFromStatDate(date);
      const row = byKey.get(key);
      days.push({
        dayKey: key,
        xpEarned: row?.xpEarned ?? 0,
        studyMinutes: row?.studyMinutes ?? 0,
        wordsLearned: row?.wordsLearned ?? 0,
        wordsReviewed: row?.wordsReviewed ?? 0,
        accuracy: row?.accuracy ?? null,
        goalMet: row?.goalMet ?? false,
      });
    }

    return days;
  }

  @Get('shop/items')
  @ApiOperation({ summary: 'What coins can be spent on (§9.2)' })
  shop() {
    return SHOP_ITEMS;
  }
}
