'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="w-full">
      {label ? (
        <label
          htmlFor={inputId}
          className="block text-[14px] font-medium text-[var(--text)] mb-1.5"
        >
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'w-full h-11 px-3 rounded-[var(--r-md)] bg-[var(--surface-alt)] text-[var(--text)]',
          'border border-[var(--border)] placeholder:text-[var(--text-subtle)]',
          'transition-colors focus:border-[var(--primary)] focus:bg-[var(--surface)]',
          error && 'border-[var(--danger)]',
          className,
        )}
        {...props}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-[12px] text-[var(--text-subtle)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        // Errors are announced, and carry an icon as well as colour (§11 a11y).
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-1.5 text-[12px] text-[var(--danger)] flex items-center gap-1"
        >
          <span aria-hidden="true">✗</span>
          {error}
        </p>
      ) : null}
    </div>
  );
});
