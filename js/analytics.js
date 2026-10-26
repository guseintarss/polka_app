/*
 * ПОЛКА · локальная аналитика использования.
 * Считает только действия и открытия экранов: ни названий продуктов, ни цен,
 * ни идентификаторов рецептов. Записи лежат в localStorage под ключом
 * polka.analytics.v1 и никуда не уходят — наружу их отдаёт только отчёт,
 * который пользователь сам отправляет или скачивает на экране «Ещё».
 * Если localStorage недоступен, модуль молча работает в памяти.
 * Ни один метод не бросает исключение: аналитика не имеет права ломать кухню.
 */

import { APP_VERSION } from './version.js';

const STORAGE_KEY = 'polka.analytics.v1';
const FORMAT_VERSION = 1;
const DAYS_KEEP = 120;

const SCREEN_LABELS = [
  ['pantry', 'полка'],
  ['recipes', 'рецепты'],
  ['plan', 'план'],
  ['shopping', 'покупки'],
  ['more', 'ещё']
];

let state = null;
let started = false;
let storage = null;
let storageChecked = false;

/* ── Хранилище ───────────────────────────────────────────────────── */

function pickStorage() {
  if (storageChecked) return storage;
  storageChecked = true;
  try {
    const candidate = globalThis.localStorage;
    if (!candidate) return null;
    const probe = STORAGE_KEY + '.probe';
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    storage = candidate;
  } catch (error) {
    storage = null;
  }
  return storage;
}

function emptyState() {
  return {
    version: FORMAT_VERSION,
    firstSeen: null,
    lastSeen: null,
    sessions: 0,
    days: {},
    totals: {},
    routes: {},
    meta: {}
  };
}

function detectPlatform() {
  try {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
    return 'other';
  } catch (error) {
    return 'other';
  }
}

function detectLocale() {
  try {
    return String(navigator.language || '');
  } catch (error) {
    return '';
  }
}

function count(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number);
}

function countMap(value) {
  const result = {};
  if (!value || typeof value !== 'object') return result;
  Object.keys(value).forEach(function (key) {
    const amount = count(value[key]);
    if (amount) result[key] = amount;
  });
  return result;
}

function normalizeDays(value) {
  const result = {};
  if (!value || typeof value !== 'object') return result;
  Object.keys(value).forEach(function (key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    const day = value[key] && typeof value[key] === 'object' ? value[key] : {};
    result[key] = { sessions: count(day.sessions), events: countMap(day.events) };
  });
  return result;
}

function normalizeMeta(value) {
  const source = value && typeof value === 'object' ? value : {};
  const meta = {};
  if (source.platform === 'ios' || source.platform === 'android' || source.platform === 'other') {
    meta.platform = source.platform;
  }
  if (source.standalone !== undefined) meta.standalone = Boolean(source.standalone);
  if (typeof source.version === 'string' && source.version) meta.version = source.version;
  if (typeof source.locale === 'string' && source.locale) meta.locale = source.locale;
  return meta;
}

function isoTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function normalize(raw) {
  const data = emptyState();
  if (!raw || typeof raw !== 'object') return data;
  data.firstSeen = isoTimestamp(raw.firstSeen) ? raw.firstSeen : null;
  data.lastSeen = isoTimestamp(raw.lastSeen) ? raw.lastSeen : null;
  data.sessions = count(raw.sessions);
  data.days = normalizeDays(raw.days);
  data.totals = countMap(raw.totals);
  data.routes = countMap(raw.routes);
  data.meta = normalizeMeta(raw.meta);
  return data;
}

function ensureState() {
  if (state) return state;
  state = emptyState();
  const store = pickStorage();
  if (!store) return state;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw) state = normalize(JSON.parse(raw));
  } catch (error) {
    state = emptyState();
  }
  return state;
}

function persist() {
  const store = pickStorage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    /* переполнение или запрет записи — данные остаются в памяти */
  }
}

/* ── Дни ─────────────────────────────────────────────────────────── */

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dayKey(date) {
  const d = date || new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function dayBucket(target) {
  const key = dayKey();
  if (target.days[key]) return target.days[key];
  target.days[key] = { sessions: 0, events: {} };
  return target.days[key];
}

function pruneDays(days) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (DAYS_KEEP - 1));
  const limit = dayKey(cutoff);
  Object.keys(days).forEach(function (key) {
    if (key < limit) delete days[key];
  });
}

/* ── Запись событий ──────────────────────────────────────────────── */

function bump(target, name) {
  const key = String(name || '');
  if (!key) return;
  const bucket = dayBucket(target);
  bucket.events[key] = count(bucket.events[key]) + 1;
  target.totals[key] = count(target.totals[key]) + 1;
}

/* mode/kind/reason разворачиваются в totals: product_add.mode='edit' → product_add.edit.
   props.route не разворачивается: открытия экранов считает trackScreen. */
function variantSuffix(props) {
  if (!props || typeof props !== 'object') return '';
  if (props.mode) return '.' + String(props.mode);
  if (props.kind) return '.' + String(props.kind);
  if (props.reason) return '.' + String(props.reason);
  return '';
}

function write() {
  pruneDays(state.days);
  persist();
}

export function initAnalytics(options) {
  try {
    if (started) return;
    started = true;
    const opts = options || {};
    const data = ensureState();
    const now = new Date().toISOString();

    if (!data.firstSeen) data.firstSeen = now;
    data.lastSeen = now;
    data.sessions += 1;
    data.meta = {
      platform: detectPlatform(),
      standalone: Boolean(opts.standalone),
      version: opts.version ? String(opts.version) : '',
      locale: detectLocale()
    };

    dayBucket(data).sessions += 1;
    bump(data, 'app_open');
    // Установку отмечаем один раз: повторные запуски с домашнего экрана счётчик не крутят.
    if (data.meta.standalone && !data.totals.install) bump(data, 'install');
    write();
  } catch (error) {
    /* тихо: аналитика не должна мешать запуску */
  }
}

export function track(name, props) {
  try {
    const key = String(name || '');
    if (!key) return;
    const data = ensureState();
    bump(data, key);

    const suffix = variantSuffix(props);
    if (suffix) {
      const variant = key + suffix;
      data.totals[variant] = count(data.totals[variant]) + 1;
    }

    write();
  } catch (error) {
    /* тихо: аналитика не должна мешать действию */
  }
}

export function trackScreen(tab) {
  try {
    const key = String(tab || '');
    if (!key) return;
    const data = ensureState();
    data.routes[key] = count(data.routes[key]) + 1;
    // В дневном бакете экраны лежат под именем вкладки: с именами событий они не пересекаются.
    const bucket = dayBucket(data);
    bucket.events[key] = count(bucket.events[key]) + 1;
    write();
  } catch (error) {
    /* тихо */
  }
}

export function resetAnalytics() {
  const meta = state ? Object.assign({}, state.meta) : {};
  try {
    const store = pickStorage();
    if (store) store.removeItem(STORAGE_KEY);
  } catch (error) {
    /* хранилище уже недоступно */
  }
  state = emptyState();
  state.meta = meta;
}

/* ── Отчёт ───────────────────────────────────────────────────────── */

function platformText(platform) {
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  return 'другое';
}

function deviceText(meta) {
  const mode = meta.standalone ? 'установлено на экран Домой' : 'в браузере';
  return platformText(meta.platform) + ' · ' + mode;
}

function formatDay(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return pad2(date.getDate()) + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear();
}

function screenLine(routes) {
  const parts = SCREEN_LABELS.map(function (entry) {
    const value = count(routes ? routes[entry[0]] : 0);
    return value ? entry[1] + ' ' + value : '';
  }).filter(Boolean);
  if (!parts.length) return '';
  return 'Экраны (открытия): ' + parts.join(', ');
}

function actionLines(events) {
  const totals = events || {};
  const lines = [];
  const added = count(totals.product_add) + count(totals.product_edit);
  const scanned = count(totals.scan_ok);
  if (added) {
    lines.push('- добавлено продуктов: ' + added +
      (scanned ? ' (из них отсканировано: ' + scanned + ')' : ''));
  }
  if (count(totals.recipe_open)) lines.push('- открыто рецептов: ' + count(totals.recipe_open));
  if (count(totals.cook)) lines.push('- приготовлено блюд: ' + count(totals.cook));
  if (count(totals.plan_generate)) lines.push('- собрано планов: ' + count(totals.plan_generate));
  if (count(totals.shopping_add)) lines.push('- добавлено покупок: ' + count(totals.shopping_add));
  if (count(totals.shopping_check)) lines.push('- отмечено покупок: ' + count(totals.shopping_check));

  const lookups = count(totals.scan_lookup);
  if (lookups) {
    lines.push('- поиск по коду: ' + lookups + ' (найдено: ' + count(totals['scan_lookup.found']) + ')');
  }

  const exported = count(totals.export);
  const imported = count(totals.import);
  const demo = count(totals.demo_load);
  if (exported || imported || demo) {
    lines.push('- экспорт: ' + exported + ', импорт: ' + imported + ', демо-кухня: ' + demo);
  }
  if (count(totals.report_share)) lines.push('- отправлено отчётов: ' + count(totals.report_share));
  return lines;
}

export function getSummary() {
  const data = ensureState();
  return {
    firstSeen: data.firstSeen,
    lastSeen: data.lastSeen,
    daysActive: Object.keys(data.days).length,
    sessions: data.sessions,
    events: Object.assign({}, data.totals),
    routes: Object.assign({}, data.routes),
    meta: Object.assign({}, data.meta)
  };
}

export function buildTextReport() {
  const summary = getSummary();
  const lines = [
    'ПОЛКА — отчёт об использовании',
    'Версия: ' + (summary.meta.version || APP_VERSION),
    'Устройство: ' + deviceText(summary.meta),
    'Первый запуск: ' + formatDay(summary.firstSeen),
    'Последний запуск: ' + formatDay(summary.lastSeen),
    'Дней с приложением: ' + summary.daysActive,
    'Запусков: ' + summary.sessions
  ];

  const screens = screenLine(summary.routes);
  if (screens) {
    lines.push('');
    lines.push(screens);
  }

  const actions = actionLines(summary.events);
  if (actions.length) {
    lines.push('');
    lines.push('Действия:');
    actions.forEach(function (line) { lines.push(line); });
  }

  lines.push('');
  lines.push('Отчёт содержит только счётчики действий — без названий продуктов, цен и личных данных.');
  return lines.join('\n');
}

export function buildJsonReport() {
  const summary = getSummary();
  return JSON.stringify({
    format: 'polka-analytics',
    version: 1,
    generatedAt: new Date().toISOString(),
    app: summary.meta,
    summary: summary
  }, null, 2);
}
