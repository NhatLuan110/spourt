import { Injectable } from '@nestjs/common';
import { endOfStudyDay, startOfStudyDay, studyDayKey } from '@sprout/shared';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';

/**
 * §9.4 — every "today" in the product is the learner's local study day with a
 * 04:00 rollover, never a UTC date. Studying at 01:00 still counts for the day
 * before, which is the whole point of the rollover.
 */
export interface StudyDay {
  key: string;
  /** Instant the study day begins, in UTC. */
  start: Date;
  /** Instant the study day ends, in UTC. */
  end: Date;
  timeZone: string;
  rolloverHour: number;
  /** UTC midnight of the calendar date — the DailyStat primary key. */
  statDate: Date;
}

export interface LearnerClock {
  timeZone: string;
  rolloverHour: number;
}

@Injectable()
export class StudyDayService {
  constructor(private readonly prisma: PrismaService) {}

  async clockFor(userId: string): Promise<LearnerClock> {
    const [profile, settings] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId }, select: { timezone: true } }),
      this.prisma.userSettings.findUnique({
        where: { userId },
        select: { dayRolloverHour: true },
      }),
    ]);

    if (!profile || !settings) throw AppException.notFound('Tài khoản');
    return { timeZone: profile.timezone, rolloverHour: settings.dayRolloverHour };
  }

  /** Build the study day containing `now` for a learner whose clock is known. */
  resolve(clock: LearnerClock, now = new Date()): StudyDay {
    const key = studyDayKey(now, clock.timeZone, clock.rolloverHour);
    return {
      key,
      start: startOfStudyDay(key, clock.timeZone, clock.rolloverHour),
      end: endOfStudyDay(key, clock.timeZone, clock.rolloverHour),
      timeZone: clock.timeZone,
      rolloverHour: clock.rolloverHour,
      statDate: statDateFromKey(key),
    };
  }

  async today(userId: string, now = new Date()): Promise<StudyDay> {
    return this.resolve(await this.clockFor(userId), now);
  }

  /** The study day a given key names, for the same learner clock. */
  dayFromKey(clock: LearnerClock, key: string): StudyDay {
    return {
      key,
      start: startOfStudyDay(key, clock.timeZone, clock.rolloverHour),
      end: endOfStudyDay(key, clock.timeZone, clock.rolloverHour),
      timeZone: clock.timeZone,
      rolloverHour: clock.rolloverHour,
      statDate: statDateFromKey(key),
    };
  }
}

/** `2026-03-10` becomes the UTC midnight Prisma stores in a `@db.Date`. */
export function statDateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Inverse of statDateFromKey, for reading DailyStat rows back. */
export function keyFromStatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
