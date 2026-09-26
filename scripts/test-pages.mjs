import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Run against the built artifact or pass the deployed project URL as argv[2].
const root = fileURLToPath(new URL('../apps/web/out-pages/', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
let server;
let browser;
let base = process.argv[2];
try {
  if (!base) {
    server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith('/spourt/')) { response.writeHead(404).end(); return; }
      const relative = decodeURIComponent(url.pathname.slice('/spourt/'.length)) || 'index.html';
      const target = resolve(root, relative);
      if (!target.startsWith(resolve(root) + sep)) { response.writeHead(403).end(); return; }
      try {
        if (!(await stat(target)).isFile()) throw new Error('not a file');
        response.setHeader('content-type', mime[extname(target)] || 'application/octet-stream');
        response.end(await readFile(target));
      } catch { response.writeHead(404).end(); }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}/spourt/`;
  }
  browser = await chromium.launch({ headless: true, channel: process.env.PAGES_BROWSER_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  if (!process.argv[2]) {
    // The built site calls the hosted API. A sleeping or redeploying free API
    // must not stall `networkidle`, so the artifact check treats it as offline.
    await page.route(url => !url.href.startsWith(base) && url.pathname.includes('/api/v1/'), route => route.abort());
  }
  const errors = [];
  const failedAssets = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(base) && response.status() >= 400) failedAssets.push(response.url());
  });
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);
  await page.locator('h1').waitFor();
  assert.match(await page.title(), /Sprout/);
  assert.equal(await page.locator('header').evaluate(el => getComputedStyle(el).display), 'flex');
  assert.equal(await page.locator('section').first().evaluate(el => getComputedStyle(el).display), 'grid');
  console.log('PASS: homepage, JavaScript and styles render.');

  await page.locator('header a').click();
  await page.waitForURL('**/#/login');
  await page.locator('input[type=email]').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('input[type=password]').waitFor();
  await page.locator('a[href$="#/register"]').click();
  await page.locator('input[autocomplete=nickname]').waitFor();
  await page.goBack();
  await page.waitForURL('**/#/login');
  console.log('PASS: navigation, direct links, reload and browser back.');

  // This deployment deliberately has no backend until hosting authentication is complete.
  if (await page.locator('.service-notice').count()) {
    assert.equal(await page.locator('button[type=submit]').isDisabled(), true);
    await page.goto(`${base}#/word/example`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/#/login');
    console.log('PASS: unavailable sign-in is explained and protected routes stay protected.');
  }
  await page.goto(`${base}#/not-a-real-page`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Không tìm thấy trang' }).waitFor();
  console.log('PASS: unknown route renders a useful page.');

  const data = await page.request.get(`${base}hanzi-data/%E4%BD%A0.json`);
  assert.equal(data.status(), 200);
  assert.ok((await data.json()).strokes.length > 0);
  console.log('PASS: bundled data loads from the project directory.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  console.log('PASS: mobile homepage fits the viewport.');
  assert.deepEqual(errors, [], 'Browser exceptions');
  assert.deepEqual(failedAssets, [], 'Missing site resources');
  console.log(`PASS: ${base}`);
} finally {
  await browser?.close();
  await new Promise(done => server ? server.close(done) : done());
}
