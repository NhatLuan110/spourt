import { Component, lazy, Suspense, useEffect, useMemo, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { NextIntlClientProvider } from 'next-intl';
import { Providers } from '@/components/providers';
import { AuthProvider } from '@/components/auth-provider';
import { API_URL } from '@/lib/api-client';
import AppLayout from '../src/app/(app)/layout';
import AuthLayout from '../src/app/(auth)/layout';
import NotFound from '../src/app/not-found';
import vi from '../messages/vi.json';
import en from '../messages/en.json';
import '../src/app/chinese-theme.css';
import './style.css';

const PrintLayout = lazy(() => import('../src/app/(print)/layout'));
type PageProps = { params: Promise<Record<string, string | undefined>> };
const modules = import.meta.glob<{ default: ComponentType<PageProps> }>(['../src/app/**/page.tsx', '!../src/app/dev/**']);
const pages = Object.entries(modules)
  .filter(([file]) => !file.includes('/dev/'))
  .map(([file, load]) => ({
    file,
    path: '/' + file.replace('../src/app/', '').replace(/(?:^|\/)\([^/]+\)/g, '')
      .replace(/\/?page\.tsx$/, '').replace(/^\//, '').replace(/\[([^\]]+)\]/g, ':$1'),
    Page: lazy(load),
  }));

function Loading() {
  return <p role="status" className="p-8 text-center text-[var(--text-muted)]">Đang mở trang…</p>;
}

function PageHost({ Page }: { Page: ComponentType<PageProps> }) {
  const paramsKey = JSON.stringify(useParams());
  const params = useMemo(() => Promise.resolve(JSON.parse(paramsKey) as Record<string, string>), [paramsKey]);
  return <Suspense fallback={<Loading />}><Page params={params} /></Suspense>;
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (this.state.failed) return (
      <main className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl">Không mở được trang</h1>
        <p className="my-4">Vui lòng tải lại trang để nhận bản cập nhật mới nhất.</p>
        <button className="underline" onClick={() => window.location.reload()}>Tải lại</button>
      </main>
    );
    return this.props.children;
  }
}

function NavigationEffects() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function App() {
  const locale = document.cookie.split(';').some((value) => value.trim() === 'sprout_locale=en') ? 'en' : 'vi';
  document.documentElement.lang = locale;
  const routeGroup = (group: string | null) => pages.filter(({ file }) => group
    ? file.includes(`/(${group})/`)
    : !/\/\([^/]+\)\//.test(file)).map(({ path, Page }) => (
      <Route key={path} path={path} element={<PageHost Page={Page} />} />
    ));

  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : vi} timeZone="Asia/Ho_Chi_Minh">
      <Providers><AuthProvider><HashRouter>
        <NavigationEffects />
        {!API_URL && <aside role="status" className="service-notice">
          {locale === 'en'
            ? 'Sign-in, learning history and AI Tutor are not ready yet. Please come back later.'
            : 'Đăng nhập, lịch sử học và AI Tutor chưa sẵn sàng. Vui lòng quay lại sau.'}
        </aside>}
        <PageErrorBoundary><Suspense fallback={<Loading />}><Routes>
          {routeGroup(null)}
          <Route element={<AuthLayout><Outlet /></AuthLayout>}>{routeGroup('auth')}</Route>
          <Route element={<AppLayout><Outlet /></AppLayout>}>{routeGroup('app')}</Route>
          <Route element={<PrintLayout><Outlet /></PrintLayout>}>{routeGroup('print')}</Route>
          <Route path="*" element={<NotFound />} />
        </Routes></Suspense></PageErrorBoundary>
      </HashRouter></AuthProvider></Providers>
    </NextIntlClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
