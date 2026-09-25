/** Public files live below the repository path on GitHub Pages. */
export function publicAssetUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
  return `${base}${path}`;
}

/** Generated audio is served by the API; bundled recordings stay on the web host. */
export function mediaUrl(path: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (path.startsWith('/media/') && apiUrl && /^https?:\/\//.test(apiUrl)) {
    return new URL(path, apiUrl).href;
  }
  return publicAssetUrl(path);
}
