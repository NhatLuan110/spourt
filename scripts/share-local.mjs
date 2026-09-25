#!/usr/bin/env node
// Run with: node scripts/share-local.mjs
// Keeps the public link alive until this process is stopped with Ctrl+C.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readEnvFile } from './lib/read-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = join(root, '.deploy');
const tunnelExe = join(stateDir, 'cloudflared.exe');
const webDir = join(root, 'apps/web');
const children = new Set();
let stopping = false;
mkdirSync(stateDir, { recursive: true });

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  console.log('\nDa dung chia se. Link cong khai khong con hoat dong.');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', () => { for (const child of children) child.kill(); });

function launch(name, executable, args, options = {}) {
  const log = createWriteStream(join(stateDir, `${name}.log`), { flags: 'w' });
  const child = spawn(executable, args, {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  children.add(child);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  // Drain final child output before closing its log during shutdown.
  child.once('close', () => log.end());
  child.on('error', (error) => {
    console.error(`${name}: ${error.message}`);
    process.exitCode = 1;
    stop();
  });
  child.on('exit', (code) => {
    children.delete(child);
    if (!stopping && name !== 'postgres') {
      console.error(`${name} da dung (ma ${code}). Xem .deploy/${name}.log`);
      process.exitCode = 1;
      stop();
    }
  });
  return child;
}

async function requireFreePort(port) {
  const probe = createServer();
  await new Promise((resolveProbe, reject) => {
    probe.once('error', () => reject(new Error(`Cong ${port} dang duoc dung. Dung ban web/API cu roi mo lai tep nay.`)));
    probe.listen(port, '127.0.0.1', resolveProbe);
  });
  await new Promise((resolveProbe) => probe.close(resolveProbe));
}

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (stopping) throw new Error(`${label} da dung.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      const body = await response.text();
      if (response.ok) return body;
    } catch { /* The owned service is still starting. */ }
    await delay(1000);
  }
  throw new Error(`${label} chua san sang. Kiem tra cac log trong .deploy.`);
}

try {
  if (!existsSync(tunnelExe)) throw new Error('Thieu .deploy/cloudflared.exe. Can tai cloudflared tu Cloudflare.');
  if (!existsSync(join(webDir, '.next/BUILD_ID'))) throw new Error('Chua co ban build web. Can build voi API_ORIGIN=http://127.0.0.1:4000 va NEXT_PUBLIC_API_URL=/api/v1.');
  const routes = JSON.parse(readFileSync(join(webDir, '.next/routes-manifest.json'), 'utf8'));
  const rewrites = Array.isArray(routes.rewrites) ? routes.rewrites : Object.values(routes.rewrites).flat();
  if (!rewrites.some((route) => route.source === '/api/v1/:path*' && route.destination === 'http://127.0.0.1:4000/api/v1/:path*')) {
    throw new Error('Ban build chua noi API local. Can build lai voi API_ORIGIN=http://127.0.0.1:4000 va NEXT_PUBLIC_API_URL=/api/v1.');
  }
  await requireFreePort(3000);
  await requireFreePort(4000);

  console.log('Dang bat co so du lieu...');
  const postgres = launch('postgres', process.execPath, ['scripts/local-postgres.mjs', 'start']);
  const pgCode = await new Promise((resolveExit, reject) => {
    postgres.once('exit', resolveExit);
    postgres.once('error', reject);
  });
  if (pgCode !== 0) throw new Error('Khong bat duoc PostgreSQL. Xem .deploy/postgres.log.');

  console.log('Dang bat web...');
  launch('web', process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3000', '--hostname', '127.0.0.1'], {
    cwd: webDir,
    env: { ...process.env, NODE_ENV: 'production', API_ORIGIN: 'http://127.0.0.1:4000', NEXT_PUBLIC_API_URL: '/api/v1' },
  });
  await waitFor('http://127.0.0.1:3000/login', 'Web');

  console.log('Dang tao link cong khai...');
  // Empty POST requests must keep Content-Length: 0. Chunked requests without
  // Content-Type make Fastify reject session refresh/logout with HTTP 415.
  const tunnel = launch('tunnel', tunnelExe, ['tunnel', '--url', 'http://127.0.0.1:3000', '--no-autoupdate', '--protocol', 'http2', '--no-chunked-encoding']);
  const url = await new Promise((resolveUrl, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chua tao duoc link. Xem .deploy/tunnel.log.')), 90000);
    const collect = (chunk) => {
      output = (output + chunk.toString()).slice(-20000);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) { clearTimeout(timer); resolveUrl(match[0]); }
    };
    tunnel.stdout.on('data', collect);
    tunnel.stderr.on('data', collect);
    tunnel.once('exit', () => { clearTimeout(timer); reject(new Error('Duong ket noi cong khai da dung.')); });
    tunnel.once('error', (error) => { clearTimeout(timer); reject(error); });
  });

  // Quick tunnels can be removed remotely while cloudflared stays alive and
  // retries forever. Report that terminal condition instead of leaving a dead
  // URL looking healthy in the user's terminal and link file.
  let tunnelLogTail = '';
  const monitorTunnel = (chunk) => {
    if (stopping) return;
    tunnelLogTail = (tunnelLogTail + chunk.toString()).slice(-2000);
    if (!tunnelLogTail.includes('Unauthorized: Tunnel not found')) return;
    console.error('\nCloudflare da huy link tam. Can tao link moi va gui lai cho nguoi nhan.');
    console.error('Chay lai: node "' + join(root, 'scripts/share-local.mjs') + '"');
    const linkFile = join(stateDir, 'LINK-WEB.txt');
    if (existsSync(linkFile) && readFileSync(linkFile, 'utf8').split(/\r?\n/)[0] === url) {
      writeFileSync(linkFile, 'Link tam da mat hieu luc. Mo lai CHIA-SE-WEB.cmd de tao link moi.\n', 'utf8');
    }
    process.exitCode = 1;
    stop();
  };
  tunnel.stdout.on('data', monitorTunnel);
  tunnel.stderr.on('data', monitorTunnel);

  console.log('Dang noi API va du lieu hoc...');
  const localEnv = readEnvFile(join(root, '.env'));
  const keyDir = existsSync(join(root, '.keys/jwt-private.pem')) ? join(root, '.keys') : join(root, 'apps/api/.keys');
  launch('api', process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...localEnv,
      ...process.env,
      NODE_ENV: 'production',
      PORT: '4000',
      WEB_ORIGIN: url,
      COOKIE_DOMAIN: '',
      STORAGE_PUBLIC_URL: '/media',
      JWT_PRIVATE_KEY: localEnv.JWT_PRIVATE_KEY || readFileSync(join(keyDir, 'jwt-private.pem'), 'utf8'),
      JWT_PUBLIC_KEY: localEnv.JWT_PUBLIC_KEY || readFileSync(join(keyDir, 'jwt-public.pem'), 'utf8'),
    },
  });
  const readiness = JSON.parse(await waitFor('http://127.0.0.1:4000/readyz', 'API'));
  if (!readiness.checks?.database) throw new Error('API chua ket noi duoc database.');
  const refresh = await fetch('http://127.0.0.1:3000/api/v1/auth/refresh', { method: 'POST', signal: AbortSignal.timeout(10000) });
  if (refresh.status !== 401) throw new Error(`API proxy tra ve ma khong mong doi: ${refresh.status}`);

  writeFileSync(join(stateDir, 'LINK-WEB.txt'), `${url}\n\nGiu cua so CHIA-SE-WEB va may tinh dang bat, co Internet.\nNhan Ctrl+C de dung chia se. Mo lai se tao link moi.\n`, 'utf8');
  writeFileSync(join(stateDir, 'sharing.json'), JSON.stringify({ url, startedAt: new Date().toISOString(), pid: process.pid, tunnelPid: tunnel.pid }, null, 2));
  console.log(`\nLINK GUI CHO NGUOI KHAC:\n\n  ${url}\n`);
  console.log('Da kiem tra web, database va API local. Dang kiem tra link ben ngoai...');
  try {
    await waitFor(`${url}/login`, 'Link cong khai');
    const publicRefresh = await fetch(`${url}/api/v1/auth/refresh`, { method: 'POST', signal: AbortSignal.timeout(15000) });
    if (publicRefresh.status !== 401) throw new Error(`API cong khai tra ve ${publicRefresh.status}`);
    console.log('Link cong khai da phan hoi thanh cong.');
  } catch {
    console.log('Chua xac minh duoc link tu may nay. Thu mo link bang dien thoai/4G sau vai giay.');
  }
  console.log('\nGiu cua so nay mo, may tinh dang bat va co Internet.');
  console.log('Nhan Ctrl+C de dung chia se. Mo lai tep se tao link moi.');
  console.log('Link duoc luu o E:\\sprout\\.deploy\\LINK-WEB.txt');
} catch (error) {
  console.error(`\nLoi: ${error.message}`);
  process.exitCode = 1;
  stop();
}
