/*
 * ПОЛКА · данные о продукте по штрихкоду.
 * Единственный модуль, который обращается в интернет: открытые базы
 * Open Food Facts и Open Products Facts. Запрос уходит по кнопке или после
 * разового разрешения при сканировании; без согласия автоматических
 * обращений нет, наружу уходит только сам код. Найденное запоминается
 * на устройстве (polka.lookup.v1): повторный скан того же кода подставляет
 * название даже офлайн.
 * Если localStorage недоступен, модуль молча работает в памяти.
 * Ни один метод не бросает исключение: поиск не имеет права ломать кухню.
 */

const STORAGE_KEY = 'polka.lookup.v1';
const FORMAT_VERSION = 1;
const FIELDS = 'product_name,product_name_ru,generic_name,brands,quantity,product_quantity,product_quantity_unit,categories_tags';
const MAX_CACHE = 200;
const MAX_CATEGORIES = 12;
const TIMEOUT_MS = 8000;

/* Источники опрашиваются по порядку: сначала еда, затем остальное. */
const SOURCES = [
  {
    id: 'off',
    label: 'Open Food Facts',
    endpoint: 'https://world.openfoodfacts.org/api/v2/product/'
  },
  {
    id: 'opf',
    label: 'Open Products Facts',
    endpoint: 'https://world.openproductsfacts.org/api/v2/product/'
  }
];

/* Список источников для интерфейса: без служебных адресов. */
export const LOOKUP_SOURCES = SOURCES.map(function (source) {
  return { id: source.id, label: source.label };
});

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

function firstText(values, max) {
  for (let i = 0; i < values.length; i += 1) {
    const text = sanitizeText(values[i], max);
    if (text) return text;
  }
  return '';
}

function normalizeCategories(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (let i = 0; i < value.length && result.length < MAX_CATEGORIES; i += 1) {
    if (typeof value[i] !== 'string') continue;
    const tag = sanitizeText(value[i], 80);
    if (!tag || result.indexOf(tag) !== -1) continue;
    result.push(tag);
  }
  return result;
}

/*
 * Количество: прямой текст важнее, затем число и единица из полей
 * product_quantity/product_quantity_unit.
 */
function readQuantity(source) {
  const quantity = sanitizeText(source.quantity, 40);
  if (quantity) return quantity;
  const amount = sanitizeText(source.product_quantity, 40);
  if (!amount) return '';
  return sanitizeText(amount + ' ' + sanitizeText(source.product_quantity_unit, 40), 40);
}

/*
 * Приводит к стабильной форме и заодно читает ответ API: у сохранённой
 * записи поля name/brand/quantity, у продукта из базы — product_name_ru,
 * product_name, generic_name, brands и categories_tags.
 */
function normalizeInfo(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const name = firstText([
    source.product_name_ru,
    source.product_name,
    source.generic_name,
    source.name
  ], 80);
  const brand = firstText([source.brand, source.brands], 60);
  const quantity = readQuantity(source);
  const categories = normalizeCategories(
    Array.isArray(source.categories) ? source.categories : source.categories_tags
  );
  if (!name && !brand) return null;
  return {
    name: name || brand,
    brand: brand,
    quantity: quantity,
    categories: categories,
    source: sanitizeText(source.source, 40)
  };
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

/* ── Сеть ────────────────────────────────────────────────────────── */

/*
 * Один запрос к одному источнику. Возвращает 'found' с продуктом,
 * 'miss' (404 или товара нет в базе) или 'error' (сеть, таймаут,
 * неожиданный HTTP-статус). Исключения не выходят наружу.
 */
async function fetchFromSource(source, code) {
  let timer = null;
  let controller = null;
  try {
    if (typeof AbortController === 'function') {
      controller = new AbortController();
      timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    }
    const response = await fetch(
      source.endpoint + encodeURIComponent(code) + '.json?fields=' + FIELDS,
      {
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        credentials: 'omit'
      }
    );
    if (response.status === 404) return { status: 'miss' };
    if (response.status !== 200) return { status: 'error' };

    const payload = await response.json();
    if (!payload || Number(payload.status) !== 1) return { status: 'miss' };
    const raw = payload.product;
    if (!raw || typeof raw !== 'object') return { status: 'miss' };

    const product = normalizeInfo(Object.assign({}, raw, { source: source.label }));
    return product ? { status: 'found', product: product } : { status: 'miss' };
  } catch (error) {
    return { status: 'error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/*
 * Ищет продукт: сначала в памяти устройства, затем по источникам.
 * Возвращает { status: 'found'|'notfound'|'error'|'invalid', product, cached }.
 * Ошибка сети или сервера прерывает перебор: нет смысла стучаться дальше.
 */
export async function findProduct(code) {
  const key = codeForLookup(code);
  if (!key) return { status: 'invalid' };

  const cached = cachedProduct(key);
  if (cached) return { status: 'found', product: cached, cached: true };

  if (typeof fetch !== 'function') return { status: 'error' };

  for (let i = 0; i < SOURCES.length; i += 1) {
    const outcome = await fetchFromSource(SOURCES[i], key);
    if (outcome.status === 'error') return { status: 'error' };
    if (outcome.status === 'found') {
      rememberProduct(key, outcome.product);
      return { status: 'found', product: outcome.product, cached: false };
    }
  }
  return { status: 'notfound' };
}
