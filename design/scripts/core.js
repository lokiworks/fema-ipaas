const {
  useState, useEffect, useRef, useMemo, useCallback, Fragment, useLayoutEffect, useSyncExternalStore,
} = React;
const html = htm.bind(React.createElement);

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function cx(...args) {
  return args.flat().filter(Boolean).join(' ');
}

function camelAttrs(attrs) {
  return Object.fromEntries(
    Object.entries(attrs).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]),
  );
}

function Icon({ name, size = 16, strokeWidth = 2, className, style }) {
  const node = window.lucide.icons[name];
  if (!node) {
    console.warn('missing icon', name);
    return null;
  }
  const children = node[2] || [];
  return React.createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24',
      fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round',
      strokeLinejoin: 'round', className: cx('ic', className), style, 'aria-hidden': true,
    },
    children.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...camelAttrs(attrs) })),
  );
}

const uid = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

const safeStorage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { return null; }
    return true;
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { return null; }
    return true;
  },
};

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(query)) };
}

const routeListeners = new Set();
let currentRoute = parseHash();
window.addEventListener('hashchange', () => {
  currentRoute = parseHash();
  routeListeners.forEach((l) => l());
});

function navigate(to, { replace = false } = {}) {
  if (replace) {
    window.location.replace(`#${to}`);
  } else {
    window.location.hash = to;
  }
}

function useRoute() {
  return useSyncExternalStore(
    (l) => { routeListeners.add(l); return () => routeListeners.delete(l); },
    () => currentRoute,
  );
}

function matchRoute(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = safeDecode(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

function safeDecode(text) {
  try { return decodeURIComponent(text); } catch (e) { return text; }
}

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function shortcutLabel(combo) {
  const names = IS_MAC
    ? { mod: '⌘', shift: '⇧', alt: '⌥', delete: '⌫', enter: '↩' }
    : { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', delete: 'Delete', enter: 'Enter' };
  const keys = combo.split('+').map((k) => names[k] || k.toUpperCase());
  const ordered = IS_MAC ? [...keys.filter((k) => k === '⇧'), ...keys.filter((k) => k !== '⇧')] : keys;
  return ordered.join(IS_MAC ? '' : '+');
}

function Link({ to, className, children, onClick, ...rest }) {
  return html`<a href=${`#${to}`} className=${className} onClick=${onClick} ...${rest}>${children}</a>`;
}

const STORE_KEY = window.PROTOTYPE_STORE_KEY || 'fema-design-state-v11';

function shiftTimes(value, delta) {
  if (Array.isArray(value)) return value.map((v) => shiftTimes(v, delta));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftTimes(v, delta)]));
  if (typeof value === 'number' && value > 1e12 && value < 1e13) return value + delta;
  return value;
}

function loadSaved() {
  const saved = safeStorage.get(STORE_KEY);
  if (!saved) return null;
  try { return JSON.parse(saved); } catch (e) { return null; }
}

const Store = (() => {
  let state = loadSaved();
  const listeners = new Set();
  const persist = () => safeStorage.set(STORE_KEY, JSON.stringify(state));
  return {
    init(seed) {
      if (!state) {
        state = seed();
      } else if (state.anchorAt && Date.now() - state.anchorAt > HOUR) {
        state = { ...shiftTimes(state, Date.now() - state.anchorAt), anchorAt: Date.now() };
      }
      persist();
    },
    get: () => state,
    set(updater) {
      state = typeof updater === 'function' ? updater(state) : updater;
      persist();
      listeners.forEach((l) => l());
    },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    reset(seed) {
      state = seed();
      persist();
      listeners.forEach((l) => l());
    },
  };
})();

function useStore() {
  return useSyncExternalStore(Store.subscribe, Store.get);
}

function patchList(key, id, patch) {
  Store.set((s) => ({
    ...s,
    [key]: s[key].map((item) => (item.id === id ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item)),
  }));
}

function removeFromList(key, ids) {
  const set = new Set([].concat(ids));
  Store.set((s) => ({ ...s, [key]: s[key].filter((item) => !set.has(item.id)) }));
}

function prependToList(key, item) {
  Store.set((s) => ({ ...s, [key]: [item, ...s[key]] }));
}

function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body);
}

const fmt = {
  pad: (n) => String(n).padStart(2, '0'),
  dateTime(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${fmt.pad(d.getMonth() + 1)}-${fmt.pad(d.getDate())} ${fmt.pad(d.getHours())}:${fmt.pad(d.getMinutes())}:${fmt.pad(d.getSeconds())}`;
  },
  date(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${fmt.pad(d.getMonth() + 1)}-${fmt.pad(d.getDate())}`;
  },
  short(ts) {
    const d = new Date(ts);
    return `${fmt.pad(d.getMonth() + 1)}-${fmt.pad(d.getDate())} ${fmt.pad(d.getHours())}:${fmt.pad(d.getMinutes())}`;
  },
  relative(ts) {
    const diff = Date.now() - ts;
    const future = diff < 0;
    const suffix = future ? '后' : '前';
    const m = Math.round(Math.abs(diff) / 60000);
    if (m < 1) return future ? '即将' : '刚刚';
    if (m < 60) return `${m} 分钟${suffix}`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} 小时${suffix}`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d} 天${suffix}`;
    return fmt.date(ts);
  },
  duration(ms) {
    if (ms == null) return '-';
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
    return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
  },
  number: (n) => (Number(n) || 0).toLocaleString('zh-CN'),
};

function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

function copyText(text) {
  const value = String(text ?? '');
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).catch(() => legacyCopy(value));
      return true;
    }
  } catch (e) {
    return legacyCopy(value);
  }
  return legacyCopy(value);
}
