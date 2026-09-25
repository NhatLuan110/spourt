#!/usr/bin/env node
/**
 * Capture the main screens in both themes and both breakpoints.
 * Used to eyeball the design system without clicking through the app.
 *
 *   node scripts/screenshot.mjs [outputDir]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.env.WEB_URL ?? 'http://localhost:3000';
const OUT = resolve(process.argv[2] ?? 'screenshots');

const SHOTS = [
  { name: 'landing', path: '/', full: true },
  { name: 'login', path: '/login', full: false },
  { name: 'register', path: '/register', full: false },
  { name: 'dev-ui', path: '/dev/ui', full: true },
];

const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'mobile', width: 375, height: 812 },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      colorScheme: theme,
    });
    const page = await context.newPage();

    for (const shot of SHOTS) {
      // Mobile full-page shots of the gallery are enormous; keep those desktop only.
      if (shot.full && viewport.key === 'mobile' && shot.name === 'dev-ui') continue;

      await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
      await page.evaluate((value) => {
        document.documentElement.setAttribute('data-theme', value);
      }, theme);
      await page.waitForTimeout(350);

      const file = join(OUT, `${shot.name}-${viewport.key}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: shot.full });
      console.log(file);
    }

    await context.close();
  }
}

await browser.close();
