import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="contour-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <Link
        href="/"
        className="relative mb-6 flex items-center gap-2 text-[20px] font-semibold text-[var(--text)]"
      >
        <span aria-hidden="true">🌱</span>
        <span className="font-[family-name:var(--font-heading)]">Sprout</span>
      </Link>
      <div className="relative w-full max-w-[420px]">{children}</div>
    </main>
  );
}
