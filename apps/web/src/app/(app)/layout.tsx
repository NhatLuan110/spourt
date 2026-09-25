'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/auth-provider';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import {
  BOTTOM_BAR_ITEMS,
  CHINESE_BOTTOM_BAR_ITEMS,
  CHINESE_SIDEBAR_ITEMS,
  SIDEBAR_ITEMS,
} from '@/components/layout/app-nav';
import type { NavItem } from '@/components/layout/app-nav';
import { TrackSwitcher, trackFromPath } from '@/components/layout/track-switcher';
import { Scenery } from '@/components/layout/scenery';
import { sceneryForPath } from '@/components/layout/scene-map';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { user, initialising, signOut } = useAuth();

  useEffect(() => {
    if (!initialising && user === null) router.replace('/login');
  }, [initialising, user, router]);

  if (initialising || user === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  // D-101 — mỗi ngăn có bộ điều hướng riêng; đường dẫn quyết định đang ở ngăn nào.
  const track = trackFromPath(pathname);
  const sidebarItems = track === 'CHINESE' ? CHINESE_SIDEBAR_ITEMS : SIDEBAR_ITEMS;
  const bottomItems = track === 'CHINESE' ? CHINESE_BOTTOM_BAR_ITEMS : BOTTOM_BAR_ITEMS;
  // D-106 — mỗi mục điều hướng một danh thắng, đổi mục là đổi cảnh nền.
  const scenery = sceneryForPath(pathname);

  return (
    <div className="min-h-dvh">
      <Scenery scenes={scenery.scenes} dir={scenery.dir} overlay="medium" />

      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[240px] flex-col border-r border-[var(--border)] bg-[var(--surface-solid)]/94 backdrop-blur-2xl lg:flex">
        <Link
          href={track === 'CHINESE' ? '/chinese' : '/dashboard'}
          className="flex items-center gap-2.5 px-5 py-5 text-[20px] font-semibold"
        >
          <Icon name="home" size={22} className="text-[var(--primary)]" />
          <span className="font-[family-name:var(--font-heading)]">{t('app.name')}</span>
        </Link>

        <div className="px-3 pb-3">
          <TrackSwitcher />
        </div>

        <nav aria-label="Chính" className="flex-1 overflow-y-auto px-3">
          <ul className="flex flex-col gap-0.5">
            {sidebarItems.filter(
              (item) => !item.adminOnly || user.role === 'ADMIN',
            ).map((item) => (
              <li key={item.key}>
                <NavLink item={item} label={t(`nav.${item.key}`)} active={pathname === item.href} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="truncate text-[14px] text-[var(--text-muted)]">
              {user.profile.displayName}
            </span>
            <ThemeToggle />
          </div>
          <Button variant="ghost" size="sm" block onClick={() => void signOut()}>
            {t('common.signOut')}
          </Button>
        </div>
      </aside>

      <div className="lg:pl-[240px]">
        {/*
          Ảnh danh thắng là mặt bàn, phần nội dung là tờ giấy đặt lên trên. Lớp
          mờ ở đây có việc cụ thể — tách chữ khỏi ảnh — chứ không phải để trang trí.
        */}
        <main className="mx-auto max-w-[1200px] px-4 pb-24 pt-6 md:px-8 lg:pb-10">
          <div className="rounded-[var(--r-xl)] bg-[var(--bg)]/24 p-4 shadow-[var(--shadow-lg)] backdrop-blur-[2px] md:p-6">
            {children}
          </div>
        </main>
      </div>

      <nav
        aria-label="Chính"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--border)] bg-[var(--surface-solid)]/96 backdrop-blur-2xl lg:hidden"
      >
        {bottomItems.map((item) => (
          <BottomLink
            key={item.key}
            item={item}
            label={t(`nav.${item.key}`)}
            active={pathname === item.href}
          />
        ))}
      </nav>
    </div>
  );
}

function NavLink({ item, label, active }: { item: NavItem; label: string; active: boolean }) {
  const className = cn(
    'group relative flex items-center gap-3 rounded-[var(--r-md)] px-3 py-2 text-[15px] transition-colors',
    active
      ? 'font-medium text-[var(--text)]'
      : 'text-[var(--text-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--text)]',
  );

  // Sections that are not built yet stay visible but inert, so the navigation
  // never leads to a dead page (§14: no blank screens).
  if (!item.ready) {
    return (
      <span aria-disabled="true" className={cn(className, 'cursor-not-allowed opacity-45')}>
        <Icon name={item.icon} />
        <span className="flex-1">{label}</span>
        <span className="rounded-[var(--r-full)] bg-[var(--surface-alt)] px-1.5 py-0.5 text-[10px] text-[var(--text-subtle)]">
          sắp có
        </span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={className}
      aria-current={active ? 'page' : undefined}
      // Mục đang mở lấy nền pha từ chính sắc của nó, nên thanh điều hướng đọc
      // được bằng màu chứ không phải mọi mục đều một màu xanh giống nhau.
      style={active ? { backgroundColor: `color-mix(in oklab, var(${item.tint}) 14%, transparent)` } : undefined}
    >
      <Icon
        name={item.icon}
        className="shrink-0 transition-colors"
        // Icon giữ màu riêng cả khi không được chọn, chỉ nhạt đi.
        {...{ style: { color: `var(${item.tint})`, opacity: active ? 1 : 0.72 } }}
      />
      <span>{label}</span>
    </Link>
  );
}

function BottomLink({ item, label, active }: { item: NavItem; label: string; active: boolean }) {
  const className = cn(
    'flex flex-col items-center gap-0.5 py-2 text-[11px]',
    active ? 'text-[var(--text)]' : 'text-[var(--text-subtle)]',
  );

  if (!item.ready) {
    return (
      <span aria-disabled="true" className={cn(className, 'opacity-45')}>
        <Icon name={item.icon} size={22} />
        {label}
      </span>
    );
  }

  return (
    <Link href={item.href} className={className} aria-current={active ? 'page' : undefined}>
      <Icon
        name={item.icon}
        size={22}
        {...{ style: { color: `var(${item.tint})`, opacity: active ? 1 : 0.7 } }}
      />
      {label}
    </Link>
  );
}
