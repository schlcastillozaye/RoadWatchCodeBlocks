/* TEMPORARY UI audit — collects undefined classes + layout metrics. Not committed. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.RW_WEB_PORT || 5188);
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

// --- defined class names from the served stylesheets -------------------------
function definedClasses(cssText) {
  const set = new Set();
  const re = /\.((?:[A-Za-z0-9_-]|\\.)+)/g;
  let m;
  while ((m = re.exec(cssText))) set.add(m[1].replace(/\\/g, ''));
  return set;
}

const cssFiles = ['css/styles.css', 'vendor/leaflet.css'];
const defined = new Set();
for (const f of cssFiles) {
  const p = path.join(WEB_DIR, f);
  if (!fs.existsSync(p)) continue;
  for (const c of definedClasses(fs.readFileSync(p, 'utf8'))) defined.add(c);
}
const IGNORE = /^(leaflet|marker|sr-only)/;

const ROUTES = ['/', '/reports', '/submit-report', '/map', '/admin', '/audit', '/users', '/assignments'];
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 768, h: 1024 },
  { w: 375, h: 667 },
];

const server = spawn('python', ['-m', 'http.server', String(PORT), '--directory', WEB_DIR], { stdio: 'ignore', windowsHide: true });
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);

try {
  await waitForServer(`${ORIGIN}/`);
} catch (e) {
  console.error('FATAL', e.message); stop(); process.exit(1);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('dialog', async (d) => { await d.dismiss().catch(() => {}); });

await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
// log in as admin (widest UI)
await page.waitForSelector('#login-form, #root header', { timeout: 15000 });
if (await page.locator('#login-form').count()) {
  await page.fill('#login-form input[name="email"]', 'admin@roadwatch.gov');
  await page.fill('#login-form input[name="password"]', 'Admin@12345');
  await page.click('#login-form button[type="submit"]');
}
await page.waitForSelector('#home-reports', { timeout: 20000 });

const used = new Set();
const perRoute = {};

for (const route of ROUTES) {
  await page.evaluate((r) => window.navigateTo(r), route);
  await page.waitForTimeout(1200);
  const classes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('*')).flatMap((el) => Array.from(el.classList)));
  classes.forEach((c) => used.add(c));
  perRoute[route] = new Set(classes);
}

const missing = [...used].filter((c) => !defined.has(c) && !IGNORE.test(c)).sort();

// --- layout metrics at each viewport ----------------------------------------
const layout = {};
for (const route of ['/', '/reports', '/map', '/admin', '/submit-report']) {
  await page.evaluate((r) => window.navigateTo(r), route);
  await page.waitForTimeout(900);
  layout[route] = {};
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(350);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const overflowing = [];
      for (const el of document.querySelectorAll('*')) {
        const p = el.parentElement;
        if (!p) continue;
        const pr = p.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) {
          overflowing.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : '.' + (el.className || '').toString().split(' ').slice(0, 3).join('.')} (w=${Math.round(r.width)} p.w=${Math.round(pr.width)})`);
        }
      }
      return {
        scrollWidth: de.scrollWidth,
        innerWidth: window.innerWidth,
        hOverflow: de.scrollWidth > window.innerWidth + 2,
        overflowing: overflowing.slice(0, 8),
      };
    });
    layout[route][`${vp.w}`] = m;
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

await browser.close();
stop();

console.log('=== MISSING CLASSES USED BY app.js MARKUP (no CSS rule) ===');
console.log(`count=${missing.length}`);
console.log(missing.join('\n'));

console.log('\n=== LAYOUT (scrollWidth vs innerWidth, and child-overflows-parent) ===');
for (const [route, vps] of Object.entries(layout)) {
  for (const [w, m] of Object.entries(vps)) {
    console.log(`${route} @${w}: scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth} hOverflow=${m.hOverflow}`);
    for (const o of m.overflowing) console.log('    overflow: ' + o);
  }
}
process.exit(0);
