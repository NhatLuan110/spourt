import { cn } from '@/lib/utils';

export interface WeekStripProps {
  days: { dayKey: string; xpEarned: number; goalMet: boolean; minutes: number }[];
  goalXp: number;
  className?: string;
}

const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * §7.2 — seven bars, one per study day. The height is XP against the goal, so
 * a short bar is honest about a light day rather than hiding it.
 */
export function WeekStrip({ days, goalXp, className }: WeekStripProps) {
  const ceiling = Math.max(goalXp, ...days.map((day) => day.xpEarned), 1);

  return (
    <ul className={cn('flex items-end justify-between gap-2', className)}>
      {days.map((day) => {
        const height = Math.max(4, Math.round((day.xpEarned / ceiling) * 72));
        const date = new Date(`${day.dayKey}T00:00:00Z`);
        const label = WEEKDAY_VI[date.getUTCDay()] ?? '';

        return (
          <li key={day.dayKey} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={cn(
                'w-full rounded-t-[var(--r-sm)] transition-[height] duration-300',
                day.goalMet ? 'bg-[var(--primary)]' : 'bg-[var(--primary-soft)]',
              )}
              style={{ height: `${height}px` }}
              role="img"
              aria-label={`${label}: ${day.xpEarned} XP, ${day.minutes} phút${day.goalMet ? ', đạt mục tiêu' : ''}`}
            />
            <span className="text-[11px] text-[var(--text-subtle)]" aria-hidden="true">
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
