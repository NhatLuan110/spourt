import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams as useRouterSearchParams } from 'react-router-dom';
export { useParams } from 'react-router-dom';

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  return useRouterSearchParams()[0];
}

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(() => ({
    push: (url: string, options?: { scroll?: boolean }) => {
      void navigate(url);
      if (options?.scroll !== false) window.scrollTo(0, 0);
    },
    replace: (url: string, options?: { scroll?: boolean }) => {
      void navigate(url, { replace: true });
      if (options?.scroll !== false) window.scrollTo(0, 0);
    },
    back: () => { void navigate(-1); },
    forward: () => { void navigate(1); },
    refresh: () => window.location.reload(),
    prefetch: () => {},
  }), [navigate]);
}
