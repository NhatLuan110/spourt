#!/usr/bin/env node
/**
 * Local PostgreSQL without Docker.
 *
 * The specification assumes `docker compose up`, but this machine has no Docker
 * daemon, so development uses the real PostgreSQL binaries shipped by the
 * `embedded-postgres` package and drives them with pg_ctl. The server keeps
 * running after this script exits, exactly like a container would.
 *
 *   node scripts/local-postgres.mjs start|stop|status|psql|reset
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, '.pgdata');
const LOG_FILE = join(DATA_DIR, 'server.log');
const PORT = process.env.PGPORT ?? '5433';
const USER = 'sprout';
const PASSWORD = 'sprout';
const DATABASE = 'sprout';

function findBinDir() {
  const pnpmDir = join(ROOT, 'node_modules', '.pnpm');
  const direct = join(
    ROOT,
    'node_modules',
    '@embedded-postgres',
    'windows-x64',
    'native',
    'bin',
  );
  if (existsSync(direct)) return direct;

  if (existsSync(pnpmDir)) {
    const match = readdirSync(pnpmDir).find((entry) =>
      entry.startsWith('@embedded-postgres+'),
    );
    if (match) {
      const scoped = join(pnpmDir, match, 'node_modules', '@embedded-postgres');
      const platform = readdirSync(scoped)[0];
      const candidate = join(scoped, platform, 'native', 'bin');
      if (existsSync(candidate)) return candidate;
    }
  }

  throw new Error(
    'PostgreSQL binaries not found. Run "pnpm install" first, or set DATABASE_URL to an external server.',
  );
}

const BIN = findBinDir();
const exe = (name) => join(BIN, process.platform === 'win32' ? `${name}.exe` : name);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: PASSWORD },
    ...options,
  });
  return result;
}

function isRunning() {
  const result = run(exe('pg_ctl'), ['-D', DATA_DIR, 'status'], { quiet: true });
  return result.status === 0;
}

function initialise() {
  if (existsSync(join(DATA_DIR, 'PG_VERSION'))) return;

  console.log('Initialising a new PostgreSQL cluster in .pgdata ...');
  mkdirSync(DATA_DIR, { recursive: true });
  const passwordFile = join(ROOT, '.pgpass.tmp');
  writeFileSync(passwordFile, PASSWORD, 'utf8');

  const result = run(exe('initdb'), [
    '-D',
    DATA_DIR,
    '-U',
    USER,
    '--pwfile',
    passwordFile,
    '--auth-host=scram-sha-256',
    '--auth-local=trust',
    '--encoding=UTF8',
    '--locale=C',
  ]);
  rmSync(passwordFile, { force: true });

  if (result.status !== 0) {
    throw new Error('initdb failed. See the output above.');
  }
}

async function start() {
  initialise();
  if (isRunning()) {
    console.log(`PostgreSQL already running on port ${PORT}.`);
    await createDatabase();
    printUrl();
    return;
  }

  const result = run(exe('pg_ctl'), [
    '-D',
    DATA_DIR,
    '-l',
    LOG_FILE,
    '-o',
    `-p ${PORT} -c listen_addresses=127.0.0.1`,
    'start',
    // On Windows pg_ctl keeps the inherited stdio handles open for the lifetime
    // of the server, so the launcher must not inherit them or it never returns.
  ], { quiet: true, stdio: 'ignore' });

  if (result.status !== 0) {
    throw new Error(`Could not start PostgreSQL. Check ${LOG_FILE}`);
  }

  await createDatabase();
  printUrl();
}

async function createDatabase() {
  // The embedded package ships only the server binaries, so the bootstrap uses
  // the pg driver rather than createdb/psql.
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    host: '127.0.0.1',
    port: Number(PORT),
    user: USER,
    password: PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DATABASE]);
    if (existing.rowCount === 0) {
      // The name is a constant in this script, never user input.
      await client.query(`CREATE DATABASE "${DATABASE}"`);
      console.log(`Created database "${DATABASE}".`);
    }
  } finally {
    await client.end();
  }
}

function stop() {
  if (!isRunning()) {
    console.log('PostgreSQL is not running.');
    return;
  }
  run(exe('pg_ctl'), ['-D', DATA_DIR, '-m', 'fast', '-w', 'stop']);
}

function status() {
  console.log(isRunning() ? `Running on port ${PORT}.` : 'Stopped.');
  if (isRunning()) printUrl();
}

function reset() {
  stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('Removed .pgdata. Run "pnpm pg:start" to create a fresh cluster.');
}



function printUrl() {
  console.log(`DATABASE_URL="postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}"`);
}

const command = process.argv[2] ?? 'start';
const actions = { start, stop, status, reset };
const action = actions[command];

if (!action) {
  console.error(`Unknown command "${command}". Use: ${Object.keys(actions).join(' | ')}`);
  process.exit(1);
}

try {
  await action();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
