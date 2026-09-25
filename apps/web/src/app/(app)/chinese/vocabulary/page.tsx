'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HSK_LEVEL_LIST } from '@sprout/shared';
import type { HskLevel } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import { speakChinese } from '@/lib/chinese-speech';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Mode = 'learn' | 'review';

const GRADES: { grade: 0 | 1 | 2 | 3; label: string; hint: string; tone: string }[] = [
  { grade: 0, label: 'Quên', hint: 'Gặp lại sau vài phút', tone: '--danger' },
  { grade: 1, label: 'Khó', hint: 'Ôn sớm hơn thường', tone: '--warning' },
  { grade: 2, label: 'Được', hint: 'Đúng nhịp', tone: '--primary' },
  { grade: 3, label: 'Dễ', hint: 'Giãn ra xa hơn', tone: '--success' },
];

/**
 * Học từ mới và ôn theo lịch. Một thẻ đi qua hai bước: đoán nghĩa bằng trắc
 * nghiệm, rồi tự chấm mức nhớ để bộ lập lịch dời ngày ôn.
 */
export default function ChineseVocabularyPage() {
  const client = useQueryClient();
  const [mode, setMode] = useState<Mode>('learn');
  const [hsk, setHsk] = useState<HskLevel>('HSK1');
  const [position, setPosition] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [lastResult, setLastResult] = useState<string | null>(null);

  const learn = useQuery({
    queryKey: chineseKeys.learn(hsk),
    queryFn: () => chineseApi.learn(hsk, 12),
    enabled: mode === 'learn',
  });

  const review = useQuery({
    queryKey: chineseKeys.reviewQueue,
    queryFn: () => chineseApi.reviewQueue(20),
    enabled: mode === 'review',
  });

  const stats = useQuery({ queryKey: chineseKeys.stats, queryFn: chineseApi.stats });

  const cards = (mode === 'learn' ? learn.data : review.data) ?? [];
  const card = cards[position];

  const grade = useMutation({
    mutationFn: ({ wordId, value }: { wordId: string; value: 0 | 1 | 2 | 3 }) =>
      chineseApi.grade(wordId, value, Date.now() - startedAt),
    onSuccess: (result) => {
      setLastResult(`Ôn lại ${result.nextReviewIn}`);
      void client.invalidateQueries({ queryKey: chineseKeys.stats });
      void client.invalidateQueries({ queryKey: chineseKeys.levels });
      advance();
    },
  });

  const advance = () => {
    setPicked(null);
    setStartedAt(Date.now());
    setPosition((value) => value + 1);
  };

  useEffect(() => {
    setPosition(0);
    setPicked(null);
    setStartedAt(Date.now());
  }, [mode, hsk]);

  // Trộn đáp án một lần cho mỗi thẻ, nếu không mỗi lần render lại đảo chỗ.
  const options = useMemo(() => {
    if (!card) return [];
    return [card.meaningVi, ...card.distractors]
      .map((value) => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map((item) => item.value);
  }, [card]);

  const pending = mode === 'learn' ? learn.isPending : review.isPending;
  const finished = !pending && cards.length > 0 && position >= cards.length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">
            Từ vựng tiếng Trung
          </h1>
          <p className="mt-1 text-[15px] text-[var(--text-muted)]">
            Học từ mới rồi để lịch ôn nhắc bạn đúng lúc sắp quên.
          </p>
        </div>
        {stats.data ? (
          <dl className="flex gap-4 text-right">
            <div>
              <dt className="text-[12px] text-[var(--text-subtle)]">Đã học</dt>
              <dd className="tabular text-[20px] font-semibold">{stats.data.learnedTotal}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[var(--text-subtle)]">Tới hạn ôn</dt>
              <dd className="tabular text-[20px] font-semibold text-[var(--accent)]">
                {stats.data.dueNow}
              </dd>
            </div>
          </dl>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-[var(--r-md)] bg-[var(--surface-alt)] p-1">
          {(
            [
              ['learn', 'Học từ mới'],
              ['review', `Ôn tập${stats.data?.dueNow ? ` (${stats.data.dueNow})` : ''}`],
            ] as [Mode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn(
                'rounded-[var(--r-sm)] px-4 py-2 text-[14px] font-medium transition-colors',
                mode === key
                  ? 'bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'learn' ? (
          <div className="flex flex-wrap gap-1">
            {HSK_LEVEL_LIST.map((level) => (
              <button
                key={level.key}
                type="button"
                onClick={() => setHsk(level.key)}
                className={cn(
                  'rounded-[var(--r-sm)] px-3 py-1.5 text-[13px] font-medium',
                  hsk === level.key
                    ? 'bg-[var(--primary)] text-[var(--text-inverse)]'
                    : 'bg-[var(--surface-alt)] text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
              >
                HSK {level.number}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {pending ? (
        <Skeleton className="h-80 w-full" />
      ) : cards.length === 0 ? (
        <EmptyState mode={mode} />
      ) : finished ? (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-[20px] font-semibold">Xong buổi này.</p>
          <p className="mt-1 text-[15px] text-[var(--text-muted)]">
            Đã qua {cards.length} thẻ. {lastResult ?? ''}
          </p>
          <button
            type="button"
            onClick={() => {
              setPosition(0);
              void (mode === 'learn' ? learn.refetch() : review.refetch());
            }}
            className="mt-4 h-11 rounded-[var(--r-md)] bg-[var(--primary)] px-5 text-[15px] font-semibold text-[var(--text-inverse)]"
          >
            Học tiếp
          </button>
        </div>
      ) : card ? (
        <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-center justify-between text-[13px] text-[var(--text-subtle)]">
            <span>
              Thẻ {position + 1} / {cards.length}
            </span>
            {lastResult ? <span>{lastResult}</span> : null}
          </div>

          <div className="mt-4 flex items-start gap-4">
            <p className="hanzi text-[56px] leading-none">{card.simplified}</p>
            <button
              type="button"
              onClick={() => speakChinese(card.simplified, { rate: 0.8 })}
              aria-label="Nghe cách đọc"
              className="mt-2 rounded-[var(--r-md)] border border-[var(--border-strong)] p-2.5 hover:bg-[var(--surface-alt)]"
            >
              <Icon name="listening" />
            </button>
          </div>
          <p className="mt-2 text-[20px] font-medium text-[var(--primary)]">{card.pinyin}</p>

          <p className="mt-5 text-[14px] font-medium text-[var(--text-muted)]">
            Nghĩa của từ này là gì?
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
              const isAnswer = option === card.meaningVi;
              const chosen = picked === option;
              const revealed = picked !== null;
              return (
                <li key={option}>
                  <button
                    type="button"
                    disabled={revealed}
                    onClick={() => setPicked(option)}
                    className={cn(
                      'w-full rounded-[var(--r-md)] border p-3 text-left text-[15px] transition-colors',
                      !revealed && 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)]',
                      revealed && isAnswer && 'border-[var(--success)] bg-[var(--success-soft)]',
                      revealed && chosen && !isAnswer && 'border-[var(--danger)] bg-[var(--danger-soft)]',
                      revealed && !isAnswer && !chosen && 'border-[var(--border)] opacity-55',
                    )}
                  >
                    {option}
                  </button>
                </li>
              );
            })}
          </ul>

          {picked !== null ? (
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              {card.hanViet ? (
                <p className="text-[14px] text-[var(--text-muted)]">
                  Hán Việt: <b className="text-[var(--text)]">{card.hanViet}</b>
                  {card.classifiers.length > 0 ? ` · lượng từ: ${card.classifiers.join(', ')}` : ''}
                </p>
              ) : null}
              <p className="mb-2 mt-3 text-[14px] font-medium">Bạn nhớ từ này tới đâu?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map((item) => (
                  <button
                    key={item.grade}
                    type="button"
                    disabled={grade.isPending}
                    onClick={() => grade.mutate({ wordId: card.id, value: item.grade })}
                    className="rounded-[var(--r-md)] p-3 text-left transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: `color-mix(in oklab, var(${item.tone}) 14%, var(--surface))`,
                    }}
                  >
                    <span className="block text-[15px] font-semibold" style={{ color: `var(${item.tone})` }}>
                      {item.label}
                    </span>
                    <span className="block text-[12px] text-[var(--text-muted)]">{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex justify-between text-[13px]">
            <Link href={`/chinese/hanzi/${encodeURIComponent(card.simplified[0] ?? '')}`} className="text-[var(--primary)]">
              Xem chữ {card.simplified[0]}
            </Link>
            <button type="button" onClick={advance} className="text-[var(--text-muted)]">
              Bỏ qua
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EmptyState({ mode }: { mode: Mode }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-strong)] p-10 text-center">
      <p className="text-[17px] font-medium">
        {mode === 'learn' ? 'Đã học hết từ mới của cấp này.' : 'Chưa có thẻ nào tới hạn ôn.'}
      </p>
      <p className="mt-1 text-[15px] text-[var(--text-muted)]">
        {mode === 'learn'
          ? 'Chọn cấp HSK cao hơn, hoặc chuyển sang tab Ôn tập.'
          : 'Học thêm từ mới, lịch ôn sẽ tự xếp cho bạn.'}
      </p>
    </div>
  );
}
