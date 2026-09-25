'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HSK_LEVEL_LIST, HSK_LEVELS_BY_KEY } from '@sprout/shared';
import type { HskLevel } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import type { ChineseWordRow } from '@/lib/chinese-api';
import { speakChinese } from '@/lib/chinese-speech';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type QuestionKind = 'meaning' | 'hanzi' | 'pinyin' | 'listening';

interface Question {
  kind: QuestionKind;
  word: ChineseWordRow;
  options: string[];
  answer: string;
  prompt: string;
}

const KIND_LABEL: Record<QuestionKind, string> = {
  meaning: 'Chọn nghĩa đúng',
  hanzi: 'Chọn chữ đúng',
  pinyin: 'Chọn pinyin đúng',
  listening: 'Nghe rồi chọn chữ',
};

const TEST_SIZE = 20;

/**
 * Đề thi thử dựng ngay từ kho từ vựng của cấp: bốn dạng câu hỏi trộn đều, đáp
 * án nhiễu lấy trong cùng cấp để đề không dễ đoán. Mỗi lần bấm là một đề khác.
 */
export default function ChineseTestsPage() {
  const [hsk, setHsk] = useState<HskLevel>('HSK1');
  const [seed, setSeed] = useState(0);
  const [started, setStarted] = useState(false);
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>([]);

  const words = useQuery({
    queryKey: chineseKeys.words(hsk, { drill: 'test' }),
    queryFn: () => chineseApi.words(hsk, { page: 1, limit: 100, sort: 'frequency' }),
  });

  const pool = words.data?.data ?? [];

  const questions = useMemo(() => buildTest(pool, seed), [pool, seed]);

  const start = () => {
    setStarted(true);
    setPosition(0);
    setAnswers(Array.from({ length: questions.length }, () => null));
  };

  const restart = () => {
    setSeed((value) => value + 1);
    setStarted(false);
  };

  if (words.isPending) return <Skeleton className="h-80 w-full" />;

  if (!started) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">
            Thi thử HSK
          </h1>
          <p className="mt-1 max-w-2xl text-[15px] text-[var(--text-muted)]">
            {TEST_SIZE} câu trộn bốn dạng: chọn nghĩa, chọn chữ, chọn pinyin và nghe hiểu. Đề
            sinh lại mỗi lần làm nên không học vẹt được.
          </p>
        </header>

        <div className="flex flex-wrap gap-1">
          {HSK_LEVEL_LIST.map((level) => (
            <button
              key={level.key}
              type="button"
              onClick={() => setHsk(level.key)}
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

        <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="text-[20px] font-semibold">{HSK_LEVELS_BY_KEY[hsk].labelVi}</h2>
          <p className="mt-1 text-[15px] text-[var(--text-muted)]">
            {HSK_LEVELS_BY_KEY[hsk].description}
          </p>
          <p className="mt-3 text-[14px] text-[var(--text-subtle)]">
            Rút {TEST_SIZE} câu từ {pool.length} từ hay gặp nhất của cấp này.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={questions.length === 0}
            className="mt-4 h-12 rounded-[var(--r-md)] bg-[var(--primary)] px-6 text-[16px] font-semibold text-[var(--text-inverse)] disabled:opacity-50"
          >
            Bắt đầu làm bài
          </button>
        </section>
      </div>
    );
  }

  const done = position >= questions.length;

  if (done) {
    const right = answers.filter((answer, index) => answer === questions[index]?.answer).length;
    const pct = Math.round((right / questions.length) * 100);
    const tone = pct >= 80 ? '--success' : pct >= 60 ? '--warning' : '--danger';
    return (
      <div className="space-y-5">
        <section
          className="rounded-[var(--r-lg)] p-8 text-center"
          style={{ backgroundColor: `color-mix(in oklab, var(${tone}) 14%, var(--surface))` }}
        >
          <p className="text-[15px] text-[var(--text-muted)]">Kết quả {HSK_LEVELS_BY_KEY[hsk].labelVi}</p>
          <p className="tabular mt-2 text-[56px] font-bold leading-none" style={{ color: `var(${tone})` }}>
            {pct}%
          </p>
          <p className="mt-2 text-[16px]">
            Đúng {right}/{questions.length} câu
          </p>
          <p className="mt-1 text-[15px] text-[var(--text-muted)]">
            {pct >= 80
              ? 'Đủ sức qua cấp này. Lên cấp tiếp theo được rồi.'
              : pct >= 60
                ? 'Gần đạt. Ôn lại những từ sai rồi thi lại.'
                : 'Cần học thêm cấp này trước khi đi tiếp.'}
          </p>
          <button
            type="button"
            onClick={restart}
            className="mt-5 h-11 rounded-[var(--r-md)] bg-[var(--primary)] px-5 text-[15px] font-semibold text-[var(--text-inverse)]"
          >
            Làm đề khác
          </button>
        </section>

        <section className="space-y-2">
          <h2 className="text-[17px] font-semibold">Xem lại câu sai</h2>
          {questions.map((question, index) =>
            answers[index] === question.answer ? null : (
              <div
                key={index}
                className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <p className="text-[13px] text-[var(--text-subtle)]">
                  Câu {index + 1} · {KIND_LABEL[question.kind]}
                </p>
                <p className="hanzi mt-1 text-[20px]">{question.prompt}</p>
                <p className="mt-1 text-[14px] text-[var(--danger)]">
                  Bạn chọn: {answers[index] ?? 'bỏ trống'}
                </p>
                <p className="text-[14px] text-[var(--success)]">Đáp án: {question.answer}</p>
                <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                  {question.word.simplified} · {question.word.pinyin} · {question.word.meaningVi}
                </p>
              </div>
            ),
          )}
          {answers.every((answer, index) => answer === questions[index]?.answer) ? (
            <p className="text-[15px] text-[var(--text-muted)]">Không sai câu nào.</p>
          ) : null}
        </section>
      </div>
    );
  }

  const question = questions[position];
  if (!question) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width]"
            style={{ width: `${(position / questions.length) * 100}%` }}
          />
        </div>
        <span className="tabular text-[14px] text-[var(--text-muted)]">
          {position + 1}/{questions.length}
        </span>
      </div>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-[13px] font-medium text-[var(--text-subtle)]">
          {KIND_LABEL[question.kind]}
        </p>

        {question.kind === 'listening' ? (
          <button
            type="button"
            onClick={() => speakChinese(question.word.simplified, { rate: 0.8 })}
            className="mt-3 inline-flex h-12 items-center gap-2 rounded-[var(--r-md)] bg-[var(--primary)] px-5 text-[16px] font-semibold text-[var(--text-inverse)]"
          >
            <Icon name="listening" size={22} /> Nghe
          </button>
        ) : (
          <p className={cn('mt-2', question.kind === 'hanzi' ? 'text-[22px]' : 'hanzi text-[40px]')}>
            {question.prompt}
          </p>
        )}

        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {question.options.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  setAnswers((value) => {
                    const next = [...value];
                    next[position] = option;
                    return next;
                  });
                  setPosition(position + 1);
                }}
                className={cn(
                  'w-full rounded-[var(--r-md)] border border-[var(--border)] p-4 text-left hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)]',
                  question.kind === 'meaning' ? 'text-[15px]' : 'hanzi text-[22px]',
                )}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setPosition(position + 1)}
          className="mt-4 text-[14px] text-[var(--text-muted)]"
        >
          Bỏ qua câu này
        </button>
      </section>
    </div>
  );
}

/** Rút ngẫu nhiên n phần tử khác nhau khỏi mảng, không sửa mảng gốc. */
function sample<T>(items: T[], count: number): T[] {
  const copy = [...items];
  const picked: T[] = [];
  while (picked.length < count && copy.length > 0) {
    const [taken] = copy.splice(Math.floor(Math.random() * copy.length), 1);
    if (taken !== undefined) picked.push(taken);
  }
  return picked;
}

function buildTest(pool: ChineseWordRow[], _seed: number): Question[] {
  if (pool.length < 8) return [];
  const kinds: QuestionKind[] = ['meaning', 'hanzi', 'pinyin', 'listening'];

  return sample(pool, Math.min(TEST_SIZE, pool.length)).map((word, index) => {
    const kind = kinds[index % kinds.length] ?? 'meaning';
    const others = sample(
      pool.filter((item) => item.id !== word.id),
      3,
    );

    const pick = (item: ChineseWordRow): string =>
      kind === 'meaning' ? item.meaningVi : kind === 'pinyin' ? item.pinyin : item.simplified;

    const answer = pick(word);
    const options = [answer, ...others.map(pick)]
      .filter((value, position, all) => all.indexOf(value) === position)
      .map((value) => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map((item) => item.value);

    const prompt =
      kind === 'meaning' || kind === 'pinyin'
        ? word.simplified
        : kind === 'hanzi'
          ? word.meaningVi
          : '';

    return { kind, word, options, answer, prompt };
  });
}
