import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.RW_WEB_PORT || 5191);
const ORIGIN = `http://localhost:${PORT}`;
const OUT = process.env.RW_SHOT_DIR || path.join(process.env.TEMP || '.', 'opencode', 'shots');
fs.mkdirSync(OUT, { recursive: true });

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(true); });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('server not reachable'));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

const server = spawn('python', ['-m', 'http.server', String(PORT), '--directory', WEB_DIR], { stdio: 'ignore', windowsHide: true });
process.on('exit', () => { try { server.kill(); } catch {} });

await waitForServer(`${ORIGIN}/`);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('dialog', async (d) => { await d.dismiss().catch(() => {}); });
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

const VIEWPORTS = [
  { w: 1440, h: 900, tag: 'desktop' },
  { w: 768, h: 1024, tag: 'tablet' },
  { w: 375, h: 667, tag: 'mobile' },
];
const ROUTES = ['/', '/reports', '/map', '/submit-report', '/admin', '/audit', '/login'];

await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });

// login screen first (logged out) at all viewports
for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `login-${vp.tag}.png`) });
}
await page.setViewportSize({ width: 1440, height: 900 });

// log in
if (await page.locator('#login-form').count()) {
  await page.fill('#login-form input[name="email"]', 'admin@roadwatch.gov');
  await page.fill('#login-form input[name="password"]', 'Admin@12345');
  await page.click('#login-form button[type="submit"]');
}
await page.waitForSelector('#home-reports', { timeout: 20000 }).catch(() => console.log('WARN: #home-reports not found'));

for (const route of ROUTES) {
  await page.evaluate((r) => window.navigateTo(r), route);
  await page.waitForTimeout(1400);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(450);
    const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
    await page.screenshot({ path: path.join(OUT, `${name}-${vp.tag}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

await browser.close();
console.log('screenshots written to', OUT);
process.exit(0);
