import { describe, expect, it } from 'vitest';
import {
  addDaysToDayKey,
  daysBetweenDayKeys,
  dueDateFromIntervalDays,
  endOfStudyDay,
  formatIntervalVi,
  formatDurationVi,
  isValidTimeZone,
  parseDayKey,
  startOfStudyDay,
  studyDayKey,
  toDayKey,
  wallTimeToUtc,
  zonedParts,
} from '../src/index.js';

const HCM = 'Asia/Ho_Chi_Minh'; // UTC+7, no daylight saving
const NEW_YORK = 'America/New_York'; // UTC-5 / -4, has daylight saving

describe('zonedParts', () => {
  it('reads the wall clock in the requested zone', () => {
    const parts = zonedParts(new Date('2026-03-10T05:00:00.000Z'), HCM);
    expect(parts).toMatchObject({ year: 2026, month: 3, day: 10, hour: 12, minute: 0 });
  });

  it('handles a zone behind UTC crossing midnight', () => {
    const parts = zonedParts(new Date('2026-03-10T02:00:00.000Z'), NEW_YORK);
    expect(parts).toMatchObject({ year: 2026, month: 3, day: 9, hour: 22 });
  });
});

describe('studyDayKey', () => {
  it('uses the learner local date, not UTC', () => {
    // 23:30 UTC is already the next morning in Ho Chi Minh City.
    expect(studyDayKey(new Date('2026-03-10T23:30:00.000Z'), HCM, 4)).toBe('2026-03-11');
    expect(studyDayKey(new Date('2026-03-10T23:30:00.000Z'), NEW_YORK, 4)).toBe('2026-03-10');
  });

  it('counts a 1am session as the previous day', () => {
    // 01:10 local on 11 March still belongs to the tenth (§9.4).
    expect(studyDayKey(new Date('2026-03-10T18:10:00.000Z'), HCM, 4)).toBe('2026-03-10');
  });

  it('starts the new day exactly at the rollover hour', () => {
    const justBefore = new Date('2026-03-10T20:59:00.000Z'); // 03:59 local on 11th
    const justAfter = new Date('2026-03-10T21:01:00.000Z'); // 04:01 local on 11th
    expect(studyDayKey(justBefore, HCM, 4)).toBe('2026-03-10');
    expect(studyDayKey(justAfter, HCM, 4)).toBe('2026-03-11');
  });

  it('respects a custom rollover hour', () => {
    const time = new Date('2026-03-10T18:10:00.000Z'); // 01:10 local on 11th
    expect(studyDayKey(time, HCM, 0)).toBe('2026-03-11');
    expect(studyDayKey(time, HCM, 6)).toBe('2026-03-10');
  });
});

describe('study day boundaries', () => {
  it('starts at the rollover hour in local time', () => {
    const start = startOfStudyDay('2026-03-10', HCM, 4);
    expect(zonedParts(start, HCM)).toMatchObject({ day: 10, hour: 4, minute: 0 });
  });

  it('ends exactly 24 hours later', () => {
    const start = startOfStudyDay('2026-03-10', HCM, 4);
    const end = endOfStudyDay('2026-03-10', HCM, 4);
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it('survives a daylight saving transition', () => {
    // US clocks jump forward on 8 March 2026.
    const before = startOfStudyDay('2026-03-07', NEW_YORK, 4);
    const after = startOfStudyDay('2026-03-09', NEW_YORK, 4);
    expect(zonedParts(before, NEW_YORK).hour).toBe(4);
    expect(zonedParts(after, NEW_YORK).hour).toBe(4);
  });
});

describe('day key arithmetic', () => {
  it('formats and parses keys', () => {
    expect(toDayKey(2026, 3, 7)).toBe('2026-03-07');
    expect(parseDayKey('2026-03-07')).toEqual({ year: 2026, month: 3, day: 7 });
  });

  it('counts whole days in both directions', () => {
    expect(daysBetweenDayKeys('2026-03-10', '2026-03-11')).toBe(1);
    expect(daysBetweenDayKeys('2026-03-11', '2026-03-10')).toBe(-1);
    expect(daysBetweenDayKeys('2026-03-10', '2026-03-10')).toBe(0);
  });

  it('crosses month and year boundaries', () => {
    expect(addDaysToDayKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetweenDayKeys('2025-12-25', '2026-01-05')).toBe(11);
  });

  it('handles a leap day', () => {
    expect(addDaysToDayKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetweenDayKeys('2028-02-28', '2028-03-01')).toBe(2);
  });
});

describe('dueDateFromIntervalDays', () => {
  const now = new Date('2026-03-10T05:00:00.000Z'); // midday in Ho Chi Minh City

  it('keeps sub-day intervals exact', () => {
    const due = dueDateFromIntervalDays(now, 10 / 1440, HCM, 4);
    expect(due.getTime()).toBe(now.getTime() + 10 * 60_000);
  });

  it('aligns day intervals to the start of the local day', () => {
    const due = dueDateFromIntervalDays(now, 1, HCM, 4);
    expect(zonedParts(due, HCM)).toMatchObject({ day: 11, hour: 4 });
  });

  it('rounds fractional day intervals', () => {
    const due = dueDateFromIntervalDays(now, 3.4, HCM, 4);
    expect(zonedParts(due, HCM).day).toBe(13);
  });

  it('never schedules in the past for a zero interval', () => {
    expect(dueDateFromIntervalDays(now, 0, HCM, 4).getTime()).toBe(now.getTime());
  });
});

describe('time zone validation', () => {
  it('accepts real zones and rejects nonsense', () => {
    expect(isValidTimeZone(HCM)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('Vietnamese formatting', () => {
  it('formats durations', () => {
    expect(formatDurationVi(45)).toBe('45 phút');
    expect(formatDurationVi(60)).toBe('1 giờ');
    expect(formatDurationVi(95)).toBe('1 giờ 35 phút');
    expect(formatDurationVi(-5)).toBe('0 phút');
  });

  it('formats review intervals the way the grading buttons show them', () => {
    expect(formatIntervalVi(10 / 1440)).toBe('10 phút');
    expect(formatIntervalVi(0.5)).toBe('12 giờ');
    expect(formatIntervalVi(4)).toBe('4 ngày');
    expect(formatIntervalVi(60)).toBe('2 tháng');
    expect(formatIntervalVi(365)).toBe('1 năm');
  });
});

describe('wallTimeToUtc', () => {
  it('round trips through zonedParts', () => {
    const utc = wallTimeToUtc(HCM, 2026, 7, 4, 9, 30);
    expect(zonedParts(utc, HCM)).toMatchObject({
      year: 2026,
      month: 7,
      day: 4,
      hour: 9,
      minute: 30,
    });
  });
});
