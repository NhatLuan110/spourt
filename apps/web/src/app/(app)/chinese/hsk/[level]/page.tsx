'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { HSK_LEVELS_BY_KEY } from '@sprout/shared';
import type { HskLevel } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import type { ChineseWordRow } from '@/lib/chinese-api';
import { Skeleton } from '@/components/ui/skeleton';
import { toneColor } from '@/lib/pinyin';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 40;

export default function HskLevelPage({ params }: { params: Promise<{ level: string }> }) {
  const { level } = use(params);
  const hsk = level as HskLevel;
  const meta = HSK_LEVELS_BY_KEY[hsk];

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'frequency' | 'pinyin'>('frequency');

  const words = useQuery({
    queryKey: chineseKeys.words(hsk, { page, search, sort }),
    queryFn: () =>
      chineseApi.words(hsk, { page, limit: PAGE_SIZE, search: search || undefined, sort }),
    enabled: Boolean(meta),
  });

  if (!meta) {
    return (
      <p className="rounded-[var(--r-md)] bg-[var(--surface)] p-6 text-[15px] text-[var(--text-muted)]">
        Không có cấp HSK này.
      </p>
    );
  }

  const total = words.data?.meta.total ?? 0;
  const totalPages = words.data?.meta.totalPages ?? 1;

  return (
    <div className="space-y-5">
      <header className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-heading)] text-[26px] text-[var(--text)]">
              {meta.labelVi}
            </h1>
            <p className="mt-1 text-[15px] text-[var(--text-muted)]">{meta.description}</p>
          </div>
          <span aria-hidden="true" className="text-[32px]">
            {meta.emoji}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/chinese/writing?source=hsk&hsk=${hsk}`}
            className="rounded-[var(--r-sm)] bg-white px-4 py-2 text-[14px] font-medium text-[var(--text-inverse)]"
          >
            In bảng tập viết cấp này
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo chữ Hán, pinyin, Hán Việt hoặc nghĩa…"
          className="h-11 min-w-[260px] flex-1 rounded-[var(--r-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-[15px] text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none focus:border-[var(--primary)]"
        />
        <div className="flex gap-1 rounded-[var(--r-md)] bg-[var(--surface)] p-1">
          {(
            [
              ['frequency', 'Hay gặp trước'],
              ['pinyin', 'Theo pinyin'],
            ] as ['frequency' | 'pinyin', string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSort(key);
                setPage(1);
              }}
              className={cn(
                'rounded-[var(--r-sm)] px-3 py-2 text-[13px] font-medium',
                sort === key ? 'bg-[var(--primary)] text-[var(--text-inverse)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-alt)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {words.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : words.isError ? (
        <p className="rounded-[var(--r-md)] bg-[var(--surface)] p-6 text-[15px] text-[var(--text-muted)]">
          Không tải được danh sách từ.
        </p>
      ) : (
        <>
          <p className="text-[13px] text-[var(--text-subtle)]">
            {total.toLocaleString('vi-VN')} từ · trang {page}/{totalPages}
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {words.data.data.map((word) => (
              <WordRow key={word.id} word={word} />
            ))}
          </ul>

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-[var(--r-sm)] border border-[var(--border-strong)] px-4 py-2 text-[14px] text-[var(--text)] disabled:opacity-40"
              >
                Trang trước
              </button>
              <span className="text-[14px] text-[var(--text-muted)]">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-[var(--r-sm)] border border-[var(--border-strong)] px-4 py-2 text-[14px] text-[var(--text)] disabled:opacity-40"
              >
                Trang sau
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function WordRow({ word }: { word: ChineseWordRow }) {
  return (
    <li className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 gap-0.5">
          {[...word.simplified].map((char, index) => (
            <Link
              key={`${char}-${index}`}
              href={`/chinese/hanzi/${encodeURIComponent(char)}`}
              title={`Xem chữ ${char}`}
              className="hanzi rounded-[4px] px-1 text-[30px] leading-none text-[var(--text)] transition-colors hover:bg-[var(--surface-alt)]"
            >
              {char}
            </Link>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium" style={{ color: toneColor(word.pinyin) }}>
            {word.pinyin}
          </p>
          <p className="truncate text-[15px] text-[var(--text)]">{word.meaningVi}</p>
          {word.hanViet ? (
            <p className="text-[13px] text-[var(--text-subtle)]">Hán Việt: {word.hanViet}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
