'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import type { GridStyle } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import type { Worksheet, WorksheetCell } from '@/lib/chinese-api';
import { GridRow } from '@/components/chinese/writing-grid';
import { StrokeOrderStrip } from '@/components/chinese/hanzi-glyph';
import { toneMarked } from '@/lib/pinyin';

/** Bề ngang in được của A4 sau khi trừ lề: 210 − 2×10 = 190mm. */
const PRINTABLE_WIDTH_MM = 190;

export default function WorksheetPrintPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-[14px]">Đang dựng bảng tập viết…</p>}>
      <WorksheetSheet />
    </Suspense>
  );
}

function WorksheetSheet() {
  const search = useSearchParams();

  const params = useMemo(() => {
    const raw: Record<string, string> = {};
    search.forEach((value, key) => {
      raw[key] = value;
    });
    return raw;
  }, [search]);

  const boxSize = Number(params.box ?? 17);
  const grid = (params.grid ?? 'tian') as GridStyle;
  const traceCount = Number(params.traceCount ?? 3);
  const showMeta = params.showMeta !== 'false';
  const showStrokeOrder = params.showStrokeOrder !== 'false';

  const query = useQuery({
    queryKey: chineseKeys.worksheet(params),
    queryFn: () => chineseApi.worksheet(params),
  });

  if (query.isPending) {
    return <p className="p-8 text-center text-[14px]">Đang dựng bảng tập viết…</p>;
  }

  if (query.isError || !query.data) {
    return (
      <p className="p-8 text-center text-[14px] text-red-700">
        Không dựng được bảng tập viết. Kiểm tra lại lựa chọn rồi thử lại.
      </p>
    );
  }

  const sheet = query.data;
  // Số ô lấp vừa bề ngang giấy, chừa chỗ cho phần chữ mẫu bên trái.
  const boxes = Math.max(4, Math.floor(PRINTABLE_WIDTH_MM / boxSize));

  return (
    <>
      <PrintToolbar sheet={sheet} />
      <div className="sheet">
        <div className="sheet-inner">
          <SheetHeader sheet={sheet} />
          {sheet.cells.map((cell) => (
            <CharacterBlock
              key={cell.character}
              cell={cell}
              grid={grid}
              boxes={boxes}
              boxSize={boxSize}
              traceCount={traceCount}
              showMeta={showMeta}
              showStrokeOrder={showStrokeOrder}
            />
          ))}
          {sheet.cells.length === 0 ? (
            <p className="p-8 text-center text-[13px]">Không có chữ nào để in.</p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function PrintToolbar({ sheet }: { sheet: Worksheet }) {
  return (
    <div className="no-print mx-auto mb-4 flex w-[190mm] flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 shadow">
      <div>
        <p className="text-[15px] font-semibold">{sheet.title}</p>
        <p className="text-[13px] text-neutral-600">
          {sheet.cells.length} chữ trên tờ này · {sheet.subtitle}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-[14px] font-medium text-white"
        >
          In / Lưu PDF
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-md border border-neutral-300 px-4 py-2 text-[14px]"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}

function SheetHeader({ sheet }: { sheet: Worksheet }) {
  return (
    <header className="mb-[4mm] border-b-2 border-neutral-800 pb-[2mm]">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[15pt] font-bold">{sheet.title}</h1>
        <span className="text-[9pt] text-neutral-600">Sprout · 汉字练习</span>
      </div>
      <div className="mt-[1mm] flex items-baseline justify-between text-[9pt] text-neutral-700">
        <span>{sheet.subtitle}</span>
        <span>Họ tên: ..................................... Ngày: ............ /............</span>
      </div>
    </header>
  );
}

function CharacterBlock({
  cell,
  grid,
  boxes,
  boxSize,
  traceCount,
  showMeta,
  showStrokeOrder,
}: {
  cell: WorksheetCell;
  grid: GridStyle;
  boxes: number;
  boxSize: number;
  traceCount: number;
  showMeta: boolean;
  showStrokeOrder: boolean;
}) {
  const mm = (value: number) => `${value}mm`;

  return (
    <section className="glyph-block mb-[3mm]">
      {showMeta ? (
        <div className="mb-[0.8mm] flex items-baseline gap-2 text-[8.5pt] leading-tight">
          <span className="font-semibold">{toneMarked(cell.pinyinNumeric)}</span>
          {cell.hanViet ? <span className="text-neutral-700">[{cell.hanViet}]</span> : null}
          {cell.meaningVi ? (
            <span className="truncate text-neutral-700">{cell.meaningVi}</span>
          ) : null}
          <span className="ml-auto shrink-0 text-neutral-500">
            {cell.strokeCount ? `${cell.strokeCount} nét` : ''}
            {cell.sampleWord ? ` · ${cell.sampleWord.simplified} ${cell.sampleWord.pinyin}` : ''}
          </span>
        </div>
      ) : null}

      {showStrokeOrder ? (
        <StrokeOrderStrip
          character={cell.character}
          size={(boxSize * 3.78) / 2.4}
          className="mb-[0.8mm]"
        />
      ) : null}

      <div style={{ width: mm(boxSize * boxes) }}>
        <GridRow
          character={cell.character}
          grid={grid}
          boxes={boxes}
          traceCount={traceCount}
          size={(boxSize * 96) / 25.4}
        />
      </div>
    </section>
  );
}
