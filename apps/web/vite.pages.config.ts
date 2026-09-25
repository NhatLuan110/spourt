import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const base = process.env.PAGES_BASE_PATH || '/spourt/';
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) {
  throw new Error('PAGES_BASE_PATH must be an absolute directory path ending in /.');
}
if (apiUrl) {
  const url = new URL(apiUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/api/v1')) {
    throw new Error('NEXT_PUBLIC_API_URL must be a public HTTPS API URL ending in /api/v1.');
  }
}

export default defineConfig({
  root: resolve(__dirname, 'static-app'),
  base,
  publicDir: resolve(__dirname, 'public'),
  // This build never loads the API's private environment file.
  envDir: false,
  define: {
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(apiUrl),
    'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify(base.replace(/\/$/, '')),
    // OAuth redirects cannot establish a cookie in the frontend's partition.
    'process.env.NEXT_PUBLIC_GOOGLE_LOGIN': JSON.stringify('false'),
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      'next/link': resolve(__dirname, 'static-app/next-link.tsx'),
      'next/navigation': resolve(__dirname, 'static-app/navigation.ts'),
      '@': resolve(__dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: resolve(__dirname, 'out-pages'),
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
        warn(warning);
      },
    },
  },
});
