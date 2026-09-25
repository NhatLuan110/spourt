import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { resolve } from 'node:path';

// These suites use provider and database doubles; they never seed or mutate a database.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/ai-provider.spec.ts', 'test/ai-resilience.spec.ts', 'test/tutor.spec.ts', 'test/writing.spec.ts', 'test/secret-box.spec.ts', 'test/auth-cookie.spec.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused/unused' },
  },
  resolve: { alias: { '@app': resolve(__dirname, 'src') } },
});
