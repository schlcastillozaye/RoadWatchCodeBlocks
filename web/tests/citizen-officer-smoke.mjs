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
  assignedOfficer: { id: 'officer-test', fullName: 'Test Officer' },
  latitude: 14.6,
  longitude: 121.0,
  createdAt: '2026-10-20T00:00:00.000Z',
  photos: [],
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

  const officerPage = await browser.newPage();
  officerPage.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  officerPage.on('pageerror', (error) => pageErrors.push(error.message));
  await officerPage.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 204, body: '' }));
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
  assert.equal(await officerPage.locator('#officer-summary .admin-stat-card').count(), 4);
  await officerPage.getByRole('link', { name: 'View my assignments' }).click();
  await officerPage.locator('h1.admin-page-title').getByText('My assignments').waitFor();
  assert.equal(await officerPage.getByText('Synthetic assigned road repair').count(), 1);

  await officerPage.evaluate(() => window.navigateTo('/report/assigned-report'));
  const startButton = officerPage.locator('[data-repair-start]');
  await startButton.waitFor();
  officerPage.on('dialog', (dialog) => dialog.accept());
  await startButton.click();
  await officerPage.waitForFunction(() =>
    document.querySelector('[data-repair-complete-form]') !== null);
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

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log('PASS: citizen profile update and dashboard content');
  console.log('PASS: officer dashboard, assignments navigation, start-work, and evidence submission');
  console.log('PASS: no browser console or page errors');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) =>
    error ? reject(error) : resolve()));
}
