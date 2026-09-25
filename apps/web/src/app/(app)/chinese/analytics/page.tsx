'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { HSK_LEVELS_BY_KEY } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import { Skeleton } from '@/components/ui/skeleton';

export default function ChineseAnalyticsPage() {
  const stats = useQuery({ queryKey: chineseKeys.stats, queryFn: chineseApi.stats });
  const forecast = useQuery({
    queryKey: chineseKeys.forecast(21),
    queryFn: () => chineseApi.forecast(21),
  });

  if (stats.isPending) return <Skeleton className="h-96 w-full" />;
  if (stats.isError || !stats.data) {
    return <p className="text-[15px] text-[var(--text-muted)]">Chưa tải được số liệu.</p>;
  }

  const data = stats.data;
  const peak = Math.max(1, ...(forecast.data ?? []).map((day) => day.count));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">
          Thống kê tiếng Trung
        </h1>
        <p className="mt-1 text-[15px] text-[var(--text-muted)]">
          Bạn đang ở đâu trên chặng HSK 1 → 6.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Từ đã học"
          value={data.learnedTotal}
          sub={`trên ${data.totalWords.toLocaleString('vi-VN')} từ`}
          tone="--primary"
        />
        <Metric label="Đã thuộc kỹ" value={data.masteredCount} sub="không cần ôn dày" tone="--success" />
        <Metric label="Tới hạn ôn" value={data.dueNow} sub="ôn hôm nay" tone="--accent" />
        <Metric
          label="Chữ viết được"
          value={data.hanziWritten}
          sub={`trên ${data.totalHanzi.toLocaleString('vi-VN')} chữ`}
          tone="--clay"
        />
      </div>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-[17px] font-semibold">Tiến độ từng cấp</h2>
        <ul className="mt-3 space-y-3">
          {Object.values(HSK_LEVELS_BY_KEY).map((level) => {
            const learned = data.byLevel.find((row) => row.hskLevel === level.key)?.learned ?? 0;
            const pct = Math.round((learned / level.wordCount) * 100);
            return (
              <li key={level.key}>
                <div className="flex items-baseline justify-between text-[14px]">
                  <Link href={`/chinese/hsk/${level.key}`} className="font-medium hover:underline">
                    {level.labelVi}
                  </Link>
                  <span className="tabular text-[var(--text-muted)]">
                    {learned} / {level.wordCount}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: `var(${level.colorToken})`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-[17px] font-semibold">Trạng thái thẻ</h2>
          <dl className="mt-3 space-y-2">
            <Row label="Mới mở" value={data.newCount} tone="--info" />
            <Row label="Đang học" value={data.learningCount} tone="--warning" />
            <Row label="Đang ôn" value={data.reviewCount} tone="--primary" />
            <Row label="Đã thuộc kỹ" value={data.masteredCount} tone="--success" />
          </dl>
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-[14px] text-[var(--text-muted)]">
            Tỉ lệ trả lời đúng:{' '}
            <b className="tabular text-[18px] text-[var(--text)]">{data.accuracyPct}%</b>
          </p>
        </section>

        <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-[17px] font-semibold">Lịch ôn 21 ngày tới</h2>
          {forecast.isPending ? (
            <Skeleton className="mt-3 h-32 w-full" />
          ) : (
            <div className="mt-4 flex h-32 items-end gap-1">
              {(forecast.data ?? []).map((day) => (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-[3px] bg-[var(--primary)] transition-[height]"
                    style={{ height: `${Math.max(2, (day.count / peak) * 100)}%` }}
                    title={`${day.date}: ${day.count} thẻ`}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
            Cột cao nhất: {peak} thẻ. Thẻ quá hạn dồn vào hôm nay.
          </p>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: string;
}) {
  return (
    <div
      className="rounded-[var(--r-lg)] p-5"
      style={{ backgroundColor: `color-mix(in oklab, var(${tone}) 13%, var(--surface))` }}
    >
      <p className="text-[13px] text-[var(--text-muted)]">{label}</p>
      <p className="tabular mt-1 text-[30px] font-bold leading-none" style={{ color: `var(${tone})` }}>
        {value.toLocaleString('vi-VN')}
      </p>
      <p className="mt-1 text-[12px] text-[var(--text-subtle)]">{sub}</p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-[14px]">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: `var(${tone})` }}
        />
        {label}
      </dt>
      <dd className="tabular text-[15px] font-semibold">{value}</dd>
    </div>
  );
}
