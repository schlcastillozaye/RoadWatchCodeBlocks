import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const requestedFile = path.resolve(webDirectory, `.${pathname}`);
  if (!requestedFile.startsWith(webDirectory)) {
    response.writeHead(403).end();
    return;
  }
  const file = fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile()
    ? requestedFile
    : path.join(webDirectory, 'index.html');
  response.writeHead(200, { 'content-type': mimeTypes[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
  route.fulfill({ status: 204, body: '' }));

try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#login-form').waitFor();
    await page.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const layout = await page.evaluate(() => {
      const main = document.querySelector('main.rw-auth-page');
      const card = document.querySelector('.rw-auth-card-login');
      const intro = document.querySelector('.rw-auth-intro');
      const mainBounds = main.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      const headings = [...document.querySelectorAll('.rw-auth-page h1, .rw-auth-page h2, .rw-auth-page h3')]
        .map((heading) => ({
          level: Number(heading.tagName.slice(1)),
          text: heading.textContent.trim(),
        }));
      return {
        viewportWidth: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        mainWidth: Math.round(mainBounds.width),
        mainHeight: Math.round(mainBounds.height),
        cardWidth: Math.round(cardBounds.width),
        cardBorder: getComputedStyle(card).borderTopWidth,
        cardShadow: getComputedStyle(card).boxShadow,
        introVisible: getComputedStyle(intro).display !== 'none',
        backHomeVisible: document.querySelector('#login-back-home').getBoundingClientRect().width > 0,
        mainLandmarks: document.querySelectorAll('main').length,
        headingCount: document.querySelectorAll('h1').length,
        headings,
      };
    });
    assert.equal(layout.scrollWidth, layout.viewportWidth, `login overflows at ${viewport.width}px: ${JSON.stringify(layout)}`);
    assert.equal(layout.mainLandmarks, 1);
    assert.equal(layout.headingCount, 1);
    assert.deepEqual(layout.headings, [
      { level: 1, text: 'Better roads start with a clear report.' },
      { level: 2, text: 'Welcome back' },
    ], `login heading hierarchy is not logical: ${JSON.stringify(layout.headings)}`);
    assert.ok(layout.backHomeVisible, `login back link is hidden at ${viewport.width}px`);
    if (viewport.width >= 901) {
      assert.ok(layout.introVisible, `desktop login introduction is hidden at ${viewport.width}px`);
      assert.equal(layout.cardBorder, '0px', 'desktop login card still has a border');
      assert.equal(layout.cardShadow, 'none', 'desktop login card still has a shadow');
      assert.equal(layout.cardWidth < layout.mainWidth, true);
    } else {
      assert.equal(layout.introVisible, false, 'mobile login should keep its existing single-card layout');
    }
  }

  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#login-form').waitFor();
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const contrast = await page.evaluate(() => {
      const ratio = (foreground, background) => {
        const luminance = (color) => {
          const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const fg = luminance(foreground);
        const bg = luminance(background);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      };
      const intro = document.querySelector('.rw-auth-intro');
      const back = document.querySelector('#login-back-home');
      const introText = document.querySelector('.rw-auth-intro-copy');
      return {
        intro: ratio(getComputedStyle(introText).color, getComputedStyle(intro).backgroundColor),
        backHome: ratio(getComputedStyle(back).color, getComputedStyle(back).backgroundColor),
      };
    });
    assert.ok(contrast.intro >= 4.5 && contrast.backHome >= 4.5,
      `${theme} login text contrast failed: ${JSON.stringify(contrast)}`);
  }

  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-form').waitFor();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => ({
    id: document.activeElement.id,
    outline: getComputedStyle(document.activeElement).outlineStyle,
    width: getComputedStyle(document.activeElement).outlineWidth,
  }));
  assert.equal(firstFocus.id, 'login-back-home');
  assert.equal(firstFocus.outline, 'solid');
  assert.ok(parseFloat(firstFocus.width) >= 2);

  await page.locator('#login-back-home').click();
  await page.getByRole('heading', { name: 'Better roads start with a clear report.' }).waitFor();
  const brandLinkName = await page.locator('#nav-home').getAttribute('aria-label');
  assert.ok(brandLinkName.includes('CODEBLOCKS INC.'), `brand link name omits its visible label: ${brandLinkName}`);

  await page.goto(`${origin}/register`, { waitUntil: 'domcontentloaded' });
  await page.locator('#register-form').waitFor();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await page.evaluate(() => {
      const card = document.querySelector('.rw-auth-register-card');
      const form = document.querySelector('#register-form');
      const cardBounds = card.getBoundingClientRect();
      const themeToggle = document.querySelector('.rw-auth-theme-toggle').getBoundingClientRect();
      return {
        viewportWidth: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cardWidth: Math.round(cardBounds.width),
        cardTop: Math.round(cardBounds.top),
        cardRight: Math.round(cardBounds.right),
        cardBorder: getComputedStyle(card).borderTopWidth,
        cardRadius: getComputedStyle(card).borderTopLeftRadius,
        columns: getComputedStyle(form).gridTemplateColumns.split(' ').length,
        fieldsFit: [...form.querySelectorAll('input')].every((input) => {
          const bounds = input.getBoundingClientRect();
          return bounds.left >= cardBounds.left && bounds.right <= cardBounds.right;
        }),
        themeBottom: Math.round(themeToggle.bottom),
      };
    });
    assert.equal(layout.scrollWidth, layout.viewportWidth,
      `registration overflows at ${viewport.width}px: ${JSON.stringify(layout)}`);
    assert.ok(layout.cardWidth > Math.min(layout.viewportWidth * 0.7, 780),
      `registration card is too narrow at ${viewport.width}px: ${JSON.stringify(layout)}`);
    assert.ok(layout.cardRight <= layout.viewportWidth, `registration card is clipped: ${JSON.stringify(layout)}`);
    assert.ok(layout.fieldsFit, `registration inputs do not fit at ${viewport.width}px: ${JSON.stringify(layout)}`);
    assert.ok(parseFloat(layout.cardBorder) >= 1);
    assert.ok(parseFloat(layout.cardRadius) >= 16);
    assert.equal(layout.columns, viewport.width >= 768 ? 2 : 1,
      `unexpected registration field columns at ${viewport.width}px: ${JSON.stringify(layout)}`);
    if (viewport.width <= 639) {
      assert.ok(layout.cardTop >= layout.themeBottom,
        `registration card overlaps the theme control at ${viewport.width}px: ${JSON.stringify(layout)}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const registerLabels = await page.locator('#register-form input').evaluateAll((inputs) =>
    inputs.map((input) => ({
      id: input.id,
      label: input.labels?.[0]?.textContent.trim() || '',
    })));
  assert.deepEqual(registerLabels.map((field) => field.label), [
    'Full name',
    'Email address',
    'Phone (optional)',
    'Password',
  ]);
  assert.ok(await page.locator('#register-back-home').isVisible());
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const registerHomeFocus = await page.evaluate(() => ({
    id: document.activeElement.id,
    outline: getComputedStyle(document.activeElement).outlineStyle,
    width: getComputedStyle(document.activeElement).outlineWidth,
  }));
  assert.equal(registerHomeFocus.id, 'register-back-home');
  assert.equal(registerHomeFocus.outline, 'solid');
  assert.ok(parseFloat(registerHomeFocus.width) >= 2);
  const passwordToggle = page.locator('#register-form .rw-password-toggle');
  assert.equal(await passwordToggle.getAttribute('aria-label'), 'Show password');
  await passwordToggle.click();
  assert.equal(await passwordToggle.getAttribute('aria-label'), 'Hide password');
  assert.equal(await page.locator('#register-password').getAttribute('type'), 'text');
  await passwordToggle.click();
  assert.equal(await page.locator('#register-password').getAttribute('type'), 'password');
  const registerHeaderLayout = await page.evaluate(() => {
    const home = document.querySelector('#register-back-home').getBoundingClientRect();
    const logo = document.querySelector('.rw-auth-brand').getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      homeAboveBrand: home.bottom <= logo.top,
    };
  });
  assert.ok(registerHeaderLayout.scrollWidth <= registerHeaderLayout.viewportWidth);
  assert.ok(registerHeaderLayout.homeAboveBrand, `registration back link overlaps the brand: ${JSON.stringify(registerHeaderLayout)}`);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await page.waitForTimeout(200);
    const registerContrast = await page.evaluate(() => {
      const luminance = (color) => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const ratio = (foreground, background) => {
        const fg = luminance(foreground);
        const bg = luminance(background);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      };
      const card = document.querySelector('.rw-auth-register-card');
      const label = document.querySelector('label[for="register-full-name"]');
      const input = document.querySelector('#register-full-name');
      return {
        label: ratio(getComputedStyle(label).color, getComputedStyle(card).backgroundColor),
        input: ratio(getComputedStyle(input).color, getComputedStyle(input).backgroundColor),
        labelColor: getComputedStyle(label).color,
        cardColor: getComputedStyle(card).backgroundColor,
        inputColor: getComputedStyle(input).color,
        inputBackground: getComputedStyle(input).backgroundColor,
        border: getComputedStyle(card).borderColor,
      };
    });
    assert.ok(registerContrast.label >= 4.5 && registerContrast.input >= 4.5,
      `${theme} registration text contrast failed: ${JSON.stringify(registerContrast)}`);
    assert.notEqual(registerContrast.border, 'rgba(0, 0, 0, 0)',
      `${theme} registration card border is not visible`);
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.locator('#register-back-home').click();
  await page.getByRole('heading', { name: 'Better roads start with a clear report.' }).waitFor();
  assert.deepEqual(pageErrors, []);
  console.log('PASS: desktop login uses the split-screen layout without a floating card');
  console.log('PASS: mobile login retains its single-card layout without horizontal overflow');
  console.log('PASS: login introduction and Back to Home link meet AA text contrast in light and dark modes');
  console.log('PASS: keyboard focus starts on the visible Back to Home link with a clear focus ring');
  console.log('PASS: login and registration Back to Home links return to the public landing page');
  console.log('PASS: registration fields have programmatically associated visible labels');
  console.log('PASS: registration uses a balanced two-column desktop/tablet layout and a single-column mobile layout');
  console.log('PASS: registration fits all five requested viewport sizes without horizontal overflow');
  console.log('PASS: registration card and input text meet AA contrast in light and dark modes');
  console.log('PASS: registration Back to Home and password visibility controls are keyboard accessible');
  console.log('PASS: the home brand link accessible name includes its visible label');
  console.log('PASS: no uncaught browser errors');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) =>
    error ? reject(error) : resolve()));
}
