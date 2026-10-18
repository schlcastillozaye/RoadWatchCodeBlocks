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
await page.waitForFunction(() => typeof window.navigateTo === 'function', { timeout: 15000 });
await page.evaluate(() => window.navigateTo('/login'));
await page.waitForSelector('#login-form', { timeout: 15000 });
await page.fill('#login-form input[name="email"]', 'admin@roadwatch.gov');
await page.fill('#login-form input[name="password"]', 'Admin@12345');
await page.click('#login-form button[type="submit"]');
await page.waitForSelector('#home-reports', { timeout: 20000 }).catch(() => {});

const AUDIT = () => {
  function parseColor(s) {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function over(fg, bg) {
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }
  function lum(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratio(a, b) {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function effectiveBg(el) {
    let node = el;
    let stack = [];
    while (node && node.nodeType === 1) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) stack.push(c);
      node = node.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i], base);
    return base;
  }

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const direct = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(' ');
    if (!direct) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const fgRaw = parseColor(cs.color);
    if (!fgRaw) continue;
    const bg = effectiveBg(el);
    const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;
    const cr = ratio(fg, bg);
    const fs = parseFloat(cs.fontSize);
    const fw = parseInt(cs.fontWeight, 10) || 400;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const min = large ? 3 : 4.5;
    if (cr < min) {
      out.push({
        text: direct.slice(0, 42),
        cls: (el.className || '').toString().slice(0, 60),
        fs, fw,
        color: cs.color,
        bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
        cr: Math.round(cr * 100) / 100,
        min,
      });
    }
  }
  return out;
};

const ROUTES = ['/', '/reports', '/map', '/submit-report', '/admin', '/audit', '/login'];
const all = [];
for (const route of ROUTES) {
  await page.evaluate((r) => window.navigateTo(r), route);
  await page.waitForTimeout(1300);
  const bad = await page.evaluate(AUDIT);
  for (const b of bad) all.push({ route, ...b });
}

// dashboard grid info
await page.evaluate(() => window.navigateTo('/admin'));
await page.waitForTimeout(1200);
const gridInfo = await page.evaluate(() => {
  const grids = Array.from(document.querySelectorAll('.grid'));
  return grids.map((g) => ({
    cls: g.className,
    cols: getComputedStyle(g).gridTemplateColumns,
    children: g.children.length,
  }));
});

await browser.close();

console.log('=== CONTRAST FAILURES (WCAG AA) ===');
console.log('total:', all.length);
const seen = new Set();
for (const b of all) {
  const key = `${b.cls}|${b.color}|${b.bg}|${b.fs}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`[${b.route}] "${b.text}"  fs=${b.fs} fw=${b.fw}  color=${b.color} on ${b.bg}  ratio=${b.cr} (need ${b.min})`);
  console.log(`      class="${b.cls}"`);
}
console.log('\n=== DASHBOARD GRIDS ===');
for (const g of gridInfo) console.log(`children=${g.children} cols=${g.cols}  class="${g.cls}"`);
process.exit(0);
