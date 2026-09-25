'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TRACK_LIST, TRACKS } from '@sprout/shared';
import type { LearningTrack } from '@sprout/shared';
import { cn } from '@/lib/utils';

/** Đường dẫn nào thuộc ngăn nào. Mọi thứ dưới /chinese là ngăn tiếng Trung. */
export function trackFromPath(pathname: string): LearningTrack {
  return pathname.startsWith(TRACKS.CHINESE.basePath) ? 'CHINESE' : 'ENGLISH';
}

const HOME: Record<LearningTrack, string> = {
  ENGLISH: '/dashboard',
  CHINESE: '/chinese',
};

/**
 * Bộ chuyển ngăn (D-101). Đặt ngay đầu sidebar để người học luôn thấy mình
 * đang ở ngăn nào và đổi được bằng một cú bấm. Tiến độ hai ngăn tách rời, đổi
 * qua lại không mất gì.
 */
export function TrackSwitcher({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const current = trackFromPath(pathname);

  return (
    <div
      role="tablist"
      aria-label="Ngăn học"
      className={cn(
        'flex gap-1 rounded-[var(--r-md)] bg-[var(--surface-alt)] p-1',
        compact ? 'text-[13px]' : 'text-[14px]',
      )}
    >
      {TRACK_LIST.map((track) => {
        const active = current === track.key;
        return (
          <Link
            key={track.key}
            href={HOME[track.key]}
            role="tab"
            aria-selected={active}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1.5 font-medium transition-colors',
              active
                ? 'bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            <span aria-hidden="true">{track.emoji}</span>
            <span>{compact ? track.shortVi : track.labelVi}</span>
          </Link>
        );
      })}
    </div>
  );
}
