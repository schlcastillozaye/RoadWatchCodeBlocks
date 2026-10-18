import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.RW_WEB_PORT || 5173);
const ORIGIN = `http://localhost:${PORT}`;

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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('dialog', async (d) => { await d.dismiss().catch(() => {}); });

await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.navigateTo === 'function');
await page.evaluate(() => window.navigateTo('/login'));
await page.waitForSelector('#login-form');
await page.fill('#login-form input[name="email"]', 'admin@roadwatch.gov');
await page.fill('#login-form input[name="password"]', 'Admin@12345');
await page.click('#login-form button[type="submit"]');
await page.waitForSelector('#home-reports', { timeout: 20000 }).catch(() => {});

const ROUTES = ['/', '/reports', '/map', '/submit-report', '/admin', '/audit', '/assignments', '/nope-404'];
console.log('=== NAV PRESENCE + geometry @1440x900 (viewport 900 tall, top=0) ===');
for (const route of ROUTES) {
  await page.evaluate((r) => window.navigateTo(r), route);
  await page.waitForTimeout(1300);
  const info = await page.evaluate(() => {
    const g = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
    };
    return {
      hasHeader: !!document.querySelector('#root header'),
      header: g('#root header'),
      docH: document.documentElement.scrollHeight,
      map: g('#map'),
      legend: g('#map-legend'),
    };
  });
  console.log(`${route}: header=${info.hasHeader ? 'YES' : 'NO '} docH=${info.docH}`);
  if (info.header) console.log(`     header rect: ${JSON.stringify(info.header)}`);
  if (info.map) console.log(`     map   rect: ${JSON.stringify(info.map)}`);
  if (info.legend) console.log(`     legend rect: ${JSON.stringify(info.legend)}   <-- fixed to viewport bottom(900)`);
}

// card heights on home + reports
console.log('\n=== CARD ROWS (equal height per row?) ===');
for (const route of ['/', '/reports']) {
  await page.evaluate((r) => window.navigateTo(r), route);
  await page.waitForTimeout(1300);
  const rows = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('article.brand-card'));
    const byRow = {};
    cards.forEach((c) => {
      const r = c.getBoundingClientRect();
      const key = Math.round(r.top);
      (byRow[key] = byRow[key] || []).push(Math.round(r.height));
    });
    return { count: cards.length, rows: byRow };
  });
  console.log(`${route}: ${rows.count} cards; row heights: ${JSON.stringify(rows.rows)}`);
}

// dashboard grid + 404 shell fill
console.log('\n=== ADMIN STATS GRID ===');
await page.evaluate(() => window.navigateTo('/admin'));
await page.waitForTimeout(1200);
const g = await page.evaluate(() => {
  const el = document.querySelector('#stat-total')?.closest('.grid');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const kids = Array.from(el.children).map((c) => {
    const k = c.getBoundingClientRect();
    return { top: Math.round(k.top), w: Math.round(k.width) };
  });
  return { cols: getComputedStyle(el).gridTemplateColumns, top: Math.round(r.top), kids };
});
console.log(g ? `cols=${g.cols}\n  rows(by top): ${JSON.stringify([...new Set(g.kids.map((k) => k.top))])} widths=${JSON.stringify(g.kids.map((k) => k.w))}` : 'not found');

console.log('\n=== 404 SHELL FILL ===');
await page.evaluate(() => window.navigateTo('/nope-404'));
await page.waitForTimeout(900);
const nf = await page.evaluate(() => {
  const h = document.querySelector('#root header');
  const sec = document.querySelector('#root .rw-main > section');
  const r = sec ? sec.getBoundingClientRect() : null;
  return {
    hasHeader: !!h,
    headerBottom: h ? Math.round(h.getBoundingClientRect().bottom) : null,
    secTop: r ? Math.round(r.top) : null,
    secBottom: r ? Math.round(r.bottom) : null,
    vh: window.innerHeight,
    text: (document.querySelector('#root .rw-main h1') || {}).textContent,
  };
});
console.log(JSON.stringify(nf));

await browser.close();
process.exit(0);
