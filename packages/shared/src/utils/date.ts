/**
 * §9.4 — every "day" in Sprout is the learner's local day, and the boundary is
 * `dayRolloverHour` (default 04:00), not midnight UTC. Studying at 01:00 still
 * counts for the previous calendar day. All streak/goal maths goes through here.
 */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  partsFormatterCache.set(timeZone, created);
  return created;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number.parseInt(found.value, 10) : 0;
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Turn a wall-clock time in `timeZone` into the matching UTC instant. */
export function wallTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = guess - timeZoneOffsetMs(new Date(guess), timeZone);
  // One refinement pass handles DST transitions around the guessed instant.
  result = guess - timeZoneOffsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** A study day key in `YYYY-MM-DD`, shifted by the rollover hour. */
export function studyDayKey(date: Date, timeZone: string, rolloverHour = 4): string {
  const shifted = new Date(date.getTime() - rolloverHour * 3600_000);
  const parts = zonedParts(shifted, timeZone);
  return toDayKey(parts.year, parts.month, parts.day);
}

export function toDayKey(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function parseDayKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map((value) => Number.parseInt(value, 10));
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

/** UTC instant at which the given study day starts. */
export function startOfStudyDay(key: string, timeZone: string, rolloverHour = 4): Date {
  const { year, month, day } = parseDayKey(key);
  return wallTimeToUtc(timeZone, year, month, day, rolloverHour, 0);
}

/** UTC instant at which the given study day ends (exclusive). */
export function endOfStudyDay(key: string, timeZone: string, rolloverHour = 4): Date {
  const start = startOfStudyDay(key, timeZone, rolloverHour);
  return new Date(start.getTime() + 24 * 3600_000);
}

/** Whole days from `fromKey` to `toKey`; negative when `toKey` is earlier. */
export function daysBetweenDayKeys(fromKey: string, toKey: string): number {
  const from = parseDayKey(fromKey);
  const to = parseDayKey(toKey);
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function addDaysToDayKey(key: string, days: number): string {
  const { year, month, day } = parseDayKey(key);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return toDayKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** §9.1 — a card becomes due at the start of its study day, so a due date is day-aligned. */
export function dueDateFromIntervalDays(
  now: Date,
  intervalDays: number,
  timeZone: string,
  rolloverHour = 4,
): Date {
  if (intervalDays < 1) {
    return new Date(now.getTime() + Math.max(0, intervalDays) * 86_400_000);
  }
  const todayKey = studyDayKey(now, timeZone, rolloverHour);
  const targetKey = addDaysToDayKey(todayKey, Math.round(intervalDays));
  return startOfStudyDay(targetKey, timeZone, rolloverHour);
}

export function formatDurationVi(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`;
}

/** §7.3.3 — "Good -> 4 ngày" hints on the grading buttons. */
export function formatIntervalVi(intervalDays: number): string {
  if (intervalDays < 1 / 24 / 60) return 'ngay bây giờ';
  if (intervalDays < 1 / 24) return `${Math.round(intervalDays * 24 * 60)} phút`;
  if (intervalDays < 1) return `${Math.round(intervalDays * 24)} giờ`;
  if (intervalDays < 30) return `${Math.round(intervalDays)} ngày`;
  if (intervalDays < 365) return `${Math.round(intervalDays / 30)} tháng`;
  const years = Math.round((intervalDays / 365) * 10) / 10;
  return `${years} năm`;
}
