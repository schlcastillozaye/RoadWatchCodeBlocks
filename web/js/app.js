/* ---------------------------------------------------------------------------
   RoadWatch Web Platform — Plain JS Frontend
   Talks to the PHP API (base URL from web/config.js -> window.RW_API_BASE).
   Routes are under /api (e.g. /api/auth/login).
   --------------------------------------------------------------------------- */

(function () {
  'use strict';

  // --- Configuration ---------------------------------------------------------
  // Prefer the runtime config from config.js (loaded before this file); fall
  // back to the standard local API port so the app still works standalone.
  const API_BASE = (typeof window.RW_API_BASE === 'string' && window.RW_API_BASE !== '')
    ? window.RW_API_BASE.replace(/\/$/, '')
    : 'http://localhost:4000'.replace(/\/$/, '');
  const TOKEN_KEY = 'roadwatch_auth_token';

  // Build an absolute URL for an API asset path (photo URLs come back absolute
  // already; this is a safety net for relative ones).
  const absoluteUrl = (url) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (typeof window.RW_absoluteUrl === 'function') return window.RW_absoluteUrl(url);
    return API_BASE + (url.charAt(0) === '/' ? '' : '/') + url;
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

  // --- State -----------------------------------------------------------------
  let user = null;
  let flash = null; // one-shot success message handed between pages

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

    const resp = await fetch(`${API_BASE}/api${path}`, { ...options, headers });

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

  const pageLogin = () => `
    <section class="min-vh-100 flex items-center justify-center p-4 bg-sheet">
      <div class="brand-card w-full max-w-md p-8 rounded-xl shadow-lg">
        <div class="text-center mb-6">
          <div class="w-20 h-20 mx-auto mb-4">
            <svg class="w-full h-full text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1111.16 3L7 7zM7 16l.067-.033a5 5 0 119.934 0l.067.033A4 4 0 017 16z"/>
            </svg>
          </div>
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
          <button type="submit" class="btn btn-primary w-full">Sign in</button>
          <p class="text-center text-sm text-slate-tint mt-3">
            New to RoadWatch? <a href="/register" id="show-register" class="font-medium text-navy underline">Create account</a>
          </p>
        </form>
      </div>
    </section>
  `;

  const pageRegister = () => `
    <section class="min-vh-100 flex items-center justify-center p-4 bg-sheet">
      <div class="brand-card w-full max-w-md p-8 rounded-xl shadow-lg">
        <div class="text-center mb-6">
          <div class="w-20 h-20 mx-auto mb-4">
            <svg class="w-full h-full text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 4M12 6l-4 4m0 0a4 4 0 01-.88-7.903A5 5 0 1111.16 3L7 7m5 3.317a5 5 0 010 6.634L12 15m3.667-1.667a5 5 0 000-6.634L15 9"/>
            </svg>
          </div>
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
          <button type="submit" class="btn btn-primary w-full">Create account</button>
          <p class="text-center text-sm text-slate-tint mt-3">
            Already have an account? <a href="/login" id="show-login" class="font-medium text-navy underline">Sign in</a>
          </p>
        </form>
      </div>
    </section>
  `;

  const pageHome = () => {
    const u = getUser();
    const firstName = u ? escapeHtml((u.fullName || '').split(' ')[0] || 'there') : '';
    return `
    <header class="bg-navy border-b border-azure">
      <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <a href="/" id="nav-home" data-nav="/" class="text-white font-bold text-lg tracking-tight">RoadWatch</a>
        <nav class="flex flex-wrap items-center gap-4">
          <a href="/map" data-nav="/map" class="text-azure text-sm">Map</a>
          ${u ? `
            <a href="/reports" data-nav="/reports" class="text-azure text-sm">My Reports</a>
            <a href="/submit-report" data-nav="/submit-report" class="text-azure text-sm">Report an issue</a>
            <span class="text-slate-200 text-sm">${firstName}</span>
            <button id="nav-logout" type="button" class="btn btn-sm btn-ghost text-white">Logout</button>
          ` : `
            <a href="/login" data-nav="/login" class="btn btn-sm btn-primary">Sign in</a>
          `}
        </nav>
      </div>
    </header>
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
      <div class="brand-card p-8 rounded-xl shadow-lg">
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
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="block text-sm font-medium text-ink-2 mb-2">GPS Location</label>
              <div class="flex items-center gap-2 p-3 rounded border border-slate-300">
                <span id="gps-coords" class="text-slate-400 flex-1 text-sm">Tap to get GPS location</span>
                <button type="button" id="btn-get-location" class="btn btn-sm btn-ghost">Get Location</button>
              </div>
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
        <div id="map" class="w-full rounded-lg overflow-hidden border border-slate-300"></div>
        <div id="map-legend" class="fixed bottom-6 right-6 bg-white p-3 rounded shadow-lg max-w-xs">
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
    </section>
  `;

  const pageAdminDashboard = () => `
    <section class="py-8">
      <div class="max-w-7xl mx-auto px-6">
        <h2 class="text-2xl font-bold text-navy mb-6">Admin Dashboard</h2>
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          ${dashboardStatsHtml()}
        </div>
        <div class="mt-6 grid grid-cols-1 gap-6">
          ${dashboardRecentReportsHtml()}
        </div>
      </div>
    </section>
  `;

  const dashboardStatsHtml = () => `
    <div class="brand-card p-6 rounded-xl shadow-sm">
      <h3 class="font-semibold text-slate-400 text-sm uppercase tracking-wider">Total Reports</h3>
      <p class="text-3xl font-bold text-navy" id="stat-total">Loading...</p>
    </div>
    <div class="brand-card p-6 rounded-xl shadow-sm">
      <h3 class="font-semibold text-slate-400 text-sm uppercase tracking-wider">Pending Review</h3>
      <p class="text-3xl font-bold text-amber" id="stat-pending">Loading...</p>
    </div>
    <div class="brand-card p-6 rounded-xl shadow-sm">
      <h3 class="font-semibold text-slate-400 text-sm uppercase tracking-wider">Approved</h3>
      <p class="text-3xl font-bold text-green" id="stat-approved">Loading...</p>
    </div>
    <div class="brand-card p-6 rounded-xl shadow-sm">
      <h3 class="font-semibold text-slate-400 text-sm uppercase tracking-wider">Completed</h3>
      <p class="text-3xl font-bold text-green" id="stat-completed">Loading...</p>
    </div>
  `;

  const dashboardRecentReportsHtml = () => `
    <div class="brand-card p-6 rounded-xl shadow-sm">
      <h2 class="font-bold text-navy text-lg mb-4">Recent Reports</h2>
      <div id="recent-reports" class="space-y-3 max-h-80 overflow-y-auto">
        <p class="text-slate-tint text-sm">Loading reports...</p>
      </div>
    </div>
  `;

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
    <section class="min-vh-100 flex items-center justify-center p-4 bg-sheet">
      <div class="text-center">
        <h1 class="text-5xl font-bold text-navy">404</h1>
        <p class="text-slate-tint text-2xl">Page not found</p>
        <a href="/" data-nav="/" class="btn btn-primary mt-4">Go Home</a>
      </div>
    </section>
  `;

  // --- Router (simple SPA) ---------------------------------------------------
  const routes = [
    { path: '/', name: 'home', page: pageHome },
    { path: '/login', name: 'login', page: pageLogin },
    { path: '/register', name: 'register', page: pageRegister },
    { path: '/reports', name: 'reports', page: pageReports, requireAuth: true },
    { path: '/report/:id', name: 'report-detail', page: pageReportDetail },
    { path: '/submit-report', name: 'submit-report', page: pageSubmitReport, requireAuth: true },
    { path: '/map', name: 'map', page: pageMap },
    { path: '/admin', name: 'admin', page: pageAdminDashboard, requireAuth: true, role: 'ADMIN' },
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
    if (current === path) { render(); return; }
    history[replace ? 'replaceState' : 'pushState']({}, '', path);
    render();
  };
  // Exposed so inline handlers / tests can drive the SPA.
  window.navigateTo = navigateTo;

  const render = async () => {
    const root = document.getElementById('root');
    if (!root) return;

    const { route, params } = matchRoute(window.location.pathname);

    if (!route) {
      root.innerHTML = pageNotFound();
      return;
    }

    // Route guards (requireAuth + role).
    if (route.requireAuth && !user) {
      navigateTo('/login', true);
      return;
    }
    if (route.role && (!user || user.role !== route.role)) {
      navigateTo(user ? '/' : '/login', true);
      return;
    }

    root.innerHTML = route.page(params);
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
      case 'assignments': await initAssignmentsPage(); break;
      case 'audit': await initAuditPage(); break;
      default: break;
    }
  };

  // --- Page init functions ---------------------------------------------------

  const initHomePage = async () => {
    on(q('#nav-logout'), 'click', () => {
      clearToken();
      setUser(null);
      navigateTo('/login');
    });

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
          alert('Login failed: ' + (err.message || err));
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
          alert('Registration failed: ' + (err.message || err));
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
    const form = q('#report-form');

    on(q('#btn-get-location'), 'click', () => {
      if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          latInput.value = pos.coords.latitude;
          lonInput.value = pos.coords.longitude;
          if (gpsCoords) gpsCoords.textContent = `Lat: ${pos.coords.latitude.toFixed(6)}, Lng: ${pos.coords.longitude.toFixed(6)}`;
        },
        (err) => alert('Unable to get location: ' + err.message),
        { enableHighAccuracy: true }
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
      if (!lat || !lon) { alert('Please set the GPS location first.'); return; }
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('Please attach at least one photo of the issue.');
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
        alert('Failed to submit: ' + (err.message || err));
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

  const initAdminDashboard = async () => {
    try {
      const data = await api('/reports/stats');
      const totals = (data && data.totals) || {};
      setText('stat-total', totals.total);
      setText('stat-pending', totals.pending);
      setText('stat-approved', totals.approved);
      setText('stat-completed', totals.completed);

      const recentList = q('#recent-reports');
      const recent = (data && data.recent) || [];
      if (recentList) {
        if (recent.length > 0) {
          html(recentList, recent.map((r) => `
            <div class="p-3 rounded border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer" data-nav="/report/${encodeURIComponent(r.id)}">
              <div class="flex justify-between items-start gap-3">
                <div class="min-w-0">
                  <h3 class="font-medium text-navy line-clamp-1">${escapeHtml(r.title)}</h3>
                  <p class="text-slate-tint text-xs line-clamp-1">${escapeHtml(reportLocation(r))}</p>
                </div>
                <span class="text-amber text-xs flex-shrink-0">${escapeHtml(r.moderationStatus)}</span>
              </div>
            </div>`).join(''));
        } else {
          html(recentList, '<p class="text-slate-tint text-sm">No reports yet.</p>');
        }
      }
    } catch (err) {
      html(q('#recent-reports'), `<p class="text-red-400">Error loading dashboard: ${escapeHtml(err.message)}</p>`);
    }
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
      const target = e.target && e.target.closest ? e.target.closest('[data-nav]') : null;
      if (!target) return;
      e.preventDefault();
      navigateTo(target.getAttribute('data-nav'));
    });

    on(window, 'popstate', render);
    await render();
  };

  // Start
  init();
})();
