'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import type { HskLevelCard } from '@/lib/chinese-api';
import { Skeleton } from '@/components/ui/skeleton';

export default function ChineseHomePage() {
  const levels = useQuery({ queryKey: chineseKeys.levels, queryFn: chineseApi.levels });

  return (
    <div className="space-y-6">
      <header className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="font-[family-name:var(--font-heading)] text-[30px] leading-tight text-[var(--text)]">
          Học tiếng Trung từ số không
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          Sáu cấp HSK, 4.991 từ và 2.632 chữ Hán. Mỗi từ có pinyin, âm Hán Việt và nghĩa
          tiếng Việt — chữ nào cũng in được ra giấy A4 để tập viết tay.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/chinese/pinyin"
            className="rounded-[var(--r-sm)] bg-white px-4 py-2 text-[14px] font-medium text-[var(--text-inverse)]"
          >
            Chưa biết gì? Bắt đầu ở đây
          </Link>
          <Link
            href="/chinese/writing"
            className="rounded-[var(--r-sm)] border border-[var(--border-strong)] px-4 py-2 text-[14px] font-medium text-[var(--text)]"
          >
            In bảng tập viết
          </Link>
        </div>
      </header>

      {levels.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      ) : levels.isError ? (
        <p className="rounded-[var(--r-md)] bg-[var(--surface)] p-6 text-[15px] text-[var(--text-muted)]">
          Chưa tải được lộ trình HSK. Thử tải lại trang.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {levels.data.map((level) => (
            <LevelCard key={level.key} level={level} />
          ))}
        </div>
      )}
    </div>
  );
}

function LevelCard({ level }: { level: HskLevelCard }) {
  return (
    <Link
      href={`/chinese/hsk/${level.key}`}
      className="group flex flex-col rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[18px] font-semibold text-[var(--text)]">{level.labelVi}</p>
          <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">{level.description}</p>
        </div>
        <span aria-hidden="true" className="text-[26px]">
          {level.emoji}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Từ" value={level.wordCount} />
        <Stat label="Chữ Hán" value={level.hanziCount} />
        <Stat label="Đã học" value={level.learnedCount} />
      </dl>

      <div className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-alt)]">
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500"
            style={{ width: `${level.progressPct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[12px] text-[var(--text-muted)]">
          <span>{level.progressPct}% đã bắt đầu</span>
          {level.dueCount > 0 ? (
            <span className="text-[var(--accent)]">{level.dueCount} từ tới hạn ôn</span>
          ) : level.recommended ? (
            <span className="text-[var(--text-muted)]">Nên học tiếp cấp này</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--r-sm)] bg-[var(--surface-alt)] py-2">
      <dt className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">{label}</dt>
      <dd className="text-[17px] font-semibold text-[var(--text)]">{value.toLocaleString('vi-VN')}</dd>
    </div>
  );
}
