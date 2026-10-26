/*
 * ПОЛКА · состояние кухни.
 * Единственное место, которое читает и пишет localStorage и применяет
 * доменные операции движка. Экраны не мутируют состояние напрямую.
 */

const DATA = window.POLKA_DATA;
const E = window.POLKA_ENGINE;

export const STORAGE_KEY = 'polka.kitchen.v1';
export const STORAGE_BACKUP_KEY = 'polka.kitchen.v1.damaged';
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

const DIETS = new Set(['all', 'vegetarian', 'vegan', 'glutenFree']);
const MAX_TIMES = [0, 20, 30, 45];

let state = null;
let storageOK = true;
let bootWarning = '';
let damagedRaw = '';
let lastSavedAt = null;
let persistenceState = 'unknown';
let persistenceRequested = false;
const listeners = new Set();

function today() {
  return E.todayISO();
}

export function emit(type, detail) {
  const event = Object.assign({ type: type, at: Date.now() }, detail || {});
  listeners.forEach(function (listener) {
    try { listener(event); } catch (error) { console.error('POLKA store listener', error); }
  });
}

export function subscribe(listener) {
  listeners.add(listener);
  return function () { listeners.delete(listener); };
}

export function getState() {
  return state;
}

export function getToday() {
  return today();
}

export function isStorageOK() {
  return storageOK;
}

export function getLastSavedAt() {
  return lastSavedAt;
}

export function getPersistenceState() {
  return persistenceState;
}

export function getBootWarning() {
  return bootWarning;
}

export function snapshot() {
  return E.clone(state);
}

/* ── Загрузка и сохранение ───────────────────────────────────────── */

function writeStorage(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    storageOK = true;
    lastSavedAt = new Date();
    requestPersistence();
    return true;
  } catch (error) {
    storageOK = false;
    return false;
  }
}

function requestPersistence() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
    persistenceState = 'unsupported';
    return;
  }
  try {
    navigator.storage.persist().then(function (granted) {
      persistenceState = granted ? 'granted' : 'denied';
      emit('persistence', { state: persistenceState });
    }).catch(function () {
      persistenceState = 'unknown';
    });
  } catch (error) {
    persistenceState = 'unknown';
  }
}

function readStorage() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    if (error && (error.name === 'SecurityError' || error.name === 'QuotaExceededError')) {
      storageOK = false;
      return null;
    }
    damagedRaw = raw || '';
    return null;
  }
}

function backupDamaged() {
  if (!damagedRaw) return false;
  try {
    localStorage.setItem(STORAGE_BACKUP_KEY, damagedRaw);
    return true;
  } catch (error) {
    return false;
  }
}

export function createDemo() {
  const demo = E.normalizeState(DATA.buildDemoState(today()), today());
  demo.plan = E.generatePlan(demo, { seed: demo.demoSeed, startDate: today() }, today());
  const sync = E.mergeShopping(demo.shopping, E.collectPlanMissing(demo, today(), 7, today()), 'sync');
  demo.shopping = sync.list;
  return demo;
}

function loadInitialState() {
  const stored = readStorage();
  if (stored) {
    try {
      return E.normalizeState(stored, today());
    } catch (error) {
      damagedRaw = JSON.stringify(stored);
      bootWarning = 'Сохранение оказалось неполным. Загрузили демо-кухню.';
    }
  }
  const demo = createDemo();
  const backed = backupDamaged();
  if (damagedRaw) {
    bootWarning = 'Сохранение было повреждено. Загрузили демо-кухню.' +
      (backed ? ' Исходный текст сохранён отдельно.' : ' Исходные данные восстановить не удалось.');
    damagedRaw = '';
  }
  writeStorage(demo);
  return demo;
}

export function init() {
  if (state) return state;
  const startedAt = performance.now();
  state = loadInitialState();
  emit('boot', { duration: Math.round(performance.now() - startedAt) });
  return state;
}

export function save() {
  const ok = writeStorage(state);
  emit('save', { ok: ok, at: lastSavedAt });
  return ok;
}

export function hasData(value) {
  const source = value || state;
  if (!source) return false;
  const settings = source.settings || {};
  return Boolean(
    (source.pantry && source.pantry.length) ||
    (source.shopping && source.shopping.length) ||
    Object.keys(source.plan || {}).length ||
    (source.stats && (source.stats.cooked || Object.keys(source.stats.history || {}).length)) ||
    settings.servings !== 2 ||
    settings.diet !== 'all' ||
    settings.maxTime !== 0
  );
}

export function replaceState(next, message) {
  state = E.normalizeState(next, today());
  save();
  emit('replace', { message: message || '' });
  return state;
}

export function reloadFromStorage() {
  let parsed;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = E.emptyState(today());
      emit('replace', { message: 'Кухня очищена в другой вкладке.' });
      return state;
    }
    parsed = JSON.parse(raw);
  } catch (error) {
    return state;
  }
  try {
    state = E.normalizeState(parsed, today());
    emit('replace', { message: 'Кухня обновилась в другой вкладке.' });
  } catch (error) {
    emit('replace', { message: 'Изменения из другой вкладки не удалось прочитать.' });
  }
  return state;
}

/* ── Полка ──────────────────────────────────────────────────────── */

function resolveMeta(input) {
  const byId = input && input.ingredientId ? E.ingredientById(input.ingredientId) : null;
  if (byId) return byId;
  return E.resolveIngredient(input && input.name ? input.name : '');
}

function pantryFields(input, base, options) {
  const opts = options || {};
  const patch = input || {};
  const source = Object.assign({}, base || {}, patch);
  const meta = resolveMeta(source);
  const name = String(source.name || (meta ? meta.name : '')).trim().slice(0, 80);
  const quantity = Math.max(0, Number(source.qty));
  const price = Math.max(0, Number(source.price) || 0);
  const hasCategory = Object.prototype.hasOwnProperty.call(patch, 'category') && DATA.CATEGORY_ORDER.includes(patch.category);
  const hasStorage = Object.prototype.hasOwnProperty.call(patch, 'storage') && Object.prototype.hasOwnProperty.call(DATA.STORAGES, patch.storage);
  const hasUnit = Object.prototype.hasOwnProperty.call(patch, 'unit') && DATA.UNITS.includes(patch.unit);
  const useMeta = Boolean(meta && opts.adoptMeta);
  const category = hasCategory
    ? patch.category
    : (useMeta ? meta.category : (DATA.CATEGORY_ORDER.includes(source.category) ? source.category : (meta ? meta.category : 'Другое')));
  const storage = hasStorage
    ? patch.storage
    : (useMeta ? meta.storage : (Object.prototype.hasOwnProperty.call(DATA.STORAGES, source.storage) ? source.storage : (meta ? meta.storage : 'pantry')));
  const unit = hasUnit
    ? patch.unit
    : (useMeta ? meta.unit : (DATA.UNITS.includes(source.unit) ? source.unit : (meta ? meta.unit : 'шт')));
  return {
    ingredientId: meta ? meta.id : null,
    name: name,
    qty: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity * 100) / 100 : 1,
    unit: unit,
    category: category,
    storage: storage,
    expires: E.isValidISODate(source.expires) ? source.expires : null,
    price: Math.round(price),
    barcode: E.cleanScanCode(source.barcode, 64)
  };
}

export function addPantry(input) {
  const fields = pantryFields(input);
  if (!fields.name) throw new Error('Название продукта обязательно.');
  const item = Object.assign({ id: E.uid('p'), addedAt: today() }, fields);
  state.pantry.unshift(item);
  save();
  return item;
}

export function updatePantry(id, patch) {
  const item = state.pantry.find(function (entry) { return entry.id === id; });
  if (!item) return null;
  const input = Object.assign({}, patch);
  const nameChanged = Object.prototype.hasOwnProperty.call(input, 'name') && input.name !== item.name;
  if (nameChanged && !Object.prototype.hasOwnProperty.call(input, 'ingredientId')) {
    input.ingredientId = null;
  }
  Object.assign(item, pantryFields(input, item, { adoptMeta: nameChanged }));
  save();
  return item;
}

export function removePantry(id) {
  const index = state.pantry.findIndex(function (entry) { return entry.id === id; });
  if (index === -1) return null;
  const item = state.pantry.splice(index, 1)[0];
  save();
  return { item: item, index: index };
}

export function insertPantry(item, index) {
  state.pantry.splice(Math.max(0, Math.min(index, state.pantry.length)), 0, item);
  save();
}

/* ── Покупки ────────────────────────────────────────────────────── */

function shoppingFields(input) {
  const source = input || {};
  const meta = resolveMeta(source);
  const name = String(source.name || (meta ? meta.name : '')).trim().slice(0, 80);
  const quantity = Math.max(0, Number(source.qty));
  const unit = DATA.UNITS.includes(source.unit) ? source.unit : (meta ? meta.unit : 'шт');
  return {
    ingredientId: meta ? meta.id : null,
    name: meta ? meta.name : name,
    qty: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity * 100) / 100 : 1,
    unit: unit,
    price: Math.max(0, Math.round(Number(source.price) || 0))
  };
}

export function addShopping(input) {
  const fields = shoppingFields(input);
  if (!fields.name) throw new Error('Название покупки обязательно.');
  const existing = state.shopping.find(function (item) {
    const sameIngredient = fields.ingredientId && item.ingredientId === fields.ingredientId && item.unit === fields.unit;
    const sameName = !fields.ingredientId && E.normalizeName(item.name) === E.normalizeName(fields.name) && item.unit === fields.unit;
    return sameIngredient || sameName;
  });
  const meta = resolveMeta(fields);
  if (existing) {
    existing.qty = Math.round((existing.qty + fields.qty) * 100) / 100;
    existing.checked = false;
    existing.price = Math.round((existing.price || 0) + (meta ? E.estimateCost(meta.id, fields.qty, fields.unit) : 0));
    existing.source = 'manual';
    if (meta && !existing.ingredientId) {
      existing.ingredientId = meta.id;
      existing.name = meta.name;
    }
    save();
    return { item: existing, merged: true };
  }
  const item = {
    id: E.uid('s'),
    ingredientId: fields.ingredientId,
    name: fields.name,
    qty: fields.qty,
    unit: fields.unit,
    checked: false,
    source: 'manual',
    price: meta ? Math.round(E.estimateCost(meta.id, fields.qty, fields.unit)) : 0
  };
  state.shopping.push(item);
  save();
  return { item: item, merged: false };
}

export function toggleShopping(id, checked) {
  const item = state.shopping.find(function (entry) { return entry.id === id; });
  if (!item) return null;
  item.checked = Boolean(checked);
  save();
  return item;
}

export function updateShopping(id, patch) {
  const item = state.shopping.find(function (entry) { return entry.id === id; });
  if (!item) return null;
  const merged = Object.assign({}, item, patch);
  if (Object.prototype.hasOwnProperty.call(patch, 'name') && !Object.prototype.hasOwnProperty.call(patch, 'ingredientId')) {
    merged.ingredientId = null;
  }
  Object.assign(item, shoppingFields(merged));
  save();
  return item;
}

export function removeShopping(id) {
  const index = state.shopping.findIndex(function (entry) { return entry.id === id; });
  if (index === -1) return null;
  const item = state.shopping.splice(index, 1)[0];
  save();
  return { item: item, index: index };
}

export function insertShopping(item, index) {
  state.shopping.splice(Math.max(0, Math.min(index, state.shopping.length)), 0, item);
  save();
}

export function mergeShopping(additions, mode) {
  const result = E.mergeShopping(state.shopping, additions, mode || 'add', today());
  state.shopping = result.list;
  save();
  return result;
}

export function addRecipeMissing(recipe, servings) {
  if (!recipe) return null;
  const additions = E.collectRecipeMissing(recipe, state, servings, today());
  if (!additions.length) return { additions: [], merged: null };
  const merged = E.mergeShopping(state.shopping, additions, 'add', today());
  state.shopping = merged.list;
  save();
  return { additions: additions, merged: merged };
}

export function buyChecked() {
  const checked = state.shopping.filter(function (item) { return item.checked; });
  if (!checked.length) return null;
  checked.forEach(function (item) {
    if (!item.price && item.ingredientId) {
      item.price = Math.round(E.estimateCost(item.ingredientId, item.qty, item.unit));
    }
  });
  const result = E.applyCheckedToPantry(state, today());
  state.pantry = result.pantry;
  state.shopping = result.shopping;
  save();
  return result;
}

export function clearChecked() {
  const checked = state.shopping.filter(function (item) { return item.checked; });
  if (!checked.length) return null;
  state.shopping = state.shopping.filter(function (item) { return !item.checked; });
  save();
  return checked;
}

export function shoppingSummary() {
  return E.shoppingSummary(state.shopping);
}

/* ── Рецепты и готовка ──────────────────────────────────────────── */

export function cook(recipe, servings) {
  if (!recipe) return null;
  const report = E.planCooking(recipe, state, servings, today());
  const deductions = report.deductions;

  if (deductions.length) {
    const afterById = new Map();
    deductions.forEach(function (deduction) {
      const current = afterById.get(deduction.itemId);
      if (current === undefined || deduction.after < current) afterById.set(deduction.itemId, deduction.after);
    });
    state.pantry = state.pantry.filter(function (item) {
      if (!afterById.has(item.id)) return true;
      const after = afterById.get(item.id);
      if (after <= 0.0001) return false;
      item.qty = after;
      return true;
    });
  }
  E.addCookedStats(state, report, today());
  save();
  return report;
}

/* ── План ───────────────────────────────────────────────────────── */

export function setPlanSlot(date, meal, recipeId) {
  if (!E.isValidISODate(date) || DATA.MEAL_ORDER.indexOf(meal) === -1) return null;
  const recipe = E.recipeById(recipeId);
  if (!recipe) return null;
  state.plan[date] = Object.assign({}, state.plan[date] || {}, { [meal]: recipe.id });
  save();
  return recipe;
}

export function clearPlanSlot(date, meal) {
  if (!state.plan[date]) return false;
  delete state.plan[date][meal];
  if (!Object.keys(state.plan[date]).length) delete state.plan[date];
  save();
  return true;
}

export function generatePlan(options) {
  const opts = options || {};
  const seed = Number.isFinite(opts.seed) ? opts.seed : Math.floor(Math.random() * 90000) + 7;
  const plan = E.generatePlan(state, {
    seed: seed,
    startDate: today(),
    diet: state.settings.diet,
    maxTime: state.settings.maxTime,
    days: 7
  }, today());
  const meals = Object.keys(plan).reduce(function (sum, date) {
    return sum + Object.keys(plan[date]).length;
  }, 0);
  if (!meals) return { plan: null, meals: 0 };
  state.plan = plan;
  save();
  return { plan: plan, meals: meals };
}

export function clearPlan() {
  if (!Object.keys(state.plan).length) return null;
  const previous = E.clone(state.plan);
  state.plan = {};
  save();
  return previous;
}

export function syncShoppingFromPlan() {
  const overview = E.planOverview(state, today());
  if (!overview.meals) return { overview: overview, additions: [], result: null };
  const additions = E.collectPlanMissing(state, today(), 7, today());
  const result = E.mergeShopping(state.shopping, additions, 'sync', today());
  state.shopping = result.list;
  save();
  return { overview: overview, additions: additions, result: result };
}

export function updateSettings(patch) {
  const source = patch || {};
  if (source.servings !== undefined) {
    const servings = Math.round(Number(source.servings));
    if (Number.isFinite(servings)) state.settings.servings = Math.min(12, Math.max(1, servings));
  }
  if (source.diet !== undefined && DIETS.has(source.diet)) state.settings.diet = source.diet;
  if (source.maxTime !== undefined) {
    const maxTime = Number(source.maxTime);
    state.settings.maxTime = MAX_TIMES.includes(maxTime) ? maxTime : 0;
  }
  save();
  return state.settings;
}

/* ── Данные ─────────────────────────────────────────────────────── */

export function exportPayload() {
  return {
    format: 'polka',
    version: 1,
    exportedAt: new Date().toISOString(),
    state: state
  };
}

export function exportText() {
  return JSON.stringify(exportPayload(), null, 2);
}

export function importState(candidate) {
  if (!candidate || typeof candidate !== 'object') throw new Error('Файл не похож на данные ПОЛКИ.');
  const source = candidate.state && typeof candidate.state === 'object' ? candidate.state : candidate;
  if (!Array.isArray(source.pantry) && !source.settings) {
    throw new Error('В файле нет данных кухни.');
  }
  const next = E.normalizeState(source, today());
  state = next;
  save();
  emit('replace', { message: 'Кухня загружена из файла.' });
  return state;
}

export function loadDemo() {
  state = createDemo();
  save();
  emit('replace', { message: 'Демо-кухня загружена. Можно экспериментировать.' });
  return state;
}

export function clearAll() {
  state = E.emptyState(today());
  save();
  emit('replace', { message: 'Кухня очищена. Начните с первого продукта.' });
  return state;
}
