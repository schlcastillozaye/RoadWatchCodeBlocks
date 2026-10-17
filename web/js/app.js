/* ---------------------------------------------------------------------------
   RoadWatch Web Platform — Plain JS Frontend
   Talks to the PHP API (base URL from web/config.js -> window.RW_API_BASE).
   Routes are under /api (e.g. /api/auth/login).
   --------------------------------------------------------------------------- */

(function () {
  'use strict';

  // --- Configuration ---------------------------------------------------------
  // Resolve the API origin lazily (on each request) from the runtime
  // configuration, so whichever of config.js / rw-runtime-config.js ran last
  // wins and an override is never missed. RW_API_BASE_URL is the documented
  // override (written by the container from the env var); RW_API_BASE is the
  // value config.js derives from it or from auto-detection.
  const resolveApiBase = () => {
    const raw = (typeof window.RW_API_BASE_URL === 'string' && window.RW_API_BASE_URL)
      || (typeof window.RW_API_BASE === 'string' && window.RW_API_BASE)
      || '';
    // Drop trailing slashes; a leading-slash path is added by the callers below.
    const trimmed = String(raw).replace(/\/+$/, '');
    // Standalone fallback (no config.js loaded): the local PHP dev API.
    return trimmed || 'http://127.0.0.1:4000';
  };
  const TOKEN_KEY = 'roadwatch_auth_token';
  const THEME_KEY = 'roadwatch_theme';

  const currentTheme = () => document.documentElement.dataset.theme || 'light';
  const themeToggleHtml = (className = '') => `
    <button type="button" class="rw-theme-toggle ${className}" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode">
      <svg class="rw-theme-icon rw-theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"></path>
      </svg>
      <svg class="rw-theme-icon rw-theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"></path>
      </svg>
      <span class="rw-theme-label">Dark mode</span>
    </button>`;

  const updateThemeToggleLabels = () => {
    const nextTheme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const label = nextTheme === 'dark' ? 'Switch to dark mode' : 'Switch to light mode';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      const text = button.querySelector('.rw-theme-label');
      if (text) text.textContent = nextTheme === 'dark' ? 'Dark mode' : 'Light mode';
    });
  };

  const setTheme = (theme, persist = false) => {
    document.documentElement.dataset.theme = theme;
    const themeColor = document.getElementById('rw-theme-color');
    if (themeColor) themeColor.content = theme === 'dark' ? '#0b1729' : '#eaf0fa';
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (error) {
        console.warn('Could not save RoadWatch theme preference:', error);
      }
    }
    updateThemeToggleLabels();
  };

  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  systemTheme.addEventListener('change', (event) => {
    try {
      if (localStorage.getItem(THEME_KEY) === 'light' || localStorage.getItem(THEME_KEY) === 'dark') return;
    } catch (error) {
      console.warn('Could not read RoadWatch theme preference:', error);
    }
    setTheme(event.matches ? 'dark' : 'light');
  });

  // Build an absolute URL for an API asset path (photo URLs come back absolute
  // already; this is a safety net for relative ones).
  const absoluteUrl = (url) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (typeof window.RW_absoluteUrl === 'function') return window.RW_absoluteUrl(url);
    return resolveApiBase() + (url.charAt(0) === '/' ? '' : '/') + url;
  };

  // --- DOM helpers -----------------------------------------------------------
  const q = (sel, parent = document) => parent.querySelector(sel);
  const qa = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));
  const on = (el, event, handler) => { if (el) el.addEventListener(event, handler); };
  const html = (el, content) => {
    if (!el) return;
    if (content === undefined) return el.innerHTML;
    el.innerHTML = content;
    return el;
  };
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value === null || value === undefined ? '' : String(value);
  };
  const create = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    if (attrs.class) el.className = attrs.class;
    if (attrs.id) el.id = attrs.id;
    if (attrs.innerHTML) el.innerHTML = attrs.innerHTML;
    if (attrs.textContent !== undefined) el.textContent = attrs.textContent;
    Object.keys(attrs)
      .filter((k) => !['class', 'id', 'innerHTML', 'textContent', 'children'].includes(k))
      .forEach((k) => el.setAttribute(k, attrs[k]));
    (children || attrs.children || []).forEach((c) => {
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  };

  const notify = (message) => {
    let region = document.getElementById('rw-notifications');
    if (!region) {
      region = document.createElement('div');
      region.id = 'rw-notifications';
      region.className = 'rw-notifications';
      region.setAttribute('aria-live', 'assertive');
      region.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(region);
    }
    const notice = document.createElement('div');
    notice.className = 'rw-notice';
    notice.setAttribute('role', 'alert');
    const text = document.createElement('p');
    text.textContent = message;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'rw-notice-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss notification');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => notice.remove());
    notice.append(text, dismiss);
    region.replaceChildren(notice);
  };

  // --- State -----------------------------------------------------------------
  let user = null;
  let flash = null; // one-shot success message handed between pages
  const deletingReportIds = new Set();

  // --- Auth ------------------------------------------------------------------
  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
  const clearToken = () => localStorage.removeItem(TOKEN_KEY);
  const setUser = (u) => { user = u; };
  const getUser = () => user;

  // API request wrapper -------------------------------------------------------
  async function api(path, options = {}) {
    const token = getToken();
    const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!isForm && options.body !== undefined && options.body !== null && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.headers) Object.assign(headers, options.headers);

    const resp = await fetch(`${resolveApiBase()}/api${path}`, { ...options, headers });

    let data = null;
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await resp.json().catch(() => null);
    } else {
      data = await resp.text().catch(() => '');
    }

    if (!resp.ok) {
      const message = (data && data.error && data.error.message)
        || (data && data.message)
        || `HTTP ${resp.status}`;
      const err = new Error(message);
      err.status = resp.status;
      err.details = data && data.error ? data.error.details : undefined;
      throw err;
    }
    return data;
  }

  // --- Authenticated image loading -------------------------------------------
  // Photos on non-approved reports require a Bearer token (FilesController),
  // so a bare <img src> receives a 401 JSON body which the browser blocks as
  // ERR_BLOCKED_BY_ORB (a broken image). Private photos are rendered with
  // `data-authed-src`, then fetched here with the token and swapped to a blob:
  // URL. Public photos (e.g. approved map thumbnails) use a normal `src`.
  const blobUrlCache = new Map();
  const loadAuthedImage = (img) => {
    const src = img.getAttribute('data-authed-src');
    if (!src) return Promise.resolve();
    img.removeAttribute('data-authed-src');
    if (blobUrlCache.has(src)) { img.src = blobUrlCache.get(src); return Promise.resolve(); }
    const token = getToken();
    return fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.blob();
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        blobUrlCache.set(src, objectUrl);
        img.src = objectUrl;
      })
      .catch(() => { img.alt = img.alt || 'Photo unavailable'; });
  };
  const hydrateAuthedImages = (scope) => {
    qa('img[data-authed-src]', scope || document).forEach((img) => { loadAuthedImage(img); });
  };

  // --- Formatting helpers ----------------------------------------------------
  const escapeHtml = (s) => {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const relativeDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const day = 86400000;
    if (diff < 0) return 'just now';
    if (diff < 3600000) {
      const m = Math.max(1, Math.floor(diff / 60000));
      return m + (m === 1 ? ' minute ago' : ' minutes ago');
    }
    if (diff < day) {
      const h = Math.floor(diff / 3600000);
      return h + (h === 1 ? ' hour ago' : ' hours ago');
    }
    const dd = Math.floor(diff / day);
    return dd + (dd === 1 ? ' day ago' : ' days ago');
  };

  const CATEGORY_META = {
    POTHOLE: { icon: '🕳️', label: 'Pothole' },
    DAMAGED_PAVEMENT: { icon: '🛣️', label: 'Damaged Pavement' },
    ROAD_CRACK: { icon: '🩹', label: 'Road Crack' },
    FLOODING: { icon: '🌊', label: 'Flooding' },
    DAMAGED_DRAINAGE: { icon: '🚿', label: 'Damaged Drainage' },
    OTHER: { icon: 'ℹ️', label: 'Other' },
  };
  const categoryIcon = (cat) => (CATEGORY_META[String(cat || '').toUpperCase()] || CATEGORY_META.OTHER).icon;
  const categoryLabel = (cat) => (CATEGORY_META[String(cat || '').toUpperCase()] || CATEGORY_META.OTHER).label;

  const reportLocation = (r) => r.areaLabel || r.addressText || 'Location not specified';

  const statusBadge = (mod, repair) => {
    if (mod === 'REJECTED') return `<span class="text-red-100 bg-red-900/20 px-2 py-1 rounded text-[10]">Rejected</span>`;
    if (mod === 'PENDING_REVIEW' || !mod) return `<span class="text-amber-100 bg-amber-900/20 px-2 py-1 rounded text-[10]">Pending review</span>`;
    if (repair === 'COMPLETED') return `<span class="text-green-100 bg-green-900/20 px-2 py-1 rounded text-[10]">Completed</span>`;
    if (repair === 'IN_PROGRESS') return `<span class="text-blue-100 bg-blue-900/20 px-2 py-1 rounded text-[10]">In progress</span>`;
    if (repair === 'AWAITING_MAINTENANCE') return `<span class="text-amber-100 bg-amber-900/20 px-2 py-1 rounded text-[10]">Awaiting maintenance</span>`;
    return `<span class="text-green-100 bg-green-900/20 px-2 py-1 rounded text-[10]">Approved</span>`;
  };

  const reportCardHtml = (r) => {
    const photo = (r.photos && r.photos[0]) || null;
    const thumb = r.thumbnailUrl || (photo ? photo.url : '');
    // A thumbnailUrl is always a public (APPROVED) image; a photos[] entry is
    // private unless the API marks it public, so it must be auth-fetched.
    const needsAuth = !r.thumbnailUrl && photo && photo.isPublic === false;
    const imgAttr = needsAuth
      ? `data-authed-src="${escapeHtml(absoluteUrl(thumb))}"`
      : `src="${escapeHtml(absoluteUrl(thumb))}"`;
    return `
    <article class="brand-card p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer" data-nav="/report/${encodeURIComponent(r.id)}">
      <div class="flex items-start gap-4">
        ${thumb
          ? `<img ${imgAttr} alt="${escapeHtml(r.title)}" class="w-16 h-16 rounded flex-shrink-0 object-cover" />`
          : `<div class="w-16 h-16 rounded flex-shrink-0 bg-sheet flex items-center justify-center"><span class="text-sm font-medium text-ink-3">${categoryIcon(r.category)}</span></div>`}
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-navy line-clamp-1">${escapeHtml(r.title)}</h3>
          <p class="text-sm text-slate-tint line-clamp-1">${escapeHtml(reportLocation(r))}</p>
        </div>
      </div>
      <div class="mt-3 flex items-center justify-between text-xs">
        <span>${statusBadge(r.moderationStatus, r.repairStatus)}</span>
        <span class="text-slate-400">${escapeHtml(relativeDate(r.createdAt))}</span>
      </div>
    </article>`;
  };

  // --- Page templates --------------------------------------------------------

  const brandLogoHtml = (theme) => `
    <span class="rw-brand-lockup rw-brand-lockup--${theme}" role="img" aria-label="Code Blocks Inc.">
      <span class="rw-brand-mark" aria-hidden="true">
        <span class="rw-brand-block"></span>
        <span class="rw-brand-block rw-brand-block--accent"></span>
        <span class="rw-brand-block"></span>
        <span class="rw-brand-block"></span>
        <span class="rw-brand-block rw-brand-block--accent"></span>
      </span>
      <span class="rw-brand-wordmark">
        <span class="rw-brand-name">CODEBLOCKS</span>
        <span class="rw-brand-inc">INC.</span>
      </span>
    </span>`;

  const pageLogin = () => `
    <section class="min-vh-100 flex items-center justify-center p-4 bg-sheet rw-auth-page">
      ${themeToggleHtml('rw-auth-theme-toggle')}
      <div class="brand-card w-full max-w-md p-8 rounded-xl shadow-lg">
        <div class="text-center mb-6">
          <div class="rw-auth-brand">${brandLogoHtml('light')}</div>
          <h1 class="text-3xl font-bold text-navy tracking-tight">Welcome back</h1>
          <p class="text-sm text-slate-tint mt-1">Sign in to continue</p>
        </div>
        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2" for="login-email">Email address</label>
            <input id="login-email" type="email" name="email" required class="w-full brand-input" placeholder="you@example.com" autocomplete="username" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2" for="login-password">Password</label>
            <input id="login-password" type="password" name="password" required class="w-full brand-input" placeholder="••••••••" autocomplete="current-password" />
          </div>
          <p id="login-feedback" class="rw-auth-feedback" role="alert" aria-live="assertive" tabindex="-1" hidden></p>
          <button type="submit" class="btn btn-primary w-full">Sign in</button>
          <p class="text-center text-sm text-slate-tint mt-3">
            New to RoadWatch? <a href="/register" id="show-register" class="font-medium text-navy underline">Create account</a>
          </p>
        </form>
      </div>
    </section>
  `;

  const pageRegister = () => `
    <section class="min-vh-100 flex items-center justify-center p-4 bg-sheet rw-auth-page">
      ${themeToggleHtml('rw-auth-theme-toggle')}
      <div class="brand-card w-full max-w-md p-8 rounded-xl shadow-lg">
        <div class="text-center mb-6">
          <div class="rw-auth-brand">${brandLogoHtml('light')}</div>
          <h1 class="text-3xl font-bold text-navy tracking-tight">Create account</h1>
          <p class="text-sm text-slate-tint mt-1">Join RoadWatch and report road issues</p>
        </div>
        <form id="register-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2">Full name</label>
            <input type="text" name="fullName" required class="w-full brand-input" placeholder="John Doe" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2">Email address</label>
            <input type="email" name="email" required class="w-full brand-input" placeholder="you@example.com" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2">Phone (optional)</label>
            <input type="tel" name="phone" class="w-full brand-input" placeholder="+63 912 345 6789" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2">Password</label>
            <input type="password" name="password" required class="w-full brand-input" placeholder="••••••••" />
          </div>
          <p id="register-feedback" class="rw-auth-feedback" role="alert" aria-live="assertive" tabindex="-1" hidden></p>
          <button type="submit" class="btn btn-primary w-full">Create account</button>
          <p class="text-center text-sm text-slate-tint mt-3">
            Already have an account? <a href="/login" id="show-login" class="font-medium text-navy underline">Sign in</a>
          </p>
        </form>
      </div>
    </section>
  `;

  // The global header is rendered by the router for every non-auth route, so
  // navigation is available on /reports, /map, /admin … and not only the home
  // page. The role-gated links only point at routes the signed-in user may open
  // (the router would otherwise bounce them straight back).
  const headerHtml = () => {
    const u = getUser();
    const firstName = u ? escapeHtml((u.fullName || '').split(' ')[0] || 'there') : '';
    const active = (path) => window.location.pathname === path ? ' is-active' : '';
    const roleLinks = !u
      ? ''
      : u.role === 'ADMIN'
        ? `<a href="/admin" data-nav="/admin" class="rw-nav-link${active('/admin')}">Admin</a>`
          + `<a href="/audit" data-nav="/audit" class="rw-nav-link${active('/audit')}">Audit log</a>`
        : u.role === 'MAINTENANCE_OFFICER'
          ? `<a href="/assignments" data-nav="/assignments" class="rw-nav-link${active('/assignments')}">Assignments</a>`
          : '';
    return `
    <header class="rw-header">
      <div class="rw-header-inner">
        <a href="/" id="nav-home" data-nav="/" class="rw-brand-home" aria-label="RoadWatch by Code Blocks Inc.">${brandLogoHtml('dark')}</a>
        <button type="button" class="rw-mobile-menu-toggle" data-mobile-menu-toggle aria-expanded="false" aria-controls="rw-primary-nav">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>
          <span>Menu</span>
        </button>
        <nav id="rw-primary-nav" class="rw-primary-nav" aria-label="Primary navigation">
          <a href="/map" data-nav="/map" class="rw-nav-link${active('/map')}">Map</a>
          ${u ? `
            <a href="/reports" data-nav="/reports" class="rw-nav-link${active('/reports')}">My Reports</a>
            <a href="/submit-report" data-nav="/submit-report" class="rw-nav-link rw-nav-primary${active('/submit-report')}">Report an issue</a>
            ${roleLinks}
            <span class="rw-nav-user">${firstName}</span>
            <button id="nav-logout" type="button" class="rw-nav-logout">Logout</button>
          ` : `
            <a href="/login" data-nav="/login" class="rw-nav-login">Sign in</a>
          `}
          ${themeToggleHtml()}
        </nav>
      </div>
    </header>`;
  };

  const pageHome = () => {
    const u = getUser();
    return `
    <main class="max-w-7xl mx-auto px-6 py-8">
      <h1 class="text-2xl font-bold text-navy mb-2">${u ? 'Welcome back, ' + escapeHtml(u.fullName || '') : 'Road issues, reported and fixed'}</h1>
      <p class="text-slate-tint text-sm mb-6">Recently verified reports from across the network.</p>
      <div id="home-reports" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div class="loading-block"><span class="spinner"></span> Loading reports…</div>
      </div>
    </main>`;
  };

  const pageReports = () => `
    <section class="py-8">
      <div class="max-w-7xl mx-auto px-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h2 class="text-2xl font-bold text-navy">Your Reports</h2>
          <button id="btn-new-report" data-nav="/submit-report" class="btn btn-primary">Report a road issue</button>
        </div>
        <div id="reports-list">
          <div class="loading-block"><span class="spinner"></span> Loading your reports…</div>
        </div>
      </div>
    </section>
  `;

  const pageReportDetail = () => `
    <section class="py-8 max-w-3xl mx-auto px-6">
      <div id="report-detail">
        <div class="loading-block"><span class="spinner"></span> Loading report…</div>
      </div>
    </section>
  `;

  const pageSubmitReport = () => `
    <section class="py-8 max-w-2xl mx-auto px-6">
      <div class="rw-report-form-card brand-card p-8 rounded-xl shadow-lg">
        <h2 class="text-2xl font-bold text-navy mb-4">Report a Road Issue</h2>
        <form id="report-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2">Issue Title</label>
            <input type="text" name="title" required minlength="4" class="w-full brand-input" placeholder="e.g. Large pothole on Main St" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2">Issue Category</label>
            <select name="category" required class="w-full brand-input">
              <option value="POTHOLE">Pothole</option>
              <option value="DAMAGED_PAVEMENT">Damaged Pavement</option>
              <option value="ROAD_CRACK">Road Crack</option>
              <option value="FLOODING">Flooding</option>
              <option value="DAMAGED_DRAINAGE">Damaged Drainage</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2">Description</label>
            <textarea name="description" rows="3" required minlength="10" class="w-full brand-input" placeholder="Describe the issue (at least 10 characters)…"></textarea>
          </div>
          <div class="space-y-4">
            <div>
              <div class="flex items-center justify-between gap-3 mb-2">
                <label class="block text-sm font-medium text-ink-2" for="report-location-map">Issue location</label>
                <button type="button" id="btn-get-location" class="btn btn-sm btn-secondary">Use my location</button>
              </div>
              <p class="text-sm text-slate-tint mb-2">Tap the map to place the pin, then drag it to fine-tune.</p>
              <div id="report-location-map" class="rw-report-location-map rounded-lg overflow-hidden border border-slate-300" role="application" aria-label="Choose the road issue location on the map"></div>
              <p id="gps-coords" class="rw-location-coords text-sm mt-2" role="status" aria-live="polite">No location selected yet.</p>
              <p id="location-feedback" class="rw-location-feedback" role="alert" hidden></p>
              <input type="hidden" name="latitude" id="lat-input" />
              <input type="hidden" name="longitude" id="lon-input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-ink-2 mb-2">Area/Barangay (optional)</label>
              <input type="text" name="areaLabel" class="w-full brand-input" placeholder="e.g. San Isidro" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2">Issue Photo (1–8 images)</label>
            <input type="file" name="photos" accept="image/*" multiple required class="w-full brand-input" />
            <div id="photo-preview" class="mt-2 grid grid-cols-2 gap-2"></div>
          </div>
          <button type="submit" class="btn btn-primary w-full">Submit Report</button>
        </form>
      </div>
    </section>
  `;

  const pageMap = () => `
    <section class="py-8">
      <div class="max-w-7xl mx-auto px-6">
        <h2 class="text-2xl font-bold text-navy mb-4">Report Map</h2>
        <div class="relative">
          <div id="map" class="w-full rounded-lg overflow-hidden border border-slate-300"></div>
          <div id="map-legend" class="absolute bottom-6 right-6 bg-white p-3 rounded shadow-lg max-w-xs">
            <h4 class="font-medium text-navy text-sm mb-2">Repair Status</h4>
            <div class="space-y-1">
              <div class="flex items-center gap-2 text-xs">
                <span class="w-2 h-2 rounded bg-slate-400"></span> Not assigned
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="w-2 h-2 rounded bg-blue-400"></span> In progress
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="w-2 h-2 rounded bg-amber-400"></span> Awaiting maintenance
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="w-2 h-2 rounded bg-green-400"></span> Completed
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  const adminLayout = (active, content) => `
    <section class="admin-workspace">
      <aside class="admin-sidebar" aria-label="Admin navigation">
        <div class="admin-sidebar-top">
          <p class="admin-sidebar-heading">WORKSPACE</p>
          <button type="button" class="admin-sidebar-toggle" data-admin-menu-toggle aria-expanded="false" aria-controls="admin-sidebar-nav">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>
            <span>Admin menu</span>
          </button>
        </div>
        <nav id="admin-sidebar-nav" class="admin-sidebar-nav">
          <a href="/admin" data-nav="/admin" class="${active === 'dashboard' ? 'is-active' : ''}">Dashboard</a>
          <a href="/admin/reports" data-nav="/admin/reports" class="${active === 'reports' ? 'is-active' : ''}">Reports</a>
          <a href="/admin/users" data-nav="/admin/users" class="${active === 'users' ? 'is-active' : ''}">Users</a>
        </nav>
        <button type="button" class="admin-sidebar-logout" data-admin-logout>Sign out</button>
      </aside>
      <div class="admin-content">${content}</div>
    </section>`;

  const pageAdminDashboard = () => adminLayout('dashboard', `
    <div class="admin-page-heading">
      <div>
        <p class="admin-eyebrow">ROADWATCH OPERATIONS</p>
        <h1 id="admin-dashboard-title" class="admin-page-title">Dashboard</h1>
        <p class="admin-page-subtitle">A live overview of reports and repair activity.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-admin-refresh>Refresh data</button>
    </div>
    <div class="admin-stat-grid" aria-label="Report statistics">
      ${[
        ['Total reports', 'stat-total', 'navy'],
        ['Pending review', 'stat-pending', 'amber'],
        ['Approved', 'stat-approved', 'green'],
        ['Rejected', 'stat-rejected', 'red'],
        ['Under repair', 'stat-under-repair', 'blue'],
      ].map(([label, id, tone]) => `
        <article class="admin-stat-card admin-stat-${tone}">
          <p>${label}</p>
          <strong id="${id}"><span class="spinner" aria-label="Loading"></span></strong>
        </article>`).join('')}
    </div>
    <section class="admin-panel">
      <div class="admin-panel-heading">
        <div>
          <h2>Latest reports</h2>
          <p>Recently submitted reports across the network.</p>
        </div>
        <a href="/admin/reports" data-nav="/admin/reports" class="btn btn-ghost btn-sm">Manage reports</a>
      </div>
      <div id="admin-dashboard-feedback" class="admin-feedback" role="status" aria-live="polite"></div>
      <div id="admin-dashboard-reports">
        <div class="loading-block"><span class="spinner"></span> Loading recent reports…</div>
      </div>
    </section>
  `);

  const pageAdminReports = () => adminLayout('reports', `
    <div class="admin-page-heading">
      <div>
        <p class="admin-eyebrow">ROADWATCH OPERATIONS</p>
        <h1 class="admin-page-title">Report management</h1>
        <p class="admin-page-subtitle">Search, review and manage submitted road reports.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-admin-refresh>Refresh data</button>
    </div>
    <section class="admin-panel">
      <form id="admin-report-filters" class="admin-filters">
        <label class="admin-search">
          <span class="sr-only">Search reports</span>
          <input class="brand-input" type="search" name="search" placeholder="Search title, reference, location…" />
        </label>
        <label>
          <span class="sr-only">Filter reports by status</span>
          <select class="brand-input" name="status">
            <option value="">All statuses</option>
            <option value="moderationStatus:PENDING_REVIEW">Pending review</option>
            <option value="moderationStatus:APPROVED">Approved</option>
            <option value="moderationStatus:REJECTED">Rejected</option>
            <option value="repairStatus:AWAITING_MAINTENANCE">Awaiting maintenance</option>
            <option value="repairStatus:IN_PROGRESS">In progress</option>
            <option value="repairStatus:COMPLETED">Completed</option>
          </select>
        </label>
        <label>
          <span class="sr-only">Sort reports</span>
          <select class="brand-input" name="sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="priority">Priority</option>
          </select>
        </label>
        <button class="btn btn-primary btn-sm" type="submit">Apply filters</button>
      </form>
      <div id="admin-reports-feedback" class="admin-feedback" role="status" aria-live="polite"></div>
      <div id="admin-reports-list">
        <div class="loading-block"><span class="spinner"></span> Loading reports…</div>
      </div>
    </section>
  `);

  const pageAdminUsers = () => adminLayout('users', `
    <div class="admin-page-heading">
      <div>
        <p class="admin-eyebrow">ROADWATCH OPERATIONS</p>
        <h1 class="admin-page-title">Users</h1>
        <p class="admin-page-subtitle">Registered citizens, officers and administrators.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-admin-refresh>Refresh data</button>
    </div>
    <section class="admin-panel">
      <form id="admin-user-filters" class="admin-filters">
        <label class="admin-search">
          <span class="sr-only">Search users</span>
          <input class="brand-input" type="search" name="search" placeholder="Search name, email or phone…" />
        </label>
        <label>
          <span class="sr-only">Filter users by role</span>
          <select class="brand-input" name="role">
            <option value="">All roles</option>
            <option value="CITIZEN">Citizen</option>
            <option value="MAINTENANCE_OFFICER">Maintenance officer</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </label>
        <button class="btn btn-primary btn-sm" type="submit">Search users</button>
      </form>
      <div id="admin-users-feedback" class="admin-feedback" role="status" aria-live="polite"></div>
      <div id="admin-users-list">
        <div class="loading-block"><span class="spinner"></span> Loading users…</div>
      </div>
    </section>
  `);

  const pageAssignments = () => `
    <section class="py-8 max-w-2xl mx-auto px-6">
      <div class="brand-card p-8 rounded-xl shadow-lg">
        <h2 class="text-2xl font-bold text-navy mb-4">My Assignments</h2>
        <div id="assignments-list" class="space-y-3">
          <div class="loading-block"><span class="spinner"></span> Loading assignments…</div>
        </div>
      </div>
    </section>
  `;

  const pageAudit = () => `
    <section class="py-8 max-w-3xl mx-auto px-6">
      <div class="brand-card p-8 rounded-xl shadow-lg">
        <h2 class="text-2xl font-bold text-navy mb-4">Audit Log</h2>
        <div id="audit-log" class="space-y-2 max-h-80 overflow-y-auto">
          <div class="loading-block"><span class="spinner"></span> Loading audit log…</div>
        </div>
      </div>
    </section>
  `;

  const pageNotFound = () => `
    <section class="flex-1 flex items-center justify-center p-4 bg-sheet">
      <div class="text-center">
        <h1 class="text-5xl font-bold text-navy">404</h1>
        <p class="text-slate-tint text-2xl">Page not found</p>
        <a href="/" data-nav="/" class="btn btn-primary mt-4">Go Home</a>
      </div>
    </section>
  `;

  // --- Router (simple SPA) ---------------------------------------------------
  const routes = [
    { path: '/', name: 'home', page: pageHome, requireAuth: true },
    { path: '/login', name: 'login', page: pageLogin },
    { path: '/register', name: 'register', page: pageRegister },
    { path: '/reports', name: 'reports', page: pageReports, requireAuth: true },
    { path: '/report/:id', name: 'report-detail', page: pageReportDetail, requireAuth: true },
    { path: '/submit-report', name: 'submit-report', page: pageSubmitReport, requireAuth: true },
    { path: '/map', name: 'map', page: pageMap, requireAuth: true },
    { path: '/admin', name: 'admin', page: pageAdminDashboard, requireAuth: true, role: 'ADMIN' },
    { path: '/admin/reports', name: 'admin-reports', page: pageAdminReports, requireAuth: true, role: 'ADMIN' },
    { path: '/admin/users', name: 'admin-users', page: pageAdminUsers, requireAuth: true, role: 'ADMIN' },
    { path: '/assignments', name: 'assignments', page: pageAssignments, requireAuth: true, role: 'MAINTENANCE_OFFICER' },
    { path: '/audit', name: 'audit', page: pageAudit, requireAuth: true, role: 'ADMIN' },
  ];

  const matchRoute = (pathname) => {
    const clean = (pathname || '/').replace(/\/+$/, '') || '/';
    const segs = clean.split('/').filter(Boolean);
    for (const route of routes) {
      const rsegs = route.path.split('/').filter(Boolean);
      if (rsegs.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < rsegs.length; i += 1) {
        if (rsegs[i].charAt(0) === ':') {
          params[rsegs[i].slice(1)] = decodeURIComponent(segs[i]);
        } else if (rsegs[i] !== segs[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return { route: null, params: {} };
  };

  const navigateTo = (path, replace = false) => {
    const current = window.location.pathname + window.location.search;
    if (current === path) return render();
    history[replace ? 'replaceState' : 'pushState']({}, '', path);
    return render();
  };
  const landingPath = (account) => {
    if (account && account.role === 'ADMIN') return '/admin';
    if (account && account.role === 'MAINTENANCE_OFFICER') return '/assignments';
    return '/';
  };
  // Exposed so inline handlers / tests can drive the SPA.
  window.navigateTo = navigateTo;

  // Login/register are full-screen auth pages; every other route renders inside
  // the shared header + main column so navigation (and the navy brand bar) is
  // present everywhere, not just on the home page.
  const AUTH_ROUTES = new Set(['login', 'register']);
  const shell = (routeName, content) => (
    AUTH_ROUTES.has(routeName)
      ? content
      : `${headerHtml()}<div class="rw-main">${content}</div>`
  );

  const render = async () => {
    const root = document.getElementById('root');
    if (!root) return;

    const { route, params } = matchRoute(window.location.pathname);

    if (!route) {
      root.innerHTML = shell('not-found', pageNotFound());
      window.scrollTo(0, 0);
      return;
    }

    if (user && (route.name === 'login' || (route.name === 'home' && user.role === 'ADMIN'))) {
      navigateTo(landingPath(user), true);
      return;
    }

    // Route guards (requireAuth + role).
    if (route.requireAuth && !user) {
      navigateTo('/login', true);
      return;
    }
    if (route.role && (!user || user.role !== route.role)) {
      navigateTo(user ? landingPath(user) : '/login', true);
      return;
    }

    root.innerHTML = shell(route.name, route.page(params));
    window.scrollTo(0, 0);
    await afterRender(route.name, params);
  };

  const afterRender = async (name, params) => {
    switch (name) {
      case 'home': initHomePage(); break;
      case 'login': initLoginPage(); break;
      case 'register': initRegisterPage(); break;
      case 'reports': await initReportsPage(); break;
      case 'report-detail': await initReportDetailPage(params); break;
      case 'submit-report': initSubmitReportPage(); break;
      case 'map': await initMapPage(); break;
      case 'admin': await initAdminDashboard(); break;
      case 'admin-reports': await initAdminReportsPage(); break;
      case 'admin-users': await initAdminUsersPage(); break;
      case 'assignments': await initAssignmentsPage(); break;
      case 'audit': await initAuditPage(); break;
      default: break;
    }
  };

  // --- Page init functions ---------------------------------------------------

  const initHomePage = async () => {
    const host = q('#home-reports');
    if (!host) return;
    try {
      const data = await api('/map/reports');
      const items = (data && data.items) || [];
      if (items.length === 0) {
        html(host, `
          <div class="empty-state">
            <h3 class="text-xl font-bold text-navy mb-2">No approved reports yet</h3>
            <p class="text-slate-tint">Spotted a pothole, crack or flooding? Report it and help your community.</p>
            ${getUser() ? '<button class="btn btn-primary mt-4" data-nav="/submit-report">Report an issue</button>' : ''}
          </div>`);
      } else {
        html(host, items.map(reportCardHtml).join(''));
      }
      hydrateAuthedImages(host);
    } catch (err) {
      html(host, `<p class="text-red-400">Could not load reports: ${escapeHtml(err.message)}</p>`);
    }
  };

  const initLoginPage = () => {
    const form = q('#login-form');
    if (form) {
      const feedback = q('#login-feedback', form);
      form.addEventListener('input', () => {
        if (feedback) {
          feedback.hidden = true;
          feedback.textContent = '';
        }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const btn = q('button[type="submit"]', form);
        if (btn) { btn.disabled = true; }
        try {
          const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              email: formData.get('email'),
              password: formData.get('password'),
            }),
          });
          setToken(data.accessToken);
          setUser(data.user);
          navigateTo('/');
        } catch (err) {
          if (feedback) {
            feedback.textContent = 'Login failed: ' + (err.message || err);
            feedback.hidden = false;
            feedback.focus();
          }
          if (btn) { btn.disabled = false; }
        }
      });
    }

    on(q('#show-register'), 'click', (e) => {
      e.preventDefault();
      navigateTo('/register');
    });
  };

  const initRegisterPage = () => {
    const form = q('#register-form');
    if (form) {
      const feedback = q('#register-feedback', form);
      form.addEventListener('input', () => {
        if (feedback) {
          feedback.hidden = true;
          feedback.textContent = '';
        }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const btn = q('button[type="submit"]', form);
        if (btn) { btn.disabled = true; }
        try {
          const data = await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              fullName: formData.get('fullName'),
              email: formData.get('email'),
              phone: formData.get('phone') || undefined,
              password: formData.get('password'),
            }),
          });
          setToken(data.accessToken);
          setUser(data.user);
          navigateTo('/');
        } catch (err) {
          if (feedback) {
            feedback.textContent = 'Registration failed: ' + (err.message || err);
            feedback.hidden = false;
            feedback.focus();
          }
          if (btn) { btn.disabled = false; }
        }
      });
    }

    on(q('#show-login'), 'click', (e) => {
      e.preventDefault();
      navigateTo('/login');
    });
  };

  const initReportsPage = async () => {
    const host = q('#reports-list');
    if (!host) return;
    try {
      const data = await api('/reports/mine');
      const items = (data && data.items) || [];
      const banner = flash
        ? `<div class="brand-card p-3 rounded mb-4 bg-green-tint border border-slate-300"><span class="text-sm text-green">${escapeHtml(flash)}</span></div>`
        : '';
      flash = null;
      if (items.length === 0) {
        html(host, `${banner}
          <div class="empty-state py-12">
            <h3 class="text-xl font-bold text-navy mb-2">No reports yet</h3>
            <p class="text-slate-tint">Your submitted reports will appear here.</p>
            <button class="btn btn-primary mt-4" data-nav="/submit-report">Report an issue</button>
          </div>`);
      } else {
        html(host, `${banner}<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">${items.map(reportCardHtml).join('')}</div>`);
      }
      hydrateAuthedImages(host);
    } catch (err) {
      html(host, `<p class="text-red-400">Error loading reports: ${escapeHtml(err.message)}</p>`);
    }
  };

  const initReportDetailPage = async (params) => {
    const host = q('#report-detail');
    if (!host || !params || !params.id) return;
    try {
      const [detail, historyData] = await Promise.all([
        api(`/reports/${encodeURIComponent(params.id)}`),
        api(`/reports/${encodeURIComponent(params.id)}/history`).catch(() => ({ history: [] })),
      ]);
      const report = detail && detail.report;
      if (!report) throw new Error('Report not found');
      const history = (historyData && historyData.history) || [];
      host.innerHTML = reportDetailHtml(report, history);
      hydrateAuthedImages(host);
    } catch (err) {
      host.innerHTML = `<p class="text-red-400">Error loading report: ${escapeHtml(err.message)}</p>`;
    }
  };

  const reportDetailHtml = (report, history) => {
    const photos = report.photos || [];
    const historyItems = history.map((h) => `
      <div class="p-3 rounded border border-slate-200">
        <div class="flex justify-between items-start gap-4">
          <div>
            <p class="font-medium text-navy text-sm">${escapeHtml(h.type)}${h.toValue ? `: ${escapeHtml(h.toValue)}` : ''}</p>
            ${h.note ? `<p class="text-slate-tint text-xs">${escapeHtml(h.note)}</p>` : ''}
          </div>
          <span class="text-slate-400 text-xs flex-shrink-0">${escapeHtml(relativeDate(h.createdAt))}</span>
        </div>
      </div>`).join('');

    return `
      <div class="brand-card p-8 rounded-xl shadow-lg">
        <div class="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
          <div class="w-14 h-14 rounded flex-shrink-0 bg-sheet flex items-center justify-center text-2xl">${categoryIcon(report.category)}</div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-bold text-navy">${escapeHtml(report.title)}</h1>
            <p class="text-slate-tint text-sm">${escapeHtml(report.description || '')}</p>
            <div class="mt-3 flex flex-wrap gap-2 items-center">
              <span class="text-slate-tint text-xs uppercase tracking-wider">${escapeHtml(categoryLabel(report.category))}</span>
              ${statusBadge(report.moderationStatus, report.repairStatus)}
            </div>
          </div>
        </div>

        ${photos.length > 0 ? `
          <div class="mt-6">
            <h2 class="font-medium text-ink-2 mb-2">Photos (${photos.length})</h2>
            <div class="grid grid-cols-2 gap-2">
              ${photos.map((p) => `
                <div class="rounded border border-slate-300 overflow-hidden group">
                  <img ${p.isPublic ? `src="${escapeHtml(absoluteUrl(p.url))}"` : `data-authed-src="${escapeHtml(absoluteUrl(p.url))}"`} alt="${escapeHtml(p.caption || 'Report photo')}" class="w-full h-32 object-cover group-hover:opacity-90 transition-opacity" />
                </div>`).join('')}
            </div>
          </div>` : ''}

        <div class="mt-6 pt-6 border-t border-azure">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div><span class="font-medium text-ink-2">Location:</span> ${escapeHtml(reportLocation(report))}</div>
            <div><span class="font-medium text-ink-2">Reference:</span> ${escapeHtml(report.referenceNo)}</div>
            <div><span class="font-medium text-ink-2">Reported:</span> ${escapeHtml(relativeDate(report.createdAt))}</div>
            <div><span class="font-medium text-ink-2">Assigned to:</span> ${report.assignedOfficer ? escapeHtml(report.assignedOfficer.fullName || 'Officer') : 'Unassigned'}</div>
          </div>
          ${report.rejectionReason ? `<p class="mt-4 text-sm text-red-400">Rejected: ${escapeHtml(report.rejectionReason)}</p>` : ''}
        </div>
      </div>

      <div class="brand-card p-8 rounded-xl shadow-lg mt-6">
        <h2 class="font-bold text-navy text-lg mb-4">History</h2>
        <div class="space-y-3">
          ${historyItems || '<p class="text-slate-tint text-sm">No history recorded.</p>'}
        </div>
      </div>

      <div class="mt-6">
        <a href="/reports" data-nav="/reports" class="btn btn-secondary">Back to my reports</a>
      </div>
    `;
  };

  const initSubmitReportPage = () => {
    const latInput = q('#lat-input');
    const lonInput = q('#lon-input');
    const gpsCoords = q('#gps-coords');
    const locationFeedback = q('#location-feedback');
    const form = q('#report-form');
    let locationMap = null;
    let locationMarker = null;

    const setSelectedLocation = (latitude, longitude) => {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        if (locationFeedback) {
          locationFeedback.textContent = 'That location is not valid. Choose a point on the map or use your current location.';
          locationFeedback.hidden = false;
        }
        return;
      }

      const position = [lat, lng];
      if (locationMap) {
        if (!locationMarker) {
          locationMarker = window.L.marker(position, { draggable: true, autoPan: true }).addTo(locationMap);
          locationMarker.on('dragend', () => {
            const point = locationMarker.getLatLng();
            setSelectedLocation(point.lat, point.lng);
          });
        } else {
          locationMarker.setLatLng(position);
        }
      }

      latInput.value = lat.toFixed(6);
      lonInput.value = lng.toFixed(6);
      if (gpsCoords) gpsCoords.textContent = `Selected: Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`;
      if (locationFeedback) {
        locationFeedback.textContent = '';
        locationFeedback.hidden = true;
      }
    };

    const locationMapElement = q('#report-location-map');
    if (locationMapElement && window.L) {
      locationMap = window.L.map(locationMapElement, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).setView([14.7942, 120.879], 11);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(locationMap);
      locationMap.on('click', (event) => setSelectedLocation(event.latlng.lat, event.latlng.lng));
      window.setTimeout(() => locationMap.invalidateSize(), 0);
    } else if (locationMapElement) {
      locationMapElement.textContent = 'The location map could not be loaded. You can still use your device location.';
      console.error('Leaflet (window.L) is not available — the report location map cannot be rendered.');
    }

    on(q('#btn-get-location'), 'click', (event) => {
      const button = event.currentTarget;
      if (!navigator.geolocation) {
        if (locationFeedback) {
          locationFeedback.textContent = 'Location access is not supported by this browser. Select the issue location on the map instead.';
          locationFeedback.hidden = false;
        }
        return;
      }
      button.disabled = true;
      button.textContent = 'Finding location…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setSelectedLocation(pos.coords.latitude, pos.coords.longitude);
          if (locationMap) locationMap.setView([pos.coords.latitude, pos.coords.longitude], Math.max(locationMap.getZoom(), 15));
          button.disabled = false;
          button.textContent = 'Use my location';
        },
        (err) => {
          const message = {
            1: 'Location permission was denied. Allow location access in your browser, or select the issue location on the map.',
            2: 'Your current location is unavailable. Try again or select the issue location on the map.',
            3: 'Finding your location timed out. Try again or select the issue location on the map.',
          }[err.code] || 'Unable to get your location. Select the issue location on the map instead.';
          if (locationFeedback) {
            locationFeedback.textContent = message;
            locationFeedback.hidden = false;
          }
          button.disabled = false;
          button.textContent = 'Use my location';
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    });

    const fileInput = form ? form.querySelector('input[type="file"]') : null;
    const photoPreview = q('#photo-preview');
    on(fileInput, 'change', (e) => {
      if (!photoPreview) return;
      html(photoPreview, '');
      Array.from(e.target.files || []).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = document.createElement('img');
          img.src = ev.target.result;
          img.className = 'rounded w-full h-24 object-cover';
          photoPreview.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    });

    on(form, 'submit', async (e) => {
      e.preventDefault();
      const lat = (latInput.value || '').trim();
      const lon = (lonInput.value || '').trim();
      const latitude = Number(lat);
      const longitude = Number(lon);
      if (!lat || !lon || !Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        if (locationFeedback) {
          locationFeedback.textContent = 'Choose a valid issue location by tapping the map, dragging its pin, or using your current location.';
          locationFeedback.hidden = false;
        }
        q('#report-location-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        notify('Please attach at least one photo of the issue.');
        return;
      }

      const fd = new FormData(form);
      fd.set('latitude', lat);
      fd.set('longitude', lon);
      fd.set('category', String(fd.get('category') || '').toUpperCase());

      const btn = q('button[type="submit"]', form);
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
      try {
        const data = await api('/reports', {
          method: 'POST',
          body: fd,
          headers: { Accept: 'application/json' },
        });
        const ref = data && data.report ? data.report.referenceNo : '';
        flash = ref ? `Report submitted successfully! Reference: ${ref}` : 'Report submitted successfully!';
        navigateTo('/reports');
      } catch (err) {
        notify('Failed to submit: ' + (err.message || err));
        if (btn) { btn.disabled = false; btn.textContent = 'Submit Report'; }
      }
    });
  };

  const initMapPage = async () => {
    const container = q('#map');
    if (!container) return;
    if (!window.L) {
      html(container, '<div class="p-6 text-slate-tint">Map library could not be loaded.</div>');
      console.error('Leaflet (window.L) is not available — the map cannot be rendered.');
      return;
    }

    const map = window.L.map('map').setView([14.7942, 120.879], 12);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const colorFor = (repairStatus) => ({
      NOT_ASSIGNED: '#94a3b8',
      AWAITING_MAINTENANCE: '#fbbf24',
      IN_PROGRESS: '#60a5fa',
      COMPLETED: '#4ade80',
    }[repairStatus] || '#94a3b8');

    try {
      const data = await api('/map/reports');
      const items = (data && data.items) || [];
      const latlngs = [];
      items.forEach((r) => {
        const lat = Number(r.latitude);
        const lng = Number(r.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
        const marker = window.L.marker([lat, lng]).addTo(map);
        marker.bindPopup(
          `<b>${escapeHtml(r.title)}</b><br>${escapeHtml(reportLocation(r))}<br>Status: ${escapeHtml(r.repairStatus || 'NOT_ASSIGNED')}`
        );
        latlngs.push([lat, lng]);
      });
      if (latlngs.length > 0) {
        map.fitBounds(window.L.latLngBounds(latlngs).pad(0.2));
      }
    } catch (err) {
      console.error('Failed to load reports for map:', err);
    }
  };

  const adminDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Date unavailable'
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const adminRepairLabel = (status) => ({
    NOT_ASSIGNED: 'Not assigned',
    AWAITING_MAINTENANCE: 'Awaiting maintenance',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
  }[status] || 'Not assigned');

  const adminReportTableHtml = (items, pagination, allowDelete) => {
    if (!items.length) {
      return `<div class="empty-state admin-empty">
        <h3 class="text-xl font-bold text-navy mb-2">No reports found</h3>
        <p>Try changing the search or status filters.</p>
      </div>`;
    }

    const rows = items.map((report) => `
      <tr>
        <td class="admin-report-main">
          <a href="/report/${encodeURIComponent(report.id)}" data-nav="/report/${encodeURIComponent(report.id)}" class="admin-report-title">
            ${escapeHtml(report.title || 'Untitled report')}
          </a>
          <span class="admin-report-reference">${escapeHtml(report.referenceNo || '')} · ${escapeHtml(categoryLabel(report.category))}</span>
        </td>
        <td>
          <div class="admin-status-stack">
            ${statusBadge(report.moderationStatus, null)}
            <span class="admin-repair-state">${escapeHtml(adminRepairLabel(report.repairStatus))}</span>
          </div>
        </td>
        <td class="admin-report-location">${escapeHtml(reportLocation(report))}</td>
        <td class="admin-report-date">${escapeHtml(adminDate(report.createdAt))}</td>
        <td>
          <div class="admin-row-actions">
            <a href="/report/${encodeURIComponent(report.id)}" data-nav="/report/${encodeURIComponent(report.id)}" class="btn btn-ghost btn-sm">Details</a>
            ${allowDelete ? `<button type="button" class="btn btn-danger btn-sm" data-delete-report="${escapeHtml(report.id)}" data-report-title="${escapeHtml(report.title || 'Untitled report')}" data-report-reference="${escapeHtml(report.referenceNo || '')}">Delete</button>` : ''}
          </div>
        </td>
      </tr>`).join('');

    const paging = pagination ? `
      <div class="admin-pagination">
        <span>${pagination.total} report${pagination.total === 1 ? '' : 's'} · Page ${pagination.page} of ${pagination.totalPages}</span>
        <div class="admin-row-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-admin-page="${Math.max(1, pagination.page - 1)}" ${pagination.page <= 1 ? 'disabled' : ''}>Previous</button>
          <button type="button" class="btn btn-secondary btn-sm" data-admin-page="${Math.min(pagination.totalPages, pagination.page + 1)}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Next</button>
        </div>
      </div>` : '';

    return `<div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Report</th><th>Status</th><th>Location</th><th>Submitted</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>${paging}`;
  };

  const setAdminFeedback = (id, message, tone = 'info') => {
    const host = document.getElementById(id);
    if (!host) return;
    host.textContent = message || '';
    host.className = message ? `admin-feedback is-${tone}` : 'admin-feedback';
  };

  const confirmAdminDelete = (reference, title) => new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'rw-confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'rw-confirm-title');
    dialog.setAttribute('aria-describedby', 'rw-confirm-description');
    dialog.innerHTML = `
      <div class="rw-confirm-content">
        <p class="rw-confirm-eyebrow">REPORT MANAGEMENT</p>
        <h2 id="rw-confirm-title">Delete this report?</h2>
        <p class="rw-confirm-identity"><strong>${escapeHtml(reference)}</strong><span>${escapeHtml(title)}</span></p>
        <p id="rw-confirm-description">This permanently removes the report and its related photos, assignments, and history. This action cannot be undone.</p>
        <div class="rw-confirm-actions">
          <button type="button" class="btn btn-secondary" data-confirm-cancel>Cancel</button>
          <button type="button" class="btn btn-danger" data-confirm-delete>Delete report</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(confirmed);
    };
    dialog.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
    dialog.querySelector('[data-confirm-delete]').addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(false);
    });
    dialog.showModal();
    dialog.querySelector('[data-confirm-cancel]').focus();
  });

  const readAdminReportFilters = () => {
    const form = q('#admin-report-filters');
    const data = form ? new FormData(form) : new FormData();
    const params = new URLSearchParams({ page: '1', pageSize: '25', sort: String(data.get('sort') || 'newest') });
    const search = String(data.get('search') || '').trim();
    if (search) params.set('search', search);
    const status = String(data.get('status') || '');
    if (status) {
      const [key, value] = status.split(':');
      params.set(key, value);
    }
    return params;
  };

  const loadAdminReportList = async (hostId, feedbackId, params, page = 1) => {
    const host = document.getElementById(hostId);
    if (!host) return;
    params.set('page', String(page));
    host.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading reports…</div>';
    try {
      const data = await api(`/reports?${params.toString()}`);
      html(host, adminReportTableHtml(data.items || [], {
        total: Number(data.total) || 0,
        page: Number(data.page) || page,
        totalPages: Number(data.totalPages) || 1,
      }, true));
      bindAdminReportActions(host, hostId, feedbackId, params);
      return data;
    } catch (err) {
      html(host, `<div class="admin-error-block">Could not load reports. ${escapeHtml(err.message)}</div>`);
      setAdminFeedback(feedbackId, 'Report data could not be loaded. Retry when the API is available.', 'error');
      return null;
    }
  };

  const refreshAdminStatistics = async (feedbackId) => {
    try {
      const data = await api('/reports/stats');
      const totals = data.totals || {};
      setText('stat-total', totals.total ?? 0);
      setText('stat-pending', totals.pending ?? 0);
      setText('stat-approved', totals.approved ?? 0);
      setText('stat-rejected', totals.rejected ?? 0);
      setText('stat-under-repair', (Number(totals.awaiting) || 0) + (Number(totals.inProgress) || 0));
      return data;
    } catch (err) {
      ['stat-total', 'stat-pending', 'stat-approved', 'stat-rejected', 'stat-under-repair'].forEach((id) => setText(id, '—'));
      setAdminFeedback(feedbackId, `Statistics could not be loaded: ${err.message}`, 'error');
      return null;
    }
  };

  const bindAdminReportActions = (host, hostId, feedbackId, params) => {
    host.querySelectorAll('[data-delete-report]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.getAttribute('data-delete-report');
        if (!id || deletingReportIds.has(id)) return;
        const title = button.getAttribute('data-report-title') || 'Untitled report';
        const reference = button.getAttribute('data-report-reference') || id;
        if (!await confirmAdminDelete(reference, title)) return;

        deletingReportIds.add(id);
        button.disabled = true;
        button.textContent = 'Deleting…';
        setAdminFeedback(feedbackId, `Deleting ${reference}…`);
        try {
          await api(`/admin/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
          setAdminFeedback(feedbackId, `Report ${reference} was deleted.`, 'success');
          await refreshAdminStatistics(feedbackId);
          const page = Number(params.get('page')) || 1;
          const refreshed = await loadAdminReportList(hostId, feedbackId, new URLSearchParams(params), page);
          if (refreshed && refreshed.items.length === 0 && page > 1) {
            await loadAdminReportList(hostId, feedbackId, new URLSearchParams(params), page - 1);
          }
        } catch (err) {
          setAdminFeedback(feedbackId, `Could not delete ${reference}: ${err.message}`, 'error');
          button.disabled = false;
          button.textContent = 'Delete';
        } finally {
          deletingReportIds.delete(id);
        }
      });
    });
    host.querySelectorAll('[data-admin-page]').forEach((button) => {
      button.addEventListener('click', () => {
        const page = Number(button.getAttribute('data-admin-page'));
        if (Number.isInteger(page) && page > 0) {
          void loadAdminReportList(hostId, feedbackId, new URLSearchParams(params), page);
        }
      });
    });
  };

  const initAdminDashboard = async () => {
    const refresh = async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '8', sort: 'newest' });
      await Promise.all([
        refreshAdminStatistics('admin-dashboard-feedback'),
        loadAdminReportList('admin-dashboard-reports', 'admin-dashboard-feedback', params),
      ]);
    };
    on(q('[data-admin-refresh]'), 'click', refresh);
    await refresh();
  };

  const initAdminReportsPage = async () => {
    const load = (page = 1) => loadAdminReportList('admin-reports-list', 'admin-reports-feedback', readAdminReportFilters(), page);
    await load();
    on(q('#admin-report-filters'), 'submit', (event) => {
      event.preventDefault();
      setAdminFeedback('admin-reports-feedback', '');
      void load();
    });
    on(q('[data-admin-refresh]'), 'click', () => {
      setAdminFeedback('admin-reports-feedback', '');
      void load();
    });
  };

  const initAdminUsersPage = async () => {
    const load = async () => {
      const host = q('#admin-users-list');
      const feedback = 'admin-users-feedback';
      if (!host) return;
      const form = q('#admin-user-filters');
      const values = form ? new FormData(form) : new FormData();
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      const search = String(values.get('search') || '').trim();
      const role = String(values.get('role') || '');
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      host.innerHTML = '<div class="loading-block"><span class="spinner"></span> Loading users…</div>';
      try {
        const data = await api(`/users?${params.toString()}`);
        const items = data.items || [];
        if (items.length === 0) {
          html(host, '<div class="empty-state admin-empty"><h3 class="text-xl font-bold text-navy mb-2">No users found</h3><p>Try a different name, email or role filter.</p></div>');
          return;
        }
        html(host, `<div class="admin-table-wrap"><table class="admin-table admin-user-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Account status</th><th>Joined</th></tr></thead>
          <tbody>${items.map((account) => `<tr>
            <td class="admin-user-name">${escapeHtml(account.fullName)}</td>
            <td>${escapeHtml(account.email)}</td>
            <td>${escapeHtml(account.role === 'ADMIN' ? 'Administrator' : account.role === 'MAINTENANCE_OFFICER' ? 'Maintenance officer' : 'Citizen')}</td>
            <td>${escapeHtml(account.status || 'ACTIVE')}</td>
            <td>${escapeHtml(adminDate(account.createdAt))}</td>
          </tr>`).join('')}</tbody></table></div>
          <div class="admin-pagination"><span>${data.total || items.length} user${Number(data.total) === 1 ? '' : 's'}</span></div>`);
      } catch (err) {
        html(host, `<div class="admin-error-block">Could not load users. ${escapeHtml(err.message)}</div>`);
        setAdminFeedback(feedback, 'User data could not be loaded. Retry when the API is available.', 'error');
      }
    };
    await load();
    on(q('#admin-user-filters'), 'submit', (event) => {
      event.preventDefault();
      setAdminFeedback('admin-users-feedback', '');
      void load();
    });
    on(q('[data-admin-refresh]'), 'click', () => {
      setAdminFeedback('admin-users-feedback', '');
      void load();
    });
  };

  const initAssignmentsPage = async () => {
    const host = q('#assignments-list');
    if (!host) return;
    try {
      const data = await api('/maintenance/assignments');
      const items = (data && data.items) || [];
      if (items.length === 0) {
        html(host, '<p class="text-slate-tint text-sm">No assignments yet.</p>');
        return;
      }
      html(host, items.map((r) => `
        <div class="p-3 rounded border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors" data-nav="/report/${encodeURIComponent(r.id)}">
          <h3 class="font-medium text-navy line-clamp-1">${escapeHtml(r.title)}</h3>
          <p class="text-slate-tint text-xs">${escapeHtml(reportLocation(r))}</p>
          <span class="text-amber text-sm">${escapeHtml(r.repairStatus)}</span>
        </div>`).join(''));
    } catch (err) {
      html(host, `<p class="text-red-400">Error: ${escapeHtml(err.message)}</p>`);
    }
  };

  const initAuditPage = async () => {
    const host = q('#audit-log');
    if (!host) return;
    try {
      const data = await api('/analytics/audit-logs?limit=50');
      const logs = (data && data.logs) || [];
      if (logs.length === 0) {
        html(host, '<p class="text-slate-tint text-sm">No audit entries.</p>');
        return;
      }
      html(host, logs.map((a) => `
        <div class="p-2 text-xs text-slate-500 border-b border-slate-100">
          <span class="font-medium text-navy">${escapeHtml(a.actor && a.actor.role ? a.actor.role : 'System')}</span>
          ${escapeHtml(a.action || '')}
          ${a.entityType ? ` on ${escapeHtml(a.entityType)}` : ''}
          ${a.metadata && a.metadata.referenceNo ? `: ${escapeHtml(a.metadata.referenceNo)}` : ''}
          <span class="text-carbon text-[80%]">${escapeHtml(relativeDate(a.createdAt))}</span>
        </div>`).join(''));
    } catch (err) {
      html(host, `<p class="text-red-400">Error: ${escapeHtml(err.message)}</p>`);
    }
  };

  // --- Auth check ------------------------------------------------------------
  const checkAuth = async () => {
    const token = getToken();
    if (!token) { setUser(null); return; }
    try {
      const data = await api('/auth/me');
      setUser(data && data.user ? data.user : data);
    } catch (err) {
      clearToken();
      setUser(null);
    }
  };

  // --- Initialize ------------------------------------------------------------
  const init = async () => {
    await checkAuth();

    // One delegated handler for every [data-nav] element (links, cards, buttons).
    document.addEventListener('click', (e) => {
      const themeButton = e.target && e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
      if (themeButton) {
        e.preventDefault();
        setTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
        return;
      }

      const mobileMenuButton = e.target && e.target.closest ? e.target.closest('[data-mobile-menu-toggle]') : null;
      if (mobileMenuButton) {
        const nav = document.getElementById('rw-primary-nav');
        const expanded = mobileMenuButton.getAttribute('aria-expanded') === 'true';
        mobileMenuButton.setAttribute('aria-expanded', String(!expanded));
        if (nav) nav.dataset.open = String(!expanded);
        return;
      }

      const adminMenuButton = e.target && e.target.closest ? e.target.closest('[data-admin-menu-toggle]') : null;
      if (adminMenuButton) {
        const sidebar = adminMenuButton.closest('.admin-sidebar');
        const expanded = adminMenuButton.getAttribute('aria-expanded') === 'true';
        adminMenuButton.setAttribute('aria-expanded', String(!expanded));
        if (sidebar) sidebar.dataset.open = String(!expanded);
        return;
      }

      const openNav = document.getElementById('rw-primary-nav');
      const navToggle = document.querySelector('[data-mobile-menu-toggle]');
      if (openNav?.dataset.open === 'true' && !e.target.closest('#rw-primary-nav, [data-mobile-menu-toggle]')) {
        openNav.dataset.open = 'false';
        if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
      }
      document.querySelectorAll('.admin-sidebar[data-open="true"]').forEach((sidebar) => {
        if (e.target.closest('.admin-sidebar')) return;
        sidebar.dataset.open = 'false';
        const toggle = sidebar.querySelector('[data-admin-menu-toggle]');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });

      const target = e.target && e.target.closest ? e.target.closest('[data-nav]') : null;
      if (!target) return;
      e.preventDefault();
      const menuButton = document.querySelector('[data-mobile-menu-toggle]');
      const nav = document.getElementById('rw-primary-nav');
      if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
      if (nav) nav.dataset.open = 'false';
      const adminSidebar = target.closest('.admin-sidebar');
      if (adminSidebar) {
        adminSidebar.dataset.open = 'false';
        const adminButton = adminSidebar.querySelector('[data-admin-menu-toggle]');
        if (adminButton) adminButton.setAttribute('aria-expanded', 'false');
      }
      navigateTo(target.getAttribute('data-nav'));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const menuButton = document.querySelector('[data-mobile-menu-toggle]');
      const nav = document.getElementById('rw-primary-nav');
      const navWasOpen = nav?.dataset.open === 'true';
      if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
      if (nav) nav.dataset.open = 'false';
      if (navWasOpen && menuButton && menuButton.getClientRects().length) menuButton.focus();
      document.querySelectorAll('.admin-sidebar[data-open="true"]').forEach((sidebar) => {
        sidebar.dataset.open = 'false';
        const adminButton = sidebar.querySelector('[data-admin-menu-toggle]');
        if (adminButton) adminButton.setAttribute('aria-expanded', 'false');
        if (adminButton && adminButton.getClientRects().length) adminButton.focus();
      });
    });

    // Logout lives in the global header, which the router re-renders for every
    // route, so bind it once here instead of per-page.
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('#nav-logout, [data-admin-logout]') : null;
      if (!btn) return;
      e.preventDefault();
      clearToken();
      setUser(null);
      navigateTo('/login');
    });

    on(window, 'popstate', render);
    updateThemeToggleLabels();
    await render();
  };

  // Start
  init();
})();
