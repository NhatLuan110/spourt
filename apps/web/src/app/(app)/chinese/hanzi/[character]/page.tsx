'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import { HanziGlyph, StrokeOrderStrip, useStrokes } from '@/components/chinese/hanzi-glyph';
import { GridCell } from '@/components/chinese/writing-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { toneMarked } from '@/lib/pinyin';

export default function HanziDetailPage({
  params,
}: {
  params: Promise<{ character: string }>;
}) {
  const { character: raw } = use(params);
  const character = decodeURIComponent(raw);
  const client = useQueryClient();

  const detail = useQuery({
    queryKey: chineseKeys.hanzi(character),
    queryFn: () => chineseApi.hanzi(character),
  });

  const mark = useMutation({
    mutationFn: (canWrite: boolean) => chineseApi.markHanzi(character, canWrite),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: chineseKeys.hanzi(character) });
      void client.invalidateQueries({ queryKey: chineseKeys.levels });
    },
  });

  if (detail.isPending) return <Skeleton className="h-96 w-full" />;
  if (detail.isError || !detail.data) {
    return (
      <p className="rounded-[var(--r-md)] bg-[var(--surface)] p-6 text-[15px] text-[var(--text-muted)]">
        Không tìm thấy chữ này trong kho HSK 1–6.
      </p>
    );
  }

  const hanzi = detail.data;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
          <StrokeAnimation character={character} />
          <p className="mt-3 text-[22px] font-semibold text-[var(--text)]">
            {toneMarked(hanzi.pinyinNumeric)}
          </p>
          {hanzi.hanViet ? (
            <p className="text-[16px] text-[var(--text-muted)]">Hán Việt: {hanzi.hanViet}</p>
          ) : null}
          <p className="mt-1 text-[14px] text-[var(--text-subtle)]">
            {hanzi.strokeCount} nét
            {hanzi.traditional ? ` · phồn thể ${hanzi.traditional}` : ''}
          </p>

          <button
            type="button"
            onClick={() => mark.mutate(!hanzi.canWrite)}
            disabled={mark.isPending}
            className={`mt-4 h-11 w-full rounded-[var(--r-md)] text-[15px] font-medium transition-colors ${
              hanzi.canWrite
                ? 'bg-[var(--success)] text-[var(--text)]'
                : 'border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-alt)]'
            }`}
          >
            {hanzi.canWrite ? '✓ Đã viết thuộc chữ này' : 'Đánh dấu đã viết thuộc'}
          </button>
          <Link
            href={`/chinese/writing?source=custom&chars=${encodeURIComponent(character)}`}
            className="mt-2 flex h-11 items-center justify-center rounded-[var(--r-md)] bg-white text-[15px] font-medium text-[var(--text-inverse)]"
          >
            In tờ tập viết chữ này
          </Link>
        </section>

        <div className="space-y-5">
          {hanzi.meaningVi ? (
            <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-1 text-[15px] font-semibold text-[var(--text-muted)]">Nghĩa</h2>
              <p className="text-[17px] leading-relaxed text-[var(--text)]">{hanzi.meaningVi}</p>
            </section>
          ) : null}

          <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-[var(--text-muted)]">Thứ tự nét</h2>
            <div className="rounded-[var(--r-md)] bg-white p-3">
              <StrokeOrderStrip character={character} size={44} max={20} />
            </div>
          </section>

          {hanzi.words.length > 0 ? (
            <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-3 text-[15px] font-semibold text-[var(--text-muted)]">
                Từ chứa chữ này ({hanzi.words.length})
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {hanzi.words.map((word) => (
                  <li
                    key={word.simplified}
                    className="rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] p-3"
                  >
                    <p className="hanzi text-[22px] leading-tight text-[var(--text)]">{word.simplified}</p>
                    <p className="text-[14px] text-[var(--text-muted)]">{word.pinyin}</p>
                    <p className="text-[14px] text-[var(--text)]">{word.meaningVi}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Vẽ dần từng nét theo thứ tự bút, dừng một nhịp ở nét cuối rồi lặp lại. Đây là
 * cách nhanh nhất để nhớ thứ tự viết trước khi đặt bút lên giấy.
 */
function StrokeAnimation({ character }: { character: string }) {
  const data = useStrokes(character);
  const total = data?.strokes.length ?? 0;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (total === 0) return;
    setShown(0);
    const timer = setInterval(() => {
      // Vẽ hết rồi thì giữ nguyên chữ đủ nét một nhịp trước khi xoá đi vẽ lại.
      setShown((current) => (current >= total + 2 ? 0 : current + 1));
    }, 420);
    return () => clearInterval(timer);
  }, [total, character]);

  return (
    <div className="mx-auto w-[184px]">
      <GridCell grid="tian" size={184} />
      <div className="relative -mt-[184px] h-[184px] w-[184px]">
        <HanziGlyph
          character={character}
          strokeLimit={Math.min(shown, total)}
          color="#12231a"
          className="absolute inset-[6%] h-[88%] w-[88%]"
        />
      </div>
      <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
        {total > 0 ? `Nét ${Math.min(shown, total)}/${total}` : ''}
      </p>
    </div>
  );
}
