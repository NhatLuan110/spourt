import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils';

/** §7.2 — the streak, XP, level and coin readouts that sit over the tree. */
export function StatPill({
  icon,
  value,
  label,
  tone = 'default',
  className,
}: {
  icon: string;
  value: string | number;
  label: string;
  tone?: 'default' | 'accent';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-[var(--r-full)] border px-3 py-1.5',
        tone === 'accent'
          ? 'border-transparent bg-[var(--accent-soft)] text-[var(--text)]'
          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]',
        className,
      )}
    >
      <span aria-hidden="true" className="text-[16px] leading-none">
        {icon}
      </span>
      <span className="text-[14px] font-semibold leading-none">
        {typeof value === 'number' ? formatNumber(value) : value}
      </span>
      <span className="text-[12px] text-[var(--text-muted)] leading-none">{label}</span>
    </div>
  );
}

export function XpBar({
  xpIntoLevel,
  xpForNextLevel,
  level,
  className,
}: {
  xpIntoLevel: number;
  xpForNextLevel: number;
  level: number;
  className?: string;
}) {
  const pct = Math.min(100, Math.round((xpIntoLevel / Math.max(1, xpForNextLevel)) * 100));
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between text-[12px] text-[var(--text-muted)]">
        <span>Cấp {level}</span>
        <span>
          {formatNumber(xpIntoLevel)} / {formatNumber(xpForNextLevel)} XP
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-sunken)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Tiến độ lên cấp ${level + 1}`}
      >
        <div
          className="h-full rounded-[var(--r-full)] bg-[var(--accent)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
