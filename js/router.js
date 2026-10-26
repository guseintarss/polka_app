/*
 * ПОЛКА · hash-роутер.
 * Каждый экран — функция, которая получает корень и параметры маршрута.
 * Роутер отвечает за заголовок, нижнюю навигацию и позицию скролла.
 */

const routes = [];
const listeners = [];
let root = null;
let fallback = 'pantry';
let started = false;
let current = null;
let entryHistoryLength = 0;

function normalizePath(value) {
  return String(value || '')
    .replace(/^#\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

export function parseHash(hash) {
  const raw = normalizePath(hash === undefined ? window.location.hash : hash);
  const question = raw.indexOf('?');
  const path = question === -1 ? raw : raw.slice(0, question);
  const search = question === -1 ? '' : raw.slice(question + 1);
  const query = new URLSearchParams(search);
  const params = {};
  query.forEach(function (value, key) { params[key] = value; });
  return { path: path || fallback, segments: (path || fallback).split('/').filter(Boolean), query: params };
}

export function register(pattern, definition) {
  const segments = String(pattern).replace(/^\/+|\/+$/g, '').split('/');
  routes.push({
    pattern: pattern,
    segments: segments,
    staticCount: segments.filter(function (segment) { return segment.charAt(0) !== ':'; }).length,
    title: definition.title || 'ПОЛКА',
    render: definition.render,
    tab: definition.tab || segments[0]
  });
  routes.sort(function (a, b) { return b.staticCount - a.staticCount || b.segments.length - a.segments.length; });
}

export function onChange(listener) {
  if (typeof listener !== 'function') return function () {};
  listeners.push(listener);
  return function () {
    const index = listeners.indexOf(listener);
    if (index !== -1) listeners.splice(index, 1);
  };
}

function notifyChange() {
  if (!listeners.length || !current) return;
  const payload = {
    path: current.path,
    tab: current.tab,
    params: Object.assign({}, current.params)
  };
  listeners.slice().forEach(function (listener) {
    try { listener(payload); } catch (error) { console.error('POLKA: слушатель маршрута упал', error); }
  });
}

function match(segments) {
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    if (route.segments.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (let part = 0; part < route.segments.length; part += 1) {
      const expected = route.segments[part];
      if (expected.charAt(0) === ':') {
        params[expected.slice(1)] = decodeURIComponent(segments[part]);
      } else if (expected !== segments[part]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: route, params: params };
  }
  return null;
}

function updateNav(tab) {
  document.querySelectorAll('[data-tab]').forEach(function (link) {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export function setTitle(title) {
  document.title = title ? title + ' — ПОЛКА' : 'ПОЛКА — кухонный журнал';
}

export function currentPath() {
  return current ? current.path : fallback;
}

function render(options) {
  if (!root) return;
  const parsed = parseHash();
  const found = match(parsed.segments);
  if (!found) {
    if (parsed.path !== fallback) {
      history.replaceState(null, '', '#/' + fallback);
      return render(options);
    }
    return;
  }
  const previous = current;
  current = {
    path: parsed.path,
    tab: found.route.tab,
    params: Object.assign({}, parsed.query, found.params),
    route: found.route
  };
  updateNav(found.route.tab);
  setTitle(found.route.title);

  let painted = false;
  try {
    found.route.render(root, current);
    painted = true;
  } catch (error) {
    console.error('POLKA: не удалось отрисовать маршрут', current.path, error);
    root.innerHTML = '<div class="screen"><div class="empty">' +
      '<h1 class="empty__title">Раздел не открылся</h1>' +
      '<p class="empty__text">Попробуйте вернуться на полку. Если ошибка повторяется, обновите приложение.</p>' +
      '<a class="btn btn--primary" href="#/pantry">На полку</a>' +
      '</div></div>';
  }
  updateNav(found.route.tab);
  if (painted) notifyChange();

  if (!options || options.scroll !== false) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    const screen = document.getElementById('screen');
    if (screen && previous && previous.path !== current.path) {
      screen.focus({ preventScroll: true });
    }
  }
}

export function start(options) {
  const opts = options || {};
  root = opts.root || document.getElementById('screen');
  fallback = opts.fallback || 'pantry';
  if (started) return;
  started = true;
  entryHistoryLength = window.history.length;

  if (!window.location.hash || window.location.hash === '#') {
    history.replaceState(null, '', '#/' + fallback);
  }
  window.addEventListener('hashchange', function () { render(); });
  render({ scroll: true });
}

export function refresh(options) {
  if (!started) return;
  render(Object.assign({ scroll: false }, options || {}));
}

export function navigate(path, options) {
  const opts = options || {};
  const clean = normalizePath(path) || fallback;
  const target = '#/' + clean;
  if (window.location.hash === target) {
    if (opts.replace) history.replaceState(null, '', target);
    refresh();
    return;
  }
  if (opts.replace) {
    history.replaceState(null, '', target);
    render();
    return;
  }
  window.location.hash = target;
}

export function back(fallbackPath) {
  if (history.length > entryHistoryLength) history.back();
  else navigate(fallbackPath || fallback, { replace: true });
}
