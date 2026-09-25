'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HSK_LEVEL_LIST } from '@sprout/shared';
import type { GridStyle, HskLevel } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import { GridCell } from '@/components/chinese/writing-grid';
import { StrokeOrderStrip } from '@/components/chinese/hanzi-glyph';
import { toneMarked } from '@/lib/pinyin';
import { cn } from '@/lib/utils';

type Source = 'hsk' | 'due' | 'custom';

/**
 * Màn dựng bảng tập viết: chọn nguồn chữ và kiểu ô, xem thử ngay tại chỗ, rồi
 * mở tờ A4 ở tab mới để in. Trang in nằm ngoài khung app nên bản in không dính
 * sidebar hay thanh điều hướng.
 */
export default function WritingBuilderPage() {
  const [source, setSource] = useState<Source>('hsk');
  const [hsk, setHsk] = useState<HskLevel>('HSK1');
  const [chars, setChars] = useState('');
  const [grid, setGrid] = useState<GridStyle>('tian');
  const [traceCount, setTraceCount] = useState(3);
  const [limit, setLimit] = useState(10);
  const [boxSize, setBoxSize] = useState(17);
  const [offset, setOffset] = useState(0);
  const [showStrokeOrder, setShowStrokeOrder] = useState(true);

  const params = useMemo(
    () => ({
      source,
      ...(source === 'custom' ? { chars } : {}),
      ...(source !== 'custom' ? { hsk } : {}),
      limit,
      offset,
      grid,
      traceCount,
      showStrokeOrder,
    }),
    [source, chars, hsk, limit, offset, grid, traceCount, showStrokeOrder],
  );

  const ready = source !== 'custom' || chars.trim().length > 0;

  const preview = useQuery({
    queryKey: chineseKeys.worksheet(params),
    queryFn: () => chineseApi.worksheet(params),
    enabled: ready,
  });

  const printUrl = `/chinese/worksheet?${new URLSearchParams(
    Object.entries({ ...params, box: boxSize }).map(([key, value]) => [key, String(value)]),
  ).toString()}`;

  const sheet = preview.data;
  const totalPages = sheet ? Math.max(1, Math.ceil(sheet.totalAvailable / limit)) : 1;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-5">
      <header className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="font-[family-name:var(--font-heading)] text-[26px] text-[var(--text)]">
          Tài liệu tập viết chữ Hán
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          Chọn chữ, in ra giấy A4 rồi tập viết tay. Mỗi dòng có thứ tự nét, vài ô chữ mờ để
          tô theo và các ô trống để tự viết. Chữ vẽ bằng nét vector nên in ra sắc nét, không
          cần cài phông tiếng Trung.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
          <Field label="Lấy chữ từ đâu">
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['hsk', 'Cấp HSK'],
                  ['due', 'Chữ chưa thuộc'],
                  ['custom', 'Tự nhập'],
                ] as [Source, string][]
              ).map(([key, label]) => (
                <Chip
                  key={key}
                  active={source === key}
                  onClick={() => {
                    setSource(key);
                    setOffset(0);
                  }}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </Field>

          {source === 'custom' ? (
            <Field label="Gõ hoặc dán chữ Hán">
              <textarea
                value={chars}
                onChange={(event) => {
                  setChars(event.target.value);
                  setOffset(0);
                }}
                rows={3}
                placeholder="爱学习中国"
                className="hanzi w-full rounded-[var(--r-sm)] border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-[20px] text-[var(--text)] outline-none focus:border-[var(--primary)]"
              />
            </Field>
          ) : (
            <Field label="Cấp HSK">
              <div className="grid grid-cols-3 gap-1">
                {HSK_LEVEL_LIST.map((level) => (
                  <Chip
                    key={level.key}
                    active={hsk === level.key}
                    onClick={() => {
                      setHsk(level.key);
                      setOffset(0);
                    }}
                  >
                    HSK {level.number}
                  </Chip>
                ))}
              </div>
            </Field>
          )}

          <Field label="Kiểu ô kẻ">
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['tian', '田 chia bốn'],
                  ['mi', '米 chia tám'],
                  ['blank', 'Ô trơn'],
                ] as [GridStyle, string][]
              ).map(([key, label]) => (
                <Chip key={key} active={grid === key} onClick={() => setGrid(key)}>
                  {label}
                </Chip>
              ))}
            </div>
          </Field>

          <Slider
            label="Số ô tô mẫu mỗi dòng"
            value={traceCount}
            min={0}
            max={8}
            onChange={setTraceCount}
            hint="Phần còn lại của dòng để trống cho bạn tự viết."
          />
          <Slider
            label="Số chữ trên một tờ"
            value={limit}
            min={4}
            max={20}
            onChange={(value) => {
              setLimit(value);
              setOffset(0);
            }}
          />
          <Slider
            label="Cỡ ô (mm)"
            value={boxSize}
            min={12}
            max={26}
            onChange={setBoxSize}
            hint="17mm là cỡ vở tập viết phổ thông."
          />

          <label className="flex items-center gap-2 text-[14px] text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={showStrokeOrder}
              onChange={(event) => setShowStrokeOrder(event.target.checked)}
            />
            In dải thứ tự nét ở đầu mỗi dòng
          </label>

          <a
            href={ready ? printUrl : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!ready}
            className={cn(
              'flex h-11 items-center justify-center rounded-[var(--r-md)] text-[15px] font-semibold',
              ready
                ? 'bg-[var(--primary)] text-[var(--text-inverse)] hover:bg-[var(--primary-hover)]'
                : 'pointer-events-none bg-white/25 text-[var(--text-subtle)]',
            )}
          >
            Mở tờ A4 để in
          </a>
        </aside>

        <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold text-[var(--text)]">
                {sheet?.title ?? 'Xem thử'}
              </h2>
              <p className="text-[13px] text-[var(--text-muted)]">{sheet?.subtitle ?? '—'}</p>
            </div>
            {sheet && sheet.totalAvailable > limit ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  className="rounded-[var(--r-sm)] border border-[var(--border-strong)] px-3 py-1.5 disabled:opacity-40"
                >
                  Tờ trước
                </button>
                <span>
                  Tờ {currentPage}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setOffset(offset + limit)}
                  className="rounded-[var(--r-sm)] border border-[var(--border-strong)] px-3 py-1.5 disabled:opacity-40"
                >
                  Tờ sau
                </button>
              </div>
            ) : null}
          </div>

          {!ready ? (
            <p className="py-10 text-center text-[14px] text-[var(--text-muted)]">
              Nhập vài chữ Hán để xem thử.
            </p>
          ) : preview.isPending ? (
            <p className="py-10 text-center text-[14px] text-[var(--text-muted)]">Đang dựng…</p>
          ) : preview.isError ? (
            <p className="py-10 text-center text-[14px] text-[var(--danger)]">
              Không dựng được bảng. Thử đổi lựa chọn.
            </p>
          ) : (
            <div className="space-y-4 rounded-[var(--r-md)] bg-white p-4">
              {sheet?.cells.map((cell) => (
                <div key={cell.character} className="border-b border-neutral-200 pb-3 last:border-0">
                  <div className="mb-1 flex flex-wrap items-baseline gap-2 text-[13px] text-neutral-700">
                    <span className="font-semibold text-neutral-900">
                      {toneMarked(cell.pinyinNumeric)}
                    </span>
                    {cell.hanViet ? <span>[{cell.hanViet}]</span> : null}
                    <span className="truncate">{cell.meaningVi}</span>
                    <span className="ml-auto text-neutral-500">{cell.strokeCount} nét</span>
                  </div>
                  {showStrokeOrder ? (
                    <StrokeOrderStrip character={cell.character} size={26} className="mb-1" />
                  ) : null}
                  <div className="flex overflow-x-auto">
                    {Array.from({ length: 8 }, (_, index) => (
                      <GridCell
                        key={index}
                        character={index < traceCount ? cell.character : undefined}
                        trace
                        grid={grid}
                        size={46}
                        className={index > 0 ? '-ml-px' : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {sheet?.cells.length === 0 ? (
                <p className="py-8 text-center text-[14px] text-neutral-500">
                  Không còn chữ nào ở lựa chọn này.
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-[var(--text-muted)]">{label}</p>
      {children}
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
        'rounded-[var(--r-sm)] px-2 py-2 text-[13px] font-medium transition-colors',
        active ? 'bg-[var(--primary)] text-[var(--text-inverse)]' : 'bg-[var(--surface-alt)] text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]',
      )}
    >
      {children}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[13px]">
        <span className="font-medium text-[var(--text-muted)]">{label}</span>
        <span className="font-semibold text-[var(--text)]">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--primary)]"
      />
      {hint ? <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">{hint}</p> : null}
    </div>
  );
}
