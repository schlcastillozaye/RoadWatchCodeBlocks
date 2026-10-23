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
const adminDeleteRequests = [];
const deletedReportIds = new Set();
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
  const method = route.request().method();
  let body = {};

  if (method === 'DELETE' && endpoint.startsWith('/admin/reports/')) {
    const reportId = decodeURIComponent(endpoint.slice('/admin/reports/'.length));
    adminDeleteRequests.push({ id: reportId, endpoint });
    deletedReportIds.add(reportId);
    body = { success: true };
  } else if (endpoint === '/auth/me') {
    body = { user: admin };
  } else if (endpoint === '/reports/stats') {
    body = { totals: { total: 2, pending: 1, approved: 1, rejected: 0 } };
  } else if (endpoint === '/reports') {
    const items = Object.values(reports).filter((report) => !deletedReportIds.has(report.id));
    const pageSize = Number(requestUrl.searchParams.get('pageSize')) || 25;
    body = {
      items,
      total: items.length,
      page: Number(requestUrl.searchParams.get('page')) || 1,
      pageSize,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    };
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
  await page.locator('#admin-dashboard-reports .admin-actions-cell').first().waitFor({ state: 'visible' });

  const reportActions = page.locator('#admin-dashboard-reports .admin-report-actions').first();
  const reportId = await reportActions.locator('[data-delete-report]').getAttribute('data-delete-report');
  const actionLayoutChecks = [];
  const viewports = [
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];
  for (const theme of ['light', 'dark']) {
    const currentTheme = await page.locator('html').getAttribute('data-theme');
    if (currentTheme !== theme) {
      await page.locator('[data-theme-toggle]').first().click();
      await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
    }
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const wrap = document.querySelector('#admin-dashboard-reports .admin-table-wrap');
        const table = wrap?.querySelector('.admin-table');
        const cell = document.querySelector('#admin-dashboard-reports .admin-actions-cell');
        const row = cell?.closest('tr');
        const header = table?.querySelector('thead tr');
        if (!wrap || !table || !cell || !row || !header) {
          return { visible: false, buttonsVisible: false, alignedColumns: false, noPageOverflow: false };
        }
        const wrapRect = wrap.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const actionRect = cell.getBoundingClientRect();
        const actionHeading = header.cells[header.cells.length - 1];
        const actionHeadingRect = actionHeading.getBoundingClientRect();
        const buttons = [...cell.querySelectorAll('.admin-report-actions .btn')].map((button) => ({
          rect: button.getBoundingClientRect(),
          display: getComputedStyle(button).display,
        }));
        const responsiveCards = wrap.clientWidth < 900;
        const cells = [...row.cells];
        const headings = [...header.cells];
        const alignedColumns = responsiveCards
          ? getComputedStyle(table).display === 'block'
            && getComputedStyle(row).display === 'grid'
            && cells.length === headings.length
            && cells.every((item) => Boolean(item.dataset.label))
            && getComputedStyle(cells[2]).display !== 'table-cell'
          : getComputedStyle(table).display === 'table'
            && cells.length === headings.length
            && cells.every((item, index) => getComputedStyle(item).display === 'table-cell'
              && Math.abs(item.getBoundingClientRect().left - headings[index].getBoundingClientRect().left) <= 1
              && Math.abs(item.getBoundingClientRect().right - headings[index].getBoundingClientRect().right) <= 1);
        const actionCellVisible = responsiveCards
          ? actionRect.left >= rowRect.left - 1 && actionRect.right <= rowRect.right + 1
          : getComputedStyle(cell).position !== 'sticky'
            && Math.abs(actionRect.left - actionHeadingRect.left) <= 1
            && Math.abs(actionRect.right - actionHeadingRect.right) <= 1;
        return {
          visible: responsiveCards
            ? actionCellVisible
            : actionRect.left >= wrapRect.left - 1 && actionRect.right <= wrapRect.right + 1,
          buttonsVisible: buttons.length === 2 && buttons.every(({ rect }) =>
            rect.width > 0 && rect.height > 0
            && rect.left >= (responsiveCards ? rowRect.left : wrapRect.left) - 1
            && rect.right <= (responsiveCards ? rowRect.right : wrapRect.right) + 1)
            && buttons.every(({ rect }) => Math.abs(rect.top - buttons[0].rect.top) <= 1),
          alignedColumns,
          noPageOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
        };
      });
      actionLayoutChecks.push({ theme, ...viewport, ...layout });
    }
  }
  if (process.env.RW_LAYOUT_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.RW_LAYOUT_SCREENSHOT_DIR, { recursive: true });
    for (const theme of ['light', 'dark']) {
      const currentTheme = await page.locator('html').getAttribute('data-theme');
      if (currentTheme !== theme) {
        await page.locator('[data-theme-toggle]').first().click();
        await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
      }
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
        await page.locator('#admin-dashboard-reports .admin-table-wrap').screenshot({
          path: path.join(process.env.RW_LAYOUT_SCREENSHOT_DIR, `admin-table-${theme}-${width}.png`),
        });
      }
    }
  }

  await page.locator('#admin-dashboard-reports .admin-report-actions a').first().click();
  await page.waitForFunction(() => document.body.innerText.includes('Synthetic test location'));
  const correctDetailsOpened = new URL(page.url()).pathname === `/report/${reportId}`;
  await page.evaluate(() => window.navigateTo('/admin'));
  await page.locator('#admin-dashboard-reports .admin-actions-cell').first().waitFor({ state: 'visible' });

  const deleteButton = page.locator(`#admin-dashboard-reports [data-delete-report="${reportId}"]`);
  await deleteButton.click();
  const deleteDialog = page.locator('dialog.rw-confirm-dialog');
  await deleteDialog.waitFor({ state: 'visible', timeout: 5000 });
  const correctDeleteIdentity = (await deleteDialog.innerText()).includes('Synthetic pending report')
    && (await deleteDialog.innerText()).includes('UI-PENDING');
  await deleteDialog.getByRole('button', { name: 'Cancel' }).click();
  await deleteDialog.waitFor({ state: 'detached', timeout: 5000 });
  const cancelKeptReport = adminDeleteRequests.length === 0
    && await page.locator(`#admin-dashboard-reports [data-delete-report="${reportId}"]`).count() === 1;

  await page.locator(`#admin-dashboard-reports [data-delete-report="${reportId}"]`).click();
  await page.locator('dialog.rw-confirm-dialog').getByRole('button', { name: 'Delete report' }).click();
  await page.waitForSelector('#admin-dashboard-reports [data-delete-report="verification"]');
  await page.waitForFunction((id) => !document.querySelector(`#admin-dashboard-reports [data-delete-report="${id}"]`), reportId);
  const deleteRefreshedList = await page.locator('#admin-dashboard-reports .admin-report-actions').count() === 1;
  const correctDeleteEndpoint = adminDeleteRequests.length === 1
    && adminDeleteRequests[0].id === reportId
    && adminDeleteRequests[0].endpoint === `/admin/reports/${reportId}`;

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
    && correctDetailsOpened
    && correctDeleteIdentity
    && cancelKeptReport
    && deleteRefreshedList
    && correctDeleteEndpoint
    && actionLayoutChecks.every(({ visible, buttonsVisible, alignedColumns, noPageOverflow }) =>
      visible && buttonsVisible && alignedColumns && noPageOverflow)
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
    reportId,
    correctDetailsOpened,
    correctDeleteIdentity,
    cancelKeptReport,
    deleteRefreshedList,
    correctDeleteEndpoint,
    actionLayoutChecks,
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
