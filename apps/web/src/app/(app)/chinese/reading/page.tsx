'use client';

import { useState } from 'react';
import { CHINESE_READING } from '@/content/chinese-reading';
import type { ReadingPassage } from '@/content/chinese-reading';
import { speakChinese, stopSpeaking } from '@/lib/chinese-speech';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

export default function ChineseReadingPage() {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const passage = CHINESE_READING.find((item) => item.slug === openSlug);

  if (passage) {
    return (
      <PassageView
        passage={passage}
        onBack={() => {
          stopSpeaking();
          setOpenSlug(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">Đọc</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[var(--text-muted)]">
          Bài đọc theo cấp, chỉ dùng từ trong phạm vi cấp đó. Có pinyin và bản dịch từng câu,
          bật tắt được để tự kiểm tra.
        </p>
      </header>

      <ul className="grid gap-3 md:grid-cols-2">
        {CHINESE_READING.map((item) => (
          <li key={item.slug}>
            <button
              type="button"
              onClick={() => setOpenSlug(item.slug)}
              className="flex w-full flex-col rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <span className="flex items-baseline gap-2">
                <span className="hanzi text-[24px]">{item.title}</span>
                <span className="rounded-[var(--r-full)] bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                  {item.hsk.replace('HSK', 'HSK ')}
                </span>
              </span>
              <span className="mt-1 text-[15px] text-[var(--text-muted)]">{item.titleVi}</span>
              <span className="mt-3 text-[13px] text-[var(--text-subtle)]">
                {item.lines.length} câu · {item.questions.length} câu hỏi
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PassageView({ passage, onBack }: { passage: ReadingPassage; onBack: () => void }) {
  const [showPinyin, setShowPinyin] = useState(true);
  const [showVi, setShowVi] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-[14px] text-[var(--primary)]">
        ← Về danh sách bài đọc
      </button>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="hanzi text-[30px] leading-tight">{passage.title}</h1>
          <p className="text-[15px] text-[var(--text-muted)]">{passage.titleVi}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Toggle active={showPinyin} onClick={() => setShowPinyin(!showPinyin)}>
            Pinyin
          </Toggle>
          <Toggle active={showVi} onClick={() => setShowVi(!showVi)}>
            Bản dịch
          </Toggle>
          <button
            type="button"
            onClick={() => speakChinese(passage.lines.map((line) => line.cn).join(''), { rate: 0.8 })}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--r-sm)] bg-[var(--primary)] px-3 text-[13px] font-medium text-[var(--text-inverse)]"
          >
            <Icon name="listening" size={16} /> Nghe cả bài
          </button>
        </div>
      </header>

      <article className="space-y-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        {passage.lines.map((line, index) => (
          <div key={index} className="group flex items-start gap-3">
            <button
              type="button"
              onClick={() => speakChinese(line.cn, { rate: 0.75 })}
              aria-label="Nghe câu này"
              className="mt-1 shrink-0 rounded-[var(--r-sm)] p-1.5 text-[var(--text-subtle)] hover:bg-[var(--surface-alt)] hover:text-[var(--text)]"
            >
              <Icon name="listening" size={18} />
            </button>
            <div className="min-w-0">
              <p className="hanzi text-[22px] leading-relaxed">{line.cn}</p>
              {showPinyin ? <p className="text-[14px] text-[var(--primary)]">{line.pinyin}</p> : null}
              {showVi ? <p className="text-[14px] text-[var(--text-muted)]">{line.vi}</p> : null}
            </div>
          </div>
        ))}
      </article>

      <section className="space-y-3">
        <h2 className="text-[19px] font-semibold">Câu hỏi hiểu bài</h2>
        {passage.questions.map((question, questionIndex) => {
          const picked = answers[questionIndex];
          const answered = picked !== undefined;
          return (
            <div
              key={questionIndex}
              className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <p className="hanzi text-[19px]">{question.question}</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {question.options.map((option, optionIndex) => {
                  const isAnswer = optionIndex === question.answer;
                  const chosen = picked === optionIndex;
                  return (
                    <li key={option}>
                      <button
                        type="button"
                        disabled={answered}
                        onClick={() =>
                          setAnswers((value) => ({ ...value, [questionIndex]: optionIndex }))
                        }
                        className={cn(
                          'hanzi w-full rounded-[var(--r-md)] border p-3 text-left text-[17px]',
                          !answered &&
                            'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)]',
                          answered && isAnswer && 'border-[var(--success)] bg-[var(--success-soft)]',
                          answered && chosen && !isAnswer && 'border-[var(--danger)] bg-[var(--danger-soft)]',
                          answered && !isAnswer && !chosen && 'border-[var(--border)] opacity-55',
                        )}
                      >
                        {option}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {answered ? (
                <p className="mt-3 text-[14px] text-[var(--text-muted)]">{question.explain}</p>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Toggle({
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
      aria-pressed={active}
      className={cn(
        'h-9 rounded-[var(--r-sm)] px-3 text-[13px] font-medium transition-colors',
        active
          ? 'bg-[var(--surface-sunken)] text-[var(--text)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-alt)]',
      )}
    >
      {children}
    </button>
  );
}
