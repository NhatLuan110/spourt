'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { THEME_STORAGE_KEY } from '@/components/theme-script';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const ICONS: Record<Theme, string> = { system: '🖥️', light: '☀️', dark: '🌙' };

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('common');
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  const apply = (next: Theme) => {
    setTheme(next);
    if (next === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
      document.documentElement.removeAttribute('data-theme');
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, next);
      document.documentElement.setAttribute('data-theme', next);
    }
  };

  const label: Record<Theme, string> = {
    system: t('themeSystem'),
    light: t('themeLight'),
    dark: t('themeDark'),
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('theme')}
      className={cn(
        'inline-flex rounded-[var(--r-full)] border border-[var(--border)] bg-[var(--surface)] p-0.5',
        className,
      )}
    >
      {ORDER.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={theme === option}
          title={label[option]}
          onClick={() => apply(option)}
          className={cn(
            'flex h-8 w-9 items-center justify-center rounded-[var(--r-full)] text-[14px] transition-colors',
            theme === option
              ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
              : 'text-[var(--text-subtle)] hover:text-[var(--text)]',
          )}
        >
          <span aria-hidden="true">{ICONS[option]}</span>
          <span className="sr-only">{label[option]}</span>
        </button>
      ))}
    </div>
  );
}
