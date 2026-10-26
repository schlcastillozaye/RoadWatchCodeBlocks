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
  const requestedFile = pathname === '/'
    ? path.join(webDirectory, 'index.html')
    : path.resolve(webDirectory, `.${pathname}`);
  if (!requestedFile.startsWith(webDirectory)) {
    response.writeHead(403).end();
    return;
  }
  const file = fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile()
    ? requestedFile
    : path.join(webDirectory, 'index.html');
  response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
let previewUser = null;
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
  route.fulfill({ status: 204, body: '' }));
await page.route('**/api/**', async (route) => {
  const endpoint = new URL(route.request().url()).pathname.replace(/^\/api/, '');
  const body = endpoint === '/auth/me' ? { user: previewUser } : {};
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
await page.route('https://*.tile.openstreetmap.org/**', (route) =>
  route.fulfill({ status: 204, body: '' }));

const contrast = (foreground, background) => {
  const rgb = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) throw new Error(`Unsupported computed color: ${value}`);
    return match[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map(Number);
  };
  const luminance = (value) => {
    const channels = rgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const fg = luminance(foreground);
  const bg = luminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
};

const verifyPalette = async (theme) => {
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  await page.waitForTimeout(180);
  const samples = await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.innerHTML = `
      <section class="brand-card">
        <p class="text-slate-tint">Muted help text</p>
        <label>Issue title<input class="brand-input" placeholder="Issue title"></label>
        <button class="btn btn-primary">Primary action</button>
        <button class="btn btn-danger">Destructive action</button>
        <button class="btn btn-primary" disabled>Disabled action</button>
        <span class="text-amber-100 bg-amber-900/20">Pending</span>
        <span class="text-green-100 bg-green-900/20">Complete</span>
        <span class="text-red-100 bg-red-900/20">Rejected</span>
        <span class="text-blue-100 bg-blue-900/20">In progress</span>
        <span class="text-red-400">Error text</span>
        <span class="bg-amber-400">Status marker</span>
      </section>
      <aside class="admin-sidebar"><nav class="admin-sidebar-nav"><a href="#">Workspace link</a></nav></aside>
      <p class="rw-auth-feedback">Authentication error</p>`;
    document.body.append(fixture);
    const effectiveBackground = (element) => {
      const layers = [];
      let node = element;
      while (node && node !== document.documentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') layers.push(color);
        node = node.parentElement;
      }
      let result = [255, 255, 255];
      layers.reverse().forEach((color) => {
        const values = color.match(/[\d.]+/g).map(Number);
        const alpha = values.length > 3 ? values[3] : 1;
        result = result.map((channel, index) => values[index] * alpha + channel * (1 - alpha));
      });
      return `rgb(${result.map(Math.round).join(', ')})`;
    };
    const sample = (selector, pseudo = null) => {
      const element = fixture.querySelector(selector);
      const style = getComputedStyle(element, pseudo);
      return {
        selector,
        color: style.color,
        background: effectiveBackground(element),
        border: style.borderTopColor,
      };
    };
    const input = fixture.querySelector('.brand-input');
    const disabled = fixture.querySelector('button:disabled');
    const sidebarLink = fixture.querySelector('.admin-sidebar-nav a');
    const error = fixture.querySelector('.rw-auth-feedback');
    const styles = {
      body: { color: getComputedStyle(document.body).color, background: getComputedStyle(document.body).backgroundColor },
      card: { color: getComputedStyle(fixture.querySelector('.brand-card')).color, background: getComputedStyle(fixture.querySelector('.brand-card')).backgroundColor },
      muted: sample('.text-slate-tint'),
      placeholder: { color: getComputedStyle(input, '::placeholder').color, background: getComputedStyle(input).backgroundColor, border: getComputedStyle(input).borderTopColor },
      primary: sample('.btn-primary'),
      danger: sample('.btn-danger'),
      disabled: { color: getComputedStyle(disabled).color, background: getComputedStyle(disabled).backgroundColor },
      sidebar: { color: getComputedStyle(sidebarLink).color, background: getComputedStyle(sidebarLink.closest('.admin-sidebar')).backgroundColor },
      error: { color: getComputedStyle(error).color, background: getComputedStyle(error).backgroundColor },
      landingPrimary: {
        color: getComputedStyle(document.querySelector('.rw-landing-button-primary')).color,
        background: effectiveBackground(document.querySelector('.rw-landing-button-primary')),
      },
      landingSecondary: {
        color: getComputedStyle(document.querySelector('.rw-landing-button-secondary')).color,
        background: effectiveBackground(document.querySelector('.rw-landing-button-secondary')),
      },
      statuses: [...fixture.querySelectorAll('.text-amber-100, .text-green-100, .text-red-100, .text-blue-100')].map((element) => ({
        color: getComputedStyle(element).color,
        background: effectiveBackground(element),
      })),
      statusMarker: {
        color: getComputedStyle(fixture.querySelector('.bg-amber-400')).backgroundColor,
        background: getComputedStyle(fixture.querySelector('.brand-card')).backgroundColor,
      },
      focus: (() => {
        input.focus();
        return {
          border: getComputedStyle(input).borderTopColor,
          outlineColor: getComputedStyle(input).outlineColor,
          outlineStyle: getComputedStyle(input).outlineStyle,
        };
      })(),
    };
    fixture.remove();
    return styles;
  });

  const failures = [];
  const check = (name, foreground, background, minimum) => {
    const ratio = contrast(foreground, background);
    if (ratio < minimum) failures.push({ name, ratio: Number(ratio.toFixed(2)), minimum, foreground, background });
    return Number(ratio.toFixed(2));
  };
  const ratios = {
    body: check('body text on page', samples.body.color, samples.body.background, 4.5),
    muted: check('muted text on card', samples.muted.color, samples.card.background, 4.5),
    placeholder: check('placeholder on input', samples.placeholder.color, samples.placeholder.background, 4.5),
    inputBorder: check('input border against input fill', samples.placeholder.border, samples.placeholder.background, 3),
    primaryButton: check('primary button label', samples.primary.color, samples.primary.background, 4.5),
    dangerButton: check('danger button label', samples.danger.color, samples.danger.background, 4.5),
    disabledButton: check('disabled button label', samples.disabled.color, samples.disabled.background, 4.5),
    sidebar: check('sidebar navigation label', samples.sidebar.color, samples.sidebar.background, 4.5),
    error: check('error feedback', samples.error.color, samples.error.background, 4.5),
    landingPrimary: check('landing primary action', samples.landingPrimary.color, samples.landingPrimary.background, 4.5),
    landingSecondary: check('landing secondary action', samples.landingSecondary.color, samples.landingSecondary.background, 4.5),
    statuses: samples.statuses.map((status, index) =>
      check(`status badge ${index + 1}`, status.color, status.background, 4.5)),
    statusMarker: check('status marker', samples.statusMarker.color, samples.statusMarker.background, 3),
  };
  assert.deepEqual(failures, [], `${theme} theme has WCAG contrast failures: ${JSON.stringify(failures)}`);
  return { theme, ratios };
};

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.rw-landing-hero');
  assert.equal(await page.getByRole('heading', { name: 'Better roads start with a clear report.' }).count(), 1);
  assert.equal(await page.locator('.rw-landing-hero-actions .rw-landing-button-primary').count(), 1);
  assert.equal(await page.locator('.rw-landing-steps li').count(), 3);

  const layouts = [];
  const contrastResults = [];
  const hoverResults = [];
  for (const theme of ['light', 'dark']) {
    contrastResults.push(await verifyPalette(theme));
    for (const selector of [
      '.rw-landing-button-primary',
      '.rw-landing-button-secondary',
      '.rw-public-header-actions .rw-nav-login',
      '.rw-public-header-actions .rw-nav-register',
    ]) {
      await page.locator(selector).hover();
      await page.waitForTimeout(180);
      const colors = await page.locator(selector).evaluate((element) => ({
        foreground: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
      }));
      const ratio = contrast(colors.foreground, colors.background);
      assert.ok(ratio >= 4.5, `${theme} hover contrast failed for ${selector}: ${ratio.toFixed(2)}:1 (${JSON.stringify(colors)})`);
      hoverResults.push({ theme, selector, ratio: Number(ratio.toFixed(2)) });
    }
    await page.mouse.move(0, 0);
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await page.evaluate(() => {
        const cta = document.querySelector('.rw-landing-hero-actions .rw-landing-button-primary');
        cta.focus();
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          heroColumns: getComputedStyle(document.querySelector('.rw-landing-hero')).gridTemplateColumns,
          cardColumns: getComputedStyle(document.querySelector('.rw-landing-card-grid')).gridTemplateColumns,
          focusOutline: getComputedStyle(cta).outlineStyle,
          focusOutlineWidth: getComputedStyle(cta).outlineWidth,
          visibleMainHeading: Boolean(document.querySelector('#rw-landing-title')?.getClientRects().length),
        };
      });
      assert.ok(layout.scrollWidth <= layout.width, `Landing page overflows at ${viewport.width}px`);
      assert.ok(layout.visibleMainHeading, `Landing heading is not visible at ${viewport.width}px`);
      if (viewport.width <= 640) {
        assert.equal(layout.cardColumns.split(' ').length, 1, 'Mobile landing cards should be stacked');
      }
      assert.notEqual(layout.focusOutline, 'none');
      assert.ok(parseFloat(layout.focusOutlineWidth) >= 2);
      layouts.push({ theme, ...viewport, ...layout });
    }
    assert.ok(contrastResults.at(-1).ratios.inputBorder >= 3);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.navigateTo('/login'));
  await page.waitForSelector('#login-form');
  assert.equal(await page.locator('#login-form').count(), 1);
  await page.evaluate(() => window.navigateTo('/register'));
  await page.waitForSelector('#register-form');
  assert.equal(await page.locator('#register-form').count(), 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.navigateTo('/'));
  await page.waitForSelector('.rw-landing-hero');
  const reducedMotion = await page.evaluate(() => ({
    readyClass: document.documentElement.classList.contains('rw-motion-ready'),
    revealOpacity: getComputedStyle(document.querySelector('.rw-landing-hero-copy')).opacity,
    revealTranslateY: (() => {
      const transform = getComputedStyle(document.querySelector('.rw-landing-hero-copy')).transform;
      return transform === 'none' ? 0 : new DOMMatrix(transform).m42;
    })(),
  }));
  assert.equal(reducedMotion.readyClass, false);
  assert.equal(reducedMotion.revealOpacity, '1');
  assert.equal(reducedMotion.revealTranslateY, 0);

  await page.keyboard.press('Tab');
  const keyboardFocus = await page.evaluate(() => ({
    tag: document.activeElement.tagName,
    outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
    outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
  }));
  assert.notEqual(keyboardFocus.outlineStyle, 'none');
  assert.ok(parseFloat(keyboardFocus.outlineWidth) >= 2);

  const roleLayouts = [];
  for (const role of ['CITIZEN', 'MAINTENANCE_OFFICER', 'ADMIN']) {
    previewUser = {
      id: `preview-${role.toLowerCase()}`,
      fullName: `Preview ${role}`,
      email: `preview-${role.toLowerCase()}@example.invalid`,
      role,
    };
    await page.evaluate(() => localStorage.setItem('roadwatch_auth_token', 'synthetic-layout-preview'));
    await page.goto(`${origin}/submit-report`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#report-form');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await page.waitForTimeout(180);
      for (const viewport of [
        { width: 375, height: 667 },
        { width: 1024, height: 768 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await page.evaluate(() => {
          const workspace = document.querySelector('.admin-workspace');
          const content = document.querySelector('.admin-content').getBoundingClientRect();
          const pageWrapper = document.querySelector('.rw-submit-report-page');
          const card = document.querySelector('.rw-report-form-card').getBoundingClientRect();
          const sidebar = document.querySelector('.admin-sidebar');
          const sidebarLink = sidebar.querySelector('.admin-sidebar-nav a');
          const panel = document.querySelector('.rw-report-form-card');
          const input = document.querySelector('#report-form input[name="title"]');
          const button = document.querySelector('.rw-report-submit');
          return {
            role: workspace.dataset.workspaceRole,
            width: innerWidth,
            mediaDesktop: matchMedia('(min-width: 1024px)').matches,
            mediaMobile: matchMedia('(max-width: 1023px)').matches,
            scrollWidth: document.documentElement.scrollWidth,
            contentWidth: Math.round(content.width),
            pageWidth: Math.round(pageWrapper.getBoundingClientRect().width),
            pagePadding: getComputedStyle(pageWrapper).paddingInline,
            pagePaddingLeft: getComputedStyle(pageWrapper).paddingLeft,
            pagePaddingRight: getComputedStyle(pageWrapper).paddingRight,
            pageClasses: pageWrapper.className,
            inlineStyle: pageWrapper.getAttribute('style'),
            matchedPaddingRules: (() => {
              const matched = [];
              const visit = (rules) => [...rules].forEach((rule) => {
                if (rule.media) {
                  if (matchMedia(rule.conditionText).matches) visit(rule.cssRules);
                } else if (rule.selectorText && pageWrapper.matches(rule.selectorText)
                  && (rule.style.padding || rule.style.paddingInline || rule.style.paddingLeft)) {
                  matched.push({ selector: rule.selectorText, padding: rule.style.padding, paddingInline: rule.style.paddingInline, paddingLeft: rule.style.paddingLeft });
                }
              });
              [...document.styleSheets].forEach((sheet) => {
                try { visit(sheet.cssRules); } catch {}
              });
              return matched;
            })(),
            cardWidth: Math.round(card.width),
            formDisplay: getComputedStyle(document.querySelector('#report-form')).display,
            sidebarText: getComputedStyle(sidebarLink).color,
            sidebarBackground: getComputedStyle(sidebar).backgroundColor,
            formLabel: getComputedStyle(document.querySelector('#report-form label')).color,
            panelBackground: getComputedStyle(panel).backgroundColor,
            inputPlaceholder: getComputedStyle(input, '::placeholder').color,
            inputBackground: getComputedStyle(input).backgroundColor,
            inputBorder: getComputedStyle(input).borderTopColor,
            buttonText: getComputedStyle(button).color,
            buttonBackground: getComputedStyle(button).backgroundColor,
          };
        });
        assert.equal(layout.role, role);
        assert.equal(layout.scrollWidth, layout.width, `${role} workspace overflows at ${viewport.width}px`);
        if (viewport.width >= 1024) {
          assert.ok(layout.cardWidth >= layout.contentWidth - 2, `${role} report form is constrained on desktop: ${JSON.stringify(layout)}`);
          assert.equal(layout.formDisplay, 'grid');
        } else {
          assert.notEqual(layout.formDisplay, 'grid', `${role} mobile form should retain its stacked layout`);
        }
        const coreRatios = {
          sidebar: contrast(layout.sidebarText, layout.sidebarBackground),
          label: contrast(layout.formLabel, layout.panelBackground),
          placeholder: contrast(layout.inputPlaceholder, layout.inputBackground),
          inputBorder: contrast(layout.inputBorder, layout.inputBackground),
          button: contrast(layout.buttonText, layout.buttonBackground),
        };
        assert.ok(coreRatios.sidebar >= 4.5 && coreRatios.label >= 4.5
          && coreRatios.placeholder >= 4.5 && coreRatios.inputBorder >= 3
          && coreRatios.button >= 4.5,
        `${role} ${theme} form contrast failed: ${JSON.stringify(coreRatios)}`);
        roleLayouts.push({ theme, ...viewport, role: layout.role, cardWidth: layout.cardWidth, contentWidth: layout.contentWidth, coreRatios });
      }
    }
  }
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    passed: true,
    contrastResults,
    hoverResults,
    layouts,
    loginAndRegistrationRoutes: true,
    reducedMotion,
    keyboardFocus,
    roleLayouts,
    consoleErrors,
    pageErrors,
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) =>
    error ? reject(error) : resolve()));
}
