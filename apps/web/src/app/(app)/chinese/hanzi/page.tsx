'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { HSK_LEVEL_LIST } from '@sprout/shared';
import type { HskLevel } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import { Skeleton } from '@/components/ui/skeleton';
import { toneMarked } from '@/lib/pinyin';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 60;

export default function HanziSearchPage() {
  const [search, setSearch] = useState('');
  const [hsk, setHsk] = useState<HskLevel | undefined>(undefined);
  const [sort, setSort] = useState<'hsk' | 'strokes'>('hsk');
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: chineseKeys.hanziList({ search, hsk, sort, page }),
    queryFn: () =>
      chineseApi.hanziList({ page, limit: PAGE_SIZE, search: search || undefined, hsk, sort }),
  });

  return (
    <div className="space-y-5">
      <header className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="font-[family-name:var(--font-heading)] text-[26px] text-[var(--text)]">
          Tra chữ Hán
        </h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)]">
          2.632 chữ trong HSK 1–6. Bấm vào chữ để xem thứ tự nét và các từ chứa nó.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Gõ chữ Hán, âm Hán Việt hoặc nghĩa…"
          className="h-11 min-w-[240px] flex-1 rounded-[var(--r-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-[15px] text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none focus:border-[var(--primary)]"
        />
        <div className="flex flex-wrap gap-1 rounded-[var(--r-md)] bg-[var(--surface)] p-1">
          <Chip active={hsk === undefined} onClick={() => { setHsk(undefined); setPage(1); }}>
            Tất cả
          </Chip>
          {HSK_LEVEL_LIST.map((level) => (
            <Chip
              key={level.key}
              active={hsk === level.key}
              onClick={() => { setHsk(level.key); setPage(1); }}
            >
              HSK {level.number}
            </Chip>
          ))}
        </div>
        <div className="flex gap-1 rounded-[var(--r-md)] bg-[var(--surface)] p-1">
          <Chip active={sort === 'hsk'} onClick={() => setSort('hsk')}>Theo cấp</Chip>
          <Chip active={sort === 'strokes'} onClick={() => setSort('strokes')}>Ít nét trước</Chip>
        </div>
      </div>

      {list.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
          {Array.from({ length: 24 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <p className="rounded-[var(--r-md)] bg-[var(--surface)] p-6 text-[15px] text-[var(--text-muted)]">
          Không tải được danh sách chữ.
        </p>
      ) : (
        <>
          <p className="text-[13px] text-[var(--text-subtle)]">
            {list.data.meta.total.toLocaleString('vi-VN')} chữ · trang {list.data.meta.page}/
            {list.data.meta.totalPages}
          </p>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
            {list.data.data.map((item) => (
              <li key={item.character}>
                <Link
                  href={`/chinese/hanzi/${encodeURIComponent(item.character)}`}
                  className="flex h-full flex-col items-center rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-2 text-center  transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)]"
                >
                  <span className="hanzi text-[34px] leading-tight text-[var(--text)]">{item.character}</span>
                  <span className="text-[12px] text-[var(--text-muted)]">{toneMarked(item.pinyinNumeric)}</span>
                  <span className="text-[12px] text-[var(--text-subtle)]">{item.hanViet}</span>
                  <span className="mt-auto text-[11px] text-[var(--text-subtle)]">{item.strokeCount} nét</span>
                </Link>
              </li>
            ))}
          </ul>

          {list.data.meta.totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-[var(--r-sm)] border border-[var(--border-strong)] px-4 py-2 text-[14px] text-[var(--text)] disabled:opacity-40"
              >
                Trang trước
              </button>
              <button
                type="button"
                disabled={page >= list.data.meta.totalPages}
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
        'rounded-[var(--r-sm)] px-3 py-2 text-[13px] font-medium',
        active ? 'bg-[var(--primary)] text-[var(--text-inverse)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-alt)]',
      )}
    >
      {children}
    </button>
  );
}
