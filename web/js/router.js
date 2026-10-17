/**
 * Tiny history-based router.
 *
 * Uses the History API with clean paths (the same URLs the React app used), so
 * the static host must rewrite unknown paths back to index.html. See the
 * `_redirects` / Railway config shipped with the web platform.
 */

let routes = [];
let onChange = () => {};
let started = false;

function compile(pattern) {
  const names = [];
  const regex = pattern
    .replace(/\/+$/, '')
    .replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === '*' ? '.*' : `\\${ch}`))
    .replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
      names.push(name);
      return '([^/]+)';
    });
  return { regex: new RegExp(`^${regex || '/'}/?$`), names };
}

export function register(defs) {
  routes = defs.map((def) => ({ ...def, ...compile(def.path) }));
}

export function match(pathname) {
  for (const route of routes) {
    const result = route.regex.exec(pathname || '/');
    if (!result) continue;
    const params = {};
    route.names.forEach((name, index) => {
      params[name] = decodeURIComponent(result[index + 1]);
    });
    return { route, params };
  }
  return { route: null, params: {} };
}

export function currentPath() {
  return window.location.pathname + window.location.search;
}

export function currentQuery() {
  return new URLSearchParams(window.location.search);
}

export function navigate(to, options = {}) {
  const target = to.startsWith('/') ? to : `/${to}`;
  if (options.replace) {
    window.history.replaceState({}, '', target);
  } else if (target !== currentPath()) {
    window.history.pushState({}, '', target);
  } else {
    // Same URL: still re-dispatch so callers can force a refresh.
    window.history.replaceState({}, '', target);
  }

  if (options.state) {
    window.history.replaceState(options.state, '', target);
  }

  dispatch();
}

function dispatch() {
  const { route, params } = match(window.location.pathname);
  onChange({ route, params, path: window.location.pathname, query: currentQuery() });
}

export function start(handler) {
  onChange = handler;
  if (!started) {
    started = true;
    window.addEventListener('popstate', dispatch);
    document.addEventListener('click', (event) => {
      // Intercept same-origin internal links so navigation stays client-side.
      const anchor = event.target.closest ? event.target.closest('a[data-link]') : null;
      if (!anchor) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('//') || anchor.target === '_blank') return;
      event.preventDefault();
      navigate(href);
    });
  }
  dispatch();
}
