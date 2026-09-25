'use client';

import { useEffect, useState } from 'react';
import { loadStrokes } from '@/lib/chinese-api';
import type { StrokeData } from '@/lib/chinese-api';
import { cn } from '@/lib/utils';

/**
 * hanzi-writer lưu nét trong ô 1024×1024 nhưng trục y hướng lên, và chữ nằm
 * trong khoảng y từ -124 đến 900. Phép biến đổi này lật trục về hệ toạ độ SVG.
 */
const GLYPH_TRANSFORM = 'translate(0, 900) scale(1, -1)';

export interface HanziGlyphProps {
  character: string;
  /** Chỉ vẽ n nét đầu. Bỏ trống là vẽ đủ chữ. */
  strokeLimit?: number;
  /** Nét đã vẽ tô màu này. */
  color?: string;
  /**
   * Vẽ mờ để người học tô theo. Dùng cho các ô đầu dòng của bảng tập viết —
   * in ra giấy vẫn thấy nhạt vừa đủ để đặt bút lên trên.
   */
  ghost?: boolean;
  /** Nét mới nhất tô đậm hơn phần còn lại, dùng cho dải thứ tự nét. */
  highlightLast?: boolean;
  className?: string;
  title?: string;
}

/**
 * Vẽ một chữ Hán bằng đường SVG thay vì bằng phông chữ. Nhờ vậy bảng tập viết
 * in ra giống hệt nhau trên mọi máy, kể cả máy không cài phông tiếng Trung, và
 * nét nào cũng phóng to được mà không vỡ.
 */
export function HanziGlyph({
  character,
  strokeLimit,
  color = 'currentColor',
  ghost = false,
  highlightLast = false,
  className,
  title,
}: HanziGlyphProps) {
  const data = useStrokes(character);

  if (!data) {
    // Chưa nạp xong, hoặc chữ nằm ngoài bộ 9580 chữ có dữ liệu nét: rơi về
    // phông hệ thống để ô không bị trống.
    return (
      <span
        className={cn('flex items-center justify-center font-[var(--font-hanzi)] leading-none', className)}
        style={{ color, opacity: ghost ? 0.22 : 1 }}
        aria-label={title ?? character}
      >
        {character}
      </span>
    );
  }

  const shown = strokeLimit ?? data.strokes.length;

  return (
    <svg
      viewBox="0 0 1024 1024"
      className={cn('block', className)}
      role="img"
      aria-label={title ?? character}
    >
      <g transform={GLYPH_TRANSFORM}>
        {data.strokes.slice(0, shown).map((path, index) => {
          const isLast = highlightLast && index === shown - 1;
          return (
            <path
              key={index}
              d={path}
              fill={isLast ? color : ghost ? color : color}
              opacity={ghost ? 0.2 : highlightLast && !isLast ? 0.25 : 1}
            />
          );
        })}
      </g>
    </svg>
  );
}

/** Nạp nét bút của một chữ, dùng chung bộ nhớ đệm của `loadStrokes`. */
export function useStrokes(character: string): StrokeData | null {
  const [data, setData] = useState<StrokeData | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    void loadStrokes(character).then((loaded) => {
      if (alive) setData(loaded);
    });
    return () => {
      alive = false;
    };
  }, [character]);

  return data;
}

/**
 * Dải thứ tự nét: ô thứ n cho thấy chữ sau khi viết xong n nét, nét mới nhất
 * đậm hơn. Đây là cách người học nhìn ra thứ tự bút mà không cần hoạt ảnh, nên
 * in ra giấy vẫn dùng được.
 */
export function StrokeOrderStrip({
  character,
  size = 34,
  max = 16,
  className,
}: {
  character: string;
  size?: number;
  max?: number;
  className?: string;
}) {
  const data = useStrokes(character);
  if (!data) return null;

  const total = data.strokes.length;
  // Chữ nhiều nét quá thì lấy cách quãng để dải không tràn khỏi bề ngang giấy.
  const step = total > max ? Math.ceil(total / max) : 1;
  const steps: number[] = [];
  for (let n = step; n < total; n += step) steps.push(n);
  steps.push(total);

  return (
    <div className={cn('flex flex-wrap items-center gap-[2px]', className)}>
      {steps.map((n) => (
        <div
          key={n}
          className="border border-[var(--hanzi-grid)] bg-white"
          style={{ width: size, height: size }}
        >
          <HanziGlyph character={character} strokeLimit={n} highlightLast color="#111" />
        </div>
      ))}
    </div>
  );
}
