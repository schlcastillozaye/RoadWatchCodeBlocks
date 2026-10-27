import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const directory = path.dirname(fileURLToPath(import.meta.url));
const webDirectory = path.resolve(directory, '..');
const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = pathname === '/'
    ? path.join(webDirectory, 'index.html')
    : path.resolve(webDirectory, `.${pathname}`);
  if (!file.startsWith(webDirectory) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream',
  });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let activeUser;
let repairStatus = 'AWAITING_MAINTENANCE';
let profileUpdate;
const repairRequests = [];
const evidencePhotos = [];
let completionNotes;
let failNextAdditionalUpload = true;
const consoleErrors = [];
const pageErrors = [];

const report = () => ({
  id: 'assigned-report',
  referenceNo: 'RW-TEST-001',
  title: 'Synthetic assigned road repair',
  description: 'A test report assigned to the maintenance officer.',
  category: 'POTHOLE',
  moderationStatus: 'APPROVED',
  repairStatus,
  completionNotes,
  assignedOfficer: { id: 'officer-test', fullName: 'Test Officer' },
  latitude: 14.6,
  longitude: 121.0,
  createdAt: '2026-10-20T00:00:00.000Z',
  photos: [...evidencePhotos],
});

async function routeApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const endpoint = url.pathname.replace(/^\/api/, '');
  const method = request.method();
  let body = {};

  if (endpoint === '/auth/me') {
    body = { user: activeUser };
  } else if (endpoint === '/reports/mine') {
    body = { items: [], total: 0, page: 1, pageSize: 5, totalPages: 0 };
  } else if (endpoint === '/users/me' && method === 'PATCH') {
    profileUpdate = JSON.parse(request.postData() || '{}');
    activeUser = { ...activeUser, ...profileUpdate };
    body = { user: activeUser };
  } else if (endpoint === '/notifications' || endpoint.startsWith('/notifications?')) {
    body = { items: [] };
  } else if (endpoint === '/maintenance/summary') {
    body = { assigned: 1, awaiting: 1, inProgress: 0, completed: 0 };
  } else if (endpoint === '/maintenance/assignments') {
    body = { items: [report()], total: 1, page: 1, pageSize: 50, totalPages: 1 };
  } else if (endpoint.startsWith('/maintenance/notifications')) {
    body = { items: [], unreadCount: 0 };
  } else if (endpoint === '/reports/assigned-report/repair' && method === 'PATCH') {
    repairRequests.push({ method, endpoint, body: JSON.parse(request.postData() || '{}') });
    repairStatus = 'IN_PROGRESS';
    body = { report: report() };
  } else if (endpoint === '/reports/assigned-report/repair-evidence' && method === 'POST') {
    repairRequests.push({
      method,
      endpoint,
      body: request.postData() || '',
      contentType: request.headers()['content-type'] || '',
    });
    repairStatus = 'AWAITING_VERIFICATION';
    completionNotes = 'Surface repair completed.';
    evidencePhotos.push({
      id: 'original-after',
      kind: 'AFTER',
      url: 'https://assets.invalid/original-after.png',
      isPublic: true,
      createdAt: '2026-10-27T04:00:00.000Z',
      uploadedBy: { id: 'officer-test', fullName: 'Test Officer', role: 'MAINTENANCE_OFFICER' },
    });
    body = { report: report() };
  } else if (endpoint === '/reports/assigned-report/photos' && method === 'POST') {
    const formData = request.postData() || '';
    repairRequests.push({
      method,
      endpoint,
      body: formData,
      contentType: request.headers()['content-type'] || '',
    });
    if (failNextAdditionalUpload) {
      failNextAdditionalUpload = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Temporary upload interruption.' } }),
      });
      return;
    }
    const count = (formData.match(/name="afterPhotos\[\]"/g) || []).length;
    for (let i = 0; i < count; i += 1) {
      evidencePhotos.push({
        id: `additional-after-${evidencePhotos.length}`,
        kind: 'AFTER',
        url: `https://assets.invalid/additional-${i}.png`,
        isPublic: true,
        caption: 'Additional repair evidence',
        createdAt: '2026-10-27T04:10:00.000Z',
        uploadedBy: { id: 'officer-test', fullName: 'Test Officer', role: 'MAINTENANCE_OFFICER' },
      });
    }
    body = { report: report() };
  } else if (endpoint === '/reports/assigned-report/history') {
    body = { history: [] };
  } else if (endpoint === '/reports/assigned-report') {
    body = { report: report() };
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function verifyResponsiveWorkspace(page, role) {
  const checks = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const workspace = document.querySelector('.admin-workspace');
        const content = document.querySelector('.admin-content');
        return {
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          workspaceWidth: Math.round(workspace.getBoundingClientRect().width),
          contentWidth: Math.round(content.getBoundingClientRect().width),
          role: workspace.dataset.workspaceRole,
          page: workspace.dataset.workspacePage,
          dashboardColumns: getComputedStyle(content).gridTemplateColumns,
        };
      });
      assert.ok(
        layout.scrollWidth <= layout.viewportWidth,
        `${role} ${theme} ${viewport.width}px has horizontal page overflow: ${JSON.stringify(layout)}`,
      );
      assert.equal(layout.role, role);
      if (role === 'CITIZEN' && viewport.width === 1440) {
        assert.ok(layout.workspaceWidth > 1280, 'Desktop workspace should use the wider available layout');
        assert.equal(layout.dashboardColumns.split(' ').length, 2);
      }
      checks.push({ theme, ...viewport, ...layout });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  return checks;
}

async function verifyReportFormLayout(page, role) {
  const returnPath = await page.evaluate(() => location.pathname + location.search + location.hash);
  await page.evaluate(() => window.navigateTo('/submit-report'));
  await page.locator('#report-form').waitFor();
  for (const id of ['report-title', 'report-description', 'report-area-label', 'report-photos']) {
    assert.equal(
      await page.locator(`label[for="${id}"]`).count(),
      1,
      `${role} report field ${id} must have an associated visible label`,
    );
  }
  assert.match(
    await page.locator('#report-photos').getAttribute('aria-describedby'),
    /report-photo-help/,
    `${role} photo field must describe its accepted purpose and constraints`,
  );
  await page.locator('#report-photos').setInputFiles(
    Array.from({ length: 9 }, (_, index) => ({
      name: `issue-${index + 1}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from('synthetic image content'),
    })),
  );
  assert.equal(await page.locator('#report-photos').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#report-photo-error').textContent(), 'Choose no more than 8 images.');
  await page.locator('#report-photos').setInputFiles({
    name: 'issue.png',
    mimeType: 'image/png',
    buffer: Buffer.from('synthetic image content'),
  });
  assert.equal(await page.locator('#report-photos').getAttribute('aria-invalid'), 'false');
  assert.match(await page.locator('#report-photo-help').textContent(), /1 image selected/);
  assert.equal(await page.locator('.rw-nav-user').getAttribute('aria-label'), null);
  await page.locator('#report-latitude').fill('14.600000');
  await page.locator('#report-longitude').fill('121.000000');
  await page.locator('#btn-apply-coordinates').click();
  assert.equal(await page.locator('#lat-input').inputValue(), '14.600000');
  assert.equal(await page.locator('#lon-input').inputValue(), '121.000000');
  assert.match(
    await page.locator('.leaflet-control-zoom-in').getAttribute('aria-label'),
    /\+/,
    'Map zoom-in accessible name must include its visible plus sign',
  );
  assert.match(
    await page.locator('.leaflet-control-zoom-out').getAttribute('aria-label'),
    /−/,
    'Map zoom-out accessible name must include its visible minus sign',
  );
  const checks = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const content = document.querySelector('.admin-content');
        const form = document.querySelector('#report-form');
        const card = document.querySelector('.rw-report-form-card');
        const location = document.querySelector('.rw-report-location-fields');
        const map = document.querySelector('#report-location-map');
        const desktop = window.innerWidth >= 1024;
        return {
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          contentWidth: Math.round(content.getBoundingClientRect().width),
          cardWidth: Math.round(card.getBoundingClientRect().width),
          formColumns: getComputedStyle(form).gridTemplateColumns,
          locationColumns: getComputedStyle(location).gridTemplateColumns,
          mapWithinContent: map.getBoundingClientRect().left >= content.getBoundingClientRect().left - 1
            && map.getBoundingClientRect().right <= content.getBoundingClientRect().right + 1,
          desktop,
        };
      });
      assert.ok(
        layout.scrollWidth <= layout.viewportWidth,
        `${role} report form ${theme} ${viewport.width}px overflows: ${JSON.stringify(layout)}`,
      );
      assert.ok(layout.mapWithinContent, `${role} report location map escaped the content width: ${JSON.stringify(layout)}`);
      if (layout.desktop) {
        assert.ok(layout.cardWidth >= layout.contentWidth - 2, `${role} desktop report card is still constrained`);
        assert.equal(layout.formColumns.split(' ').length, 2);
        assert.equal(layout.locationColumns.split(' ').length, 2);
      } else {
        assert.equal(layout.formColumns, 'none', 'Mobile report form should preserve its stacked layout');
      }
      checks.push({ role, theme, ...viewport, ...layout });
    }
  }
  await page.evaluate((path) => window.navigateTo(path), returnPath);
  await page.locator('h1.admin-page-title').waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  return checks;
}

try {
  const citizenPage = await browser.newPage();
  citizenPage.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  citizenPage.on('pageerror', (error) => pageErrors.push(error.message));
  await citizenPage.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 204, body: '' }));
  await citizenPage.route('**/api/**', routeApi);
  activeUser = {
    id: 'citizen-test',
    fullName: 'Synthetic Citizen',
    email: 'citizen@example.invalid',
    phone: '09170000000',
    role: 'CITIZEN',
  };
  await citizenPage.addInitScript(() =>
    localStorage.setItem('roadwatch_auth_token', 'synthetic-citizen-token'));
  await citizenPage.goto(origin, { waitUntil: 'domcontentloaded' });
  await citizenPage.getByRole('heading', { name: 'Welcome, Synthetic' }).waitFor();
  await citizenPage.locator('#home-reports').waitFor();
  assert.equal(await citizenPage.locator('.admin-stat-grid').count(), 0);
  assert.equal(await citizenPage.getByText('Total reports', { exact: true }).count(), 0);
  const citizenLayoutChecks = await verifyResponsiveWorkspace(citizenPage, 'CITIZEN');
  const citizenFormChecks = await verifyReportFormLayout(citizenPage, 'CITIZEN');
  await citizenPage.locator('[data-nav="/profile"]').click();
  await citizenPage.locator('#profile-form').waitFor();
  await citizenPage.locator('#profile-name').fill('Updated Synthetic Citizen');
  await citizenPage.locator('#profile-phone').fill('09171112222');
  await citizenPage.locator('#profile-form button[type="submit"]').click();
  await citizenPage.getByText('Your profile was updated.').waitFor();
  assert.deepEqual(profileUpdate, {
    fullName: 'Updated Synthetic Citizen',
    phone: '09171112222',
  });
  await citizenPage.setViewportSize({ width: 390, height: 844 });
  await citizenPage.locator('[data-admin-menu-toggle]').click();
  assert.equal(await citizenPage.locator('[data-admin-menu-toggle]').getAttribute('aria-expanded'), 'true');
  await citizenPage.locator('.admin-sidebar-nav a[data-nav="/"]').click();
  assert.equal(await citizenPage.locator('[data-admin-menu-toggle]').getAttribute('aria-expanded'), 'false');
  await citizenPage.getByRole('heading', { name: 'Welcome, Updated' }).waitFor();

  const officerPage = await browser.newPage();
  officerPage.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('503 (Service Unavailable)')) {
      consoleErrors.push(message.text());
    }
  });
  officerPage.on('pageerror', (error) => pageErrors.push(error.message));
  await officerPage.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 204, body: '' }));
  await officerPage.route('https://assets.invalid/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    }));
  await officerPage.route('**/api/**', routeApi);
  activeUser = {
    id: 'officer-test',
    fullName: 'Test Officer',
    email: 'officer@example.invalid',
    role: 'MAINTENANCE_OFFICER',
  };
  await officerPage.addInitScript(() =>
    localStorage.setItem('roadwatch_auth_token', 'synthetic-officer-token'));
  await officerPage.goto(origin, { waitUntil: 'domcontentloaded' });
  await officerPage.getByRole('heading', { name: 'My dashboard' }).waitFor();
  const officerLayoutChecks = await verifyResponsiveWorkspace(officerPage, 'MAINTENANCE_OFFICER');
  const officerFormChecks = await verifyReportFormLayout(officerPage, 'MAINTENANCE_OFFICER');
  assert.equal(await officerPage.locator('#officer-summary .admin-stat-card').count(), 4);
  await officerPage.setViewportSize({ width: 390, height: 844 });
  await officerPage.locator('[data-admin-menu-toggle]').click();
  assert.equal(await officerPage.locator('[data-admin-menu-toggle]').getAttribute('aria-expanded'), 'true');
  await officerPage.getByRole('link', { name: 'View my assignments' }).click();
  assert.equal(await officerPage.locator('[data-admin-menu-toggle]').getAttribute('aria-expanded'), 'false');
  await officerPage.locator('h1.admin-page-title').getByText('My assignments').waitFor();
  assert.equal(await officerPage.getByText('Synthetic assigned road repair').count(), 1);

  await officerPage.evaluate(() => window.navigateTo('/report/assigned-report'));
  const startButton = officerPage.locator('[data-repair-start]');
  await startButton.waitFor();
  officerPage.on('dialog', (dialog) => dialog.accept());
  await startButton.click();
  await officerPage.waitForFunction(() =>
    document.querySelector('[data-repair-complete-form]') !== null);
  assert.equal(await officerPage.locator('label[for="repair-after-photos"]').count(), 1);
  assert.match(
    await officerPage.locator('#repair-after-photos').getAttribute('aria-describedby'),
    /repair-after-photos-help/,
    'Repair evidence upload must explain the accepted photo purpose',
  );
  assert.deepEqual(repairRequests[0], {
    method: 'PATCH',
    endpoint: '/reports/assigned-report/repair',
    body: {
      repairStatus: 'IN_PROGRESS',
      note: 'Repair work started.',
    },
  });

  await officerPage.locator('[name="completionNotes"]').fill('Surface repair completed.');
  await officerPage.locator('#repair-after-photos').setInputFiles({
    name: 'after.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1r8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await officerPage.locator('[data-repair-complete-form] button[type="submit"]').click();
  await officerPage.getByText('Completion evidence submitted for admin verification.').waitFor();
  assert.equal(repairRequests[1].method, 'POST');
  assert.equal(repairRequests[1].endpoint, '/reports/assigned-report/repair-evidence');
  assert.match(repairRequests[1].contentType, /^multipart\/form-data;/);
  assert.match(repairRequests[1].body, /completionNotes/);
  assert.match(repairRequests[1].body, /afterPhotos\[\]/);
  assert.equal(repairStatus, 'AWAITING_VERIFICATION');
  await officerPage.locator('[data-additional-photos-form]').waitFor();
  await officerPage.locator('[name="photoKind"]').selectOption('AFTER');
  await officerPage.locator('#additional-repair-photos').setInputFiles([
    {
      name: 'discard.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    },
    {
      name: 'additional-a.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    },
    {
      name: 'additional-b.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    },
  ]);
  assert.equal(await officerPage.locator('[data-photo-preview-list] li').count(), 3);
  await officerPage.getByRole('button', { name: 'Remove discard.png' }).click();
  assert.equal(await officerPage.locator('[data-photo-preview-list] li').count(), 2);
  await officerPage.locator('[data-additional-photos-form] button[type="submit"]').click();
  await officerPage.locator('[data-report-action-feedback]').getByText(/Temporary upload interruption/).waitFor();
  assert.equal(await officerPage.locator('[data-photo-preview-list] li').count(), 2,
    'selected photos should remain available after a failed upload');
  await officerPage.locator('[data-additional-photos-form] button[type="submit"]').click();
  await officerPage.getByText('Additional repair photos uploaded successfully.').waitFor();
  assert.equal(repairRequests[2].endpoint, '/reports/assigned-report/photos');
  assert.equal(repairRequests[3].endpoint, '/reports/assigned-report/photos');
  assert.match(repairRequests[3].contentType, /^multipart\/form-data;/);
  assert.match(repairRequests[3].body, /AFTER/);
  assert.match(repairRequests[3].body, /additional-a\.png/);
  assert.match(repairRequests[3].body, /additional-b\.png/);
  assert.doesNotMatch(repairRequests[3].body, /discard\.png/);
  assert.equal(repairStatus, 'AWAITING_VERIFICATION', 'additional evidence must not change verification status');
  assert.equal(evidencePhotos.length, 3, 'original completion photo must be retained alongside additions');

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log('PASS: citizen profile update and dashboard content');
  console.log(`PASS: citizen responsive light/dark workspace at 375, 390, 768, 1024, and 1440px (${citizenLayoutChecks.length} checks)`);
  console.log(`PASS: citizen and officer report form width, map layout, and mobile stacking (${citizenFormChecks.length + officerFormChecks.length} checks)`);
  console.log('PASS: citizen mobile workspace menu opens, navigates, and closes');
  console.log('PASS: officer dashboard, assignments navigation, start-work, and evidence submission');
  console.log('PASS: officer previews/removes photos, retries a failed upload, and appends evidence without resetting verification');
  console.log(`PASS: officer responsive light/dark workspace at 375, 390, 768, 1024, and 1440px (${officerLayoutChecks.length} checks)`);
  console.log('PASS: officer mobile workspace menu opens, navigates, and closes');
  console.log('PASS: no browser console or page errors');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) =>
    error ? reject(error) : resolve()));
}
