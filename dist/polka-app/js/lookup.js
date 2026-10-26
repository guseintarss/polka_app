/*
 * ПОЛКА · данные о продукте по штрихкоду.
 * Единственный модуль, который обращается в интернет: открытая база
 * Open Food Facts. Запрос уходит только по явному нажатию кнопки —
 * автоматических обращений нет, наружу уходит только сам код.
 * Найденное запоминается на устройстве (polka.lookup.v1): повторный
 * скан того же кода подставляет название даже офлайн.
 * Если localStorage недоступен, модуль молча работает в памяти.
 * Ни один метод не бросает исключение: поиск не имеет права ломать кухню.
 */

const STORAGE_KEY = 'polka.lookup.v1';
const FORMAT_VERSION = 1;
const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'product_name,brands,quantity';
const MAX_CACHE = 200;
const TIMEOUT_MS = 12000;

let data = null;
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

function emptyData() {
  return { version: FORMAT_VERSION, consent: false, cache: {} };
}

function sanitizeText(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeInfo(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const name = sanitizeText(source.name, 80);
  const brand = sanitizeText(source.brand, 60);
  const quantity = sanitizeText(source.quantity, 40);
  if (!name && !brand) return null;
  return { name: name || brand, brand: brand, quantity: quantity };
}

function normalize(raw) {
  const result = emptyData();
  if (!raw || typeof raw !== 'object') return result;
  result.consent = Boolean(raw.consent);
  const cache = raw.cache && typeof raw.cache === 'object' ? raw.cache : {};
  Object.keys(cache).slice(0, MAX_CACHE * 2).forEach(function (key) {
    const code = codeForLookup(key);
    const entry = cache[key] && typeof cache[key] === 'object' ? cache[key] : {};
    const info = normalizeInfo(entry);
    if (!code || !info) return;
    info.at = Number(entry.at) || 0;
    result.cache[code] = info;
  });
  return result;
}

function ensureData() {
  if (data) return data;
  data = emptyData();
  const store = pickStorage();
  if (!store) return data;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw) data = normalize(JSON.parse(raw));
  } catch (error) {
    data = emptyData();
  }
  return data;
}

function persist() {
  const store = pickStorage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    /* переполнение или запрет записи — данные остаются в памяти */
  }
}

/* ── Публичная часть ─────────────────────────────────────────────── */

/*
 * Код, с которым работает поиск: только цифры GTIN, 8–14 знаков.
 * Пробелы и дефисы, как в печатном виде кода, игнорируются.
 */
export function codeForLookup(value) {
  const code = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f\s-]/g, '');
  return /^\d{8,14}$/.test(code) ? code : '';
}

export function hasLookupConsent() {
  return ensureData().consent;
}

export function grantLookupConsent() {
  ensureData().consent = true;
  persist();
}

export function lookupMemoryInfo() {
  const current = ensureData();
  return { consent: current.consent, count: Object.keys(current.cache).length };
}

export function resetLookupData() {
  data = emptyData();
  const store = pickStorage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch (error) {
    /* хранилище уже недоступно */
  }
}

export function cachedProduct(code) {
  const key = codeForLookup(code);
  if (!key) return null;
  const entry = ensureData().cache[key];
  return entry ? normalizeInfo(entry) : null;
}

export function rememberProduct(code, info) {
  const key = codeForLookup(code);
  const clean = normalizeInfo(info);
  if (!key || !clean) return;
  const cache = ensureData().cache;
  clean.at = Date.now();
  cache[key] = clean;
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE) {
    keys.sort(function (a, b) { return (cache[a].at || 0) - (cache[b].at || 0); });
    keys.slice(0, keys.length - MAX_CACHE).forEach(function (old) { delete cache[old]; });
  }
  persist();
}

/*
 * Ищет продукт: сначала в памяти устройства, затем в Open Food Facts.
 * Возвращает { status: 'found'|'notfound'|'error'|'invalid', product, cached }.
 */
export async function findProduct(code) {
  const key = codeForLookup(code);
  if (!key) return { status: 'invalid' };

  const cached = cachedProduct(key);
  if (cached) return { status: 'found', product: cached, cached: true };

  if (typeof fetch !== 'function') return { status: 'error' };

  let timer = null;
  let controller = null;
  if (typeof AbortController === 'function') {
    controller = new AbortController();
    timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
  }

  try {
    const url = ENDPOINT + encodeURIComponent(key) + '.json?fields=' + FIELDS;
    const response = await fetch(url, {
      signal: controller ? controller.signal : undefined,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    });
    if (response.status === 404) return { status: 'notfound' };
    if (!response.ok) return { status: 'error' };

    const payload = await response.json();
    const product = payload && Number(payload.status) === 1 ? normalizeInfo({
      name: payload.product ? payload.product.product_name : '',
      brand: payload.product ? payload.product.brands : '',
      quantity: payload.product ? payload.product.quantity : ''
    }) : null;
    if (!product) return { status: 'notfound' };

    rememberProduct(key, product);
    return { status: 'found', product: product, cached: false };
  } catch (error) {
    return { status: 'error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
