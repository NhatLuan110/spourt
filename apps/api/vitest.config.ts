import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { resolve } from 'node:path';

const TEST_DATABASE = 'sprout_test';

function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? 'postgresql://sprout:sprout@127.0.0.1:5433/sprout';
  const url = new URL(base);
  url.pathname = `/${TEST_DATABASE}`;
  return url.toString();
}

export default defineConfig({
  // NestJS dependency injection reads `design:paramtypes`, which esbuild cannot
  // emit. SWC compiles the tests with decorator metadata so the container can
  // resolve constructor arguments.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    environment: 'node',
    globalSetup: ['./test/setup-db.ts'],
    // Workers do not inherit environment changes made in globalSetup, so the
    // test database and NODE_ENV are declared here where every worker sees them.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
    },
    // Integration tests share one database, so they must not run concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@app': resolve(__dirname, 'src'),
    },
  },
});
