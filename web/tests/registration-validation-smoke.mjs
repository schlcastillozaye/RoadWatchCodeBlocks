import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const requestedFile = path.resolve(WEB_DIR, `.${pathname === '/' ? '/index.html' : pathname}`);
  const file = fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile()
    ? requestedFile
    : !path.extname(pathname) && !pathname.startsWith('/api/')
      ? path.join(WEB_DIR, 'index.html')
      : requestedFile;
  if (!file.startsWith(`${WEB_DIR}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, contents) => {
    if (error) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': MIME_TYPES[path.extname(file)] || 'application/octet-stream' });
    response.end(contents);
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });

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

try {
  const page = await browser.newPage();
  const pageErrors = [];
  const registrationRequests = [];
  const loginRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.addInitScript((apiOrigin) => {
    window.RW_API_BASE_URL = apiOrigin;
    localStorage.setItem('roadwatch_theme', 'light');
  }, origin);
  await page.route('**/api/auth/register', async (route) => {
    const body = route.request().postDataJSON();
    registrationRequests.push(body);
    if (body.email === 'network@example.test') {
      await route.abort('failed');
      return;
    }
    if (body.email === 'success@example.test') {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'synthetic-citizen',
            fullName: 'Test Citizen',
            email: body.email,
            role: 'CITIZEN',
            status: 'ACTIVE',
          },
        }),
      });
      return;
    }
    const status = body.email === 'duplicate@example.test' ? 409
      : body.email === 'server@example.test' ? 500 : 422;
    const message = status === 409 ? 'An account with this email already exists.'
      : status === 500 ? 'Unexpected server detail'
        : 'Validation failed';
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: status === 409 ? 'CONFLICT' : status === 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR',
          message,
          details: status === 422
            ? [{ path: 'password', message: 'Password must be at least 8 characters' }]
            : [],
        },
      }),
    });
  });
  await page.route('**/api/auth/login', async (route) => {
    loginRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'synthetic-citizen', fullName: 'Test Citizen', email: 'success@example.test', role: 'CITIZEN' },
        accessToken: 'synthetic-access-token',
        refreshToken: 'synthetic-refresh-token',
      }),
    });
  });

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.navigateTo('/register'));
  await page.waitForSelector('#register-form');

  async function fillRegistration(email, password = 'valid-pass-8') {
    await page.fill('input[name="fullName"]', '  Test Citizen  ');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
  }

  async function submitRegistration() {
    await page.locator('#register-form button[type="submit"]').click();
  }

  async function assertFailureStaysOnRegister(email, expectedMessage) {
    await fillRegistration(email);
    await submitRegistration();
    const feedback = page.locator('#register-feedback');
    await feedback.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#register-form')?.dataset.submitting === 'false');
    assert.match(await feedback.innerText(), expectedMessage, `${email}: expected useful registration feedback`);
    assert.equal(new URL(page.url()).pathname, '/register', `${email}: failed registration must stay on the form`);
    assert.equal(await page.locator('#register-form').getAttribute('aria-busy'), null,
      `${email}: form should leave its busy state after failure`);
    assert.equal(await page.locator('#register-form button[type="submit"]').isDisabled(), false,
      `${email}: submit button should be enabled for retry`);
    assert.equal(await page.locator('#register-form button[type="submit"]').innerText(), 'Create account',
      `${email}: submit button should return to its normal label`);
    assert.equal(await page.locator('#login-form').count(), 0, `${email}: failure must not show the login page`);
  }

  const passwordInput = page.locator('#register-password');
  await fillRegistration('not-an-email', '12345');
  const invalidConstraints = await page.evaluate(() => ({
    emailInvalid: !document.querySelector('#register-email').validity.valid,
    passwordTooShort: document.querySelector('#register-password').validity.tooShort,
  }));
  await submitRegistration();
  assert.equal(registrationRequests.length, 0,
    'Invalid email/password must be blocked by browser validation before the API request');
  assert.equal(invalidConstraints.emailInvalid, true, 'Invalid email should fail native input validation');
  assert.equal(invalidConstraints.passwordTooShort, true, 'Short password should fail native input validation');
  await page.locator('#register-email').fill('validation@example.test');
  await passwordInput.fill('valid-pass-8');
  await assertFailureStaysOnRegister('validation@example.test', /password: Password must be at least 8 characters/);
  assert.equal(registrationRequests.length, 1, 'Expected one request for server-side validation failure');

  await assertFailureStaysOnRegister('duplicate@example.test', /An account with this email already exists/);
  await assertFailureStaysOnRegister('server@example.test', /We could not create your account right now/);
  await assertFailureStaysOnRegister('network@example.test', /Unable to reach RoadBlocks/);
  assert.equal(loginRequests.length, 0, 'Failed registration must not issue a login request');

  await fillRegistration('success@example.test');
  await page.evaluate(() => {
    const form = document.querySelector('#register-form');
    form.requestSubmit();
    form.requestSubmit();
  });
  await page.waitForURL('**/login?registration=success', { timeout: 10000 });
  await page.getByRole('status').filter({
    hasText: 'Your account was created successfully! Please sign in to continue.',
  }).waitFor({ state: 'visible' });
  assert.equal(registrationRequests.filter(({ email }) => email === 'success@example.test').length, 1,
    'Rapid repeated submissions should create only one registration request');
  assert.equal(await page.locator('#login-form').count(), 1, 'Successful registration should navigate to login');
  assert.equal(await page.evaluate(() => localStorage.getItem('roadwatch_auth_token')), null,
    'Registration must not automatically sign the user in');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('status').filter({
    hasText: 'Your account was created successfully! Please sign in to continue.',
  }).waitFor({ state: 'visible' });
  for (const theme of ['light', 'dark']) {
    const currentTheme = await page.locator('html').getAttribute('data-theme');
    if (currentTheme !== theme) await page.locator('[data-theme-toggle]').first().click();
    await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
    await page.waitForTimeout(250);
    const colors = await page.locator('.rw-auth-success').evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    assert.ok(contrastRatio(colors.foreground, colors.background) >= 4.5,
      `Login success message has insufficient ${theme} theme contrast: ${JSON.stringify(colors)}`);
  }

  await page.fill('#login-email', 'success@example.test');
  await page.fill('#login-password', 'valid-pass-8');
  await page.locator('#login-form button[type="submit"]').click();
  await page.waitForFunction(() => localStorage.getItem('roadwatch_auth_token') === 'synthetic-access-token');
  assert.equal(loginRequests.length, 1, 'User should be able to sign in after successful registration');
  assert.equal(loginRequests[0].email, 'success@example.test', 'Sign-in should use the registered email');
  assert.deepEqual(pageErrors, [], `Unexpected browser errors: ${pageErrors.join('; ')}`);

  console.log('PASS: native invalid-field validation prevents registration requests');
  console.log('PASS: duplicate-email, backend validation, server, and network failures remain on registration and allow retry');
  console.log('PASS: successful account creation navigates to login with a refresh-persistent accessible success message');
  console.log('PASS: duplicate submissions are blocked and registration does not automatically sign in');
  console.log('PASS: success message contrast meets WCAG AA in light and dark modes');
  console.log('PASS: newly registered account can submit a login request');
  console.log('PASS: no uncaught browser errors');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
