/*
 * ПОЛКА — движок кухни.
 * Чистые функции без DOM: сроки, совпадение рецептов, план, покупки, стоимость.
 */
(function (global) {
  'use strict';

  const DATA = global.POLKA_DATA;
  if (!DATA) throw new Error('ПОЛКА: сначала подключите js/data.js');

  const ING_BY_ID = new Map(DATA.INGREDIENTS.map((item) => [item.id, item]));
  const RECIPE_BY_ID = new Map(DATA.RECIPES.map((item) => [item.id, item]));
  const CATEGORY_SET = new Set(DATA.CATEGORY_ORDER);
  const UNIT_SET = new Set(DATA.UNITS);
  const MEAL_SET = new Set(DATA.MEAL_ORDER);
  const DIETS = new Set(['all', 'vegetarian', 'vegan', 'glutenFree']);
  const MASS = { 'г': 1, 'кг': 1000 };
  const VOLUME = { 'мл': 1, 'л': 1000 };
  const DAY_MS = 86400000;
  const EPSILON = 0.0001;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function todayISO(date) {
    const d = date || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isValidISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12);
    return d.getFullYear() === parts[0] && d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
  }

  function parseISO(value) {
    if (!isValidISODate(value)) return null;
    const parts = value.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  }

  function addDays(iso, days) {
    return DATA.addDaysISO(iso, days);
  }

  function daysBetween(fromISO, toISO) {
    const a = parseISO(fromISO);
    const b = parseISO(toISO);
    if (!a || !b) return 0;
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
  }

  function daysUntil(iso, today) {
    if (!iso) return null;
    return daysBetween(today || todayISO(), iso);
  }

  function maxISO(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a >= b ? a : b;
  }

  function normalizeName(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stem(value) {
    return normalizeName(value)
      .replace(/(ами|ями|ах|ях|ов|ев|ей|ой|ый|ий|ая|ое|ые|ыми|ими|ому|ему|а|я|ы|и|у|ю|е|о|ь)$/u, '')
      .trim();
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function ingredientById(id) {
    return ING_BY_ID.get(id) || null;
  }

  function recipeById(id) {
    return RECIPE_BY_ID.get(id) || null;
  }

  function resolveIngredient(name) {
    const normalized = normalizeName(name);
    if (!normalized) return null;
    for (const item of DATA.INGREDIENTS) {
      if (normalizeName(item.name) === normalized) return item;
      if ((item.aliases || []).some((alias) => normalizeName(alias) === normalized)) return item;
    }
    const wanted = stem(normalized);
    if (wanted.length < 3) return null;
    for (const item of DATA.INGREDIENTS) {
      if (stem(item.name) === wanted) return item;
      if ((item.aliases || []).some((alias) => stem(alias) === wanted)) return item;
    }
    return null;
  }

  function categoryOf(ingredientId, fallback) {
    const item = ingredientById(ingredientId);
    return item ? item.category : (CATEGORY_SET.has(fallback) ? fallback : 'Другое');
  }

  function storageOf(ingredientId, fallback) {
    const item = ingredientById(ingredientId);
    return item ? item.storage : (own(DATA.STORAGES, fallback) ? fallback : 'pantry');
  }

  function storageLabel(id) {
    return own(DATA.STORAGES, id) ? DATA.STORAGES[id].label : 'Шкаф';
  }

  function mealLabel(id) {
    return own(DATA.MEALS, id) ? DATA.MEALS[id].label : id;
  }

  function tagLabel(id) {
    return own(DATA.TAGS, id) ? DATA.TAGS[id].label : id;
  }

  function pluralRu(number, forms) {
    const n = Math.abs(Math.round(Number(number) || 0)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  function formatNumber(value, maxDigits) {
    const digits = typeof maxDigits === 'number' ? maxDigits : 0;
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value) || 0);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency', currency: 'RUB', maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function formatQty(qty, unit) {
    const amount = Number(qty) || 0;
    if (unit === 'г' && amount >= 1000) return formatNumber(amount / 1000, 1) + ' кг';
    if (unit === 'мл' && amount >= 1000) return formatNumber(amount / 1000, 1) + ' л';
    return formatNumber(amount, 1) + ' ' + unit;
  }

  function formatDateShort(iso) {
    const d = parseISO(iso);
    if (!d) return '—';
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1);
  }

  function formatDateNumeric(iso) {
    const d = parseISO(iso);
    if (!d) return '—';
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  function formatDateLong(iso) {
    const d = parseISO(iso);
    if (!d) return '—';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(d);
  }

  function formatDateWithWeekday(iso) {
    const d = parseISO(iso);
    if (!d) return '—';
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  }

  function weekdayShort(iso) {
    const d = parseISO(iso);
    if (!d) return '—';
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(d).replace('.', '');
  }

  function weekdayLong(iso) {
    const d = parseISO(iso);
    if (!d) return '—';
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(d);
  }

  function expiryState(iso, today) {
    if (!iso) {
      return { days: null, tone: 'none', label: 'без срока', short: '—', date: null };
    }
    const days = daysUntil(iso, today || todayISO());
    if (days === null || !Number.isFinite(days)) {
      return { days: null, tone: 'none', label: 'без срока', short: '—', date: null };
    }
    if (days < 0) {
      return {
        days: days, tone: 'expired',
        label: 'просрочено ' + pluralRu(Math.abs(days), ['день', 'дня', 'дней']),
        short: Math.abs(days) + ' дн. назад', date: iso
      };
    }
    if (days === 0) return { days: days, tone: 'today', label: 'сегодня', short: 'сегодня', date: iso };
    if (days === 1) return { days: days, tone: 'soon', label: 'завтра', short: 'завтра', date: iso };
    if (days <= 3) return { days: days, tone: 'soon', label: 'через ' + days + ' ' + pluralRu(days, ['день', 'дня', 'дней']), short: days + ' дн.', date: iso };
    if (days <= 7) return { days: days, tone: 'week', label: 'через ' + days + ' ' + pluralRu(days, ['день', 'дня', 'дней']), short: days + ' дн.', date: iso };
    return { days: days, tone: 'fresh', label: 'до ' + formatDateLong(iso), short: formatDateShort(iso), date: iso };
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function safeStoredId(value, prefix) {
    if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,79}$/.test(value)) return value;
    return uid(prefix);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cleanScanText(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max || 80);
  }

  function cleanScanCode(value, max) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value)
      .replace(/[\u0000-\u001f\u007f\s]/g, '')
      .slice(0, max || 64);
  }

  function parseScanPayload(raw) {
    const result = { code: null, name: null, kind: 'unknown' };
    const text = cleanScanText(raw, 512);
    if (!text) return result;

    const digits = text.replace(/[\s-]/g, '');
    if (/^\d{8}$/.test(digits) || /^\d{12}$/.test(digits) ||
        /^\d{13}$/.test(digits) || /^\d{14}$/.test(digits)) {
      result.code = digits;
      result.kind = 'barcode';
      return result;
    }

    const gs1 = text.match(/^(?:\(01\)|01)(\d{14})/);
    if (gs1) {
      result.code = gs1[1];
      result.kind = 'gs1';
      return result;
    }

    if (/^https?:\/\//i.test(text)) {
      let name = '';
      try {
        const url = new URL(text);
        const keys = ['name', 'title', 'product', 'n', 'text'];
        for (let i = 0; i < keys.length; i += 1) {
          const value = cleanScanText(url.searchParams.get(keys[i]), 80);
          if (value.length >= 2) { name = value; break; }
        }
        if (!name) {
          const segment = decodeURIComponent((url.pathname.split('/').filter(Boolean).pop() || ''));
          const pretty = cleanScanText(segment.replace(/[-_+]+/g, ' '), 80);
          if (pretty.length >= 2 && !/^[0-9a-f]{8,}$/i.test(pretty)) name = pretty;
        }
      } catch (error) { /* ссылку не разобрать — оставляем как есть */ }
      if (name) result.name = name;
      result.kind = 'qr';
      return result;
    }

    result.name = cleanScanText(text, 80);
    result.kind = result.name ? 'text' : 'unknown';
    return result;
  }

  function emptyState(today) {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      demo: false,
      demoSeed: 19,
      settings: { servings: 2, diet: 'all', maxTime: 0 },
      pantry: [],
      shopping: [],
      plan: {},
      stats: { cooked: 0, history: {} }
    };
  }

  function normalizeState(raw, today) {
    if (!raw || typeof raw !== 'object') throw new Error('Файл не похож на данные ПОЛКИ.');
    const now = today || todayISO();
    const state = emptyState(now);
    state.createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : state.createdAt;
    state.demo = Boolean(raw.demo);
    state.demoSeed = Number.isFinite(raw.demoSeed) ? raw.demoSeed : 19;

    const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    state.settings.servings = Math.min(12, Math.max(1, Math.round(Number(settings.servings) || 2)));
    state.settings.diet = DIETS.has(settings.diet) ? settings.diet : 'all';
    state.settings.maxTime = [0, 20, 30, 45].includes(Number(settings.maxTime)) ? Number(settings.maxTime) : 0;

    const seen = new Set();
    state.pantry = (Array.isArray(raw.pantry) ? raw.pantry : []).slice(0, 500).map((entry) => {
      const source = entry && typeof entry === 'object' ? entry : {};
      let id = safeStoredId(source.id, 'p');
      if (seen.has(id)) id = uid('p');
      seen.add(id);
      const name = String(source.name || '').trim().slice(0, 80);
      const ingredient = ingredientById(source.ingredientId);
      const qty = Math.max(0, Number(source.qty));
      return {
        id: id,
        ingredientId: ingredient ? ingredient.id : null,
        name: name || (ingredient ? ingredient.name : ''),
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit: UNIT_SET.has(source.unit) ? source.unit : (ingredient ? ingredient.unit : 'шт'),
        category: categoryOf(ingredient ? ingredient.id : null, source.category),
        storage: storageOf(ingredient ? ingredient.id : null, source.storage),
        expires: isValidISODate(source.expires) ? source.expires : null,
        price: Math.max(0, Number(source.price) || 0),
        barcode: cleanScanCode(source.barcode, 64),
        addedAt: isValidISODate(source.addedAt) ? source.addedAt : now
      };
    }).filter((entry) => entry.name);

    const seenShopping = new Set();
    state.shopping = (Array.isArray(raw.shopping) ? raw.shopping : []).slice(0, 500).map((entry) => {
      const source = entry && typeof entry === 'object' ? entry : {};
      const ingredient = ingredientById(source.ingredientId);
      const qty = Math.max(0, Number(source.qty));
      let id = safeStoredId(source.id, 's');
      if (seenShopping.has(id)) id = uid('s');
      seenShopping.add(id);
      return {
        id: id,
        ingredientId: ingredient ? ingredient.id : null,
        name: String(source.name || (ingredient ? ingredient.name : '')).trim().slice(0, 80),
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit: UNIT_SET.has(source.unit) ? source.unit : (ingredient ? ingredient.unit : 'шт'),
        checked: Boolean(source.checked),
        source: source.source === 'plan' || source.source === 'recipe' ? source.source : 'manual',
        price: Math.max(0, Number(source.price) || 0)
      };
    }).filter((entry) => entry.name);

    state.plan = {};
    if (raw.plan && typeof raw.plan === 'object') {
      Object.keys(raw.plan).slice(0, 60).forEach((date) => {
        if (!isValidISODate(date)) return;
        const day = raw.plan[date];
        if (!day || typeof day !== 'object') return;
        const clean = {};
        DATA.MEAL_ORDER.forEach((meal) => {
          if (typeof day[meal] === 'string' && recipeById(day[meal])) clean[meal] = day[meal];
        });
        if (Object.keys(clean).length) state.plan[date] = clean;
      });
    }

    const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    state.stats.cooked = Math.max(0, Math.round(Number(stats.cooked) || 0));
    if (stats.history && typeof stats.history === 'object') {
      Object.keys(stats.history).slice(0, 400).forEach((date) => {
        if (!isValidISODate(date)) return;
        const item = stats.history[date] || {};
        state.stats.history[date] = {
          count: Math.max(0, Math.round(Number(item.count) || 0)),
          value: Math.max(0, Number(item.value) || 0)
        };
      });
    }
    return state;
  }

  function pantryEntries(state, ingredientId) {
    return state.pantry
      .filter((item) => item.ingredientId === ingredientId && item.qty > 0)
      .sort((a, b) => {
        if (!a.expires && !b.expires) return a.name.localeCompare(b.name, 'ru');
        if (!a.expires) return 1;
        if (!b.expires) return -1;
        return a.expires.localeCompare(b.expires);
      });
  }

  function compareLots(a, b) {
    if (!a.expires && !b.expires) return a.name.localeCompare(b.name, 'ru');
    if (!a.expires) return 1;
    if (!b.expires) return -1;
    return a.expires.localeCompare(b.expires) || a.name.localeCompare(b.name, 'ru');
  }

  function activePantryLots(state) {
    return state.pantry
      .filter((item) => item && Number(item.qty) > 0)
      .map((item) => Object.assign({}, item))
      .sort(compareLots);
  }

  /*
   * Списывает количество из копий продуктов на полке по FEFO.
   * Просроченные на дату приёма пищи лоты не участвуют.
   * Возвращает остаток, который докупить.
   */
  function takeFromLots(lots, ingredientId, qty, unit, date) {
    const todayDate = date || todayISO();
    let remaining = Number(qty);
    if (!Number.isFinite(remaining) || remaining <= 0) return 0;
    for (let index = 0; index < lots.length && remaining > EPSILON; index += 1) {
      const lot = lots[index];
      if (lot.ingredientId !== ingredientId || !(Number(lot.qty) > 0)) continue;
      if (expiryState(lot.expires, todayDate).tone === 'expired') continue;
      const take = Math.min(lot.qty, convertQty(remaining, unit, lot.unit));
      if (!Number.isFinite(take) || take <= 0) continue;
      const taken = convertQty(take, lot.unit, unit);
      if (!Number.isFinite(taken)) continue;
      lot.qty = Math.round(Math.max(0, lot.qty - take) * 100) / 100;
      remaining = Math.round(Math.max(0, remaining - taken) * 100) / 100;
    }
    return remaining;
  }

  function consumeRecipeFromLots(lots, recipe, servings, date) {
    const scale = (Number(servings) || recipe.servings) / recipe.servings;
    (recipe.ingredients || []).forEach((ingredient) => {
      if (ingredient.optional) return;
      const meta = ingredientById(ingredient.id);
      const unit = ingredient.unit || (meta ? meta.unit : 'шт');
      takeFromLots(lots, ingredient.id, ingredient.qty * scale, unit, date);
    });
  }

  function availableQty(state, ingredientId, unit, today) {
    if (!state || !Array.isArray(state.pantry)) return 0;
    const meta = ingredientById(ingredientId);
    const target = unit || (meta ? meta.unit : 'шт');
    const todayDate = today || todayISO();
    let total = 0;
    state.pantry.forEach((item) => {
      if (item.ingredientId !== ingredientId || !(Number(item.qty) > 0)) return;
      if (expiryState(item.expires, todayDate).tone === 'expired') return;
      const converted = convertQty(item.qty, item.unit, target);
      if (converted !== null && Number.isFinite(converted)) total += converted;
    });
    return total;
  }

  function hasIngredient(state, ingredientId, qty, unit, today) {
    const available = availableQty(state, ingredientId, unit, today);
    const required = Number(qty);
    if (!Number.isFinite(required) || required <= 0) return available > 0;
    return available + EPSILON >= required;
  }

  function matchRecipe(recipe, state, today, servings) {
    const todayDate = today || todayISO();
    const scale = (Number(servings) || recipe.servings) / recipe.servings;
    const required = (recipe.ingredients || []).filter((ingredient) => !ingredient.optional);
    const core = required.filter((ingredient) => {
      const meta = ingredientById(ingredient.id);
      return !meta || !meta.staple;
    });
    const missing = [];
    const missingBlocking = [];
    const present = [];
    let rescue = 0;
    let urgentValue = 0;

    required.forEach((ingredient) => {
      const meta = ingredientById(ingredient.id);
      const unit = ingredient.unit || (meta ? meta.unit : 'шт');
      const entries = pantryEntries(state, ingredient.id).filter((item) => {
        return expiryState(item.expires, todayDate).tone !== 'expired';
      });
      const enough = hasIngredient(state, ingredient.id, ingredient.qty * scale, unit, todayDate);
      if (enough) {
        present.push(ingredient);
        const urgentEntry = entries.find((item) => {
          const expiry = expiryState(item.expires, todayDate);
          return expiry.tone === 'today' || expiry.tone === 'soon';
        });
        if (urgentEntry) {
          rescue += 1;
          urgentValue += urgentEntry.price || 0;
        }
      } else {
        missing.push(ingredient);
        if (!meta || !meta.staple) missingBlocking.push(ingredient);
      }
    });

    const totalCore = core.length || required.length || 1;
    const presentCore = core.filter((ingredient) => present.some((item) => item.id === ingredient.id)).length;
    const score = Math.max(0, Math.min(1, presentCore / totalCore));
    const canCook = missingBlocking.length === 0;

    return {
      score: score,
      percent: Math.round(score * 100),
      present: present.length,
      total: required.length,
      coreTotal: totalCore,
      corePresent: presentCore,
      missing: missing,
      missingBlocking: missingBlocking,
      canCook: canCook,
      rescue: rescue,
      urgentValue: Math.round(urgentValue)
    };
  }

  function recipeMatchesDiet(recipe, diet) {
    if (!diet || diet === 'all') return true;
    if (diet === 'vegetarian') return recipe.tags.includes('vegetarian') || recipe.tags.includes('vegan');
    if (diet === 'vegan') return recipe.tags.includes('vegan');
    if (diet === 'glutenFree') return recipe.tags.includes('glutenFree');
    return true;
  }

  function searchText(recipe) {
    return normalizeName([
      recipe.title,
      recipe.description,
      ...(recipe.ingredients || []).map((item) => {
        const meta = ingredientById(item.id);
        return meta ? meta.name + ' ' + (meta.aliases || []).join(' ') : '';
      })
    ].join(' '));
  }

  function rankRecipes(state, filters, today) {
    const options = filters || {};
    const query = normalizeName(options.query || '');
    const tag = options.tag || 'all';
    const sort = options.sort || 'match';
    const todayDate = today || todayISO();
    const ranked = [];

    DATA.RECIPES.forEach((recipe) => {
      if (query && searchText(recipe).indexOf(query) === -1) return;
      if (tag === 'quick' && !recipe.tags.includes('quick')) return;
      if (tag === 'vegetarian' && !recipe.tags.includes('vegetarian') && !recipe.tags.includes('vegan')) return;
      if (tag === 'vegan' && !recipe.tags.includes('vegan')) return;
      if (tag === 'glutenFree' && !recipe.tags.includes('glutenFree')) return;
      const coverage = matchRecipe(recipe, state, todayDate, state.settings.servings);
      if (tag === 'ready' && coverage.missingBlocking.length > 0) return;
      if (tag === 'almost' && coverage.missingBlocking.length > 1) return;
      ranked.push({ recipe: recipe, match: coverage });
    });

    ranked.sort((a, b) => {
      if (sort === 'title') return a.recipe.title.localeCompare(b.recipe.title, 'ru');
      if (sort === 'time') return a.recipe.time - b.recipe.time || b.match.score - a.match.score;
      if (sort === 'rescue') return b.match.rescue - a.match.rescue || b.match.score - a.match.score || a.recipe.time - b.recipe.time;
      return b.match.score - a.match.score || a.match.missingBlocking.length - b.match.missingBlocking.length ||
        b.match.rescue - a.match.rescue || a.recipe.time - b.recipe.time || a.recipe.title.localeCompare(b.recipe.title, 'ru');
    });
    return ranked;
  }

  function estimateCost(ingredientId, qty, unit) {
    const meta = ingredientById(ingredientId);
    if (!meta) return 0;
    const amount = Number(qty) || 0;
    if (meta.base === 'kg') {
      if (unit === 'кг') return amount * meta.price;
      if (unit === 'г') return (amount / 1000) * meta.price;
    }
    if (meta.base === 'l') {
      if (unit === 'л') return amount * meta.price;
      if (unit === 'мл') return (amount / 1000) * meta.price;
    }
    if (meta.base === 'pcs') return amount * meta.price;
    return 0;
  }

  function recipeCost(recipe, servings) {
    const scale = servings ? servings / recipe.servings : 1;
    return Math.round(recipe.ingredients.reduce((sum, ingredient) => sum + estimateCost(ingredient.id, ingredient.qty * scale, ingredient.unit || (ingredientById(ingredient.id) || {}).unit), 0));
  }

  function convertQty(qty, from, to) {
    if (from === to) return Number(qty) || 0;
    if (MASS[from] && MASS[to]) return (Number(qty) * MASS[from]) / MASS[to];
    if (VOLUME[from] && VOLUME[to]) return (Number(qty) * VOLUME[from]) / VOLUME[to];
    return null;
  }

  function collectRecipeMissing(recipe, state, servings, today) {
    const todayDate = today || todayISO();
    const scale = (Number(servings) || recipe.servings) / recipe.servings;
    const missing = [];
    (recipe.ingredients || []).forEach((ingredient) => {
      if (ingredient.optional) return;
      const meta = ingredientById(ingredient.id);
      const unit = ingredient.unit || (meta ? meta.unit : 'шт');
      const needed = ingredient.qty * scale;
      const available = availableQty(state, ingredient.id, unit, todayDate);
      const deficit = needed - available;
      if (deficit <= EPSILON) return;
      const qty = Math.round((deficit + Number.EPSILON) * 100) / 100;
      missing.push({
        ingredientId: ingredient.id,
        name: meta ? meta.name : ingredient.id,
        qty: qty,
        unit: unit,
        category: meta ? meta.category : 'Другое',
        price: Math.round(estimateCost(ingredient.id, qty, unit)),
        source: 'recipe'
      });
    });
    return missing;
  }

  function collectPlanMissing(state, startDate, days, today) {
    const start = startDate || today || todayISO();
    const span = typeof days === 'number' ? days : 7;
    const servings = state.settings.servings;
    const lots = activePantryLots(state);
    const missing = new Map();

    for (let index = 0; index < span; index += 1) {
      const date = addDays(start, index);
      const day = state.plan[date];
      if (!day) continue;
      DATA.MEAL_ORDER.forEach((meal) => {
        const recipe = recipeById(day[meal]);
        if (!recipe) return;
        const scale = (Number(servings) || recipe.servings) / recipe.servings;
        (recipe.ingredients || []).forEach((ingredient) => {
          if (ingredient.optional) return;
          const meta = ingredientById(ingredient.id);
          const unit = ingredient.unit || (meta ? meta.unit : 'шт');
          const deficit = takeFromLots(lots, ingredient.id, ingredient.qty * scale, unit, date);
          if (deficit <= EPSILON) return;
          const key = ingredient.id + '|' + unit;
          let entry = missing.get(key);
          if (!entry) {
            entry = {
              ingredientId: ingredient.id,
              name: meta ? meta.name : ingredient.id,
              unit: unit,
              category: meta ? meta.category : 'Другое',
              qty: 0,
              sources: []
            };
            missing.set(key, entry);
          }
          entry.qty += deficit;
          if (entry.sources.indexOf(recipe.title) === -1) entry.sources.push(recipe.title);
        });
      });
    }

    return Array.from(missing.values()).map((entry) => {
      const qty = Math.round((entry.qty + Number.EPSILON) * 100) / 100;
      return {
        ingredientId: entry.ingredientId,
        name: entry.name,
        qty: qty,
        unit: entry.unit,
        category: entry.category,
        price: Math.round(estimateCost(entry.ingredientId, qty, entry.unit)),
        source: 'plan',
        sources: entry.sources
      };
    });
  }

  function scaledPrice(item, addition, nextQty) {
    const currentQty = Number(item.qty) || 0;
    const currentPrice = Number(item.price) || 0;
    const addedQty = Number(addition.qty) || 0;
    const addedPrice = Number(addition.price) || 0;
    const unitPrice = currentQty > 0 && currentPrice > 0
      ? currentPrice / currentQty
      : (addedQty > 0 ? addedPrice / addedQty : 0);
    return Math.round(unitPrice * nextQty);
  }

  function mergeShopping(list, additions, mode, today) {
    const result = list.map((item) => Object.assign({}, item));
    let added = 0;
    let updated = 0;
    let removed = 0;
    let unchecked = 0;
    const targetKeys = new Set();

    additions.forEach((addition) => {
      const key = (addition.ingredientId || normalizeName(addition.name)) + '|' + addition.unit;
      targetKeys.add(key);
      const addQty = Math.round((Number(addition.qty) || 0) * 100) / 100;
      const existing = result.find((item) => {
        const itemKey = (item.ingredientId || normalizeName(item.name)) + '|' + item.unit;
        return itemKey === key;
      });

      if (!existing) {
        result.push({
          id: uid('s'),
          ingredientId: addition.ingredientId || null,
          name: addition.name,
          qty: addQty,
          unit: addition.unit,
          checked: false,
          source: addition.source || 'plan',
          price: Math.round(addition.price || 0)
        });
        added += 1;
        return;
      }

      /*
       * Отмеченное уже куплено. Если план или рецепт требует больше,
       * отметку снимаем: иначе список молча покажет «всё куплено».
       */
      if (existing.checked) {
        if (addQty <= existing.qty + EPSILON) return;
        const nextQty = addQty;
        existing.price = scaledPrice(existing, addition, nextQty);
        existing.qty = nextQty;
        existing.checked = false;
        if (addition.source === 'recipe' && existing.source === 'plan') existing.source = 'recipe';
        unchecked += 1;
        updated += 1;
        return;
      }

      if (mode === 'sync') {
        if (existing.source === 'plan') {
          const nextQty = addQty;
          const nextPrice = Math.round(Number(addition.price) || 0);
          if (nextQty !== existing.qty || nextPrice !== (existing.price || 0)) {
            existing.qty = nextQty;
            existing.price = nextPrice;
            updated += 1;
          }
          return;
        }
        if (addQty <= existing.qty + EPSILON) return;
        const nextQty = addQty;
        existing.price = scaledPrice(existing, addition, nextQty);
        existing.qty = nextQty;
        updated += 1;
        return;
      }

      existing.qty = Math.round((existing.qty + addQty) * 100) / 100;
      existing.price = Math.round((existing.price || 0) + (Number(addition.price) || 0));
      if (addition.source === 'recipe' && existing.source === 'plan') existing.source = 'recipe';
      updated += 1;
    });

    if (mode === 'sync') {
      for (let index = result.length - 1; index >= 0; index -= 1) {
        const item = result[index];
        const key = (item.ingredientId || normalizeName(item.name)) + '|' + item.unit;
        if (item.source === 'plan' && !item.checked && !targetKeys.has(key)) {
          result.splice(index, 1);
          removed += 1;
        }
      }
    }

    return { list: result, added: added, updated: updated, removed: removed, unchecked: unchecked };
  }

  function shoppingSummary(items) {
    const summary = { total: 0, checkedTotal: 0, uncheckedTotal: 0, count: items.length, checked: 0, unchecked: 0, unknown: 0 };
    items.forEach((item) => {
      const price = Math.round(Number(item.price) || 0);
      summary.total += price;
      if (item.checked) {
        summary.checked += 1;
        summary.checkedTotal += price;
      } else {
        summary.unchecked += 1;
        summary.uncheckedTotal += price;
      }
      if (!price) summary.unknown += 1;
    });
    return summary;
  }

  function applyCheckedToPantry(state, today) {
    const todayDate = today || todayISO();
    const pantry = state.pantry.map((item) => Object.assign({}, item));
    const moved = [];
    const keep = [];

    state.shopping.forEach((item) => {
      if (!item.checked) {
        keep.push(item);
        return;
      }
      moved.push(item);
      const meta = ingredientById(item.ingredientId);
      const existing = pantry.find((product) => {
        if (item.ingredientId && product.ingredientId === item.ingredientId && product.unit === item.unit) return true;
        return normalizeName(product.name) === normalizeName(item.name) && product.unit === item.unit;
      });
      const shelfLife = meta ? meta.shelfLife : 7;
      const newExpires = addDays(todayDate, shelfLife);
      if (existing) {
        existing.qty = Math.round((existing.qty + item.qty) * 100) / 100;
        existing.price = Math.round((existing.price || 0) + (item.price || 0));
        if (existing.expires !== null) existing.expires = maxISO(existing.expires, newExpires);
      } else {
        pantry.push({
          id: uid('p'),
          ingredientId: item.ingredientId || null,
          name: meta ? meta.name : item.name,
          qty: item.qty,
          unit: item.unit,
          category: categoryOf(item.ingredientId, 'Другое'),
          storage: storageOf(item.ingredientId, 'pantry'),
          expires: newExpires,
          price: Math.round(item.price || 0),
          addedAt: todayDate
        });
      }
    });

    return { pantry: pantry, shopping: keep, moved: moved };
  }

  function planCooking(recipe, state, servings, today) {
    const todayDate = today || todayISO();
    const scale = (Number(servings) || recipe.servings) / recipe.servings;
    const deductions = [];
    const shortages = [];
    const used = [];

    (recipe.ingredients || []).forEach((ingredient) => {
      if (ingredient.optional) return;
      let remaining = ingredient.qty * scale;
      if (remaining <= 0) return;
      const unit = ingredient.unit || (ingredientById(ingredient.id) || {}).unit || 'шт';
      const entries = pantryEntries(state, ingredient.id).filter((item) => {
        return expiryState(item.expires, todayDate).tone !== 'expired';
      });
      let taken = false;

      entries.forEach((item) => {
        if (remaining <= EPSILON) return;
        const converted = convertQty(remaining, unit, item.unit);
        if (converted === null) return;
        const take = Math.min(item.qty, converted);
        if (take <= 0) return;
        remaining -= convertQty(take, item.unit, unit) || 0;
        taken = true;
        const after = Math.max(0, item.qty - take);
        const expiry = expiryState(item.expires, todayDate);
        const urgent = expiry.tone === 'today' || expiry.tone === 'soon';
        deductions.push({
          itemId: item.id,
          name: item.name,
          take: Math.round(take * 100) / 100,
          unit: item.unit,
          before: item.qty,
          after: Math.round(after * 100) / 100,
          remove: after <= EPSILON,
          urgent: urgent,
          value: Math.round((item.price || 0) * (take / item.qty))
        });
      });

      if (taken) used.push(ingredient.id);
      if (remaining > EPSILON) {
        shortages.push({
          ingredientId: ingredient.id,
          name: (ingredientById(ingredient.id) || {}).name || ingredient.id,
          qty: Math.round((remaining + Number.EPSILON) * 100) / 100,
          unit: unit
        });
      }
    });

    const urgentItems = deductions.filter((item) => item.urgent);
    const uniqueUrgent = new Set(urgentItems.map((item) => item.itemId));
    return {
      deductions: deductions,
      used: used,
      shortages: shortages,
      urgentCount: uniqueUrgent.size,
      savedValue: urgentItems.reduce((sum, item) => sum + item.value, 0)
    };
  }

  function addCookedStats(state, report, today) {
    const date = today || todayISO();
    state.stats.cooked = (state.stats.cooked || 0) + 1;
    const entry = state.stats.history[date] || { count: 0, value: 0 };
    entry.count += report.urgentCount || 0;
    entry.value += Math.round(report.savedValue || 0);
    state.stats.history[date] = entry;
  }

  function historyWindow(state, today, days) {
    const end = today || todayISO();
    const span = days || 7;
    const result = [];
    for (let offset = span - 1; offset >= 0; offset -= 1) {
      const date = addDays(end, -offset);
      const item = state.stats.history[date] || { count: 0, value: 0 };
      result.push({ date: date, count: item.count, value: item.value });
    }
    return result;
  }

  function statsSummary(state, today) {
    const todayDate = today || todayISO();
    let totalValue = 0;
    let riskValue = 0;
    let expiring = 0;
    let expired = 0;
    state.pantry.forEach((item) => {
      totalValue += Number(item.price) || 0;
      const expiry = expiryState(item.expires, todayDate);
      if (expiry.tone === 'expired') {
        expired += 1;
        riskValue += Number(item.price) || 0;
      } else if (expiry.tone === 'today' || expiry.tone === 'soon') {
        expiring += 1;
        riskValue += Number(item.price) || 0;
      }
    });
    const history = historyWindow(state, todayDate, 7);
    const savedWeek = history.reduce((acc, item) => ({ count: acc.count + item.count, value: acc.value + item.value }), { count: 0, value: 0 });
    return {
      pantryCount: state.pantry.length,
      totalValue: Math.round(totalValue),
      riskValue: Math.round(riskValue),
      expiring: expiring,
      expired: expired,
      savedWeek: savedWeek,
      history: history,
      cooked: state.stats.cooked || 0
    };
  }

  function planOverview(state, today) {
    const start = today || todayISO();
    const days = [];
    let meals = 0;
    const used = new Set();
    const missing = collectPlanMissing(state, start, 7, start);
    const lots = activePantryLots(state);
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(start, offset);
      const day = state.plan[date] || {};
      const slots = {};
      DATA.MEAL_ORDER.forEach((meal) => {
        const recipe = recipeById(day[meal]);
        if (!recipe) {
          slots[meal] = null;
          return;
        }
        meals += 1;
        used.add(recipe.id);
        slots[meal] = {
          recipe: recipe,
          match: matchRecipe(recipe, Object.assign({}, state, { pantry: lots }), date, state.settings.servings)
        };
        consumeRecipeFromLots(lots, recipe, state.settings.servings, date);
      });
      days.push({
        date: date,
        weekday: weekdayShort(date),
        weekdayLong: weekdayLong(date),
        day: Number(date.slice(8, 10)),
        month: formatDateLong(date).replace(/^\d+\s+/, ''),
        isToday: date === start,
        slots: slots
      });
    }
    const cost = missing.reduce((sum, item) => sum + (item.price || 0), 0);
    return {
      days: days,
      meals: meals,
      unique: used.size,
      missing: missing.length,
      cost: Math.round(cost),
      missingItems: missing,
      servings: state.settings.servings
    };
  }

  function generatePlan(state, options, today) {
    const opts = options || {};
    const start = opts.startDate || today || todayISO();
    const seed = opts.seed || state.demoSeed || 19;
    const diet = opts.diet || state.settings.diet || 'all';
    const maxTime = opts.maxTime !== undefined ? Number(opts.maxTime) : Number(state.settings.maxTime) || 0;
    const span = opts.days || 7;
    let rngState = seed >>> 0;
    const rng = function () {
      rngState += 0x6D2B79F5;
      let t = rngState;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const usage = {};
    const plan = {};

    for (let offset = 0; offset < span; offset += 1) {
      const date = addDays(start, offset);
      const day = {};
      DATA.MEAL_ORDER.forEach((meal) => {
        let candidates = DATA.RECIPES.filter((recipe) => {
          if (!recipe.meal.includes(meal)) return false;
          if (!recipeMatchesDiet(recipe, diet)) return false;
          if (maxTime && recipe.time > maxTime) return false;
          return true;
        });
        if (!candidates.length) return;
        const sameDay = new Set(Object.values(day));
        const scored = candidates.map((recipe) => {
          const match = matchRecipe(recipe, state, date, state.settings.servings);
          const repeat = usage[recipe.id] || 0;
          const same = sameDay.has(recipe.id) ? 1 : 0;
          const score = match.score * 55 +
            (match.missingBlocking.length === 0 ? 24 : 0) +
            match.rescue * 14 -
            repeat * 55 -
            (repeat >= 2 ? 70 : 0) -
            same * 20 -
            recipe.time * 0.04 +
            rng() * 7;
          return { recipe: recipe, score: score };
        }).sort((a, b) => b.score - a.score);
        const chosen = scored[0].recipe;
        day[meal] = chosen.id;
        usage[chosen.id] = (usage[chosen.id] || 0) + 1;
      });
      if (Object.keys(day).length) plan[date] = day;
    }
    return plan;
  }

  function getHero(state, today) {
    const todayDate = today || todayISO();
    const expiry = [];
    state.pantry.forEach((item) => {
      const status = expiryState(item.expires, todayDate);
      if (status.tone === 'today' || status.tone === 'soon') {
        expiry.push({ item: item, status: status });
      }
    });
    expiry.sort((a, b) => {
      if (a.status.days === null) return 1;
      if (b.status.days === null) return -1;
      return a.status.days - b.status.days;
    });

    let dinner = null;
    let dinnerSource = 'suggestion';
    const planned = recipeById((state.plan[todayDate] || {}).dinner);
    if (planned) {
      dinner = planned;
      dinnerSource = 'plan';
    } else {
      const ranked = rankRecipes(state, { tag: 'all', sort: 'rescue' }, todayDate);
      if (ranked.length) dinner = ranked[0].recipe;
    }

    return {
      expiring: expiry.slice(0, 3),
      expiringCount: expiry.length,
      dinner: dinner,
      dinnerMatch: dinner ? matchRecipe(dinner, state, todayDate, state.settings.servings) : null,
      dinnerSource: dinnerSource,
      stats: statsSummary(state, todayDate)
    };
  }

  function pantryGroups(state, filters, today) {
    const opts = filters || {};
    const query = normalizeName(opts.query || '');
    const category = opts.category || 'all';
    const storage = opts.storage || 'all';
    const sort = opts.sort || 'expiry';
    const todayDate = today || todayISO();
    const groups = Object.create(null);

    state.pantry.forEach((item) => {
      if (query && normalizeName(item.name).indexOf(query) === -1) return;
      if (category !== 'all' && item.category !== category) return;
      const storageId = own(DATA.STORAGES, item.storage) ? item.storage : 'pantry';
      if (storage !== 'all' && storageId !== storage) return;
      if (!groups[storageId]) groups[storageId] = [];
      groups[storageId].push(item);
    });

    return Object.keys(DATA.STORAGES).map((id) => {
      const items = (groups[id] || []).slice();
      items.sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name, 'ru');
        if (sort === 'price') return (b.price || 0) - (a.price || 0) || a.name.localeCompare(b.name, 'ru');
        const ea = expiryState(a.expires, todayDate);
        const eb = expiryState(b.expires, todayDate);
        const da = ea.days === null ? 100000 : ea.days;
        const db = eb.days === null ? 100000 : eb.days;
        return da - db || a.name.localeCompare(b.name, 'ru');
      });
      return {
        id: id,
        label: DATA.STORAGES[id].label,
        items: items,
        value: Math.round(items.reduce((sum, item) => sum + (Number(item.price) || 0), 0))
      };
    }).filter((group) => group.items.length > 0);
  }

  global.POLKA_ENGINE = {
    todayISO: todayISO,
    isValidISODate: isValidISODate,
    parseISO: parseISO,
    addDays: addDays,
    daysUntil: daysUntil,
    maxISO: maxISO,
    normalizeName: normalizeName,
    stem: stem,
    ingredientById: ingredientById,
    recipeById: recipeById,
    resolveIngredient: resolveIngredient,
    categoryOf: categoryOf,
    storageOf: storageOf,
    storageLabel: storageLabel,
    mealLabel: mealLabel,
    tagLabel: tagLabel,
    pluralRu: pluralRu,
    formatNumber: formatNumber,
    formatMoney: formatMoney,
    formatQty: formatQty,
    formatDateShort: formatDateShort,
    formatDateNumeric: formatDateNumeric,
    formatDateLong: formatDateLong,
    formatDateWithWeekday: formatDateWithWeekday,
    weekdayShort: weekdayShort,
    weekdayLong: weekdayLong,
    expiryState: expiryState,
    uid: uid,
    clone: clone,
    parseScanPayload: parseScanPayload,
    cleanScanCode: cleanScanCode,
    emptyState: emptyState,
    normalizeState: normalizeState,
    pantryEntries: pantryEntries,
    availableQty: availableQty,
    hasIngredient: hasIngredient,
    matchRecipe: matchRecipe,
    recipeMatchesDiet: recipeMatchesDiet,
    rankRecipes: rankRecipes,
    estimateCost: estimateCost,
    recipeCost: recipeCost,
    convertQty: convertQty,
    collectRecipeMissing: collectRecipeMissing,
    collectPlanMissing: collectPlanMissing,
    mergeShopping: mergeShopping,
    shoppingSummary: shoppingSummary,
    applyCheckedToPantry: applyCheckedToPantry,
    planCooking: planCooking,
    addCookedStats: addCookedStats,
    historyWindow: historyWindow,
    statsSummary: statsSummary,
    planOverview: planOverview,
    generatePlan: generatePlan,
    getHero: getHero,
    pantryGroups: pantryGroups
  };
})(window);
