'use client';

import { useState } from 'react';
import { HSK_LEVEL_LIST } from '@sprout/shared';
import type { HskLevel } from '@sprout/shared';
import { CHINESE_GRAMMAR } from '@/content/chinese-grammar';
import type { GrammarPoint } from '@/content/chinese-grammar';
import { speakChinese } from '@/lib/chinese-speech';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

export default function ChineseGrammarPage() {
  const [hsk, setHsk] = useState<HskLevel | 'all'>('all');
  const points =
    hsk === 'all' ? CHINESE_GRAMMAR : CHINESE_GRAMMAR.filter((point) => point.hsk === hsk);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">
          Ngữ pháp tiếng Trung
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[var(--text-muted)]">
          {CHINESE_GRAMMAR.length} điểm ngữ pháp, mỗi điểm kèm công thức, ví dụ và lỗi người
          Việt hay mắc ở đúng chỗ đó.
        </p>
      </header>

      <div className="flex flex-wrap gap-1">
        <Chip active={hsk === 'all'} onClick={() => setHsk('all')}>
          Tất cả
        </Chip>
        {HSK_LEVEL_LIST.map((level) => (
          <Chip key={level.key} active={hsk === level.key} onClick={() => setHsk(level.key)}>
            HSK {level.number}
          </Chip>
        ))}
      </div>

      <div className="space-y-3">
        {points.map((point) => (
          <PointCard key={point.slug} point={point} />
        ))}
        {points.length === 0 ? (
          <p className="rounded-[var(--r-md)] border border-dashed border-[var(--border-strong)] p-8 text-center text-[15px] text-[var(--text-muted)]">
            Chưa soạn điểm ngữ pháp nào cho cấp này.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PointCard({ point }: { point: GrammarPoint }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-[18px] font-semibold">{point.title}</h2>
            <span className="rounded-[var(--r-full)] bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
              {point.hsk.replace('HSK', 'HSK ')}
            </span>
          </div>
          <p className="hanzi mt-1 text-[16px] text-[var(--primary)]">{point.formula}</p>
        </div>
        <span
          className={cn(
            'mt-1 shrink-0 text-[var(--text-subtle)] transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open ? (
        <div className="border-t border-[var(--border)] p-5 pt-4">
          <p className="text-[15px] leading-relaxed">{point.explain}</p>

          <p
            className="mt-3 rounded-[var(--r-md)] p-3 text-[14px] leading-relaxed"
            style={{ backgroundColor: 'color-mix(in oklab, var(--warning) 12%, var(--surface))' }}
          >
            <b className="text-[var(--warning)]">Hay sai:</b> {point.pitfall}
          </p>

          <ul className="mt-4 space-y-2">
            {point.examples.map((example) => (
              <li
                key={example.cn}
                className="flex items-start gap-3 rounded-[var(--r-md)] bg-[var(--surface-alt)] p-3"
              >
                <button
                  type="button"
                  onClick={() => speakChinese(example.cn, { rate: 0.8 })}
                  aria-label={`Nghe câu ${example.cn}`}
                  className="mt-0.5 shrink-0 rounded-[var(--r-sm)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                >
                  <Icon name="listening" size={18} />
                </button>
                <div className="min-w-0">
                  <p className="hanzi text-[20px] leading-snug">{example.cn}</p>
                  <p className="text-[14px] text-[var(--primary)]">{example.pinyin}</p>
                  <p className="text-[14px] text-[var(--text-muted)]">{example.vi}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-[var(--r-sm)] px-3 py-2 text-[13px] font-medium transition-colors',
        active
          ? 'bg-[var(--primary)] text-[var(--text-inverse)]'
          : 'bg-[var(--surface-alt)] text-[var(--text-muted)] hover:text-[var(--text)]',
      )}
    >
      {children}
    </button>
  );
}
