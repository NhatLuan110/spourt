import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}

/** §14 — no blank screens: empty always explains itself and offers a next step. */
export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-10 gap-3',
        className,
      )}
    >
      <svg width="72" height="72" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <path
          d="M50 12 C 76 26, 88 48, 86 66 C 84 84, 66 92, 50 90 C 34 92, 16 84, 14 66 C 12 48, 24 26, 50 12 Z"
          fill="var(--primary-soft)"
          stroke="var(--border-strong)"
          strokeWidth="2"
        />
        <path d="M50 20 L50 88" stroke="var(--moss)" strokeWidth="2" opacity="0.7" />
        <path
          d="M50 40 L34 32 M50 54 L32 50 M50 46 L66 36 M50 62 L68 56"
          stroke="var(--moss)"
          strokeWidth="1.5"
          opacity="0.7"
        />
      </svg>
      <h3 className="text-[18px] text-[var(--text)]">{title}</h3>
      {body ? <p className="text-[14px] text-[var(--text-muted)] max-w-sm">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
