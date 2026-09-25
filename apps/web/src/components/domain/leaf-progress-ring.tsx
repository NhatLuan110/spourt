import { cn } from '@/lib/utils';

export interface LeafProgressRingProps {
  value: number;
  max: number;
  /** Rendered in the middle of the leaf. */
  label?: string;
  caption?: string;
  size?: number;
  className?: string;
  /** Announced to assistive tech, e.g. "Mục tiêu hôm nay". */
  ariaLabel: string;
}

// A leaf outline rather than a circle (§3.5.2). Drawn once, filled by dash offset.
const LEAF_PATH =
  'M50 6 C 78 20, 92 44, 90 66 C 88 86, 68 96, 50 94 C 32 96, 12 86, 10 66 C 8 44, 22 20, 50 6 Z';
const LEAF_LENGTH = 268;

export function LeafProgressRing({
  value,
  max,
  label,
  caption,
  size = 120,
  className,
  ariaLabel,
}: LeafProgressRingProps) {
  const safeMax = Math.max(1, max);
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const complete = ratio >= 1;
  const offset = LEAF_LENGTH * (1 - ratio);

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <path
          d={LEAF_PATH}
          fill="var(--surface-alt)"
          stroke="var(--border)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          className="leaf-path"
          d={LEAF_PATH}
          fill="none"
          stroke={complete ? 'var(--accent)' : 'var(--primary)'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={LEAF_LENGTH}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
        {/* Central vein: the leaf reads as a leaf even at small sizes. */}
        <path
          d="M50 14 L50 92"
          stroke="var(--border-strong)"
          strokeWidth="1.5"
          opacity="0.5"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label ? (
          <span className="text-[18px] font-semibold text-[var(--text)] leading-none">{label}</span>
        ) : null}
        {caption ? (
          <span className="mt-1 text-[12px] text-[var(--text-muted)]">{caption}</span>
        ) : null}
      </div>
    </div>
  );
}
