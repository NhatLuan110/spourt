import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { UrlObject } from 'node:url';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | UrlObject;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
};

/** Keep shared pages compatible with both Next and a hash-routed static host. */
const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { href, replace, scroll: _scroll, prefetch: _prefetch, ...props }, ref,
) {
  let to: string;
  if (typeof href === 'string') {
    to = href;
  } else {
    const query = new URLSearchParams();
    if (typeof href.query === 'string') {
      new URLSearchParams(href.query).forEach((value, key) => query.append(key, value));
    } else {
      Object.entries(href.query ?? {}).forEach(([key, values]) => {
        for (const value of Array.isArray(values) ? values : [values]) {
          if (value != null) query.append(key, String(value));
        }
      });
    }
    to = `${href.pathname || '/'}${query.size ? `?${query}` : ''}${href.hash || ''}`;
  }
  return <RouterLink ref={ref} to={to} replace={replace} {...props} />;
});

export default Link;
