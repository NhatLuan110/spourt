'use client';

import type { GridStyle } from '@sprout/shared';
import { HanziGlyph } from './hanzi-glyph';
import { cn } from '@/lib/utils';

/**
 * Ô kẻ tập viết. 田字格 chia bốn, 米字格 thêm hai đường chéo, ô trơn cho người
 * đã quen tay. Đường chia vẽ nét đứt mảnh để khi in không át mất chữ mẫu.
 */
export function GridCell({
  character,
  grid = 'tian',
  trace = false,
  size = 64,
  className,
}: {
  character?: string;
  grid?: GridStyle;
  /** Có in chữ mẫu mờ để tô lên không. */
  trace?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('relative shrink-0 border border-[var(--hanzi-grid)] bg-white', className)}
      style={{ width: size, height: size }}
    >
      {grid !== 'blank' ? (
        <svg
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <g stroke="var(--hanzi-grid)" strokeWidth="0.6" strokeDasharray="4 3">
            <line x1="50" y1="0" x2="50" y2="100" />
            <line x1="0" y1="50" x2="100" y2="50" />
            {grid === 'mi' ? (
              <>
                <line x1="0" y1="0" x2="100" y2="100" />
                <line x1="100" y1="0" x2="0" y2="100" />
              </>
            ) : null}
          </g>
        </svg>
      ) : null}

      {character ? (
        <HanziGlyph
          character={character}
          ghost={trace}
          color="#111"
          className="absolute inset-[6%] h-[88%] w-[88%]"
        />
      ) : null}
    </div>
  );
}

/** Một hàng ô: vài ô tô mẫu rồi tới các ô trống để tự viết. */
export function GridRow({
  character,
  grid,
  boxes,
  traceCount,
  size = 64,
}: {
  character: string;
  grid: GridStyle;
  boxes: number;
  traceCount: number;
  size?: number;
}) {
  return (
    <div className="flex gap-0">
      {Array.from({ length: boxes }, (_, index) => (
        <GridCell
          key={index}
          character={index < traceCount ? character : undefined}
          trace
          grid={grid}
          size={size}
          // Các ô liền nhau nên chỉ ô đầu mới cần viền trái, tránh vạch đôi.
          className={index > 0 ? '-ml-px' : undefined}
        />
      ))}
    </div>
  );
}
