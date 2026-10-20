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
        console.warn('Could not save RoadBlocks theme preference:', error);
      }
    }
    updateThemeToggleLabels();
  };

  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  systemTheme.addEventListener('change', (event) => {
    try {
      if (localStorage.getItem(THEME_KEY) === 'light' || localStorage.getItem(THEME_KEY) === 'dark') return;
    } catch (error) {
      console.warn('Could not read RoadBlocks theme preference:', error);
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
    window.setTimeout(() => {
      if (notice.isConnected) notice.remove();
    }, 5 * 60 * 1000);
  };

  // --- State -----------------------------------------------------------------
  let user = null;
  let flash = null; // one-shot success message handed between pages
  const deletingReportIds = new Set();
  let assignmentFocusBound = false;

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

  // --- Full-size photo viewer -------------------------------------------------
  // Every thumbnail declares the photos it can show as JSON in
  // `data-photo-viewer` (plus which one it represents in `data-photo-index`), so
  // a single delegated handler lights the viewer up from any screen — report
  // lists, the admin table, maintenance assignments and report details — with no
  // per-page wiring. Private photos are still fetched through the same
  // `loadAuthedImage` path the thumbnails use, so the viewer never widens
  // access: a photo the caller may not read fails here exactly as it would in
  // the thumbnail.
  const viewerItems = (report) => {
    const list = Array.isArray(report && report.photos) ? report.photos : [];
    if (list.length) {
      return list.map((p) => ({
        url: absoluteUrl(p.url),
        isPublic: p.isPublic !== false,
        caption: p.caption || '',
      }));
    }
    if (report && report.thumbnailUrl) {
      return [{ url: absoluteUrl(report.thumbnailUrl), isPublic: true, caption: report.title || '' }];
    }
    return [];
  };

  // Attributes that turn an element into a viewer trigger. Empty when the report
  // has no photo, so callers can fall back to the plain icon tile.
  const photoViewerAttrs = (report, index = 0) => {
    const items = viewerItems(report);
    if (!items.length) return '';
    return `data-photo-viewer="${escapeHtml(JSON.stringify(items))}" data-photo-index="${index}"`;
  };

  const viewerItemsFromTrigger = (el) => {
    try {
      const parsed = JSON.parse(el.getAttribute('data-photo-viewer') || '[]');
      return Array.isArray(parsed) ? parsed.filter((p) => p && p.url) : [];
    } catch (error) {
      return [];
    }
  };

  const openPhotoViewer = (items, startIndex = 0) => {
    if (!items || !items.length) return;
    let index = Math.min(Math.max(0, Number(startIndex) || 0), items.length - 1);
    let zoom = 1;
    const multi = items.length > 1;

    const dialog = document.createElement('dialog');
    dialog.className = 'rw-lightbox';
    dialog.setAttribute('aria-label', 'Report photo');
    dialog.innerHTML = `
      <div class="rw-lightbox-panel">
        <div class="rw-lightbox-bar">
          <span class="rw-lightbox-count" data-lightbox-count></span>
          <span class="rw-lightbox-caption" data-lightbox-caption></span>
          <span class="rw-lightbox-spacer"></span>
          <button type="button" class="rw-lightbox-btn" data-lightbox-zoom-out aria-label="Zoom out">&#8722;</button>
          <button type="button" class="rw-lightbox-btn" data-lightbox-zoom-in aria-label="Zoom in">+</button>
          <button type="button" class="rw-lightbox-btn rw-lightbox-close" data-lightbox-close aria-label="Close photo viewer">&times;</button>
        </div>
        <div class="rw-lightbox-stage" data-lightbox-stage>
          <p class="rw-lightbox-status" data-lightbox-status>Loading photo…</p>
          <img class="rw-lightbox-image" data-lightbox-image alt="" hidden />
        </div>
        <button type="button" class="rw-lightbox-nav rw-lightbox-prev" data-lightbox-prev aria-label="Previous photo">&#8249;</button>
        <button type="button" class="rw-lightbox-nav rw-lightbox-next" data-lightbox-next aria-label="Next photo">&#8250;</button>
      </div>`;
    document.body.appendChild(dialog);

    const image = dialog.querySelector('[data-lightbox-image]');
    const stage = dialog.querySelector('[data-lightbox-stage]');
    const status = dialog.querySelector('[data-lightbox-status]');
    const count = dialog.querySelector('[data-lightbox-count]');
    const caption = dialog.querySelector('[data-lightbox-caption]');
    const unavailable = 'This photo could not be loaded. It may have been removed, or you may not have access to it.';

    const setZoom = (value) => {
      zoom = Math.min(4, Math.max(1, value));
      if (zoom === 1) {
        image.style.width = '';
        stage.classList.remove('is-zoomed');
      } else {
        // Zooming to the natural pixel size (scaled) lets the stage scroll, so
        // large photos can be inspected and panned on touch and mouse alike.
        const natural = image.naturalWidth || 0;
        if (natural > 0) image.style.width = `${Math.round(natural * zoom)}px`;
        stage.classList.add('is-zoomed');
      }
    };

    const render = () => {
      const photo = items[index];
      count.textContent = multi ? `${index + 1} / ${items.length}` : 'Photo';
      caption.textContent = photo.caption || '';
      image.hidden = true;
      image.removeAttribute('src');
      image.removeAttribute('data-authed-src');
      image.alt = photo.caption || 'Report photo';
      status.hidden = false;
      status.textContent = 'Loading photo…';
      setZoom(1);
      stage.scrollTop = 0;
      stage.scrollLeft = 0;
      if (photo.isPublic === false) {
        image.setAttribute('data-authed-src', photo.url);
        // `loadAuthedImage` resolves whether or not the fetch succeeded, so an
        // unset `src` afterwards is the failure signal.
        loadAuthedImage(image).then(() => {
          if (!image.getAttribute('src')) {
            status.hidden = false;
            status.textContent = unavailable;
          }
        });
      } else {
        image.src = photo.url;
      }
    };

    image.addEventListener('load', () => {
      image.hidden = false;
      status.hidden = true;
    });
    image.addEventListener('error', () => {
      if (!image.getAttribute('src')) return;
      image.hidden = true;
      status.hidden = false;
      status.textContent = unavailable;
    });
    image.addEventListener('click', () => setZoom(zoom === 1 ? 2 : 1));

    const step = (delta) => {
      index = (index + delta + items.length) % items.length;
      render();
    };

    const onKeydown = (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(zoom + 0.5); }
      else if (event.key === '-') { event.preventDefault(); setZoom(zoom - 0.5); }
    };

    const lastFocus = document.activeElement;
    const close = () => {
      if (dialog.open) dialog.close();
      dialog.remove();
      document.documentElement.classList.remove('rw-modal-open');
      document.removeEventListener('keydown', onKeydown);
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    };

    dialog.querySelector('[data-lightbox-close]').addEventListener('click', close);
    dialog.querySelector('[data-lightbox-zoom-in]').addEventListener('click', () => setZoom(zoom + 0.5));
    dialog.querySelector('[data-lightbox-zoom-out]').addEventListener('click', () => setZoom(zoom - 0.5));
    if (multi) {
      dialog.querySelector('[data-lightbox-prev]').addEventListener('click', () => step(-1));
      dialog.querySelector('[data-lightbox-next]').addEventListener('click', () => step(1));
    } else {
      dialog.querySelector('[data-lightbox-prev]').hidden = true;
      dialog.querySelector('[data-lightbox-next]').hidden = true;
    }
    // On a full-screen dialog, the empty stage is the usable backdrop area.
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target === stage) close();
    });
    document.addEventListener('keydown', onKeydown);

    document.documentElement.classList.add('rw-modal-open');
    render();
    dialog.showModal();
    dialog.querySelector('[data-lightbox-close]').focus();
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

  // Single source of truth for issue categories on the web client. Values and
  // wording mirror `Schema::CATEGORIES` (backend) and `IssueCategory` (mobile),
  // so both apps validate and display the same thing.
  // DAMAGED_DRAINAGE predates the current picker list: it stays here (and in the
  // API) so older reports keep rendering, but is listed after the six current
  // options for continuity.
  const CATEGORY_META = {
    POTHOLE: { icon: '🕳️', label: 'Pothole' },
    ROAD_CRACK: { icon: '🩹', label: 'Road cracks' },
    DAMAGED_PAVEMENT: { icon: '🛣️', label: 'Damaged pavement' },
    FLOODING: { icon: '🌊', label: 'Flooding or water accumulation' },
    ROAD_OBSTRUCTION: { icon: '🚧', label: 'Road obstruction' },
    DAMAGED_DRAINAGE: { icon: '🚿', label: 'Damaged drainage' },
    OTHER: { icon: 'ℹ️', label: 'Other' },
  };
  // Order offered when submitting a report.
  const CATEGORY_OPTIONS = ['POTHOLE', 'ROAD_CRACK', 'DAMAGED_PAVEMENT', 'FLOODING', 'ROAD_OBSTRUCTION', 'DAMAGED_DRAINAGE', 'OTHER'];
  // "Other" must be explained; bounds are mirrored by the API and the mobile form.
  const CATEGORY_OTHER = 'OTHER';
  const CATEGORY_OTHER_MIN = 5;
  const CATEGORY_OTHER_MAX = 300;

  const categoryIcon = (cat) => (CATEGORY_META[String(cat || '').toUpperCase()] || CATEGORY_META.OTHER).icon;
  const categoryLabel = (cat) => (CATEGORY_META[String(cat || '').toUpperCase()] || CATEGORY_META.OTHER).label;
  // A report's category as shown to users: "Other — <the reporter's own words>"
  // when they supplied a description, plain label otherwise.
  const categoryText = (report) => {
    const value = String((report && report.category) || '').toUpperCase();
    const typical = categoryLabel(value);
    const other = report && typeof report.categoryOther === 'string' ? report.categoryOther.trim() : '';
    return value === CATEGORY_OTHER && other ? `${typical} — ${other}` : typical;
  };

  const reportLocation = (r) => r.areaLabel || r.addressText || 'Location not specified';

  const statusBadge = (mod, repair) => {
    if (mod === 'REJECTED') return `<span class="text-red-100 bg-red-900/20 px-2 py-1 rounded text-[10]">Rejected</span>`;
    if (mod === 'PENDING_REVIEW' || !mod) return `<span class="text-amber-100 bg-amber-900/20 px-2 py-1 rounded text-[10]">Pending review</span>`;
    if (repair === 'COMPLETED') return `<span class="text-green-100 bg-green-900/20 px-2 py-1 rounded text-[10]">Completed</span>`;
    if (repair === 'VERIFIED_COMPLETED') return `<span class="text-green-100 bg-green-900/20 px-2 py-1 rounded text-[10]">Verified completed</span>`;
    if (repair === 'AWAITING_VERIFICATION') return `<span class="text-blue-100 bg-blue-900/20 px-2 py-1 rounded text-[10]">Awaiting verification</span>`;
    if (repair === 'RETURNED_FOR_WORK') return `<span class="text-amber-100 bg-amber-900/20 px-2 py-1 rounded text-[10]">Returned for further work</span>`;
    if (repair === 'IN_PROGRESS') return `<span class="text-blue-100 bg-blue-900/20 px-2 py-1 rounded text-[10]">In progress</span>`;
    if (repair === 'AWAITING_MAINTENANCE') return `<span class="text-amber-100 bg-amber-900/20 px-2 py-1 rounded text-[10]">Awaiting maintenance</span>`;
    return `<span class="text-green-100 bg-green-900/20 px-2 py-1 rounded text-[10]">Approved</span>`;
  };

  const reportCardHtml = (r) => {
    const photo = (r.photos && r.photos[0]) || null;
    const thumb = r.thumbnailUrl || (photo ? photo.url : '');
    const currentUser = getUser();
    // A thumbnailUrl is always public; private photos are only fetchable by
    // staff or the report owner.
    const needsAuth = !r.thumbnailUrl && photo && photo.isPublic === false;
    const canViewPrivatePhoto = currentUser
      && (currentUser.role === 'ADMIN'
        || currentUser.role === 'MAINTENANCE_OFFICER'
        || r.citizen?.id === currentUser.id);
    const showThumb = Boolean(thumb) && (!needsAuth || canViewPrivatePhoto);
    const imgAttr = needsAuth
      ? `data-authed-src="${escapeHtml(absoluteUrl(thumb))}"`
      : `src="${escapeHtml(absoluteUrl(thumb))}"`;
    return `
    <article class="brand-card p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer" data-nav="/report/${encodeURIComponent(r.id)}">
      <div class="flex items-start gap-4">
        ${showThumb
          ? `<button type="button" class="rw-photo-trigger flex-shrink-0" ${photoViewerAttrs(r)} aria-label="View photo for ${escapeHtml(r.title)}"><img ${imgAttr} alt="${escapeHtml(r.title)}" class="w-16 h-16 rounded object-cover" /></button>`
          : `<div class="w-16 h-16 rounded flex-shrink-0 bg-sheet flex items-center justify-center"><span class="text-sm font-medium text-ink-3">${categoryIcon(r.category)}</span></div>`}
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-navy line-clamp-1">${escapeHtml(r.title)}</h3>
          <p class="text-sm text-slate-tint line-clamp-1">${escapeHtml(categoryText(r))} · ${escapeHtml(reportLocation(r))}</p>
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

  const passwordToggleHtml = (id) => `
    <button type="button" class="rw-password-toggle" data-password-toggle="${escapeHtml(id)}"
      aria-label="Show password" aria-pressed="false" title="Show password">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z"></path>
        <circle cx="12" cy="12" r="2.7"></circle>
        <path class="rw-password-eye-slash" d="m4 4 16 16"></path>
      </svg>
    </button>`;

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
            <div class="rw-password-field">
              <input id="login-password" type="password" name="password" required class="w-full brand-input" placeholder="••••••••" autocomplete="current-password" />
              ${passwordToggleHtml('login-password')}
            </div>
          </div>
          <p id="login-feedback" class="rw-auth-feedback" role="alert" aria-live="assertive" tabindex="-1" hidden></p>
          <button type="submit" class="btn btn-primary w-full">Sign in</button>
          <p class="text-center text-sm text-slate-tint mt-3">
            New to RoadBlocks? <a href="/register" id="show-register" class="font-medium text-navy underline">Create account</a>
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
          <p class="text-sm text-slate-tint mt-1">Join RoadBlocks and report road issues</p>
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
            <label class="block text-sm font-medium text-ink-2 mb-2" for="register-password">Password</label>
            <div class="rw-password-field">
              <input id="register-password" type="password" name="password" required class="w-full brand-input" placeholder="••••••••" autocomplete="new-password" />
              ${passwordToggleHtml('register-password')}
            </div>
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
        <a href="/" id="nav-home" data-nav="/" class="rw-brand-home" aria-label="RoadBlocks by Code Blocks Inc.">${brandLogoHtml('dark')}</a>
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
    const firstName = escapeHtml((u?.fullName || '').split(' ')[0] || 'there');
    return workspaceLayout('CITIZEN', 'dashboard', `
      <div class="admin-page-heading">
        <div>
          <p class="admin-eyebrow">CITIZEN DASHBOARD</p>
          <h1 class="admin-page-title">Welcome, ${firstName}</h1>
          <p class="admin-page-subtitle">Track your reports and the work happening in your community.</p>
        </div>
        <div class="rw-dashboard-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-citizen-refresh>Refresh data</button>
          <a href="/submit-report" data-nav="/submit-report" class="btn btn-primary btn-sm">Report an issue</a>
        </div>
      </div>
      <div class="admin-stat-grid" aria-label="Your report statistics">
        ${[
          ['Total reports', 'citizen-stat-total', 'navy'],
          ['Awaiting review', 'citizen-stat-pending', 'amber'],
          ['In repair', 'citizen-stat-progress', 'blue'],
          ['Completed', 'citizen-stat-completed', 'green'],
        ].map(([label, id, tone]) => `
          <article class="admin-stat-card admin-stat-${tone}">
            <p>${label}</p>
            <strong id="${id}"><span class="spinner" aria-label="Loading"></span></strong>
          </article>`).join('')}
      </div>
      <section class="admin-panel">
        <div class="admin-panel-heading">
          <div>
            <h2>Recent activity</h2>
            <p>Your latest submissions and status updates.</p>
          </div>
          <a href="/reports" data-nav="/reports" class="btn btn-ghost btn-sm">View all reports</a>
        </div>
        <div id="citizen-dashboard-feedback" class="admin-feedback" role="status" aria-live="polite"></div>
        <div id="home-reports">
          <div class="loading-block"><span class="spinner"></span> Loading your reports…</div>
        </div>
      </section>
      <section class="admin-panel">
        <div class="admin-panel-heading">
          <div><h2>Notifications</h2><p>Active notices automatically expire after five minutes.</p></div>
        </div>
        <div id="citizen-notifications"><div class="loading-block"><span class="spinner"></span> Loading notifications…</div></div>
      </section>
      <section class="admin-panel rw-citizen-quick-actions">
        <div class="admin-panel-heading">
          <div>
            <h2>Quick actions</h2>
            <p>Find a service or continue reporting.</p>
          </div>
        </div>
        <div class="rw-action-grid">
          <a href="/submit-report" data-nav="/submit-report" class="rw-action-card"><strong>Report a road issue</strong><span>Share a location, details and photo.</span></a>
          <a href="/reports" data-nav="/reports" class="rw-action-card"><strong>Track my reports</strong><span>Review moderation and repair progress.</span></a>
          <a href="/map" data-nav="/map" class="rw-action-card"><strong>Explore the public map</strong><span>See approved reports near the community.</span></a>
        </div>
      </section>
    `);
  };

  const pageReports = () => workspaceLayout('CITIZEN', 'reports', `
    <section class="workspace-page">
      <div class="max-w-7xl mx-auto px-6">
        <div class="admin-page-heading">
          <div>
            <p class="admin-eyebrow">CITIZEN WORKSPACE</p>
            <h1 class="admin-page-title">My reports</h1>
            <p class="admin-page-subtitle">Review each report’s status and follow its progress.</p>
          </div>
          <button id="btn-new-report" data-nav="/submit-report" class="btn btn-primary">Report a road issue</button>
        </div>
        <div id="reports-list" class="admin-panel">
          <div class="loading-block"><span class="spinner"></span> Loading your reports…</div>
        </div>
      </div>
    </section>
  `);

  const pageReportDetail = () => {
    const user = getUser();
    const role = user?.role === 'ADMIN' || user?.role === 'MAINTENANCE_OFFICER' ? user.role : 'CITIZEN';
    const active = role === 'ADMIN' ? 'reports' : role === 'MAINTENANCE_OFFICER' ? 'assignments' : 'reports';
    return workspaceLayout(role, active, `
    <section class="workspace-page max-w-3xl mx-auto px-6">
      <div id="report-detail">
        <div class="loading-block"><span class="spinner"></span> Loading report…</div>
      </div>
    </section>
  `);
  };

  const pageSubmitReport = () => workspaceLayout('CITIZEN', 'submit-report', `
    <section class="workspace-page max-w-2xl mx-auto px-6">
      <div class="rw-report-form-card admin-panel">
        <div class="admin-page-heading">
          <div>
            <p class="admin-eyebrow">CITIZEN WORKSPACE</p>
            <h1 class="admin-page-title">Report a road issue</h1>
            <p class="admin-page-subtitle">Add the details, location and a photo so your report can be reviewed.</p>
          </div>
        </div>
        <form id="report-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2">Issue Title</label>
            <input type="text" name="title" required minlength="4" class="w-full brand-input" placeholder="e.g. Large pothole on Main St" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-2" for="report-category">Issue Category</label>
            <select name="category" id="report-category" required class="w-full brand-input">
              ${CATEGORY_OPTIONS.map((value) => `<option value="${value}">${escapeHtml(categoryLabel(value))}</option>`).join('')}
            </select>
          </div>
          <div id="report-category-other-wrap" hidden>
            <label class="block text-sm font-medium text-ink-2 mb-2" for="report-category-other">Describe the issue</label>
            <input type="text" name="categoryOther" id="report-category-other" maxlength="${CATEGORY_OTHER_MAX}"
              class="w-full brand-input" placeholder="e.g. Fallen tree blocking the whole lane" />
            <p class="text-sm text-slate-tint mt-1">Tell us what the issue is (at least ${CATEGORY_OTHER_MIN} characters).</p>
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
              <label class="block text-sm font-medium text-ink-2 mb-2" for="report-address">Place or address</label>
              <input type="text" name="addressText" id="report-address" maxlength="500" class="w-full brand-input"
                placeholder="Select a map point to fill in the location, or edit this field" autocomplete="street-address" />
              <p id="address-lookup-status" class="text-xs text-slate-tint mt-1" aria-live="polite">A coordinate label will be used if address lookup is unavailable.</p>
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
  `);

  const pageMap = () => {
    const role = getUser()?.role;
    const workspaceRole = role === 'ADMIN' || role === 'MAINTENANCE_OFFICER' ? role : 'CITIZEN';
    return workspaceLayout(workspaceRole, 'map', `
    <section class="workspace-page">
      <div class="max-w-7xl mx-auto px-6">
        <div class="admin-page-heading">
          <div>
            <p class="admin-eyebrow">ROADBLOCKS MAP</p>
            <h1 class="admin-page-title">Public report map</h1>
            <p class="admin-page-subtitle">Explore approved reports and their repair status.</p>
          </div>
        </div>
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
  `);
  };

  const workspaceLayout = (role, active, content) => {
    const links = role === 'ADMIN'
      ? [
          ['dashboard', '/admin', 'Dashboard'],
          ['reports', '/admin/reports', 'Reports'],
          ['map', '/map', 'Public map'],
          ['users', '/admin/users', 'Users'],
        ]
      : role === 'MAINTENANCE_OFFICER'
        ? [
            ['dashboard', '/assignments', 'My dashboard'],
            ['assignments', '#assignments-list', 'My assignments'],
            ['map', '/map', 'Public map'],
          ]
        : [
            ['dashboard', '/', 'Dashboard'],
            ['reports', '/reports', 'My reports'],
            ['submit-report', '/submit-report', 'Report an issue'],
            ['map', '/map', 'Public map'],
          ];
    const roleName = role === 'ADMIN' ? 'Admin' : role === 'MAINTENANCE_OFFICER' ? 'Maintenance' : 'Citizen';
    const navLabel = `${roleName} navigation`;
    return `
    <section class="admin-workspace">
      <aside class="admin-sidebar" aria-label="${navLabel}">
        <div class="admin-sidebar-top">
          <p class="admin-sidebar-heading">${role === 'ADMIN' ? 'ROADBLOCKS OPERATIONS' : `${roleName.toUpperCase()} WORKSPACE`}</p>
          <button type="button" class="admin-sidebar-toggle" data-admin-menu-toggle aria-expanded="false" aria-controls="admin-sidebar-nav">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>
            <span>Workspace menu</span>
          </button>
        </div>
        <nav id="admin-sidebar-nav" class="admin-sidebar-nav">
          ${links.map(([key, href, label]) => {
            const hash = href.indexOf('#');
            const path = hash < 0 ? href : href.slice(0, hash);
            const nav = hash < 0 ? `data-nav="${path}"` : '';
            return `<a href="${href}" ${nav} class="${active === key ? 'is-active' : ''}">${label}</a>`;
          }).join('')}
        </nav>
        <button type="button" class="admin-sidebar-logout" data-admin-logout>Sign out</button>
      </aside>
      <div class="admin-content">${content}</div>
    </section>`;
  };

  const adminLayout = (active, content) => workspaceLayout('ADMIN', active, content);

  const pageAdminDashboard = () => adminLayout('dashboard', `
    <div class="admin-page-heading">
      <div>
        <p class="admin-eyebrow">ROADBLOCKS OPERATIONS</p>
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
          <h2>Pending reports</h2>
          <p>Review new submissions and decide whether they should enter the maintenance workflow.</p>
        </div>
        <a href="/admin/reports" data-nav="/admin/reports" class="btn btn-ghost btn-sm">View all reports</a>
      </div>
      <div id="admin-dashboard-pending">
        <div class="loading-block"><span class="spinner"></span> Loading pending reports…</div>
      </div>
    </section>
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
    <section class="admin-panel">
      <div class="admin-panel-heading">
        <div><h2>Workflow notifications</h2><p>Repair submissions that need review expire from this active list after five minutes.</p></div>
      </div>
      <div id="admin-notifications"><div class="loading-block"><span class="spinner"></span> Loading notifications…</div></div>
    </section>
  `);

  const pageAdminReports = () => adminLayout('reports', `
    <div class="admin-page-heading">
      <div>
        <p class="admin-eyebrow">ROADBLOCKS OPERATIONS</p>
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
            <option value="repairStatus:AWAITING_VERIFICATION">Awaiting admin verification</option>
            <option value="repairStatus:RETURNED_FOR_WORK">Returned for further work</option>
            <option value="repairStatus:COMPLETED">Completed (legacy)</option>
            <option value="repairStatus:VERIFIED_COMPLETED">Verified completed (admin approved)</option>
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
        <p class="admin-eyebrow">ROADBLOCKS OPERATIONS</p>
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

  const pageAssignments = () => workspaceLayout('MAINTENANCE_OFFICER', 'dashboard', `
    <section class="workspace-page">
      <div class="admin-page-heading">
        <div>
          <p class="admin-eyebrow">MAINTENANCE WORKSPACE</p>
          <h1 class="admin-page-title">My dashboard</h1>
          <p class="admin-page-subtitle">Assignments, repair progress and notifications for your work.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-refresh-assignments">Refresh dashboard</button>
      </div>
      <div id="officer-summary" class="admin-stat-grid" aria-label="Maintenance summary">
        <div class="loading-block"><span class="spinner"></span> Loading your summary…</div>
      </div>
      <section class="admin-panel">
        <div class="admin-panel-heading">
          <div>
            <h2>Assignment notifications</h2>
            <p id="officer-unread-count">Loading unread count…</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-mark-all-notifications-read">Mark all read</button>
        </div>
        <div id="officer-notification-feedback" class="admin-feedback" role="status" aria-live="polite"></div>
        <div id="officer-notifications"><div class="loading-block"><span class="spinner"></span> Loading notifications…</div></div>
      </section>
      <section class="admin-panel" id="assigned-work">
        <div class="admin-panel-heading">
          <div>
            <h2>My assignments</h2>
            <p>Open a report to review its location, photos and repair history.</p>
          </div>
        </div>
        <div id="assignments-list" class="space-y-3">
          <div class="loading-block"><span class="spinner"></span> Loading assignments…</div>
        </div>
      </section>
    </section>
  `);

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

    if (user && (route.name === 'login' || (route.name === 'home' && user.role !== 'CITIZEN'))) {
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
    bindPasswordToggles(root);
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

  const bindPasswordToggles = (root) => {
    root.querySelectorAll('[data-password-toggle]').forEach((button) => {
      const input = root.querySelector(`#${CSS.escape(button.dataset.passwordToggle || '')}`);
      if (!input) return;
      button.addEventListener('click', () => {
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(visible));
        button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        button.title = visible ? 'Hide password' : 'Show password';
        button.classList.toggle('is-visible', visible);
      });
      button.addEventListener('keydown', (event) => {
        if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
        event.preventDefault();
        button.click();
      });
    });
  };

  let notificationExpiryTimer = null;

  const loadNotificationPanel = (hostId) => {
    const host = q(`#${hostId}`);
    if (!host) return;
    const render = async () => {
      try {
        const data = await api('/notifications?limit=50');
        const items = data.items || [];
        const unread = Number(data.unreadCount) || 0;
        host.innerHTML = items.length
          ? `<div class="rw-notification-list">${items.map((item) => `
              <button type="button" class="rw-notification-item${item.isRead ? ' is-read' : ''}" data-notification-report="${escapeHtml(item.reportId)}" data-notification-id="${escapeHtml(item.id)}">
                <span class="rw-notification-dot" aria-hidden="true"></span>
                <span class="rw-notification-copy">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.message)}</span>
                  <small>${escapeHtml(relativeDate(item.createdAt))} · ${escapeHtml(adminRepairLabel(item.repairStatus))}</small>
                </span>
              </button>`).join('')}
              <div class="rw-notification-footer"><span>${unread} unread · expires after five minutes</span>
                <button type="button" class="btn btn-ghost btn-sm" data-notifications-mark-all ${unread ? '' : 'disabled'}>Mark all read</button>
              </div>
            </div>`
          : '<div class="empty-state admin-empty"><p>No active notifications.</p></div>';
        if (notificationExpiryTimer) window.clearTimeout(notificationExpiryTimer);
        const expirations = items.map((item) => Date.parse(item.expiresAt)).filter(Number.isFinite);
        if (expirations.length) {
          const untilExpiry = Math.max(0, Math.min(...expirations) - Date.now());
          notificationExpiryTimer = window.setTimeout(() => {
            if (host.isConnected) void render();
          }, untilExpiry + 20);
        }
      } catch (err) {
        host.innerHTML = `<div class="admin-error-block">Could not load notifications. ${escapeHtml(err.message)}</div>`;
      }
    };
    host.addEventListener('click', async (event) => {
      const markAll = event.target.closest('[data-notifications-mark-all]');
      const item = event.target.closest('[data-notification-id]');
      try {
        if (markAll) {
          await api('/notifications/read-all', { method: 'PATCH' });
          await render();
        } else if (item) {
          await api(`/notifications/${encodeURIComponent(item.dataset.notificationId)}/read`, { method: 'PATCH' });
          navigateTo(`/report/${encodeURIComponent(item.dataset.notificationReport)}`);
        }
      } catch (err) {
        notify(`Could not update notification: ${err.message}`);
      }
    });
    void render();
  };

  const initHomePage = async () => {
    loadNotificationPanel('citizen-notifications');
    const host = q('#home-reports');
    if (!host) return;
    const feedbackId = 'citizen-dashboard-feedback';
    const load = async () => {
      const refreshButton = q('[data-citizen-refresh]');
      if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = 'Refreshing…';
      }
      const query = (values) => {
        const params = new URLSearchParams({ page: '1', pageSize: '1', ...values });
        return api(`/reports/mine?${params.toString()}`);
      };
      const tasks = await Promise.allSettled([
        api('/reports/mine?page=1&pageSize=5'),
        query({ moderationStatus: 'PENDING_REVIEW' }),
        query({ repairStatus: 'AWAITING_MAINTENANCE' }),
        query({ repairStatus: 'IN_PROGRESS' }),
        query({ repairStatus: 'AWAITING_VERIFICATION' }),
        query({ repairStatus: 'RETURNED_FOR_WORK' }),
        query({ repairStatus: 'COMPLETED' }),
        query({ repairStatus: 'VERIFIED_COMPLETED' }),
      ]);
      const [recentResult, pendingResult, awaitingResult, progressResult, verificationResult, returnedResult, completedResult, verifiedResult] = tasks;
      const stats = [
        ['citizen-stat-total', [recentResult]],
        ['citizen-stat-pending', [pendingResult]],
        ['citizen-stat-progress', [awaitingResult, progressResult, verificationResult, returnedResult]],
        ['citizen-stat-completed', [completedResult, verifiedResult]],
      ];
      stats.forEach(([id, results]) => {
        if (results.every((result) => result.status === 'fulfilled')) {
          setText(id, results.reduce((sum, result) => sum + (Number(result.value.total) || 0), 0));
        } else {
          setText(id, '—');
        }
      });
      const errors = tasks.filter((result) => result.status === 'rejected');
      if (errors.length) {
        setAdminFeedback(feedbackId, `Some dashboard information could not be loaded: ${errors.map((r) => r.reason?.message || 'request failed').join('; ')}`, 'error');
      } else {
        setAdminFeedback(feedbackId, '');
      }

      if (recentResult.status === 'rejected') {
        html(host, `<div class="admin-error-block">Could not load your reports. ${escapeHtml(recentResult.reason?.message || 'Please retry.')}</div>`);
      } else {
        const items = recentResult.value.items || [];
        html(host, items.length
          ? `<div class="rw-dashboard-report-list">${items.map(reportCardHtml).join('')}</div>`
          : `<div class="empty-state admin-empty">
              <h3 class="text-xl font-bold text-navy mb-2">No reports yet</h3>
              <p>Submit a road issue to start tracking its review and repair progress.</p>
              <a href="/submit-report" data-nav="/submit-report" class="btn btn-primary mt-4">Report an issue</a>
            </div>`);
        hydrateAuthedImages(host);
      }
      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = 'Refresh data';
      }
    };
    on(q('[data-citizen-refresh]'), 'click', load);
    await load();
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
      bindReportDetailActions(host, report);
    } catch (err) {
      host.innerHTML = `<p class="text-red-400">Error loading report: ${escapeHtml(err.message)}</p>`;
    }
  };

  const bindReportDetailActions = (host, report) => {
    const refresh = () => initReportDetailPage({ id: report.id });
    const setBusy = (button, busy, label) => {
      if (!button) return;
      if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
      button.disabled = busy;
      button.textContent = busy ? label : button.dataset.defaultLabel;
    };
    const setActionFeedback = (message, tone = 'info') => {
      const feedback = host.querySelector('[data-report-action-feedback]');
      if (!feedback) return;
      feedback.textContent = message;
      feedback.className = `rw-staff-feedback is-${tone}`;
    };
    const requestModerationDecision = (decision) => new Promise((resolve) => {
      const rejecting = decision === 'REJECT';
      const dialog = document.createElement('dialog');
      dialog.className = 'rw-confirm-dialog';
      dialog.setAttribute('aria-labelledby', 'rw-decision-title');
      dialog.setAttribute('aria-describedby', 'rw-decision-description');
      dialog.innerHTML = `
        <form class="rw-confirm-content rw-report-decision">
          <p class="rw-confirm-eyebrow">REPORT REVIEW · ${rejecting ? 'REJECTION' : 'APPROVAL'}</p>
          <h2 id="rw-decision-title">${rejecting ? 'Reject this report?' : 'Approve this report?'}</h2>
          <p id="rw-decision-description">${rejecting
            ? 'The report will remain off the public map. Provide a clear reason so the citizen understands the decision.'
            : 'The report will become eligible for the public map and maintenance assignment.'}</p>
          <p class="rw-confirm-identity"><strong>${escapeHtml(report.referenceNo || '')}</strong><span>${escapeHtml(report.title || 'Road issue report')}</span></p>
          ${rejecting ? `
            <label for="rw-rejection-reason">Rejection reason <span>(at least 5 characters)</span></label>
            <textarea id="rw-rejection-reason" name="reason" class="brand-input" rows="3" minlength="5" maxlength="1000" required></textarea>
            <p class="rw-decision-error" role="alert" aria-live="polite"></p>` : ''}
          <div class="rw-confirm-actions">
            <button type="button" class="btn btn-secondary" data-decision-cancel>Cancel</button>
            <button type="submit" class="btn ${rejecting ? 'btn-danger' : 'btn-primary'}">${rejecting ? 'Reject report' : 'Approve report'}</button>
          </div>
        </form>`;
      document.body.appendChild(dialog);
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(value);
      };
      const form = dialog.querySelector('form');
      dialog.querySelector('[data-decision-cancel]').addEventListener('click', () => finish(null));
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const reason = String(new FormData(form).get('reason') || '').trim();
        if (rejecting && reason.length < 5) {
          const textarea = form.querySelector('textarea');
          const error = form.querySelector('.rw-decision-error');
          error.textContent = 'Enter a rejection reason of at least 5 characters.';
          textarea.setCustomValidity('Enter at least 5 characters.');
          textarea.reportValidity();
          textarea.addEventListener('input', () => textarea.setCustomValidity(''), { once: true });
          textarea.focus();
          return;
        }
        finish({ decision, reason });
      });
      dialog.showModal();
      if (rejecting) form.querySelector('textarea').focus();
    });

    const approveButton = host.querySelector('[data-report-approve]');
    on(approveButton, 'click', async () => {
      if (!await requestModerationDecision('APPROVE')) return;
      setBusy(approveButton, true, 'Approving…');
      try {
        await api(`/reports/${encodeURIComponent(report.id)}/moderation`, {
          method: 'PATCH',
          body: JSON.stringify({ decision: 'APPROVE' }),
        });
        notify('Report approved. Assign a maintenance officer to start the repair workflow.');
        await refresh();
      } catch (err) {
        setActionFeedback(`Could not approve report: ${err.message}`, 'error');
        notify(`Could not approve report: ${err.message}`);
        setBusy(approveButton, false);
      }
    });

    const rejectButton = host.querySelector('[data-report-reject]');
    on(rejectButton, 'click', async () => {
      const decision = await requestModerationDecision('REJECT');
      if (!decision) return;
      setBusy(rejectButton, true, 'Rejecting…');
      try {
        await api(`/reports/${encodeURIComponent(report.id)}/moderation`, {
          method: 'PATCH',
          body: JSON.stringify({ decision: 'REJECT', reason: decision.reason }),
        });
        notify('Report rejected. It will remain off the public map and repair queue.');
        await refresh();
      } catch (err) {
        setActionFeedback(`Could not reject report: ${err.message}`, 'error');
        notify(`Could not reject report: ${err.message}`);
        setBusy(rejectButton, false);
      }
    });

    const verificationButton = host.querySelector('[data-repair-verify]');
    const returnButton = host.querySelector('[data-repair-return]');
    const decideVerification = async (decision) => {
      const returning = decision === 'RETURN';
      const dialog = document.createElement('dialog');
      dialog.className = 'rw-confirm-dialog';
      dialog.innerHTML = `<form class="rw-confirm-content">
        <p class="rw-confirm-eyebrow">REPAIR VERIFICATION</p>
        <h2>${returning ? 'Return this repair?' : 'Verify repair completion?'}</h2>
        <p>${returning
          ? 'The officer will be asked to continue work. Explain what still needs attention.'
          : 'Confirm the submitted notes and after-repair evidence show the issue is resolved.'}</p>
        ${returning ? '<label for="repair-return-reason">Reason (at least 5 characters)</label><textarea id="repair-return-reason" name="reason" class="brand-input" rows="3" minlength="5" maxlength="1000" required></textarea><p class="rw-decision-error" role="alert"></p>' : ''}
        <div class="rw-confirm-actions">
          <button type="button" class="btn btn-secondary" data-verification-cancel>Cancel</button>
          <button type="submit" class="btn ${returning ? 'btn-danger' : 'btn-primary'}">${returning ? 'Return for work' : 'Verify completion'}</button>
        </div>
      </form>`;
      document.body.appendChild(dialog);
      const form = dialog.querySelector('form');
      const close = () => {
        if (dialog.open) dialog.close();
        dialog.remove();
      };
      dialog.querySelector('[data-verification-cancel]').addEventListener('click', close);
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        close();
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const reason = String(new FormData(form).get('reason') || '').trim();
        if (returning && reason.length < 5) {
          form.querySelector('.rw-decision-error').textContent = 'Enter a reason of at least 5 characters.';
          form.querySelector('textarea').focus();
          return;
        }
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        submit.textContent = returning ? 'Returning…' : 'Verifying…';
        try {
          await api(`/reports/${encodeURIComponent(report.id)}/verification`, {
            method: 'PATCH',
            body: JSON.stringify({ decision, ...(returning ? { reason } : {}) }),
          });
          close();
          notify(returning ? 'Repair returned to the assigned officer.' : 'Repair verified. The citizen was notified.');
          await refresh();
        } catch (err) {
          submit.disabled = false;
          submit.textContent = returning ? 'Return for work' : 'Verify completion';
          setActionFeedback(`Could not update repair verification: ${err.message}`, 'error');
          notify(`Could not update repair verification: ${err.message}`);
        }
      });
      dialog.showModal();
      if (returning) form.querySelector('textarea').focus();
    };
    on(verificationButton, 'click', () => void decideVerification('VERIFY'));
    on(returnButton, 'click', () => void decideVerification('RETURN'));

    const assignButton = host.querySelector('[data-report-assign]');
    on(assignButton, 'click', async () => {
      setBusy(assignButton, true, 'Loading officers…');
      try {
        const data = await api('/users/officers');
        const officers = (data.officers || []).filter((officer) => (officer.status || 'ACTIVE') === 'ACTIVE');
        if (!officers.length) throw new Error('No active maintenance officers are available.');
        const dialog = document.createElement('dialog');
        dialog.className = 'rw-confirm-dialog';
        dialog.innerHTML = `
          <form method="dialog" class="rw-confirm-content" data-assignment-form>
            <p class="rw-confirm-eyebrow">MAINTENANCE ASSIGNMENT</p>
            <h2>Assign this report</h2>
            <label class="block text-sm font-medium text-ink-2 mt-4" for="assignment-officer">Maintenance officer</label>
            <select class="brand-input mt-2" id="assignment-officer" name="officerId" required>
              <option value="">Select an active officer</option>
              ${officers.map((officer) => `<option value="${escapeHtml(officer.id)}">${escapeHtml(officer.fullName)}${officer.email ? ` · ${escapeHtml(officer.email)}` : ''}</option>`).join('')}
            </select>
            <label class="block text-sm font-medium text-ink-2 mt-4" for="assignment-note">Assignment note (optional)</label>
            <textarea class="brand-input mt-2" id="assignment-note" name="note" maxlength="1000" rows="2" placeholder="Add instructions for the officer."></textarea>
            <div class="rw-confirm-actions mt-5">
              <button type="button" class="btn btn-secondary" data-assignment-cancel>Cancel</button>
              <button type="submit" class="btn btn-primary">Assign report</button>
            </div>
          </form>`;
        document.body.appendChild(dialog);
        const close = () => {
          if (dialog.open) dialog.close();
          dialog.remove();
        };
        dialog.querySelector('[data-assignment-cancel]').addEventListener('click', close);
        dialog.addEventListener('cancel', (event) => {
          event.preventDefault();
          close();
        });
        dialog.addEventListener('click', (event) => {
          if (event.target === dialog) close();
        });
        dialog.querySelector('form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const officerId = String(form.get('officerId') || '');
          if (!officerId) return;
          const submit = dialog.querySelector('[type="submit"]');
          submit.disabled = true;
          submit.textContent = 'Assigning…';
          try {
            await api(`/reports/${encodeURIComponent(report.id)}/assign`, {
              method: 'POST',
              body: JSON.stringify({ officerId, note: String(form.get('note') || '').trim() }),
            });
            close();
            notify('Report assigned. A persistent notification was sent to the officer.');
            await refresh();
          } catch (err) {
            notify(`Could not assign report: ${err.message}`);
            submit.disabled = false;
            submit.textContent = 'Assign report';
          }
        });
        dialog.showModal();
        dialog.querySelector('select').focus();
      } catch (err) {
        notify(`Could not load maintenance officers: ${err.message}`);
      } finally {
        if (assignButton.isConnected) setBusy(assignButton, false);
      }
    });

    const startButton = host.querySelector('[data-repair-start]');
    on(startButton, 'click', async () => {
      if (!window.confirm('Start work on this assigned report?')) return;
      setBusy(startButton, true, 'Starting…');
      try {
        await api(`/reports/${encodeURIComponent(report.id)}/repair`, {
          method: 'PATCH',
          body: JSON.stringify({ repairStatus: 'IN_PROGRESS', note: 'Repair work started.' }),
        });
        notify('Repair status updated to in progress.');
        await refresh();
      } catch (err) {
        setActionFeedback(`Could not start repair: ${err.message}`, 'error');
        notify(`Could not start repair: ${err.message}`);
        setBusy(startButton, false);
      }
    });

    const completionForm = host.querySelector('[data-repair-complete-form]');
    on(completionForm, 'submit', async (event) => {
      event.preventDefault();
      const notes = String(new FormData(completionForm).get('completionNotes') || '').trim();
      const files = Array.from(host.querySelector('#repair-after-photos').files || []);
      if (notes.length < 5 || files.length < 1) {
        notify('Add completion notes and at least one after-repair photo.');
        return;
      }
      if (!window.confirm('Submit this repair for admin verification? The citizen will not be notified until an admin verifies it.')) return;
      const submit = completionForm.querySelector('[type="submit"]');
      setBusy(submit, true, 'Uploading and submitting…');
      try {
        const upload = new FormData();
        upload.append('kind', 'AFTER');
        files.forEach((file) => upload.append('afterPhotos[]', file));
        await api(`/reports/${encodeURIComponent(report.id)}/photos`, { method: 'POST', body: upload });
        await api(`/reports/${encodeURIComponent(report.id)}/repair`, {
          method: 'PATCH',
          body: JSON.stringify({ repairStatus: 'AWAITING_VERIFICATION', completionNotes: notes }),
        });
        notify('Completion evidence submitted for admin verification.');
        await refresh();
      } catch (err) {
        setActionFeedback(`Could not complete repair: ${err.message}`, 'error');
        notify(`Could not complete repair: ${err.message}`);
        setBusy(submit, false);
      }
    });
  };

  const reportDetailHtml = (report, history) => {
    const photos = report.photos || [];
    const currentUser = getUser();
    const isAdmin = currentUser && currentUser.role === 'ADMIN';
    const isAssignedOfficer = currentUser
      && currentUser.role === 'MAINTENANCE_OFFICER'
      && report.assignedOfficer
      && report.assignedOfficer.id === currentUser.id;
    const canModerate = isAdmin && report.moderationStatus === 'PENDING_REVIEW';
    const canAssign = isAdmin && report.moderationStatus === 'APPROVED'
      && !['AWAITING_VERIFICATION', 'COMPLETED', 'VERIFIED_COMPLETED'].includes(report.repairStatus);
    const canMaintain = report.moderationStatus === 'APPROVED'
      && ['AWAITING_MAINTENANCE', 'IN_PROGRESS', 'RETURNED_FOR_WORK'].includes(report.repairStatus)
      && isAssignedOfficer;
    const canVerifyRepair = isAdmin && report.moderationStatus === 'APPROVED'
      && report.repairStatus === 'AWAITING_VERIFICATION';
    const staffActions = (canModerate || canAssign || canMaintain || canVerifyRepair) ? `
      <section class="brand-card rw-staff-actions mt-6">
        <div class="rw-staff-actions-heading">
          <div>
            <p class="rw-staff-eyebrow">${canModerate ? 'ADMIN REVIEW' : isAdmin ? 'ADMIN WORKSPACE' : 'MAINTENANCE WORKSPACE'}</p>
            <h2>${isAdmin ? 'Admin actions' : 'Maintenance actions'}</h2>
            <p>${canModerate
              ? 'Review the report details and choose one moderation decision.'
              : isAdmin
                ? 'Manage assignment and monitor progress. The assigned officer reports completion.'
                : 'Update your assigned repair and submit completion evidence when the work is finished.'}</p>
          </div>
        </div>
        ${canModerate ? `
          <div class="rw-staff-action-group">
            <p class="rw-staff-group-label">Moderation decision</p>
            <div class="rw-staff-review-actions">
              <button type="button" class="btn btn-primary" data-report-approve>Approve report</button>
              <button type="button" class="btn btn-danger" data-report-reject>Reject report</button>
            </div>
          </div>` : ''}
        ${canAssign ? `
          <div class="rw-staff-action-group">
            <p class="rw-staff-group-label">${report.assignedOfficer ? 'Current assignment' : 'Next step'}</p>
            <button type="button" class="btn btn-primary rw-staff-assign" data-report-assign>${report.assignedOfficer ? 'Reassign officer' : 'Assign to officer'}</button>
          </div>` : ''}
        ${canVerifyRepair ? `
          <div class="rw-staff-action-group">
            <p class="rw-staff-group-label">Review submitted repair evidence</p>
            <div class="rw-staff-review-actions">
              <button type="button" class="btn btn-primary" data-repair-verify>Verify completion</button>
              <button type="button" class="btn btn-danger" data-repair-return>Return for further work</button>
            </div>
          </div>` : ''}
        ${canMaintain && ['AWAITING_MAINTENANCE', 'RETURNED_FOR_WORK'].includes(report.repairStatus) ? `
          <div class="rw-staff-action-group">
            <p class="rw-staff-group-label">Repair progress</p>
            <button type="button" class="btn btn-primary rw-staff-assign" data-repair-start>${report.repairStatus === 'RETURNED_FOR_WORK' ? 'Resume work' : 'Start work'}</button>
          </div>` : ''}
        ${isAdmin && report.moderationStatus === 'APPROVED' ? `
          <p class="rw-staff-monitor" role="status">Current repair status: <strong>${escapeHtml(adminRepairLabel(report.repairStatus))}</strong>. Completion notes and after-photos are submitted by the assigned maintenance officer.</p>` : ''}
        <p class="rw-staff-feedback" data-report-action-feedback role="status" aria-live="polite"></p>
        ${canMaintain && report.repairStatus === 'IN_PROGRESS' ? `
          <form class="rw-staff-completion" data-repair-complete-form>
            <p class="rw-staff-group-label">Submit repair for verification</p>
            <label for="repair-completion-notes">Completion notes</label>
            <textarea id="repair-completion-notes" name="completionNotes" required minlength="5" maxlength="4000" rows="3" class="w-full brand-input" placeholder="Describe the work completed and the current condition."></textarea>
            <label for="repair-after-photos">After-repair photo <span>(required)</span></label>
            <input id="repair-after-photos" name="afterPhotos" type="file" accept="image/*" multiple required class="w-full brand-input" />
            <button type="submit" class="btn btn-primary">Finish work and submit evidence</button>
          </form>` : ''}
      </section>` : '';
    const historyItems = history.map((h) => {
      const submittedNotes = String(h.note || '').startsWith('Completion evidence submitted: ');
      const title = h.type === 'REPAIR' && h.actorRole === 'MAINTENANCE_OFFICER'
        ? (submittedNotes ? 'Officer completion notes' : 'Officer progress update')
        : h.type === 'REPAIR' && h.actorRole === 'ADMIN' ? 'Admin repair verification' : h.type;
      const note = submittedNotes ? String(h.note).slice('Completion evidence submitted: '.length) : h.note;
      const actor = h.actor && h.actor.fullName
        ? `<span class="block text-xs text-ink-3">${escapeHtml(h.actor.fullName)}${h.actorRole ? ` · ${escapeHtml(h.actorRole === 'MAINTENANCE_OFFICER' ? 'Maintenance officer' : h.actorRole === 'ADMIN' ? 'Administrator' : 'Citizen')}` : ''}</span>`
        : '';
      return `
      <div class="p-3 rounded border border-slate-200">
        <div class="flex justify-between items-start gap-4">
          <div>
            <p class="font-medium text-navy text-sm">${escapeHtml(title)}${h.toValue ? `: ${escapeHtml(adminRepairLabel(h.toValue) || h.toValue)}` : ''}</p>
            ${actor}
            ${note ? `<p class="text-ink-2 text-sm mt-1">${escapeHtml(note)}</p>` : ''}
          </div>
          <span class="text-slate-400 text-xs flex-shrink-0">${escapeHtml(relativeDate(h.createdAt))}</span>
        </div>
      </div>`;
    }).join('');

    return `
      <div class="brand-card p-8 rounded-xl shadow-lg">
        <div class="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
          <div class="w-14 h-14 rounded flex-shrink-0 bg-sheet flex items-center justify-center text-2xl">${categoryIcon(report.category)}</div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-bold text-navy">${escapeHtml(report.title)}</h1>
            <p class="text-slate-tint text-sm">${escapeHtml(report.description || '')}</p>
            <div class="mt-3 flex flex-wrap gap-2 items-center">
              <span class="text-slate-tint text-xs uppercase tracking-wider">${escapeHtml(categoryText(report))}</span>
              ${statusBadge(report.moderationStatus, report.repairStatus)}
            </div>
          </div>
        </div>

        ${photos.length > 0 ? `
          <div class="mt-6">
            <h2 class="font-medium text-ink-2 mb-2">Photos (${photos.length})</h2>
            <p class="text-xs text-slate-tint mb-2">Select a photo to view it full size.</p>
            <div class="grid grid-cols-2 gap-2">
              ${photos.map((p, i) => `
                <button type="button" class="rw-photo-trigger rounded border border-slate-300 overflow-hidden group text-left" ${photoViewerAttrs(report, i)} aria-label="View ${escapeHtml(p.caption || 'report photo')} full size">
                  <span class="rw-photo-kind">${escapeHtml(p.kind === 'AFTER' ? 'After repair' : p.kind === 'PROGRESS' ? 'Progress' : 'Before')}</span>
                  <img ${p.isPublic ? `src="${escapeHtml(absoluteUrl(p.url))}"` : `data-authed-src="${escapeHtml(absoluteUrl(p.url))}"`} alt="${escapeHtml(p.caption || (p.kind === 'AFTER' ? 'After-repair photo' : p.kind === 'PROGRESS' ? 'Repair progress photo' : 'Before photo'))}" class="w-full h-32 object-cover group-hover:opacity-90 transition-opacity" />
                </button>`).join('')}
            </div>
          </div>` : ''}

        <div class="mt-6 pt-6 border-t border-azure">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div><span class="font-medium text-ink-2">Location:</span> ${escapeHtml(reportLocation(report))}</div>
            <div><span class="font-medium text-ink-2">Reference:</span> ${escapeHtml(report.referenceNo)}</div>
            <div><span class="font-medium text-ink-2">Reported:</span> ${escapeHtml(relativeDate(report.createdAt))}</div>
            <div><span class="font-medium text-ink-2">Assigned to:</span> ${report.assignedOfficer ? escapeHtml(report.assignedOfficer.fullName || 'Officer') : 'Unassigned'}</div>
            <div><span class="font-medium text-ink-2">Repair status:</span> ${escapeHtml(adminRepairLabel(report.repairStatus))}</div>
            <div><span class="font-medium text-ink-2">Last updated:</span> ${escapeHtml(relativeDate(report.updatedAt))}</div>
            <div><span class="font-medium text-ink-2">Coordinates:</span> ${escapeHtml(Number(report.latitude).toFixed(6))}, ${escapeHtml(Number(report.longitude).toFixed(6))}</div>
          </div>
          ${report.rejectionReason ? `<p class="mt-4 text-sm text-red-400">Rejected: ${escapeHtml(report.rejectionReason)}</p>` : ''}
        </div>
      </div>

      ${staffActions}

      ${report.completionNotes ? `
        <section class="brand-card p-6 rounded-xl shadow-sm mt-6 rw-completion-notes">
          <h2 class="font-bold text-navy text-lg mb-2">Officer completion notes</h2>
          <p class="text-ink-2 text-sm whitespace-pre-wrap">${escapeHtml(report.completionNotes)}</p>
        </section>` : ''}

      <div class="brand-card p-8 rounded-xl shadow-lg mt-6">
        <h2 class="font-bold text-navy text-lg mb-4">History</h2>
        <div class="space-y-3">
          ${historyItems || '<p class="text-slate-tint text-sm">No history recorded.</p>'}
        </div>
      </div>

      <div class="mt-6">
        <a href="${isAdmin ? '/admin/reports' : isAssignedOfficer ? '/assignments' : '/reports'}"
          data-nav="${isAdmin ? '/admin/reports' : isAssignedOfficer ? '/assignments' : '/reports'}" class="btn btn-secondary">
          Back to ${isAdmin ? 'report management' : isAssignedOfficer ? 'assignments' : 'my reports'}
        </a>
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
    let geocodeRequest = 0;
    const addressInput = q('#report-address');
    const addressStatus = q('#address-lookup-status');
    const areaInput = q('input[name="areaLabel"]');

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
      if (addressInput) addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (areaInput) areaInput.value = '';
      const requestId = ++geocodeRequest;
      if (addressStatus) addressStatus.textContent = 'Looking up this address…';
      if (locationFeedback) {
        locationFeedback.textContent = '';
        locationFeedback.hidden = true;
      }
      void api(`/map/geocode/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`)
        .then((result) => {
          if (requestId !== geocodeRequest) return;
          if (result && result.available && result.address) {
            if (addressInput) addressInput.value = result.address;
            if (areaInput && result.areaLabel) areaInput.value = result.areaLabel;
            if (addressStatus) addressStatus.textContent = 'Address found. You can edit it before submitting.';
          } else if (addressStatus) {
            addressStatus.textContent = 'Address lookup unavailable; the selected coordinates are saved as the location.';
          }
        })
        .catch(() => {
          if (requestId === geocodeRequest && addressStatus) {
            addressStatus.textContent = 'Address lookup failed; the selected coordinates are saved as the location.';
          }
        });
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

    // "Other" is only meaningful with a description, so the field is revealed
    // (and required) only for that category — the same rule the mobile form and
    // the API enforce.
    const categorySelect = form ? form.querySelector('select[name="category"]') : null;
    const otherWrap = q('#report-category-other-wrap');
    const otherInput = q('#report-category-other');
    const syncCategoryOther = () => {
      const isOther = String((categorySelect && categorySelect.value) || '').toUpperCase() === CATEGORY_OTHER;
      if (otherWrap) otherWrap.hidden = !isOther;
      if (otherInput) {
        otherInput.required = isOther;
        if (!isOther) otherInput.value = '';
      }
    };
    on(categorySelect, 'change', syncCategoryOther);
    syncCategoryOther();

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

      const category = String((categorySelect && categorySelect.value) || '').toUpperCase();
      const otherText = otherInput ? otherInput.value.trim() : '';
      if (category === CATEGORY_OTHER && otherText.length < CATEGORY_OTHER_MIN) {
        if (otherWrap) otherWrap.hidden = false;
        notify(`Please describe the issue when the category is Other (at least ${CATEGORY_OTHER_MIN} characters).`);
        if (otherInput) otherInput.focus();
        return;
      }

      const fd = new FormData(form);
      fd.set('latitude', lat);
      fd.set('longitude', lon);
      fd.set('category', category);
      // The explanation is sent only for "Other"; every other category drops it
      // so the stored value always matches the category.
      if (category === CATEGORY_OTHER) fd.set('categoryOther', otherText); else fd.delete('categoryOther');

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
      AWAITING_VERIFICATION: '#60a5fa',
      RETURNED_FOR_WORK: '#fbbf24',
      COMPLETED: '#4ade80',
      VERIFIED_COMPLETED: '#4ade80',
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
    AWAITING_VERIFICATION: 'Awaiting admin verification',
    RETURNED_FOR_WORK: 'Returned for further work',
    COMPLETED: 'Completed (legacy)',
    VERIFIED_COMPLETED: 'Verified completed',
  }[status] || 'Not assigned');

  const adminReportTableHtml = (items, pagination, allowDelete) => {
    if (!items.length) {
      return `<div class="empty-state admin-empty">
        <h3 class="text-xl font-bold text-navy mb-2">No reports found</h3>
        <p>Try changing the search or status filters.</p>
      </div>`;
    }

    const rows = items.map((report) => {
      const firstPhoto = Array.isArray(report.photos) ? report.photos[0] : null;
      const thumbImg = firstPhoto
        ? `<img ${firstPhoto.isPublic === false ? `data-authed-src="${escapeHtml(absoluteUrl(firstPhoto.url))}"` : `src="${escapeHtml(absoluteUrl(firstPhoto.url))}"`} alt="" class="admin-report-thumb" />`
        : '';
      return `
      <tr>
        <td class="admin-report-main">
          <div class="admin-report-cell">
            ${thumbImg ? `<button type="button" class="rw-photo-trigger" ${photoViewerAttrs(report, 0)} aria-label="View photo for ${escapeHtml(report.title || 'report')}">${thumbImg}</button>` : ''}
            <div class="admin-report-text">
              <a href="/report/${encodeURIComponent(report.id)}" data-nav="/report/${encodeURIComponent(report.id)}" class="admin-report-title">
                ${escapeHtml(report.title || 'Untitled report')}
              </a>
              <span class="admin-report-reference">${escapeHtml(report.referenceNo || '')} · ${escapeHtml(categoryText(report))}</span>
            </div>
          </div>
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
      </tr>`;
    }).join('');

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
      hydrateAuthedImages(host);
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
      setText('stat-under-repair', (Number(totals.awaiting) || 0) + (Number(totals.inProgress) || 0)
        + (Number(totals.awaitingVerification) || 0) + (Number(totals.returnedForWork) || 0));
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
    loadNotificationPanel('admin-notifications');
    const refresh = async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '8', sort: 'newest' });
      const pendingParams = new URLSearchParams({
        page: '1',
        pageSize: '8',
        sort: 'newest',
        moderationStatus: 'PENDING_REVIEW',
      });
      await Promise.all([
        refreshAdminStatistics('admin-dashboard-feedback'),
        loadAdminReportList('admin-dashboard-pending', 'admin-dashboard-feedback', pendingParams),
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
    const summaryHost = q('#officer-summary');
    const notificationsHost = q('#officer-notifications');
    const feedbackHost = q('#officer-notification-feedback');
    const unreadCountHost = q('#officer-unread-count');
    let expiryRefreshTimer = null;
    const refresh = async () => {
      const refreshButton = q('#btn-refresh-assignments');
      if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = 'Refreshing…';
      }
      const results = await Promise.allSettled([
        api('/maintenance/summary'),
        api('/maintenance/assignments'),
        api('/maintenance/notifications?limit=50'),
      ]);
      const [summaryResult, assignmentsResult, notificationsResult] = results;

      if (summaryResult.status === 'fulfilled' && summaryHost) {
        const summary = summaryResult.value || {};
        const stats = [
          ['Assigned reports', summary.assigned],
          ['New assignments', summary.awaiting],
          ['In progress', summary.inProgress],
          ['Completed', summary.completed],
        ];
        html(summaryHost, stats.map(([label, value]) => `
          <article class="admin-stat-card">
            <p>${escapeHtml(label)}</p>
            <strong class="admin-stat-value">${escapeHtml(value ?? 0)}</strong>
          </article>`).join(''));
      } else if (summaryHost) {
        html(summaryHost, `<div class="admin-error-block">Could not load summary. ${escapeHtml(summaryResult.reason.message)}</div>`);
      }

      if (assignmentsResult.status === 'fulfilled') {
        const items = (assignmentsResult.value && assignmentsResult.value.items) || [];
        if (!items.length) {
          html(host, '<div class="empty-state"><h3 class="text-lg font-bold text-navy mb-1">No assignments yet</h3><p class="text-slate-tint text-sm">New work assigned by an administrator will appear here.</p></div>');
        } else {
          html(host, items.map((r) => {
        const firstPhoto = Array.isArray(r.photos) ? r.photos[0] : null;
        const thumb = firstPhoto
          ? `<button type="button" class="rw-photo-trigger flex-shrink-0" ${photoViewerAttrs(r, 0)} aria-label="View photo for ${escapeHtml(r.title || 'report')}"><img ${firstPhoto.isPublic === false ? `data-authed-src="${escapeHtml(absoluteUrl(firstPhoto.url))}"` : `src="${escapeHtml(absoluteUrl(firstPhoto.url))}"`} alt="" class="w-14 h-14 rounded object-cover" /></button>`
          : '';
        return `
          <article class="p-4 rounded border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors" data-nav="/report/${encodeURIComponent(r.id)}">
            <div class="flex items-start gap-3">
              ${thumb}
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <h3 class="font-medium text-navy break-words">${escapeHtml(r.title)}</h3>
                  ${statusBadge(r.moderationStatus, r.repairStatus)}
                </div>
                <p class="text-slate-tint text-sm mt-1">${escapeHtml(categoryText(r))} · ${escapeHtml(reportLocation(r))}</p>
                <div class="text-slate-tint text-xs mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Reported ${escapeHtml(relativeDate(r.createdAt))}</span>
                  ${r.priority ? `<span>Priority: ${escapeHtml(r.priority)}</span>` : ''}
                </div>
                <p class="text-xs text-ink-2 mt-2 line-clamp-2">${escapeHtml(r.description || '')}</p>
              </div>
            </div>
          </article>`;
          }).join(''));
          hydrateAuthedImages(host);
        }
      } else {
        html(host, `<div class="admin-error-block">Could not load assignments. ${escapeHtml(assignmentsResult.reason.message)}</div>`);
      }

      if (notificationsResult.status === 'fulfilled') {
        const notificationData = notificationsResult.value || {};
        const items = notificationData.items || [];
        if (expiryRefreshTimer) window.clearTimeout(expiryRefreshTimer);
        const expirationTimes = items.map((item) => Date.parse(item.expiresAt)).filter(Number.isFinite);
        if (expirationTimes.length) {
          expiryRefreshTimer = window.setTimeout(() => {
            if (host.isConnected) void refresh();
          }, Math.max(0, Math.min(...expirationTimes) - Date.now()) + 20);
        }
        const unread = Number(notificationData.unreadCount) || 0;
        const markAllButton = q('#btn-mark-all-notifications-read');
        if (markAllButton) markAllButton.disabled = unread === 0;
        if (unreadCountHost) unreadCountHost.textContent = `${unread} unread notification${unread === 1 ? '' : 's'}`;
        if (feedbackHost) feedbackHost.textContent = '';
        if (!items.length) {
          html(notificationsHost, '<div class="empty-state"><p class="text-slate-tint text-sm">No assignment notifications yet.</p></div>');
        } else {
          html(notificationsHost, `<div class="space-y-2">${items.map((item) => `
            <button type="button" class="w-full text-left p-3 rounded border ${item.isRead ? 'border-slate-200 bg-white' : 'border-azure bg-sheet'} hover:bg-slate-50 transition-colors"
              data-open-notification="${escapeHtml(item.id)}" data-notification-report="${escapeHtml(item.reportId)}">
              <span class="flex items-start gap-3">
                <span class="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.isRead ? 'bg-slate-300' : 'bg-blue-600'}" aria-hidden="true"></span>
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold text-navy">${escapeHtml(item.title || 'Assignment notification')}</span>
                  <span class="block text-sm text-ink-2 mt-1 break-words">${escapeHtml(item.message || '')}</span>
                  <span class="block text-xs text-slate-tint mt-2">${escapeHtml(relativeDate(item.createdAt))} · ${escapeHtml(item.repairStatus || 'AWAITING_MAINTENANCE')}</span>
                </span>
              </span>
            </button>`).join('')}</div>`);
          notificationsHost.querySelectorAll('[data-open-notification]').forEach((button) => {
            button.addEventListener('click', async () => {
              button.disabled = true;
              try {
                await api(`/maintenance/notifications/${encodeURIComponent(button.dataset.openNotification)}/read`, { method: 'PATCH' });
              } catch (err) {
                if (feedbackHost) feedbackHost.textContent = `Could not mark notification read: ${err.message}`;
              }
              navigateTo(`/report/${encodeURIComponent(button.dataset.notificationReport)}`);
            });
          });
        }
      } else {
        if (unreadCountHost) unreadCountHost.textContent = 'Unread count unavailable';
        html(notificationsHost, `<div class="admin-error-block">Could not load notifications. ${escapeHtml(notificationsResult.reason.message)}</div>`);
        if (feedbackHost) feedbackHost.textContent = 'Refresh the dashboard to retry. If your session expired, sign in again.';
      }

      const refreshButtonAfter = q('#btn-refresh-assignments');
      if (refreshButtonAfter) {
        refreshButtonAfter.disabled = false;
        refreshButtonAfter.textContent = 'Refresh dashboard';
      }
    };

    const refreshButton = q('#btn-refresh-assignments');
    if (refreshButton) refreshButton.onclick = () => void refresh();
    const markAllButton = q('#btn-mark-all-notifications-read');
    if (markAllButton) markAllButton.onclick = async () => {
      markAllButton.disabled = true;
      try {
        await api('/maintenance/notifications/read-all', { method: 'PATCH' });
        await refresh();
      } catch (err) {
        if (feedbackHost) feedbackHost.textContent = `Could not mark notifications read: ${err.message}`;
        markAllButton.disabled = false;
      }
    };
    if (!assignmentFocusBound) {
      assignmentFocusBound = true;
      window.addEventListener('focus', () => {
        if (window.location.pathname === '/assignments' && getUser()?.role === 'MAINTENANCE_OFFICER') {
          void initAssignmentsPage();
        }
      });
    }
    await refresh();
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
      // Report thumbnails open the full-size viewer instead of following the
      // card's [data-nav] link they sit inside.
      const photoTrigger = e.target && e.target.closest ? e.target.closest('[data-photo-viewer]') : null;
      if (photoTrigger) {
        e.preventDefault();
        e.stopPropagation();
        const items = viewerItemsFromTrigger(photoTrigger);
        openPhotoViewer(items, Number(photoTrigger.getAttribute('data-photo-index')) || 0);
        return;
      }

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
