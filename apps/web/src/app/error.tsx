'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Wired to Sentry in production; the console keeps local debugging simple.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span aria-hidden="true" className="text-[40px]">
        🍂
      </span>
      <h1 className="text-[24px]">Có lỗi xảy ra</h1>
      <p className="max-w-[46ch] text-[15px] text-[var(--text-muted)]">
        Chúng tôi chưa tải được trang này. Bài học và tiến độ của bạn vẫn an toàn.
      </p>
      <Button onClick={reset}>Thử lại</Button>
    </main>
  );
}
