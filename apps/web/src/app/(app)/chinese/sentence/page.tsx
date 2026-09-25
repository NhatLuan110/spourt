'use client';

import { useEffect, useMemo, useState } from 'react';
import { CHINESE_GRAMMAR } from '@/content/chinese-grammar';
import { CHINESE_READING } from '@/content/chinese-reading';
import { speakChinese } from '@/lib/chinese-speech';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

interface Drill {
  cn: string;
  pinyin: string;
  vi: string;
  /** Điểm ngữ pháp mà câu này minh hoạ, hiện ra sau khi làm đúng. */
  note?: string;
}

/**
 * Sắp xếp câu: xáo trộn các thành phần rồi ghép lại cho đúng trật tự.
 *
 * Đây là bài tập đúng chỗ đau nhất của người Việt học tiếng Trung — trạng ngữ
 * thời gian và nơi chốn phải đứng TRƯỚC động từ, ngược hẳn tiếng Việt. Câu lấy
 * từ chính kho ví dụ ngữ pháp và bài đọc nên luôn khớp với thứ vừa học.
 */
const DRILLS: Drill[] = [
  ...CHINESE_GRAMMAR.flatMap((point) =>
    point.examples
      // Câu quá ngắn thì xáo trộn không thành bài tập.
      .filter((example) => example.cn.replace(/[。，？！]/g, '').length >= 5)
      .map((example) => ({
        cn: example.cn,
        pinyin: example.pinyin,
        vi: example.vi,
        note: point.title,
      })),
  ),
  ...CHINESE_READING.flatMap((passage) =>
    passage.lines
      .filter((line) => line.cn.replace(/[。，？！]/g, '').length >= 6)
      .map((line) => ({ cn: line.cn, pinyin: line.pinyin, vi: line.vi })),
  ),
];

/**
 * Cắt câu thành các mảnh có nghĩa. Không cắt từng chữ một: ghép lại từng chữ
 * thành câu là bài tập chép, không dạy được trật tự từ.
 */
function chunk(sentence: string): string[] {
  const clean = sentence.replace(/[。！？]/g, '');
  // Dấu phẩy tiếng Trung là ranh giới mệnh đề, tách ở đó trước.
  const clauses = clean.split('，').filter(Boolean);
  const pieces: string[] = [];
  for (const clause of clauses) {
    const chars = [...clause];
    // Gom hai tới ba chữ một mảnh, đủ để mảnh thường trùng ranh giới từ.
    let index = 0;
    while (index < chars.length) {
      const size = chars.length - index === 4 ? 2 : Math.min(chars.length - index, index === 0 ? 2 : 3);
      pieces.push(chars.slice(index, index + size).join(''));
      index += size;
    }
  }
  return pieces;
}

export default function ChineseSentencePage() {
  const [position, setPosition] = useState(0);
  const [built, setBuilt] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const drill = DRILLS[position % DRILLS.length];

  const pieces = useMemo(() => (drill ? chunk(drill.cn) : []), [drill]);

  const [pool, setPool] = useState<string[]>([]);
  useEffect(() => {
    setPool(
      pieces
        .map((piece, index) => ({ piece, index, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map((item) => item.piece),
    );
    setBuilt([]);
    setChecked(false);
  }, [pieces]);

  if (!drill) {
    return <p className="text-[15px] text-[var(--text-muted)]">Chưa có câu nào để luyện.</p>;
  }

  const target = pieces.join('');
  const attempt = built.join('');
  const correct = attempt === target;

  const take = (piece: string, index: number) => {
    if (checked) return;
    setBuilt((value) => [...value, piece]);
    setPool((value) => value.filter((_, position2) => position2 !== index));
  };

  const undo = (index: number) => {
    if (checked) return;
    const piece = built[index];
    if (!piece) return;
    setBuilt((value) => value.filter((_, position2) => position2 !== index));
    setPool((value) => [...value, piece]);
  };

  const check = () => {
    setChecked(true);
    setScore((value) => ({ right: value.right + (correct ? 1 : 0), total: value.total + 1 }));
    if (correct) speakChinese(drill.cn, { rate: 0.8 });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">
            Sắp xếp câu
          </h1>
          <p className="mt-1 max-w-2xl text-[15px] text-[var(--text-muted)]">
            Ghép các mảnh thành câu đúng. Bài này rèn đúng chỗ người Việt hay sai: thời gian và
            nơi chốn đứng trước động từ, ngược với tiếng Việt.
          </p>
        </div>
        {score.total > 0 ? (
          <p className="tabular text-[15px] text-[var(--text-muted)]">
            Đúng <b className="text-[var(--text)]">{score.right}</b>/{score.total}
          </p>
        ) : null}
      </header>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-[13px] text-[var(--text-subtle)]">
          Câu {(position % DRILLS.length) + 1} / {DRILLS.length}
        </p>
        <p className="mt-2 text-[17px]">{drill.vi}</p>

        {/* Vùng ghép câu */}
        <div
          className={cn(
            'mt-4 flex min-h-[72px] flex-wrap items-center gap-2 rounded-[var(--r-md)] border-2 border-dashed p-3',
            checked && correct && 'border-[var(--success)] bg-[var(--success-soft)]',
            checked && !correct && 'border-[var(--danger)] bg-[var(--danger-soft)]',
            !checked && 'border-[var(--border-strong)]',
          )}
        >
          {built.length === 0 ? (
            <span className="text-[14px] text-[var(--text-subtle)]">
              Bấm các mảnh bên dưới để ghép câu…
            </span>
          ) : (
            built.map((piece, index) => (
              <button
                key={`${piece}-${index}`}
                type="button"
                onClick={() => undo(index)}
                disabled={checked}
                className="hanzi rounded-[var(--r-sm)] bg-[var(--surface-sunken)] px-3 py-2 text-[22px] leading-none"
              >
                {piece}
              </button>
            ))
          )}
        </div>

        {/* Kho mảnh */}
        <div className="mt-3 flex flex-wrap gap-2">
          {pool.map((piece, index) => (
            <button
              key={`${piece}-${index}`}
              type="button"
              onClick={() => take(piece, index)}
              disabled={checked}
              className="hanzi rounded-[var(--r-sm)] border border-[var(--border-strong)] bg-[var(--surface-alt)] px-3 py-2 text-[22px] leading-none hover:bg-[var(--surface-sunken)] disabled:opacity-40"
            >
              {piece}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {!checked ? (
            <>
              <button
                type="button"
                onClick={check}
                disabled={pool.length > 0}
                className="h-11 rounded-[var(--r-md)] bg-[var(--primary)] px-5 text-[15px] font-semibold text-[var(--text-inverse)] disabled:opacity-45"
              >
                Kiểm tra
              </button>
              <button
                type="button"
                onClick={() => {
                  setPool([...pool, ...built]);
                  setBuilt([]);
                }}
                className="h-11 rounded-[var(--r-md)] border border-[var(--border-strong)] px-4 text-[15px]"
              >
                Làm lại
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setPosition(position + 1)}
              className="h-11 rounded-[var(--r-md)] bg-[var(--primary)] px-5 text-[15px] font-semibold text-[var(--text-inverse)]"
            >
              Câu tiếp theo
            </button>
          )}
        </div>

        {checked ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-[15px] font-medium">
              {correct ? 'Đúng rồi.' : 'Chưa đúng. Câu đúng là:'}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <p className="hanzi text-[24px]">{drill.cn}</p>
              <button
                type="button"
                onClick={() => speakChinese(drill.cn, { rate: 0.8 })}
                aria-label="Nghe câu đúng"
                className="rounded-[var(--r-sm)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-alt)]"
              >
                <Icon name="listening" size={18} />
              </button>
            </div>
            <p className="text-[14px] text-[var(--primary)]">{drill.pinyin}</p>
            {drill.note ? (
              <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
                Điểm ngữ pháp: {drill.note}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
