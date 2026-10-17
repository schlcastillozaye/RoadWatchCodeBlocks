/**
 * Minimal DOM helpers — a light alternative to JSX for building the UI.
 *
 *   h('div', { class: 'card' }, h('h2', null, 'Title'), 'body text')
 *
 * Props:
 *   - class / className   → className
 *   - dataset             → element.dataset entries
 *   - style               → inline styles (object)
 *   - html                → innerHTML (trusted, app-authored markup only)
 *   - on<Event>           → addEventListener('event', handler), e.g. onClick
 *   - any other string    → setAttribute
 */

export function h(tag, props, ...children) {
  const el = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;

      if (key === 'class' || key === 'className') {
        el.className = value;
      } else if (key === 'dataset') {
        Object.assign(el.dataset, value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'html') {
        el.innerHTML = value;
      } else if (key === 'value') {
        el.value = value;
      } else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'multiple') {
        el[key] = Boolean(value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }

  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      append(parent, child);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
  return parent;
}

/** Replaces a node's children with the provided content. */
export function render(parent, ...children) {
  parent.textContent = '';
  append(parent, children);
  return parent;
}

/** Removes every child of a node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Text content helper that never throws on null. */
export function text(value, fallback = '') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

/** Creates a document fragment from multiple children. */
export function frag(...children) {
  const fragment = document.createDocumentFragment();
  append(fragment, children);
  return fragment;
}
