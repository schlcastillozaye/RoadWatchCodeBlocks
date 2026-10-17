/* ---------------------------------------------------------------------------
   RoadWatch web app — real-browser E2E (Playwright-core + installed Edge).
   ---------------------------------------------------------------------------
   Serves the static app with `python -m http.server` and drives Microsoft Edge
   (channel: 'msedge').  No browsers are downloaded.

   IMPORTANT: the PHP API only emits CORS headers for its allow-listed origins
   (http://localhost:5173, http://localhost:3000, http://localhost).  The usual
   8080 static port is NOT allow-listed, so the browser would block every API
   call.  We therefore serve on an allow-listed origin (5173 by default).

   Because `python -m http.server` has no SPA fallback, in-app routes are driven
   through the SPA router (`window.navigateTo`) rather than direct deep-link
   GETs (a production host uses web/public/_redirects for that).

   Usage:  node tests/e2e.mjs
   --------------------------------------------------------------------------- */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.RW_WEB_PORT || 5173);
const ORIGIN = `http://localhost:${PORT}`;

const results = [];
const record = (id, name, pass, detail) => {
  results.push({ id, name, pass, detail });
  console.log(`\n[${pass ? 'PASS' : 'FAIL'}] ${id}. ${name}`);
  if (detail) console.log(detail);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`static server not reachable at ${url}`));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function startStaticServer() {
  const child = spawn('python', ['-m', 'http.server', String(PORT), '--directory', WEB_DIR], {
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', (err) => console.error('static server spawn error:', err.message));
  return child;
}

function makeCollector(page, label) {
  const entry = { consoleErrors: [], pageErrors: [], requestFailures: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') entry.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => entry.pageErrors.push(err.message));
  page.on('requestfailed', (req) => {
    entry.requestFailures.push(`${req.method()} ${req.url()} — ${(req.failure() || {}).errorText || 'failed'}`);
  });
  page.on('dialog', async (d) => { await d.dismiss().catch(() => {}); });
  return { entry, label, summary() {
    const errs = entry.consoleErrors.map((t) => `  console.error: ${t}`)
      .concat(entry.pageErrors.map((t) => `  pageerror: ${t}`))
      .concat(entry.requestFailures.map((t) => `  requestfailed: ${t}`));
    return errs.length ? errs.join('\n') : '  (no console/page errors)';
  } };
}

async function nav(page, route, waitFor) {
  await page.evaluate((r) => window.navigateTo(r), route);
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 });
}

async function login(page, email, password) {
  await nav(page, '/login', '#login-form');
  await page.fill('#login-form input[name="email"]', email);
  await page.fill('#login-form input[name="password"]', password);
  // Wait for the authenticated home page (only reachable once the login
  // request resolves and the token is stored) — NOT a bare `h1`, which matches
  // the login page itself and would resolve before the request completes.
  await Promise.all([
    page.waitForSelector('#home-reports', { timeout: 15000 }),
    page.click('#login-form button[type="submit"]'),
  ]);
  await page.waitForFunction(() => !!localStorage.getItem('roadwatch_auth_token'), { timeout: 15000 });
}

// When a saved storage state is injected, the app re-authenticates on load via
// GET /auth/me; wait until the signed-in identity is reflected in the UI.
async function waitAuthenticated(page, name) {
  await page.waitForSelector('#home-reports', { timeout: 15000 });
  if (name) await page.waitForFunction((n) => document.body.innerText.includes(n), name, { timeout: 15000 });
}

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVQ4jWNgGAWjYBSMglEwCkbBKBgFo2AUAAAHkgABiv0FOAAAAABJRU5ErkJggg==';

async function main() {
  // Saved once (scenario B) and reused by C/G so the suite only performs two
  // logins per run; the API throttles auth writes to 30 per 15 min per IP.
  let citizenState = null;
  const server = startStaticServer();
  const stop = () => { try { server.kill(); } catch { /* ignore */ } };
  process.on('exit', stop);

  const pngPath = path.join(os.tmpdir(), `roadwatch-e2e-${Date.now()}.png`);
  fs.writeFileSync(pngPath, Buffer.from(PNG_B64, 'base64'));

  try {
    await waitForServer(`${ORIGIN}/`);
  } catch (err) {
    console.error(`\nFATAL: could not start static server on ${ORIGIN}: ${err.message}`);
    stop();
    process.exit(1);
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // --- Scenario A: initial load, no errors ---------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const col = makeCollector(page, 'A');
    try {
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#root header, #login-form', { timeout: 15000 });
      await page.waitForFunction(() => {
        const el = document.querySelector('#home-reports');
        return el && !el.querySelector('.spinner');
      }, { timeout: 15000 }).catch(() => {});
      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      record('a', 'Load "/" with no uncaught console/page errors', clean, col.summary());
    } catch (err) {
      record('a', 'Load "/" with no uncaught console/page errors', false, `  ${err.message}\n${col.summary()}`);
    } finally {
      await context.close();
    }
  }

  // --- Scenario B: citizen login, name shown -------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const col = makeCollector(page, 'B');
    try {
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      await login(page, 'citizen@example.com', 'Citizen@12345');
      await page.waitForFunction(() => document.body.innerText.includes('Juan Dela Cruz'), { timeout: 15000 });
      const nameShown = await page.locator('text=Juan Dela Cruz').first().isVisible();
      const token = await page.evaluate(() => localStorage.getItem('roadwatch_auth_token'));
      if (nameShown && token) citizenState = await context.storageState();
      const ok = nameShown && !!token;
      record('b', 'Citizen login lands authenticated with name shown', ok,
        `  name visible: ${nameShown}, token stored: ${!!token}\n${col.summary()}`);
    } catch (err) {
      record('b', 'Citizen login lands authenticated with name shown', false, `  ${err.message}\n${col.summary()}`);
    } finally {
      await context.close();
    }
  }

  // --- Scenario C: submit a report -----------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['geolocation'], geolocation: { latitude: 14.7942, longitude: 120.879 }, storageState: citizenState || undefined });
    const page = await context.newPage();
    const col = makeCollector(page, 'C');
    const title = `E2E pothole ${Date.now()}`;
    try {
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      if (citizenState) await waitAuthenticated(page, 'Juan Dela Cruz');
      else await login(page, 'citizen@example.com', 'Citizen@12345');

      await nav(page, '/submit-report', '#report-form');
      // Set the location directly (and also exercise permissions).
      await page.evaluate(() => {
        document.querySelector('#lat-input').value = '14.7942';
        document.querySelector('#lon-input').value = '120.879';
      });
      await page.fill('input[name="title"]', title);
      await page.selectOption('select[name="category"]', 'POTHOLE');
      await page.fill('textarea[name="description"]', 'E2E automated submission: large pothole blocking the right lane.');
      await page.fill('input[name="areaLabel"]', 'E2E Area');
      await page.setInputFiles('input[name="photos"]', pngPath);
      await page.click('#report-form button[type="submit"]');

      await page.waitForSelector('#reports-list', { timeout: 15000 });
      await page.waitForFunction((t) => document.body.innerText.includes(t), title, { timeout: 15000 });
      const found = await page.locator(`text=${title}`).first().isVisible();
      // Own (non-approved) photos require a Bearer token: they must be fetched
      // and swapped to blob: URLs, not requested directly (which would 401/ORB).
      await page.waitForFunction(() => document.querySelectorAll('#reports-list img[src^="blob:"]').length > 0, { timeout: 15000 }).catch(() => {});
      const authedImages = await page.locator('#reports-list img[src^="blob:"]').count();
      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      record('c', 'Submit report (multipart + photo) and see it under /reports', found && authedImages > 0 && clean,
        `  report card visible: ${found}, private photos hydrated: ${authedImages}\n${col.summary()}`);
    } catch (err) {
      record('c', 'Submit report (multipart + photo) and see it under /reports', false, `  ${err.message}\n${col.summary()}`);
    } finally {
      await context.close();
    }
  }

  // --- Scenario D: admin dashboard, audit, reports -------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const col = makeCollector(page, 'D');
    try {
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      await login(page, 'admin@roadwatch.gov', 'Admin@12345');

      // /admin : stats render numbers (no ReferenceError)
      await nav(page, '/admin', '#stat-total');
      await page.waitForFunction(() => {
        const el = document.getElementById('stat-total');
        return el && el.textContent !== 'Loading...' && /^\d+$/.test(el.textContent.trim());
      }, { timeout: 15000 });
      const stats = await page.evaluate(() => ['stat-total', 'stat-pending', 'stat-approved', 'stat-completed']
        .map((id) => `${id}=${document.getElementById(id).textContent.trim()}`).join(', '));
      const recentRows = await page.locator('#recent-reports > div').count();

      // /audit : log rows render
      await nav(page, '/audit', '#audit-log');
      await page.waitForFunction(() => document.querySelectorAll('#audit-log > div').length > 0, { timeout: 15000 });
      const auditRows = await page.locator('#audit-log > div').count();

      // /reports : list page renders
      await nav(page, '/reports', '#reports-list');
      await page.waitForFunction(() => {
        const el = document.querySelector('#reports-list');
        return el && !el.querySelector('.spinner');
      }, { timeout: 15000 });
      const reportsRendered = await page.locator('#reports-list').isVisible();

      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      const ok = recentRows >= 1 && auditRows >= 1 && reportsRendered && clean;
      record('d', 'Admin: /admin stats + /audit rows + /reports list', ok,
        `  ${stats}\n  recent rows: ${recentRows}, audit rows: ${auditRows}, reports list visible: ${reportsRendered}\n${col.summary()}`);
    } catch (err) {
      record('d', 'Admin: /admin stats + /audit rows + /reports list', false, `  ${err.message}\n${col.summary()}`);
    } finally {
      await context.close();
    }
  }

  // --- Scenario E: map -----------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const col = makeCollector(page, 'E');
    try {
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      await nav(page, '/map', '.leaflet-container');
      await page.waitForSelector('.leaflet-marker-icon', { timeout: 15000 });
      const containers = await page.locator('.leaflet-container').count();
      const markers = await page.locator('.leaflet-marker-icon').count();
      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      record('e', 'Map renders Leaflet container with >= 1 marker, no console errors', containers >= 1 && markers >= 1 && clean,
        `  leaflet containers: ${containers}, markers: ${markers}\n${col.summary()}`);
    } catch (err) {
      record('e', 'Map renders Leaflet container with >= 1 marker, no console errors', false, `  ${err.message}\n${col.summary()}`);
    } finally {
      await context.close();
    }
  }

  // --- Scenario F: logged-out /reports redirects to /login -----------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const col = makeCollector(page, 'F');
    try {
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#root header, #login-form', { timeout: 15000 });
      await nav(page, '/reports', '#login-form');
      const url = new URL(page.url());
      const onLogin = url.pathname.replace(/\/+$/, '') === '/login';
      const formShown = await page.locator('#login-form').isVisible();
      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      record('f', 'Logged-out /reports redirects to /login', onLogin && formShown && clean,
        `  pathname: ${url.pathname}, login form visible: ${formShown}\n${col.summary()}`);
    } catch (err) {
      record('f', 'Logged-out /reports redirects to /login', false, `  ${err.message}\n${col.summary()}`);
    } finally {
      await context.close();
    }
  }

  // --- Scenario G: no horizontal overflow at 3 viewports -------------------
  {
    const context = await browser.newContext({ storageState: citizenState || undefined });
    const page = await context.newPage();
    const col = makeCollector(page, 'G');
    const viewports = [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ];
    let allOk = true;
    const lines = [];
    try {
      await page.setViewportSize(viewports[0]);
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      if (citizenState) await waitAuthenticated(page, 'Juan Dela Cruz');
      else await login(page, 'citizen@example.com', 'Citizen@12345');

      for (const route of ['/', '/reports', '/submit-report', '/map']) {
        await nav(page, route, '#root header, #reports-list, #report-form, .leaflet-container');
        await wait(250);
        for (const vp of viewports) {
          await page.setViewportSize(vp);
          await wait(150);
          const m = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          }));
          const overflow = m.scrollWidth > m.innerWidth + 2;
          if (overflow) allOk = false;
          lines.push(`  ${route} @ ${vp.width}x${vp.height}: scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth} ${overflow ? '<-- OVERFLOW' : 'ok'}`);
        }
      }
      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      record('g', 'No horizontal overflow at 375/768/1440 widths', allOk && clean, `${lines.join('\n')}\n${col.summary()}`);
    } catch (err) {
      record('g', 'No horizontal overflow at 375/768/1440 widths', false, `  ${err.message}\n${lines.join('\n')}\n${col.summary()}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  stop();

  try { fs.unlinkSync(pngPath); } catch { /* ignore */ }

  console.log('\n================ SUMMARY ================');
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}. ${r.name}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`=========================================`);
  console.log(`${results.length - failed}/${results.length} scenarios passed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
