import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
  },
  // The app compiles JSX with the automatic runtime; vitest transforms the
  // same files for unit tests, so it needs the same setting or every component
  // import fails with "React is not defined".
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
