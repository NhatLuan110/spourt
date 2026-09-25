import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span aria-hidden="true" className="text-[40px]">
        🌾
      </span>
      <h1 className="text-[24px]">Không tìm thấy trang</h1>
      <p className="max-w-[46ch] text-[15px] text-[var(--text-muted)]">
        Đường dẫn này không tồn tại, hoặc nội dung đã được chuyển đi nơi khác.
      </p>
      <Link href="/dashboard">
        <Button>Về trang chủ</Button>
      </Link>
    </main>
  );
}
