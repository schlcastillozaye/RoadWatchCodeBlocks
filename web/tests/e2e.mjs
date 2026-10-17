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
  page.on('dialog', async (d) => {
    if (page.acceptNextDialog) {
      page.acceptNextDialog = false;
      page.lastDialogMessage = d.message();
      await d.accept().catch(() => {});
      return;
    }
    await d.dismiss().catch(() => {});
  });
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
  const landing = email === 'admin@roadwatch.gov' ? '#admin-dashboard-title' : '#home-reports';
  await Promise.all([
    page.waitForSelector(landing, { timeout: 15000 }),
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
  let submittedReportTitle = null;
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
      const signInShown = await page.locator('#login-form').isVisible();
      const onSignInRoute = new URL(page.url()).pathname === '/login';
      const publicContentHidden = await page.locator('#home-reports, #reports-list, .leaflet-container').count() === 0;
      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      record('a', 'Default landing page requires sign-in', signInShown && onSignInRoute && publicContentHidden && clean,
        `  sign-in visible: ${signInShown}, sign-in route: ${onSignInRoute}, public content hidden: ${publicContentHidden}\n${col.summary()}`);
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
      await nav(page, '/admin', '#home-reports');
      const adminDenied = new URL(page.url()).pathname === '/' && await page.locator('#admin-dashboard-title').count() === 0;
      const ok = nameShown && !!token && adminDenied;
      record('b', 'Citizen login and admin-only route protection', ok,
        `  name visible: ${nameShown}, token stored: ${!!token}, admin route denied: ${adminDenied}\n${col.summary()}`);
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
      if (found) submittedReportTitle = title;
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

      const adminLandedDirectly = new URL(page.url()).pathname === '/admin'
        && await page.locator('#admin-dashboard-title').isVisible()
        && await page.locator('#home-reports').count() === 0;
      await nav(page, '/admin', '#stat-total');
      await page.waitForFunction(() => {
        const el = document.getElementById('stat-total');
        return el && el.textContent !== 'Loading...' && /^\d+$/.test(el.textContent.trim());
      }, { timeout: 15000 });
      await page.waitForSelector(
        '#admin-dashboard-reports .admin-table tbody tr, #admin-dashboard-reports .admin-empty, #admin-dashboard-reports .admin-error-block',
        { timeout: 15000 }
      );
      const stats = await page.evaluate(() => ['stat-total', 'stat-pending', 'stat-approved', 'stat-rejected', 'stat-under-repair']
        .map((id) => `${id}=${document.getElementById(id).textContent.trim()}`).join(', '));
      const totalBefore = Number(stats.match(/stat-total=(\d+)/)?.[1]);
      const recentRows = await page.locator('#admin-dashboard-reports tbody > tr').count();

      let deletionOk = false;
      if (submittedReportTitle) {
        await nav(page, '/admin/reports', '#admin-report-filters');
        await page.fill('#admin-report-filters input[name="search"]', submittedReportTitle);
        await page.selectOption('#admin-report-filters select[name="status"]', 'moderationStatus:PENDING_REVIEW');
        await page.click('#admin-report-filters button[type="submit"]');
        const row = page.locator('#admin-reports-list tbody tr').filter({ hasText: submittedReportTitle });
        await row.waitFor({ state: 'visible', timeout: 15000 });
        const deleteButton = row.locator('[data-delete-report]');

        await page.route('**/api/admin/reports/**', (route) => route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Simulated deletion failure' } }),
        }));
        const consoleErrorsBeforeExpectedFailure = col.entry.consoleErrors.length;
        page.acceptNextDialog = true;
        await deleteButton.click();
        await page.waitForFunction(() => document.querySelector('#admin-reports-feedback')?.textContent.includes('Simulated deletion failure'));
        const errorVisible = (await page.locator('#admin-reports-feedback').innerText()).includes('Simulated deletion failure');
        const retryEnabled = await row.locator('[data-delete-report]').isEnabled();
        const expectedFailureErrors = col.entry.consoleErrors.slice(consoleErrorsBeforeExpectedFailure);
        const expectedHttpFailureObserved = expectedFailureErrors.length === 1
          && expectedFailureErrors[0].includes('status of 500 (Internal Server Error)');
        if (expectedHttpFailureObserved) col.entry.consoleErrors.splice(consoleErrorsBeforeExpectedFailure, 1);
        await page.unroute('**/api/admin/reports/**');

        const reference = await row.locator('[data-delete-report]').getAttribute('data-report-reference');
        page.acceptNextDialog = true;
        await row.locator('[data-delete-report]').click();
        await page.waitForSelector('#admin-reports-list .admin-empty', { timeout: 15000 });
        const confirmation = page.lastDialogMessage || '';
        const successVisible = (await page.locator('#admin-reports-feedback').innerText()).includes('was deleted');
        await nav(page, '/admin', '#stat-total');
        await page.waitForFunction((before) => {
          const el = document.getElementById('stat-total');
          return el && /^\d+$/.test(el.textContent.trim()) && Number(el.textContent.trim()) === before - 1;
        }, totalBefore, { timeout: 15000 });
        const totalAfter = Number((await page.locator('#stat-total').innerText()).trim());
        deletionOk = expectedHttpFailureObserved && errorVisible && retryEnabled && successVisible
          && confirmation.includes(submittedReportTitle) && confirmation.includes(reference || '')
          && totalAfter === totalBefore - 1;
      }

      // /audit : log rows render
      await nav(page, '/audit', '#audit-log');
      await page.waitForFunction(() => document.querySelectorAll('#audit-log > div').length > 0, { timeout: 15000 });
      const auditRows = await page.locator('#audit-log > div').count();

      await nav(page, '/admin/users', '#admin-users-list');
      await page.waitForFunction(() => {
        const el = document.querySelector('#admin-users-list');
        return el && !el.querySelector('.spinner');
      }, { timeout: 15000 });
      const usersRendered = await page.locator('#admin-users-list .admin-user-table, #admin-users-list .admin-empty').count() > 0;

      let adminResponsive = true;
      for (const route of ['/admin', '/admin/reports', '/admin/users']) {
        await nav(page, route, route === '/admin' ? '#admin-dashboard-title' : route === '/admin/reports' ? '#admin-report-filters' : '#admin-user-filters');
        for (const viewport of [
          { width: 375, height: 667 },
          { width: 768, height: 1024 },
          { width: 1024, height: 768 },
          { width: 1440, height: 900 },
        ]) {
          await page.setViewportSize(viewport);
          await wait(100);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
          if (overflow) adminResponsive = false;
        }
      }

      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      const ok = adminLandedDirectly && recentRows >= 1 && deletionOk && auditRows >= 1 && usersRendered && adminResponsive && clean;
      record('d', 'Admin landing, dashboard, user directory, and safe report deletion', ok,
        `  direct admin landing: ${adminLandedDirectly}\n  ${stats}\n  recent rows: ${recentRows}, deletion + error recovery: ${deletionOk}, audit rows: ${auditRows}, users visible: ${usersRendered}, admin responsive at 4 widths: ${adminResponsive}\n${col.summary()}`);
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
      await login(page, 'citizen@example.com', 'Citizen@12345');
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
      const reportsRedirected = new URL(page.url()).pathname === '/login' && await page.locator('#login-form').isVisible();
      await nav(page, '/map', '#login-form');
      const mapRedirected = new URL(page.url()).pathname === '/login' && await page.locator('#login-form').isVisible()
        && await page.locator('.leaflet-container').count() === 0;
      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      record('f', 'Logged-out report and map routes redirect to sign-in', reportsRedirected && mapRedirected && clean,
        `  reports redirected: ${reportsRedirected}, map redirected: ${mapRedirected}\n${col.summary()}`);
    } catch (err) {
      record('f', 'Logged-out /reports redirects to /login', false, `  ${err.message}\n${col.summary()}`);
    } finally {
      await context.close();
    }
  }

  // --- Scenario G: no horizontal overflow at the target viewport sizes -----
  {
    const context = await browser.newContext({ storageState: citizenState || undefined });
    const page = await context.newPage();
    const col = makeCollector(page, 'G');
    const viewports = [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
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
      record('g', 'No horizontal overflow at 375/768/1024/1440 widths', allOk && clean, `${lines.join('\n')}\n${col.summary()}`);
    } catch (err) {
      record('g', 'No horizontal overflow at 375/768/1024/1440 widths', false, `  ${err.message}\n${lines.join('\n')}\n${col.summary()}`);
    } finally {
      await context.close();
    }
  }

  // --- Scenario H: runtime API override drives the login URL ---------------
  // Reproduces the deployed setup: the container serves rw-runtime-config.js
  // with the RW_API_BASE_URL value. The login POST must go to THAT origin with a
  // single /api segment — the production bug was the request falling back to the
  // static frontend origin (405 Method Not Allowed).
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const col = makeCollector(page, 'H');
    const override = 'http://127.0.0.1:4000';
    const loginUrls = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/auth/login')) loginUrls.push(req.url());
    });
    try {
      // Stand in for the container-generated runtime config file.
      await page.route(/\/rw-runtime-config\.js(\?|$)/, (route) => route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `window.RW_API_BASE_URL = "${override}";\nwindow.RW_API_BASE = "${override}";\n`,
      }));

      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      const resolved = await page.evaluate(() => window.RW_API_BASE);
      await login(page, 'citizen@example.com', 'Citizen@12345');

      const expected = `${override}/api/auth/login`;
      const hit = loginUrls.includes(expected);
      const noDupApi = loginUrls.every((u) => !u.includes('/api/api/'));
      const clean = col.entry.consoleErrors.length === 0 && col.entry.pageErrors.length === 0;
      record('h', 'Runtime RW_API_BASE_URL override drives the login request', hit && noDupApi && resolved === override && clean,
        `  window.RW_API_BASE: ${resolved}\n  login POST url(s): ${loginUrls.join(', ') || '(none)'}\n  expected: ${expected}\n${col.summary()}`);
    } catch (err) {
      record('h', 'Runtime RW_API_BASE_URL override drives the login request', false,
        `  ${err.message}\n  login POST url(s): ${loginUrls.join(', ') || '(none)'}\n${col.summary()}`);
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
