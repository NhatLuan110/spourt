'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HSK_LEVEL_LIST } from '@sprout/shared';
import type { HskLevel } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import type { ChineseWordRow } from '@/lib/chinese-api';
import { hasChineseVoice, speakChinese, ttsSupported } from '@/lib/chinese-speech';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Nghe rồi chọn chữ. Câu hỏi dựng thẳng từ kho từ vựng bằng giọng đọc của trình
 * duyệt, nên không cần tệp âm thanh nào — vừa chạy được ngoại tuyến vừa phủ
 * được cả 4991 từ thay vì vài chục bài thu sẵn.
 */
export default function ChineseListeningPage() {
  const [hsk, setHsk] = useState<HskLevel>('HSK1');
  const [position, setPosition] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [support, setSupport] = useState(true);

  useEffect(() => {
    const check = () => setSupport(ttsSupported() && hasChineseVoice());
    check();
    const timer = setTimeout(check, 700);
    return () => clearTimeout(timer);
  }, []);

  const words = useQuery({
    queryKey: chineseKeys.words(hsk, { drill: 'listening' }),
    queryFn: () => chineseApi.words(hsk, { page: 1, limit: 60, sort: 'frequency' }),
  });

  const pool = words.data?.data ?? [];
  const current = pool[position];

  // Ba đáp án nhiễu lấy từ chính cấp đang học, trộn một lần cho mỗi câu.
  const options = useMemo(() => {
    if (!current || pool.length < 4) return [];
    const others = pool.filter((word) => word.id !== current.id);
    const picks: ChineseWordRow[] = [];
    while (picks.length < 3 && others.length > 0) {
      const [taken] = others.splice(Math.floor(Math.random() * others.length), 1);
      if (taken) picks.push(taken);
    }
    return [current, ...picks]
      .map((word) => ({ word, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map((item) => item.word);
  }, [current, pool]);

  // Phát tự động khi sang câu mới: bài nghe thì tiếng phải tới trước mắt.
  useEffect(() => {
    if (current && support) speakChinese(current.simplified, { rate: 0.8 });
  }, [current, support]);

  const choose = (word: ChineseWordRow) => {
    if (picked) return;
    setPicked(word.id);
    setScore((value) => ({
      right: value.right + (word.id === current?.id ? 1 : 0),
      total: value.total + 1,
    }));
  };

  const next = () => {
    setPicked(null);
    setPosition((value) => (pool.length === 0 ? 0 : (value + 1) % pool.length));
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">Nghe</h1>
          <p className="mt-1 text-[15px] text-[var(--text-muted)]">
            Nghe từ rồi chọn đúng chữ. Nghe lại bao nhiêu lần cũng được.
          </p>
        </div>
        {score.total > 0 ? (
          <p className="tabular text-[15px] text-[var(--text-muted)]">
            Đúng <b className="text-[var(--text)]">{score.right}</b>/{score.total}
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-1">
        {HSK_LEVEL_LIST.map((level) => (
          <button
            key={level.key}
            type="button"
            onClick={() => {
              setHsk(level.key);
              setPosition(0);
              setPicked(null);
            }}
            className={cn(
              'rounded-[var(--r-sm)] px-3 py-2 text-[13px] font-medium',
              hsk === level.key
                ? 'bg-[var(--primary)] text-[var(--text-inverse)]'
                : 'bg-[var(--surface-alt)] text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            HSK {level.number}
          </button>
        ))}
      </div>

      {!support ? (
        <div className="rounded-[var(--r-md)] bg-[var(--warning-soft)] p-4 text-[14px] text-[var(--warning)]">
          Máy chưa có giọng đọc tiếng Trung. Vào Cài đặt Windows → Thời gian &amp; ngôn ngữ →
          Giọng nói, cài gói tiếng Trung (中文) rồi tải lại trang.
        </div>
      ) : null}

      {words.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : !current ? (
        <p className="text-[15px] text-[var(--text-muted)]">Không có từ nào ở cấp này.</p>
      ) : (
        <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => speakChinese(current.simplified, { rate: 0.8 })}
              className="inline-flex h-12 items-center gap-2 rounded-[var(--r-md)] bg-[var(--primary)] px-5 text-[16px] font-semibold text-[var(--text-inverse)]"
            >
              <Icon name="listening" size={22} /> Nghe lại
            </button>
            <button
              type="button"
              onClick={() => speakChinese(current.simplified, { rate: 0.55 })}
              className="inline-flex h-12 items-center gap-2 rounded-[var(--r-md)] border border-[var(--border-strong)] px-4 text-[15px]"
            >
              Chậm hơn
            </button>
          </div>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {options.map((word) => {
              const isAnswer = word.id === current.id;
              const chosen = picked === word.id;
              const revealed = picked !== null;
              return (
                <li key={word.id}>
                  <button
                    type="button"
                    disabled={revealed}
                    onClick={() => choose(word)}
                    className={cn(
                      'w-full rounded-[var(--r-md)] border p-4 text-left transition-colors',
                      !revealed && 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)]',
                      revealed && isAnswer && 'border-[var(--success)] bg-[var(--success-soft)]',
                      revealed && chosen && !isAnswer && 'border-[var(--danger)] bg-[var(--danger-soft)]',
                      revealed && !isAnswer && !chosen && 'border-[var(--border)] opacity-55',
                    )}
                  >
                    <span className="hanzi block text-[30px] leading-tight">{word.simplified}</span>
                    {revealed ? (
                      <span className="mt-1 block text-[14px] text-[var(--text-muted)]">
                        {word.pinyin} · {word.meaningVi}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {picked !== null ? (
            <button
              type="button"
              onClick={next}
              className="mt-5 h-11 w-full rounded-[var(--r-md)] bg-[var(--primary)] text-[15px] font-semibold text-[var(--text-inverse)]"
            >
              Câu tiếp theo
            </button>
          ) : null}
        </section>
      )}
    </div>
  );
}
