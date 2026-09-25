'use client';

import { useState } from 'react';
import { playWord } from '@/lib/speech';
import type { Accent } from '@/lib/speech';
import { cn } from '@/lib/utils';

export interface WordAudioProps {
  text: string;
  urlUs?: string | null;
  urlUk?: string | null;
  /** Show both accents side by side, as the word card does. */
  both?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** §7.3.3 — the speaker button next to a headword. */
export function WordAudio({ text, urlUs, urlUk, both = false, size = 'md', className }: WordAudioProps) {
  const [playing, setPlaying] = useState<Accent | null>(null);

  const play = async (accent: Accent) => {
    setPlaying(accent);
    await playWord({ url: accent === 'us' ? urlUs ?? null : urlUk ?? null, text, accent });
    window.setTimeout(() => setPlaying(null), 400);
  };

  const buttonClass = cn(
    'inline-flex items-center justify-center gap-1 rounded-[var(--r-full)] border border-[var(--border)]',
    'bg-[var(--surface-alt)] text-[var(--text-muted)] transition-colors',
    'hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]',
    size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-9 px-3 text-[13px]',
  );

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <button
        type="button"
        className={buttonClass}
        onClick={() => void play('us')}
        aria-label={`Nghe ${text} giọng Mỹ`}
      >
        <span aria-hidden="true">{playing === 'us' ? '🔊' : '🔈'}</span>
        {both ? <span>US</span> : null}
      </button>
      {both ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => void play('uk')}
          aria-label={`Nghe ${text} giọng Anh`}
        >
          <span aria-hidden="true">{playing === 'uk' ? '🔊' : '🔈'}</span>
          <span>UK</span>
        </button>
      ) : null}
    </span>
  );
}
