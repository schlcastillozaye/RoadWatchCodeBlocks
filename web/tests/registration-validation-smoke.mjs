import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.RW_WEB_PORT || 5187);
const ORIGIN = `http://localhost:${PORT}`;
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, ORIGIN).pathname);
  const file = path.resolve(WEB_DIR, `.${pathname === '/' ? '/index.html' : pathname}`);
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

let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let requestCount = 0;
  let requestBody;

  await page.addInitScript(() => {
    window.RW_API_BASE_URL = window.location.origin;
  });
  await page.route('**/api/auth/register', async (route) => {
    requestCount += 1;
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ path: 'password', message: 'Password must be at least 8 characters' }],
        },
      }),
    });
  });

  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#register-form, #login-form');
  if (await page.locator('#login-form').count()) {
    await page.locator('#show-register').click();
  } else {
    await page.evaluate(() => window.navigateTo('/register'));
  }
  await page.waitForSelector('#register-form');

  await page.fill('input[name="fullName"]', '  Test Citizen  ');
  await page.fill('input[name="email"]', 'citizen@example.test');
  await page.fill('input[name="password"]', '12345');
  const passwordValidity = await page.locator('#register-password').evaluate((input) => ({
    minLength: input.minLength,
    maxLength: input.maxLength,
    tooShort: input.validity.tooShort,
    formValid: input.form.checkValidity(),
  }));
  await page.locator('#register-form button[type="submit"]').click();
  await page.waitForTimeout(150);
  if (requestCount !== 0 || !passwordValidity.tooShort || passwordValidity.minLength !== 8) {
    throw new Error(`Short password was not blocked before the API request: ${JSON.stringify(passwordValidity)}`);
  }

  await page.fill('input[name="password"]', 'valid-pass-8');
  await page.locator('#register-form button[type="submit"]').click();
  await page.waitForFunction(() => {
    const feedback = document.querySelector('#register-feedback');
    return feedback && !feedback.hidden && feedback.textContent.includes('password: Password must be at least 8 characters');
  });
  if (requestCount !== 1 || requestBody?.password !== 'valid-pass-8'
    || requestBody?.fullName !== 'Test Citizen'
    || requestBody?.email !== 'citizen@example.test'
    || errors.length > 0) {
    throw new Error(`Registration contract/details check failed: requests=${requestCount}, errors=${errors.join('; ')}`);
  }

  console.log('PASS: password shorter than 8 characters is blocked before any request');
  console.log('PASS: valid form values reach the registration API with expected fields');
  console.log('PASS: structured server validation details are displayed to the user');
  console.log('PASS: no uncaught browser errors');
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
