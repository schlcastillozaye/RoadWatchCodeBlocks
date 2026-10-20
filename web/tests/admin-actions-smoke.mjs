import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const requested = path.resolve(WEB_DIR, `.${pathname}`);
  const file = pathname === '/' ? path.join(WEB_DIR, 'index.html') : requested;
  if (!file.startsWith(WEB_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const consoleErrors = [];
const pageErrors = [];
await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
  route.fulfill({ status: 204, body: '' }));
const verificationRequests = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

const admin = {
  id: 'admin-ui-test',
  fullName: 'Synthetic Administrator',
  email: 'admin-ui-test@example.invalid',
  role: 'ADMIN',
};
const reports = {
  pending: {
    id: 'pending',
    title: 'Synthetic pending report',
    referenceNo: 'UI-PENDING',
    description: 'Synthetic report for the UI regression check.',
    category: 'POTHOLE',
    moderationStatus: 'PENDING_REVIEW',
    repairStatus: 'NOT_ASSIGNED',
  },
  verification: {
    id: 'verification',
    title: 'Synthetic verification report',
    referenceNo: 'UI-VERIFY',
    description: 'Synthetic report awaiting admin verification.',
    category: 'POTHOLE',
    moderationStatus: 'APPROVED',
    repairStatus: 'AWAITING_VERIFICATION',
    assignedOfficer: { id: 'officer-ui-test', fullName: 'Synthetic Officer' },
    completionNotes: 'Synthetic completion evidence notes.',
  },
};

page.route('**/api/**', async (route) => {
  const requestUrl = new URL(route.request().url());
  const endpoint = requestUrl.pathname.replace(/^\/api/, '');
  let body = {};

  if (endpoint === '/auth/me') {
    body = { user: admin };
  } else if (endpoint === '/reports/stats') {
    body = { totals: { total: 2, pending: 1, approved: 1, rejected: 0 } };
  } else if (endpoint === '/reports') {
    body = { items: [], total: 0, page: 1, totalPages: 1 };
  } else if (endpoint === '/notifications') {
    body = { notifications: [] };
  } else if (endpoint.endsWith('/history')) {
    body = { history: [] };
  } else if (endpoint.endsWith('/verification') && route.request().method() === 'PATCH') {
    verificationRequests.push(JSON.parse(route.request().postData() || '{}'));
    body = { report: reports.verification };
  } else {
    const reportId = endpoint.split('/').filter(Boolean).at(-1);
    if (reports[reportId]) {
      body = {
        report: {
          ...reports[reportId],
          areaLabel: 'Synthetic test location',
          latitude: 14.6,
          longitude: 121.0,
          createdAt: '2026-10-20T00:00:00.000Z',
          updatedAt: '2026-10-20T00:00:00.000Z',
          photos: [],
        },
      };
    }
  }

  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

try {
  await page.addInitScript(() => localStorage.setItem('roadwatch_auth_token', 'synthetic-ui-test-token'));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#admin-dashboard-title', { timeout: 15000 });

  const checks = [];
  let responsive = true;
  for (const [reportId, expectedButtons] of [
    ['pending', ['Approve report', 'Reject report']],
    ['verification', ['Verify completion', 'Return for further work']],
  ]) {
    await page.evaluate((id) => window.navigateTo(`/report/${id}`), reportId);
    const actions = page.locator('.rw-staff-actions');
    await actions.waitFor({ state: 'visible', timeout: 10000 });
    const heading = (await actions.locator('h2').innerText()).trim();
    const present = {};
    for (const label of expectedButtons) {
      present[label] = await actions.getByRole('button', { name: label }).isVisible();
    }
    const viewportChecks = [];
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
      viewportChecks.push({ ...viewport, noOverflow });
      responsive = responsive && noOverflow;
    }
    checks.push({ reportId, heading, present, viewportChecks });
  }

  await page.setViewportSize({ width: 375, height: 667 });
  await page.evaluate(() => window.navigateTo('/report/verification'));
  await page.locator('[data-repair-return]').click();
  const returnDialog = page.locator('dialog.rw-confirm-dialog');
  await returnDialog.waitFor({ state: 'visible', timeout: 5000 });
  const reasonFieldRequired = await returnDialog.locator('textarea[required]').count() === 1;
  await returnDialog.locator('textarea').fill('Evidence is incomplete.');
  await returnDialog.getByRole('button', { name: 'Return for work' }).click();
  await returnDialog.waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('#rw-notifications')?.innerText.includes('Repair returned'));
  const returnRequest = verificationRequests.at(-1);

  const adminText = await page.locator('body').innerText();
  const staleBrandVisible = /ROADWATCH/i.test(adminText);
  const passed = checks.every(({ heading, present }) => heading === 'Admin actions'
    && Object.values(present).every(Boolean))
    && responsive
    && reasonFieldRequired
    && returnRequest?.decision === 'RETURN'
    && returnRequest?.reason === 'Evidence is incomplete.'
    && !staleBrandVisible
    && consoleErrors.length === 0
    && pageErrors.length === 0;

  console.log(JSON.stringify({
    passed,
    checks,
    responsive,
    reasonFieldRequired,
    returnRequest,
    staleBrandVisible,
    consoleErrors,
    pageErrors,
  }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
