import assert from 'node:assert/strict';
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
function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const [r, g, b] = color.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number)
      .map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

async function setTheme(theme, context) {
  const themeToggle = page.locator('[data-theme-toggle]').first();
  const currentTheme = await page.locator('html').getAttribute('data-theme');
  if (currentTheme !== theme) {
    assert.ok(
      currentTheme === 'light' || currentTheme === 'dark',
      `${context}: cannot switch to ${theme}; current theme is ${JSON.stringify(currentTheme)}`,
    );
    await themeToggle.click();
    await page.waitForFunction(
      (expected) => document.documentElement.dataset.theme === expected,
      theme,
      { timeout: 5000 },
    );
    await page.waitForTimeout(250);
  }
  assert.equal(
    await page.locator('html').getAttribute('data-theme'),
    theme,
    `${context}: requested ${theme} theme`,
  );
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  assert.equal(
    await themeToggle.getAttribute('aria-label'),
    `Switch to ${nextTheme} mode`,
    `${context}: theme toggle label should offer ${nextTheme} mode`,
  );
}

async function assertAdminPageHeadings(route, expectedTitle) {
  await page.evaluate((path) => window.navigateTo(path), route);
  try {
    await page.waitForFunction((title) => {
      const headings = [...document.querySelectorAll('h1')];
      const isVisible = (heading) => {
        const style = getComputedStyle(heading);
        return heading.getClientRects().length > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0;
      };
      return headings.length === 1
        && headings[0].textContent.trim() === title
        && isVisible(headings[0]);
    }, expectedTitle, { timeout: 10000 });
  } catch (error) {
    throw new Error(
      `Heading check failed for ${route}: expected exactly one visible <h1> with text "${expectedTitle}".`,
      { cause: error },
    );
  }

  const headingStructure = await page.evaluate(() => {
    const isVisible = (heading) => {
      const style = getComputedStyle(heading);
      return heading.getClientRects().length > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0;
    };
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter(isVisible)
      .map((heading) => ({
        level: Number(heading.tagName.slice(1)),
        text: heading.textContent.trim(),
        inPageContent: Boolean(heading.closest('.admin-content')),
      }));
    return headings;
  });
  assert.equal(
    headingStructure.filter(({ level }) => level === 1).length,
    1,
    `${route}: expected exactly one visible <h1>; found ${JSON.stringify(headingStructure)}`,
  );
  assert.equal(headingStructure[0]?.level, 1, `${route}: the first visible heading should be an <h1>`);
  assert.equal(
    headingStructure[0]?.text,
    expectedTitle,
    `${route}: expected the page <h1> to read "${expectedTitle}"`,
  );
  assert.equal(headingStructure[0]?.inPageContent, true, `${route}: the <h1> should be in the page content`);
  for (let index = 1; index < headingStructure.length; index += 1) {
    const previous = headingStructure[index - 1];
    const current = headingStructure[index];
    assert.ok(
      current.level <= previous.level + 1,
      `${route}: heading hierarchy skips from h${previous.level} "${previous.text}" `
        + `to h${current.level} "${current.text}"`,
    );
  }
}

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

  if (endpoint === '/analytics/audit-logs') {
    body = {
      logs: Array.from({ length: 20 }, (_, index) => ({
        actor: { role: index % 2 ? 'MAINTENANCE_OFFICER' : 'ADMIN' },
        action: index === 3 ? 'REPORT_DELETED' : 'USER_LOGIN',
        entityType: index === 3 ? 'Report' : 'User',
        metadata: index === 3 ? { referenceNo: 'RW-2026-000018' } : {},
        createdAt: new Date(Date.now() - index * 60000).toISOString(),
      })),
    };
  } else if (method === 'DELETE' && endpoint.startsWith('/admin/reports/')) {
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
          photos: [
            { url: 'https://assets.invalid/synthetic-photo.svg', isPublic: true, kind: 'BEFORE', caption: 'Before repair' },
            { url: 'https://assets.invalid/synthetic-photo.svg', isPublic: true, kind: 'AFTER', caption: 'After repair' },
            {
              url: 'https://assets.invalid/synthetic-photo.svg',
              isPublic: true,
              kind: 'AFTER',
              caption: 'Additional repair evidence',
              createdAt: '2026-10-27T04:10:00.000Z',
              uploadedBy: { id: 'officer-ui-test', fullName: 'Synthetic Officer', role: 'MAINTENANCE_OFFICER' },
            },
          ],
        },
      };
    }
  }

  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
page.route('**/synthetic-photo.svg', (route) => route.fulfill({
  status: 200,
  contentType: 'image/svg+xml',
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#78a9d1"/></svg>',
}));

try {
  await page.addInitScript(() => {
    localStorage.setItem('roadwatch_auth_token', 'synthetic-ui-test-token');
    localStorage.setItem('roadwatch_theme', 'light');
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#admin-dashboard-title', { timeout: 15000 });
  const adminDashboardPath = await page.evaluate(() => location.pathname + location.search + location.hash);
  for (const [route, expectedTitle] of [
    ['/admin', 'Dashboard'],
    ['/admin?view=statistics', 'Reports & statistics'],
    ['/admin/reports', 'Report management'],
    ['/admin/reports?view=assignments', 'Maintenance assignments'],
    ['/admin/reports?view=repair-monitoring', 'Repair monitoring'],
    ['/admin/users', 'Users'],
    ['/profile', 'My profile'],
    ['/audit', 'Audit log'],
  ]) {
    await assertAdminPageHeadings(route, expectedTitle);
  }
  await page.evaluate((path) => window.navigateTo(path), adminDashboardPath);
  await page.waitForSelector('#admin-dashboard-title', { timeout: 10000 });
  assert.equal(await page.locator('.rw-nav-user').getAttribute('aria-label'), null,
    'Admin dashboard: navigation user element should not have a prohibited aria-label');
  for (const theme of ['light', 'dark']) {
    await setTheme(theme, `Admin sign-out contrast ${theme}`);
    const colors = await page.locator('.admin-sidebar-logout').evaluate((element) => {
      const parse = (value) => value.match(/\d+(?:\.\d+)?/g).map(Number);
      const foreground = getComputedStyle(element).color;
      const background = parse(getComputedStyle(element).backgroundColor);
      const parent = parse(getComputedStyle(element.parentElement).backgroundColor);
      const alpha = background.length > 3 ? background[3] : 1;
      const composite = background.slice(0, 3).map((channel, index) =>
        Math.round(channel * alpha + parent[index] * (1 - alpha)));
      return { foreground, background: `rgb(${composite.join(', ')})` };
    });
    assert.ok(
      contrastRatio(colors.foreground, colors.background) >= 4.5,
      `${theme} admin sign-out contrast is below WCAG AA: ${JSON.stringify(colors)}`,
    );
  }
  await page.evaluate(() => window.navigateTo('/audit'));
  const auditLog = page.locator('#audit-log');
  await auditLog.waitFor();
  assert.equal(await page.locator('#audit-log-heading').evaluate((heading) => heading.tagName), 'H1',
    '/audit: expected the audit title to be an h1');
  assert.equal((await page.locator('#audit-log-heading').textContent()).trim(), 'Audit log',
    '/audit: unexpected page heading');
  assert.equal(await auditLog.getAttribute('tabindex'), '0', '/audit: log region should be keyboard-focusable');
  assert.equal(await auditLog.getAttribute('role'), 'region', '/audit: log should have a named region role');
  assert.equal(await auditLog.locator('.rw-audit-entry').count(), 20, '/audit: expected all synthetic audit entries');
  const auditDesktopLayout = await page.evaluate(() => {
    const content = document.querySelector('.admin-content').getBoundingClientRect();
    const panel = document.querySelector('.rw-audit-panel').getBoundingClientRect();
    const log = document.querySelector('#audit-log');
    return {
      contentWidth: content.width,
      panelWidth: panel.width,
      logMaxHeight: parseFloat(getComputedStyle(log).maxHeight),
      logClientHeight: log.clientHeight,
      logScrollHeight: log.scrollHeight,
    };
  });
  assert.ok(auditDesktopLayout.panelWidth > auditDesktopLayout.contentWidth * 0.9,
    `/audit at 1440x900: panel should use the desktop content width: ${JSON.stringify(auditDesktopLayout)}`);
  assert.ok(auditDesktopLayout.logMaxHeight > 320,
    `/audit at 1440x900: log should show more content on desktop: ${JSON.stringify(auditDesktopLayout)}`);
  assert.ok(auditDesktopLayout.logScrollHeight > auditDesktopLayout.logClientHeight,
    `/audit at 1440x900: log should scroll when entries exceed the visible area: ${JSON.stringify(auditDesktopLayout)}`);
  await auditLog.focus();
  assert.equal(await auditLog.evaluate((element) => document.activeElement === element), true,
    '/audit: keyboard focus should reach the log region');
  for (const theme of ['light', 'dark']) {
    await setTheme(theme, `/audit layout ${theme}`);
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        panelWidth: document.querySelector('.rw-audit-panel').getBoundingClientRect().width,
        contentWidth: document.querySelector('.admin-content').getBoundingClientRect().width,
      }));
      const context = `/audit ${theme} ${viewport.width}x${viewport.height}`;
      assert.equal(layout.width, viewport.width, `${context}: measured viewport width`);
      assert.equal(layout.scrollWidth, viewport.width, `${context}: unexpected horizontal overflow`);
      assert.ok(layout.panelWidth > layout.contentWidth * 0.9,
        `${context}: audit panel should fill available workspace: ${JSON.stringify(layout)}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.navigateTo('/admin/users'));
  const statusFilter = page.locator('#admin-user-filters select[name="status"]');
  await statusFilter.waitFor();
  for (const theme of ['light', 'dark']) {
    await setTheme(theme, `/admin/users status selector ${theme}`);
    const colors = await statusFilter.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
      disabled: element.disabled,
    }));
    assert.ok(
      contrastRatio(colors.foreground, colors.background) >= 4.5,
      `${theme} admin status selector contrast is below WCAG AA: ${JSON.stringify(colors)}`,
    );
    assert.equal(colors.disabled, false, `${theme} admin status selector should be enabled`);
  }
  await page.evaluate(() => window.navigateTo('/profile'));
  await page.locator('#profile-form').waitFor();
  for (const theme of ['light', 'dark']) {
    await setTheme(theme, `/profile layout ${theme}`);
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const content = document.querySelector('.admin-content').getBoundingClientRect();
        const panel = document.querySelector('.rw-profile-panel').getBoundingClientRect();
        const form = document.querySelector('.rw-profile-form');
        return {
          viewportWidth: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          contentWidth: content.width,
          panelWidth: panel.width,
          formColumns: getComputedStyle(form).gridTemplateColumns.split(' ').length,
        };
      });
      const context = `/profile ${theme} ${viewport.width}x${viewport.height}`;
      assert.equal(layout.viewportWidth, viewport.width, `${context}: measured viewport width`);
      assert.equal(layout.scrollWidth, viewport.width, `${context}: unexpected horizontal overflow`);
      assert.ok(layout.panelWidth > layout.contentWidth * 0.9,
        `${context}: profile panel should use available workspace width: ${JSON.stringify(layout)}`);
      assert.equal(layout.formColumns, viewport.width <= 639 ? 1 : 2,
        `${context}: unexpected number of profile form columns: ${JSON.stringify(layout)}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.navigateTo('/submit-report'));
  await page.locator('#report-form').waitFor();
  const adminFormLayoutChecks = [];
  for (const theme of ['light', 'dark']) {
    await setTheme(theme, `/admin report form layout ${theme}`);
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const content = document.querySelector('.admin-content').getBoundingClientRect();
        const card = document.querySelector('.rw-report-form-card').getBoundingClientRect();
        const form = document.querySelector('#report-form');
        const map = document.querySelector('#report-location-map').getBoundingClientRect();
        const desktop = window.innerWidth >= 1024;
        const formColumns = getComputedStyle(form).gridTemplateColumns;
        return {
          noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          fullWidth: desktop
            ? card.width >= content.width - 2
            : card.width > 0 && card.right <= content.right + 1,
          formLayout: desktop
            ? formColumns.split(' ').length === 2
            : getComputedStyle(form).display !== 'grid',
          mapWithinContent: map.left >= content.left - 1 && map.right <= content.right + 1,
        };
      });
      adminFormLayoutChecks.push({ theme, ...viewport, ...layout });
    }
  }
  await page.evaluate((path) => window.navigateTo(path), adminDashboardPath);
  await page.waitForSelector('#admin-dashboard-title', { timeout: 10000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-admin-menu-toggle]').click();
  if (await page.locator('[data-admin-menu-toggle]').getAttribute('aria-expanded') !== 'true') {
    throw new Error('Admin mobile workspace menu did not open.');
  }
  await page.locator('.admin-sidebar-nav a[data-nav="/admin"]').click();
  if (await page.locator('[data-admin-menu-toggle]').getAttribute('aria-expanded') !== 'false') {
    throw new Error('Admin mobile workspace menu did not close after navigation.');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#admin-dashboard-reports .admin-actions-cell').first().waitFor({ state: 'visible' });

  const reportActions = page.locator('#admin-dashboard-reports .admin-report-actions').first();
  const reportId = await reportActions.locator('[data-delete-report]').getAttribute('data-delete-report');
  const actionLayoutChecks = [];
  const viewports = [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];
  for (const theme of ['light', 'dark']) {
    await setTheme(theme, `/admin dashboard actions ${theme}`);
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
        const touchTargets = window.innerWidth > 640
          || buttons.every(({ rect }) => rect.height >= 44);
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
          touchTargets,
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
      await setTheme(theme, `/admin dashboard screenshot ${theme}`);
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
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const content = document.querySelector('.admin-content');
        const detailPage = document.querySelector('.rw-report-detail-page');
        const detailCard = document.querySelector('#report-detail > .brand-card');
        const photos = document.querySelector('.rw-report-photos-grid');
        const photoButtons = [...(photos?.querySelectorAll('.rw-photo-trigger') || [])];
        if (!content || !detailPage || !detailCard || !photos) {
          return { visible: false, detailUsesContentWidth: false, photosFit: false, noOverflow: false };
        }
        const contentRect = content.getBoundingClientRect();
        const detailRect = detailCard.getBoundingClientRect();
        const imageRects = photoButtons.map((button) => button.getBoundingClientRect());
        const desktop = window.innerWidth >= 1024;
        return {
          visible: detailRect.width > 0 && detailRect.height > 0,
          detailUsesContentWidth: desktop
            ? detailRect.width >= contentRect.width - 2
            : detailRect.width <= contentRect.width + 1,
          photosFit: photoButtons.length === 3
            && imageRects.every((rect) => rect.width > 0 && rect.left >= photos.getBoundingClientRect().left - 1
              && rect.right <= photos.getBoundingClientRect().right + 1)
            && (!desktop || photoButtons.every((button) => button.querySelector('img').getBoundingClientRect().height >= 224)),
          noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
        };
      });
      viewportChecks.push({ ...viewport, ...layout });
      responsive = responsive && layout.visible && layout.detailUsesContentWidth
        && layout.photosFit && layout.noOverflow;
    }
    checks.push({ reportId, heading, present, viewportChecks });
  }

  await page.setViewportSize({ width: 375, height: 667 });
  await page.evaluate(() => window.navigateTo('/report/verification'));
  await page.locator('.rw-photo-meta').getByText('Additional repair evidence').waitFor();
  const additionalEvidenceMetadata = await page.locator('.rw-photo-meta').filter({
    hasText: 'Additional repair evidence',
  }).innerText();
  assert.match(additionalEvidenceMetadata, /Uploaded/);
  assert.match(additionalEvidenceMetadata, /Synthetic Officer/);
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
  const failures = [];
  for (const { reportId: checkedReportId, heading, present, viewportChecks } of checks) {
    if (heading !== 'Admin actions') failures.push(`/report/${checkedReportId}: expected "Admin actions" heading`);
    for (const [label, isPresent] of Object.entries(present)) {
      if (!isPresent) failures.push(`/report/${checkedReportId}: "${label}" action is not visible`);
    }
    for (const { width, height, visible, detailUsesContentWidth, photosFit, noOverflow } of viewportChecks) {
      const context = `/report/${checkedReportId} ${width}x${height}`;
      if (!visible) failures.push(`${context}: report detail card is not visible`);
      if (!detailUsesContentWidth) failures.push(`${context}: report detail card does not fit available content width`);
      if (!photosFit) failures.push(`${context}: evidence photos do not fit their gallery`);
      if (!noOverflow) failures.push(`${context}: page has horizontal overflow`);
    }
  }
  for (const { theme, width, height, visible, buttonsVisible, alignedColumns, noPageOverflow, touchTargets } of actionLayoutChecks) {
    const context = `/admin ${theme} ${width}x${height}`;
    if (!visible) failures.push(`${context}: report action cell is misplaced or not visible`);
    if (!buttonsVisible) failures.push(`${context}: report action buttons are misplaced or not visible`);
    if (!alignedColumns) failures.push(`${context}: table columns are misaligned`);
    if (!noPageOverflow) failures.push(`${context}: page has horizontal overflow`);
    if (!touchTargets) failures.push(`${context}: mobile action buttons are smaller than 44px`);
  }
  for (const { theme, width, height, noOverflow, fullWidth, formLayout, mapWithinContent } of adminFormLayoutChecks) {
    const context = `/submit-report ${theme} ${width}x${height}`;
    if (!noOverflow) failures.push(`${context}: page has horizontal overflow`);
    if (!fullWidth) failures.push(`${context}: form card does not fit the available content width`);
    if (!formLayout) failures.push(`${context}: form columns do not match the responsive breakpoint`);
    if (!mapWithinContent) failures.push(`${context}: location map extends outside the content area`);
  }
  if (!responsive) failures.push('Admin report details failed one or more responsive layout checks');
  if (!correctDetailsOpened) failures.push(`Dashboard action did not open /report/${reportId}`);
  if (!correctDeleteIdentity) failures.push('Delete confirmation does not identify the selected report');
  if (!cancelKeptReport) failures.push('Cancelling delete changed the report or sent a delete request');
  if (!deleteRefreshedList) failures.push('Confirmed delete did not refresh the report list');
  if (!correctDeleteEndpoint) failures.push('Delete action called an unexpected API endpoint or report ID');
  if (!reasonFieldRequired) failures.push('Return-for-work dialog does not require an explanation');
  if (returnRequest?.decision !== 'RETURN') failures.push('Return-for-work action sent an unexpected decision');
  if (returnRequest?.reason !== 'Evidence is incomplete.') failures.push('Return-for-work action did not send the entered reason');
  if (staleBrandVisible) failures.push('Dashboard contains stale RoadWatch branding');
  if (consoleErrors.length) failures.push(`Browser console errors: ${consoleErrors.join(' | ')}`);
  if (pageErrors.length) failures.push(`Browser page errors: ${pageErrors.join(' | ')}`);
  const passed = failures.length === 0;

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
    adminFormLayoutChecks,
    responsive,
    reasonFieldRequired,
    returnRequest,
    staleBrandVisible,
    failures,
    consoleErrors,
    pageErrors,
  }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
