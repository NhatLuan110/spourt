import { execSync } from 'node:child_process';
import { Client } from 'pg';

/**
 * §11 asks for integration tests against a real database. Testcontainers needs a
 * Docker daemon, which this machine does not have (DECISIONS D-002), so the
 * suite provisions a separate `sprout_test` database on the same local server
 * and migrates it before the first test runs.
 */
const BASE_URL = process.env.DATABASE_URL ?? 'postgresql://sprout:sprout@127.0.0.1:5433/sprout';
const TEST_DATABASE = 'sprout_test';

function testDatabaseUrl(): string {
  const url = new URL(BASE_URL);
  url.pathname = `/${TEST_DATABASE}`;
  return url.toString();
}

export async function setup(): Promise<void> {
  const adminUrl = new URL(BASE_URL);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DATABASE,
    ]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    }
  } finally {
    await client.end();
  }

  const url = testDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';

  execSync('prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  // The vocabulary suite needs real topics, words and word families, and the
  // seed is idempotent, so the tests run against the same content the app does
  // rather than against fixtures that could drift from it.
  execSync('tsx prisma/seed/index.ts', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

export async function teardown(): Promise<void> {
  // The database is left in place so a failing run can be inspected; the next
  // run truncates it in beforeEach.
}
