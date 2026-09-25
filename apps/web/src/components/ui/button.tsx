'use client';

import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-200 disabled:pointer-events-none disabled:opacity-55 select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--primary)] text-[var(--text-inverse)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] shadow-[var(--shadow-sm)]',
        secondary:
          'bg-[var(--surface)] text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-alt)]',
        ghost: 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--text)]',
        danger: 'bg-[var(--danger)] text-white hover:opacity-90',
        accent:
          'bg-[var(--accent)] text-[#3a2c12] hover:bg-[var(--accent-hover)] shadow-[var(--shadow-sm)]',
      },
      size: {
        sm: 'h-9 px-3 text-[14px] rounded-[var(--r-sm)]',
        md: 'h-11 px-4 text-[16px] rounded-[var(--r-md)]',
        lg: 'h-13 px-6 text-[18px] rounded-[var(--r-md)] py-3',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  loading?: boolean;
  /** Text announced while loading, for screen readers. */
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, loading, loadingLabel, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
