/**
 * Shared UI builders used by every page — buttons, badges, states, modals,
 * the map canvas, photo galleries, toasts and more.
 *
 * Each builder returns a DOM node (or a small controller object for the map),
 * mirroring the React components one-for-one.
 */

import { h, append, render, clear } from './dom.js';
import { api } from './api.js';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  MODERATION_LABELS,
  PRIORITY_LABELS,
  REPAIR_LABELS,
  formatDateTime,
  titleCase,
} from './format.js';
import {
  FALLBACK_CENTRE,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  REPAIR_COLORS,
  SEARCH_MARKER_COLOR,
  SEARCH_MARKER_STROKE,
} from './maps.js';

/* --------------------------------------------------------------- Spinners */

export function spinner(size = 22, extraClass = '') {
  return h('span', {
    role: 'status',
    'aria-label': 'Loading',
    class: `spinner ${extraClass}`.trim(),
    style: { width: `${size}px`, height: `${size}px` },
  });
}

export function loadingBlock(label = 'Loading…') {
  return h('div', { class: 'loading-block' }, spinner(26), label);
}

export function skeletonRows(rows = 5) {
  return h(
    'div',
    { class: 'col stack-3' },
    Array.from({ length: rows }, () => h('div', { class: 'skeleton' })),
  );
}

/* ----------------------------------------------------------- Empty / error */

export function emptyState({ icon = '◍', title, message, action } = {}) {
  return h(
    'div',
    { class: 'empty-state' },
    h('div', { class: 'empty-icon' }, icon),
    h('h3', null, title),
    message ? h('p', null, message) : null,
    action ? h('div', { class: 'mt-2' }, action) : null,
  );
}

export function errorState(message, onRetry) {
  return h(
    'div',
    { class: 'error-state' },
    h('div', { class: 'error-icon' }, '⚠'),
    h('h3', null, 'Something went wrong'),
    h('p', null, message),
    onRetry ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm mt-1', onClick: onRetry }, 'Try again') : null,
  );
}

export function banner(tone = 'info', ...children) {
  return h('div', { class: `banner banner-${tone}` }, ...children);
}

/* ---------------------------------------------------------------- Badges */

const MODERATION_TONES = { PENDING_REVIEW: 'amber', APPROVED: 'green', REJECTED: 'red' };
const REPAIR_TONES = { NOT_ASSIGNED: 'slate', AWAITING_MAINTENANCE: 'blue', IN_PROGRESS: 'amber', COMPLETED: 'green' };
const PRIORITY_TONES = { LOW: 'slate', MEDIUM: 'blue', HIGH: 'amber', URGENT: 'red' };

export function badge(tone = 'slate', ...children) {
  return h('span', { class: `badge badge-${tone}` }, ...children);
}

export function moderationBadge(status) {
  return badge(MODERATION_TONES[status] || 'slate', h('span', { class: 'dot' }), MODERATION_LABELS[status] || status);
}

export function repairBadge(status) {
  return badge(REPAIR_TONES[status] || 'slate', h('span', { class: 'dot' }), REPAIR_LABELS[status] || status);
}

export function priorityBadge(priority) {
  return badge(PRIORITY_TONES[priority] || 'slate', `⚑ ${PRIORITY_LABELS[priority] || priority}`);
}

export function categoryChip(category) {
  return badge(
    'sky',
    h('span', { 'aria-hidden': 'true' }, CATEGORY_ICONS[category] || '⚑'),
    CATEGORY_LABELS[category] || category,
  );
}

/* ------------------------------------------------------------- Structure */

export function pageHeader({ title, subtitle, actions } = {}) {
  return h(
    'div',
    { class: 'page-header' },
    h('div', null, h('h1', null, title), subtitle ? h('p', { class: 'subtitle' }, subtitle) : null),
    actions && actions.length ? h('div', { class: 'page-actions' }, ...actions) : null,
  );
}

export function section({ title, description, actions, className = '' } = {}, ...children) {
  return h(
    'section',
    { class: `section ${className}`.trim() },
    title || actions
      ? h(
          'div',
          { class: 'section-head' },
          h('div', null, title ? h('h2', null, title) : null, description ? h('p', { class: 'description' }, description) : null),
          actions && actions.length ? h('div', { class: 'row' }, ...actions) : null,
        )
      : null,
    ...children,
  );
}

export function statCard({ label, value, hint, tone = 'navy', onClick } = {}) {
  const node = h(
    'div',
    {
      class: `stat-card stat-${tone}${onClick ? ' interactive' : ''}`,
      role: onClick ? 'button' : null,
      tabindex: onClick ? '0' : null,
    },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, value),
    hint ? h('p', { class: 'stat-hint' }, hint) : null,
  );
  if (onClick) {
    node.addEventListener('click', onClick);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    });
  }
  return node;
}

export function field(label, value) {
  return h(
    'div',
    { class: 'field' },
    h('p', { class: 'field-label' }, label),
    h('div', { class: 'field-value' }, value instanceof Node ? value : String(value ?? '—')),
  );
}

export function pagination({ page, totalPages, total, onPage }) {
  return h(
    'div',
    { class: 'pagination' },
    h('p', { class: 'meta' }, `Page ${page} of ${totalPages} · ${total} record${total === 1 ? '' : 's'}`),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        { type: 'button', class: 'btn btn-secondary btn-sm', disabled: page <= 1, onClick: () => onPage(page - 1) },
        '← Prev',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary btn-sm',
          disabled: page >= totalPages,
          onClick: () => onPage(page + 1),
        },
        'Next →',
      ),
    ),
  );
}

/* ----------------------------------------------------------------- Brand */

export function brandMark({ size = 26, onDark = true } = {}) {
  const blockColor = onDark ? '#c3e6ff' : '#071633';
  const accentColor = onDark ? '#f3efe3' : '#c5d5e0';
  const gap = size * 0.16;
  const radius = size * 0.32;
  const accentSize = size * 0.62;

  const square = (dimension, color) =>
    h('div', {
      class: 'bm-sq',
      style: {
        width: `${dimension}px`,
        height: `${dimension}px`,
        borderRadius: `${radius * (dimension / size)}px`,
        background: color,
      },
    });

  return h(
    'div',
    { class: 'brand-mark', 'aria-hidden': 'true', style: { gap: `${gap * 0.85}px` } },
    h('div', { class: 'bm-col', style: { gap: `${gap}px` } }, square(size, blockColor), square(size, blockColor), square(size, blockColor)),
    h(
      'div',
      { class: 'bm-col accent', style: { height: `${size * 3 + gap * 2}px` } },
      square(accentSize, accentColor),
      square(accentSize, accentColor),
    ),
  );
}

const LOGO_SIZES = { sm: { mark: 16, title: '1.05rem' }, md: { mark: 22, title: '1.4rem' }, lg: { mark: 32, title: '2rem' } };

export function brandLogo({ onDark = true, size = 'md', showTagline = false } = {}) {
  const config = LOGO_SIZES[size] || LOGO_SIZES.md;
  const titleColor = onDark ? '#f7fbff' : '#071633';
  const subtitleColor = onDark ? '#c3e6ff' : '#3d4b63';
  const brand = window.RW_BRAND;

  return h(
    'div',
    { class: 'brand-logo', style: { gap: size === 'lg' ? '16px' : '11px' } },
    brandMark({ size: config.mark, onDark }),
    h(
      'div',
      { class: 'col', style: { lineHeight: '1' } },
      h('span', { class: 'brand-title', style: { fontSize: config.title, color: titleColor } }, brand.product),
      showTagline ? h('span', { class: 'brand-tag', style: { color: subtitleColor } }, `by ${brand.company}`) : null,
    ),
  );
}

/* ---------------------------------------------------------------- Toasts */

let toastRegion = null;
const TOAST_MARKS = { success: '✓ ', error: '⚠ ', info: 'ℹ ' };

function ensureToastRegion() {
  if (!toastRegion) {
    toastRegion = h('div', { class: 'toast-region' });
    document.body.appendChild(toastRegion);
  }
  return toastRegion;
}

export function notify(message, kind = 'info') {
  const region = ensureToastRegion();
  const node = h(
    'div',
    { class: `toast toast-${kind}` },
    h('span', { class: 'toast-mark' }, TOAST_MARKS[kind] || ''),
    message,
  );
  region.appendChild(node);
  window.setTimeout(() => node.remove(), 5200);
}

export const toast = {
  info: (message) => notify(message, 'info'),
  success: (message) => notify(message, 'success'),
  error: (message) => notify(message, 'error'),
};

/* ----------------------------------------------------------------- Modal */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Opens a modal dialog. Returns `{ root, body, footer, close, setFooter }`.
 * `onClose` fires for user-initiated dismissals (Escape, backdrop, ✕).
 */
export function openModal({ title, description, body, footer, widthClass = '', onClose } = {}) {
  const dialog = h(
    'div',
    {
      class: `modal ${widthClass}`.trim(),
      tabindex: '-1',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
      onClick: (event) => event.stopPropagation(),
    },
    h(
      'div',
      { class: 'modal-head' },
      h('div', null, h('h2', null, title), description ? h('p', { class: 'description' }, description) : null),
      h('button', { type: 'button', class: 'modal-close', 'aria-label': 'Close dialog', onClick: () => dismiss() }, '✕'),
    ),
    body ? h('div', { class: 'modal-body' }, body) : null,
    footer ? h('div', { class: 'modal-foot' }, footer) : null,
  );

  const backdrop = h('div', { class: 'modal-backdrop', role: 'presentation', onClick: () => dismiss() }, dialog);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(backdrop);
  window.setTimeout(() => dialog.focus(), 0);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    document.body.style.overflow = previousOverflow;
    backdrop.remove();
  }
  function dismiss() {
    if (closed) return;
    close();
    if (onClose) onClose();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      dismiss();
      return;
    }
    if (event.key === 'Tab') {
      const nodes = dialog.querySelectorAll(FOCUSABLE);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }
  }

  document.addEventListener('keydown', onKeyDown);

  return { root: backdrop, dialog, close, dismiss };
}

export function closeButton(label, onClick, extraClass = '') {
  return h('button', { type: 'button', class: `btn btn-ghost ${extraClass}`.trim(), onClick }, label);
}

/* ---------------------------------------------------------------- Tables */

export function submittableSpinner(size = 16) {
  return spinner(size);
}

/* -------------------------------------------------------------- Auth image */

/** Loads an API image; private photos are fetched with the bearer token. */
function loadImage(photoOrUrl, isPublic) {
  const src = typeof photoOrUrl === 'string' ? photoOrUrl : photoOrUrl.url;
  const absolute = window.RW_absoluteUrl(src);

  if (isPublic) {
    return Promise.resolve(absolute);
  }

  let objectUrl = null;
  return fetch(absolute, { headers: api.authHeader() })
    .then((response) => {
      if (!response.ok) throw new Error('Image request failed');
      return response.blob();
    })
    .then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      return objectUrl;
    })
    .catch(() => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return null;
    });
}

export function authImage({ src, isPublic = false, alt = '', className = '', onClick, contain = false } = {}) {
  const wrap = h('span', {
    class: `${className} auth-image${contain ? ' auth-image-contain' : ''}`.trim(),
  });
  if (onClick) wrap.addEventListener('click', onClick);

  const setImage = (url) => {
    clear(wrap);
    append(wrap, h('img', { src: url, alt, loading: 'lazy', draggable: 'false' }));
  };
  const setPlaceholder = (unavailable) => {
    clear(wrap);
    append(
      wrap,
      unavailable
        ? h('span', { class: 'img-placeholder', title: 'Image unavailable', style: { width: '100%', height: '100%' } }, '🖼')
        : spinner(18),
    );
  };

  setPlaceholder(false);
  loadImage(src, isPublic).then((url) => {
    if (!wrap.isConnected) return;
    if (url) setImage(url);
    else setPlaceholder(true);
  });

  return wrap;
}

export function photoGallery({ photos, onSelect, sizeClass = 'h-28 w-28' } = {}) {
  if (!photos || photos.length === 0) {
    return h('p', { class: 'text-sm muted' }, 'No photos attached.');
  }

  return h(
    'div',
    { class: 'photo-gallery' },
    photos.map((photo, index) =>
      h(
        'figure',
        { class: 'photo-thumb' },
        authImage({
          src: photo.url,
          isPublic: photo.isPublic,
          alt: `${String(photo.kind).toLowerCase()} photo ${index + 1}`,
          className: sizeClass,
          onClick: onSelect ? () => onSelect(index) : undefined,
        }),
        h('span', { class: 'photo-kind' }, photo.kind),
      ),
    ),
  );
}

/** Lightbox overlay with keyboard navigation and its own index state. */
export function lightbox({ photos, index = 0, onClose } = {}) {
  let current = index;

  const imageSlot = h('div', { class: 'lightbox-body', onClick: () => close() });
  const label = h('span', { class: 'kind' });
  const nav = h('div', { class: 'lightbox-nav' });

  const overlay = h(
    'div',
    { class: 'lightbox', role: 'dialog', 'aria-modal': 'true' },
    h(
      'div',
      { class: 'lightbox-head' },
      label,
      h('button', { type: 'button', class: 'lightbox-close', onClick: () => close() }, '✕'),
    ),
    imageSlot,
    nav,
  );

  function draw() {
    const photo = photos[current];
    if (!photo) return;
    label.textContent = `${photo.kind} photo · ${current + 1}/${photos.length}`;
    clear(imageSlot);
    const wrap = h('div', { onClick: (event) => event.stopPropagation() }, ' ');
    append(imageSlot, wrap);
    const loader = h('span', { class: 'auth-image auth-image-contain lightbox-img' });
    append(wrap, loader);
    loadImage(photo, photo.isPublic).then((url) => {
      clear(loader);
      if (url) append(loader, h('img', { src: url, alt: 'Report photo' }));
      else append(loader, h('span', { class: 'img-placeholder', style: { width: '280px', height: '180px' } }, '🖼'));
    });

    clear(nav);
    if (photos.length > 1) {
      append(
        nav,
        h('button', { type: 'button', class: 'btn btn-ghost', style: { color: '#f7fbff' }, onClick: () => go(-1) }, '← Previous'),
        h('button', { type: 'button', class: 'btn btn-ghost', style: { color: '#f7fbff' }, onClick: () => go(1) }, 'Next →'),
      );
    }
  }

  function go(delta) {
    current = (current + delta + photos.length) % photos.length;
    draw();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
  }

  function close() {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    if (onClose) onClose();
  }

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  draw();

  return { close };
}

/* -------------------------------------------------------------- Timeline */

const TYPE_DOT = { CREATION: 'dot-creation', MODERATION: 'dot-moderation', ASSIGNMENT: 'dot-assignment', REPAIR: 'dot-repair' };

export function timeline(entries) {
  if (!entries || entries.length === 0) {
    return h('p', { class: 'text-sm muted' }, 'No status updates recorded yet.');
  }

  return h(
    'ol',
    { class: 'timeline' },
    entries.map((entry, index) =>
      h(
        'li',
        { class: 'timeline-item' },
        h(
          'div',
          { class: 'timeline-rail' },
          h('span', { class: `timeline-dot ${TYPE_DOT[entry.type] || ''}`.trim() }),
          index < entries.length - 1 ? h('span', { class: 'timeline-line' }) : null,
        ),
        h(
          'div',
          { class: 'grow' },
          h(
            'p',
            { class: 'timeline-title' },
            titleCase(entry.type),
            entry.toValue ? h('span', { class: 'muted-2', style: { fontWeight: '400' } }, ` · ${titleCase(entry.toValue)}`) : null,
          ),
          entry.note ? h('p', { class: 'timeline-note' }, entry.note) : null,
          h(
            'p',
            { class: 'timeline-meta' },
            [entry.actor ? entry.actor.fullName : null, formatDateTime(entry.createdAt)].filter(Boolean).join(' · '),
          ),
        ),
      ),
    ),
  );
}

/* --------------------------------------------------------------- Map */

const MARKER_RADIUS = 9;
const SEARCH_MARKER_RADIUS = 10;
const TILE_TIMEOUT_MS = 4000;

/**
 * Creates a Leaflet map on OpenStreetMap tiles. Returns a controller:
 *   { el, setMarkers(markers), focus({ focusId, focusPoint }) }
 */
export function mapCanvas({ markers = [], onSelect, height = 420 } = {}) {
  const container = h('div', { class: 'map-canvas', style: { height: `${height}px` } });
  const wrapper = h('div', { style: { position: 'relative', height: `${height}px` } }, container);
  const veil = h('div', {
    style: {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--sheet)',
    },
  }, spinner(24));
  wrapper.appendChild(veil);

  let map = null;
  const markerRefs = new Map();
  let searchMarker = null;
  let fitSignature = '';
  let currentMarkers = markers.slice();

  const fail = () => {
    veil.remove();
    render(
      wrapper,
      h(
        'div',
        { class: 'empty-state', style: { padding: '2rem 1rem', height: '100%' } },
        h('span', { style: { fontSize: '1.5rem' } }, '🗺'),
        h('p', { class: 'strong muted-2' }, 'Map view unavailable'),
        h('p', { class: 'text-xs' }, 'Use the list to browse and open every approved report.'),
      ),
    );
  };

  if (!window.RW_MAPS_ENABLED || typeof window.L === 'undefined') {
    fail();
    return { el: wrapper, setMarkers: () => {}, focus: () => {} };
  }

  try {
    map = window.L.map(container, {
      center: [FALLBACK_CENTRE.lat, FALLBACK_CENTRE.lng],
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });
    const tiles = window.L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      veil.remove();
    };
    tiles.once('load', settle);
    window.setTimeout(settle, TILE_TIMEOUT_MS);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => map && map.invalidateSize());
      observer.observe(container);
    }
  } catch {
    fail();
    return { el: wrapper, setMarkers: () => {}, focus: () => {} };
  }

  function syncMarkers() {
    if (!map) return;
    const seen = new Set();
    for (const marker of currentMarkers) {
      seen.add(marker.id);
      if (markerRefs.has(marker.id)) continue;
      const colour = REPAIR_COLORS[marker.status] || REPAIR_COLORS.NOT_ASSIGNED;
      const circle = window.L.circleMarker([marker.lat, marker.lng], {
        radius: MARKER_RADIUS,
        color: '#ffffff',
        weight: 2,
        fillColor: colour,
        fillOpacity: 1,
      }).addTo(map);
      circle.bindTooltip(marker.title);
      if (onSelect) circle.on('click', () => onSelect(marker.id));
      markerRefs.set(marker.id, circle);
    }
    for (const [id, circle] of markerRefs) {
      if (!seen.has(id)) {
        circle.remove();
        markerRefs.delete(id);
      }
    }

    const signature = currentMarkers.map((m) => m.id).sort().join('|');
    if (currentMarkers.length > 0 && signature !== fitSignature) {
      if (currentMarkers.length === 1) {
        map.setView([currentMarkers[0].lat, currentMarkers[0].lng], 15);
      } else {
        const bounds = window.L.latLngBounds(currentMarkers.map((m) => [m.lat, m.lng]));
        map.fitBounds(bounds, { padding: [64, 64] });
      }
    }
    fitSignature = signature;
  }

  function focus({ focusId, focusPoint } = {}) {
    if (!map) return;
    if (focusId) {
      const marker = currentMarkers.find((item) => item.id === focusId);
      if (marker) map.setView([marker.lat, marker.lng], 16);
      return;
    }
    if (focusPoint && Number.isFinite(focusPoint.lat) && Number.isFinite(focusPoint.lng)) {
      map.setView([focusPoint.lat, focusPoint.lng], 15);
      if (searchMarker) searchMarker.remove();
      searchMarker = window.L.circleMarker([focusPoint.lat, focusPoint.lng], {
        radius: SEARCH_MARKER_RADIUS,
        color: SEARCH_MARKER_STROKE,
        weight: 3,
        fillColor: SEARCH_MARKER_COLOR,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip('Searched location');
    }
  }

  syncMarkers();

  return {
    el: wrapper,
    setMarkers(next) {
      currentMarkers = next || [];
      syncMarkers();
    },
    focus,
  };
}

export function mapLegend() {
  const items = [
    { label: 'Not assigned', color: 'var(--slate)' },
    { label: 'Awaiting maintenance', color: 'var(--blue)' },
    { label: 'In progress', color: 'var(--amber)' },
    { label: 'Completed', color: 'var(--green)' },
  ];
  return h(
    'div',
    { class: 'map-legend' },
    items.map((item) =>
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: item.color } }), item.label),
    ),
  );
}

/* ---------------------------------------------------------- Place search */

const RECENT_SEARCHES_KEY = 'rw_recent_searches_web';
const MAX_RECENT_SEARCHES = 8;

function loadRecentSearches() {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}
function saveRecentSearches(searches) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
  } catch {
    /* ignore */
  }
}
function addRecentSearch(query) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const updated = [trimmed, ...loadRecentSearches().filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT_SEARCHES,
  );
  saveRecentSearches(updated);
}
function removeRecentSearch(query) {
  saveRecentSearches(loadRecentSearches().filter((item) => item.toLowerCase() !== query.toLowerCase()));
}

/**
 * Address / landmark search box with debounced search and recent searches.
 * Degrades gracefully: when geocoding is unavailable the caller is told to fall
 * back to text filtering.
 */
export function placeSearch({ onSelect, onUnavailable, onReset } = {}) {
  let debounce = null;
  const input = h('input', {
    id: 'place-search',
    class: 'brand-input grow',
    placeholder: 'Search an address or landmark…',
    autocomplete: 'off',
    onInput: (event) => {
      const value = event.target.value;
      if (value.trim().length >= 2) schedule(value);
      else clearFeedback();
    },
    onKeydown: (event) => {
      if (event.key === 'Enter' && input.value.trim().length >= 2) {
        event.preventDefault();
        runSearch();
      }
    },
  });

  const searchBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-sm', disabled: true }, 'Search');
  const clearBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', style: { display: 'none' } }, 'Clear');

  const errorSlot = h('p', { class: 'text-xs', style: { color: 'var(--red)', marginTop: '0.5rem', display: 'none' } });
  const loadingSlot = h('p', { class: 'row text-xs muted', style: { marginTop: '0.5rem', display: 'none', gap: '0.5rem' } });
  const resultsSlot = h('div');
  const recentSlot = h('div');

  function clearFeedback() {
    render(resultsSlot);
    render(recentSlot);
    errorSlot.style.display = 'none';
    loadingSlot.style.display = 'none';
  }

  function schedule(value) {
    if (debounce) clearTimeout(debounce);
    debounce = window.setTimeout(() => runSearch(value), 400);
  }

  async function runSearch(explicit) {
    const q = (explicit !== undefined ? explicit : input.value).trim();
    if (q.length < 2) {
      errorSlot.textContent = 'Type at least 2 characters to search.';
      errorSlot.style.display = '';
      return;
    }
    clearFeedback();
    loadingSlot.textContent = '';
    append(loadingSlot, spinner(14), 'Looking up that place…');
    loadingSlot.style.display = '';
    if (onReset) onReset();

    try {
      const response = await api.searchPlace(q);
      if (response.available && response.results.length > 0) {
        renderResults(response.results);
        addRecentSearch(q);
        return;
      }
      const message = response.reason || 'No matching place was found.';
      showUnavailable(message, q);
    } catch (err) {
      showUnavailable(err && err.message ? err.message : 'Address search failed.', q);
    } finally {
      loadingSlot.style.display = 'none';
    }
  }

  function renderResults(results) {
    render(
      resultsSlot,
      h(
        'ul',
        { class: 'place-results' },
        results.map((place) =>
          h(
            'li',
            null,
            h(
              'button',
              {
                type: 'button',
                class: 'place-result',
                onClick: () => {
                  input.value = place.address;
                  clearFeedback();
                  if (onSelect) onSelect(place);
                },
              },
              h('span', { class: 'addr' }, place.address),
              h(
                'span',
                { class: 'coords' },
                `${place.areaLabel ? `${place.areaLabel} · ` : ''}${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`,
              ),
            ),
          ),
        ),
      ),
    );
  }

  function showUnavailable(reason, q) {
    render(
      resultsSlot,
      h(
        'div',
        { class: 'notice-amber' },
        h('p', { class: 'notice-title' }, 'Address search unavailable'),
        h('p', { class: 'mt-1' }, reason),
        h('p', { class: 'mt-1' }, `Showing reports that match “${q}” instead.`),
      ),
    );
    if (onUnavailable) onUnavailable(reason, q);
  }

  function renderRecent() {
    const recent = loadRecentSearches();
    if (recent.length === 0) {
      render(recentSlot);
      return;
    }
    render(
      recentSlot,
      h(
        'div',
        { class: 'place-results' },
        h(
          'div',
          { class: 'recent-head' },
          h('span', null, '🕐 Recent searches'),
          h(
            'button',
            {
              type: 'button',
              class: 'link-btn',
              onClick: () => {
                saveRecentSearches([]);
                renderRecent();
              },
            },
            'Clear all',
          ),
        ),
        recent.map((search) =>
          h(
            'button',
            {
              type: 'button',
              class: 'recent-item',
              onClick: () => {
                input.value = search;
                clearFeedback();
                runSearch(search);
              },
            },
            h('span', { class: 'muted' }, '🕐'),
            h('span', { class: 'truncate grow' }, search),
          ),
        ),
      ),
    );
  }

  input.addEventListener('focus', () => {
    if (!input.value.trim()) renderRecent();
  });
  input.addEventListener('blur', () => window.setTimeout(() => clearFeedback(), 200));

  const form = h(
    'form',
    {
      class: 'row',
      onSubmit: (event) => {
        event.preventDefault();
        if (input.value.trim().length >= 2) runSearch();
      },
    },
    h('label', { class: 'sr-only', for: 'place-search' }, 'Search an address or landmark'),
    input,
    searchBtn,
    clearBtn,
  );

  input.addEventListener('input', () => {
    const valid = input.value.trim().length >= 2;
    searchBtn.disabled = !valid;
    clearBtn.style.display = input.value ? '' : 'none';
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    searchBtn.disabled = true;
    clearBtn.style.display = 'none';
    clearFeedback();
    input.focus();
  });

  return h('div', { class: 'place-search' }, form, errorSlot, loadingSlot, resultsSlot, recentSlot);
}

export { append, render, clear };
