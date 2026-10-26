/*
 * ПОЛКА · экран «Полка».
 * Сводка, спасательная заметка, поиск и группы по зонам хранения.
 * Добавление и правка продукта — в шторке, состояние — только через store.
 */

import * as store from '../store.js';
import {
  DATA, E, esc, icon, money, qty, plural, capitalize, debounce,
  render as renderHTML, emptyState, expiryBadge, focusFirstError,
  toast, openSheet, confirmSheet
} from '../ui.js';
import { createScanner, isScannerSupported } from '../scanner.js';
import * as lookup from '../lookup.js';
import { track } from '../analytics.js';

const FILTER_DEFAULTS = { query: '', category: 'all', storage: 'all', sort: 'expiry', soon: false };
const SORT_LABELS = { expiry: 'по сроку', name: 'по названию', price: 'по цене' };
const PRODUCT_WORDS = ['продукт', 'продукта', 'продуктов'];

let filters = Object.assign({}, FILTER_DEFAULTS);

function isFiltered() {
  return Boolean(filters.query) ||
    filters.category !== 'all' ||
    filters.storage !== 'all' ||
    filters.soon;
}

function activeFilterCount() {
  return (filters.category !== 'all' ? 1 : 0) + (filters.sort !== 'expiry' ? 1 : 0);
}

function resetFilters() {
  filters = Object.assign({}, FILTER_DEFAULTS);
}

function isUrgent(item, today) {
  const tone = E.expiryState(item.expires, today).tone;
  return tone === 'expired' || tone === 'today' || tone === 'soon';
}

function listNames(items, limit) {
  const names = items.slice(0, limit).map(function (item) { return esc(item.name); });
  if (!names.length) return '';
  if (items.length > limit) {
    return names.join(', ') + ' и\u00A0ещё\u00A0' + (items.length - limit);
  }
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' и ' + names[1];
  return names.slice(0, -1).join(', ') + ' и ' + names[names.length - 1];
}

function urgentItems(state, today) {
  return state.pantry
    .filter(function (item) { return isUrgent(item, today); })
    .sort(function (a, b) {
      const da = E.expiryState(a.expires, today).days;
      const db = E.expiryState(b.expires, today).days;
      return da - db || a.name.localeCompare(b.name, 'ru');
    });
}

/* ── Разметка ───────────────────────────────────────────────────── */

function summaryHTML(state, today) {
  const stats = E.statsSummary(state, today);
  return '<div class="summary-grid pantry-summary" role="group" aria-label="Сводка полки">' +
    '<div class="summary-grid__item">' +
      '<span class="summary-grid__value">' + esc(stats.pantryCount) + '</span>' +
      '<span class="summary-grid__label">' + esc(plural(stats.pantryCount, PRODUCT_WORDS)) + '</span>' +
    '</div>' +
    '<div class="summary-grid__item">' +
      '<span class="summary-grid__value">' + esc(money(stats.totalValue)) + '</span>' +
      '<span class="summary-grid__label">стоимость полки</span>' +
    '</div>' +
    '<div class="summary-grid__item">' +
      '<span class="summary-grid__value">' + esc(stats.expiring) + '</span>' +
      '<span class="summary-grid__label">скоро срок</span>' +
    '</div>' +
  '</div>';
}

function rescueHTML(state, today) {
  const urgent = urgentItems(state, today);
  if (!urgent.length) {
    if (!state.pantry.length) return '';
    return '<p class="pantry-quiet">' + icon('leaf') +
      '<span>Со сроками спокойно — на этой неделе ничего не горит.</span></p>';
  }

  const expired = urgent.filter(function (item) { return E.expiryState(item.expires, today).tone === 'expired'; });
  const soon = urgent.filter(function (item) {
    const tone = E.expiryState(item.expires, today).tone;
    return tone === 'today' || tone === 'soon';
  });
  const bits = [];
  if (expired.length) bits.push('Просрочено: ' + listNames(expired, 3) + '.');
  if (soon.length) bits.push('Срок подходит: ' + listNames(soon, 3) + '.');
  const tone = expired.length ? 'note--danger' : 'note--warn';

  return '<section class="note ' + tone + ' pantry-rescue" aria-labelledby="pantry-rescue-title">' +
    '<p class="note__title" id="pantry-rescue-title">' +
      (soon.length ? 'Сначала спасите' : 'Проверьте просроченное') +
    '</p>' +
    '<p class="note__text">' + capitalize(bits.join(' ')) + '</p>' +
    '<div class="note__action">' +
      '<button class="btn btn--ghost btn--small pantry-rescue__action" type="button" data-action="rescue">' +
        icon('clock') + ' Показать со сроком · ' + urgent.length +
      '</button>' +
    '</div>' +
  '</section>';
}

function toolbarHTML() {
  const count = activeFilterCount();
  return '<div class="pantry-toolbar">' +
    '<div class="search-field">' +
      icon('search') +
      '<input id="pantry-search" type="search" value="' + esc(filters.query) + '" ' +
        'placeholder="Найти продукт" aria-label="Поиск по полке" autocomplete="off" enterkeyhint="search">' +
      '<button class="search-field__clear" type="button" data-action="clear-search" aria-label="Очистить поиск"' +
        (filters.query ? '' : ' hidden') + '>' + icon('close') + '</button>' +
    '</div>' +
    '<button class="btn btn--ghost pantry-filter-btn" type="button" data-action="filters" aria-haspopup="dialog" aria-label="Фильтры">' +
      icon('filter') + '<span>Фильтры</span>' +
      '<span class="pantry-filter-btn__count" data-filter-count' + (count ? '' : ' hidden') + '>' + count + '</span>' +
    '</button>' +
  '</div>';
}

function chipsHTML() {
  const storageChips = Object.keys(DATA.STORAGES).map(function (id) {
    const storage = DATA.STORAGES[id];
    const pressed = !filters.soon && filters.storage === id;
    return '<button class="chip" type="button" data-storage="' + esc(id) + '" aria-pressed="' + pressed + '">' +
      esc(storage.label) + '</button>';
  }).join('');

  return '<div class="chips pantry-chips" role="group" aria-label="Фильтр по месту хранения">' +
    '<button class="chip" type="button" data-storage="all" aria-pressed="' + (!filters.soon && filters.storage === 'all') + '">Все</button>' +
    storageChips +
    '<button class="chip chip--danger" type="button" data-soon="1" aria-pressed="' + filters.soon + '">Скоро срок</button>' +
  '</div>';
}

function filterStatusHTML() {
  const parts = [];
  if (filters.category !== 'all') parts.push(filters.category);
  if (filters.sort !== 'expiry') parts.push(SORT_LABELS[filters.sort]);
  return '<div class="pantry-filter-status" data-filter-status' + (parts.length ? '' : ' hidden') + '>' +
    '<span data-filter-status-text>' + esc(parts.join(' · ')) + '</span>' +
    '<button class="text-link" type="button" data-action="reset-advanced">Сбросить</button>' +
  '</div>';
}

function productRowHTML(item, today) {
  const status = E.expiryState(item.expires, today);
  const expired = status.tone === 'expired';
  const price = Number(item.price) > 0 ? money(item.price) : 'без цены';
  return '<li>' +
    '<button class="list-row pantry-row' + (expired ? ' is-expired' : '') + '" type="button" ' +
      'data-action="edit" data-id="' + esc(item.id) + '">' +
      '<span class="list-row__body">' +
        '<span class="list-row__name">' + esc(item.name) + '</span>' +
        '<span class="list-row__meta">' + esc(qty(item.qty, item.unit)) + ' · ' + esc(item.category) + '</span>' +
      '</span>' +
      '<span class="list-row__tail pantry-row__tail">' +
        expiryBadge(status) +
        '<span class="list-row__sub">' + esc(price) + '</span>' +
      '</span>' +
      '<span class="visually-hidden">Изменить продукт</span>' +
    '</button>' +
  '</li>';
}

function resultsHTML(state, today) {
  const groups = E.pantryGroups(state, {
    query: filters.query,
    category: filters.category,
    storage: filters.storage,
    sort: filters.sort
  }, today).map(function (group) {
    if (!filters.soon) return group;
    const items = group.items.filter(function (item) { return isUrgent(item, today); });
    return {
      id: group.id,
      label: group.label,
      items: items,
      value: Math.round(items.reduce(function (sum, item) { return sum + (Number(item.price) || 0); }, 0))
    };
  }).filter(function (group) { return group.items.length > 0; });

  const count = groups.reduce(function (sum, group) { return sum + group.items.length; }, 0);
  const value = groups.reduce(function (sum, group) { return sum + group.value; }, 0);
  const note = isFiltered()
    ? count + ' из ' + state.pantry.length + ' · ' + money(value)
    : count + ' ' + plural(count, PRODUCT_WORDS) + ' · ' + money(value);

  const head = '<div class="section-head pantry-list-head">' +
    '<h2 class="section-title" id="pantry-list-title">На полке</h2>' +
    '<span class="section-note" data-results-note>' + esc(note) + '</span>' +
  '</div>';

  if (!count) {
    return head + emptyState({
      iconName: 'search',
      title: 'Ничего не нашлось',
      text: 'Попробуйте изменить запрос или сбросить фильтры. Полка при этом не опустела.',
      actionLabel: 'Сбросить фильтры',
      actionAttrs: 'data-action="reset"'
    });
  }

  return head + groups.map(function (group) {
    const storage = DATA.STORAGES[group.id] || { label: group.label, icon: 'shelf' };
    const groupNote = group.items.length + ' ' + plural(group.items.length, PRODUCT_WORDS) + ' · ' + money(group.value);
    return '<section class="pantry-group" aria-labelledby="pantry-group-' + esc(group.id) + '">' +
      '<div class="group-head">' +
        icon(storage.icon) +
        '<h3 class="group-head__name" id="pantry-group-' + esc(group.id) + '">' + esc(storage.label) + '</h3>' +
        '<span class="group-head__meta">' + esc(groupNote) + '</span>' +
      '</div>' +
      '<ul class="list pantry-list">' +
        group.items.map(function (item) { return productRowHTML(item, today); }).join('') +
      '</ul>' +
    '</section>';
  }).join('');
}

function emptyShelfHTML() {
  return '<div class="empty pantry-empty">' +
    '<span class="empty__icon">' + icon('shelf') + '</span>' +
    '<h3 class="empty__title">Полка пока пуста</h3>' +
    '<p class="empty__text">Добавьте первый продукт — ПОЛКА подскажет срок и посчитает стоимость. Или верните демо-кухню, чтобы осмотреться.</p>' +
    '<div class="pantry-empty__actions">' +
      '<button class="btn btn--primary" type="button" data-action="add">' + icon('plus') + ' Добавить продукт</button>' +
      '<button class="btn btn--ghost" type="button" data-action="demo">Вернуть демо</button>' +
    '</div>' +
  '</div>';
}

function screenHTML(state, today) {
  const empty = state.pantry.length === 0;
  return '<div class="screen pantry-screen">' +
    '<header class="screen-head">' +
      '<p class="eyebrow">Кухня · ' + esc(capitalize(E.weekdayLong(today))) + '</p>' +
      '<h1 class="screen-title">Полка</h1>' +
      '<p class="screen-lead">' +
        (empty
          ? 'Здесь будет всё, что лежит на кухне. Начните с одного продукта.'
          : 'Что уже есть — и что стоит приготовить первым, пока оно свежее.') +
      '</p>' +
    '</header>' +
    summaryHTML(state, today) +
    (empty
      ? emptyShelfHTML()
      : rescueHTML(state, today) +
        toolbarHTML() +
        chipsHTML() +
        filterStatusHTML() +
        '<section class="pantry-results" data-results tabindex="-1" aria-labelledby="pantry-list-title">' +
          resultsHTML(state, today) +
        '</section>' +
        '<div class="pantry-add">' +
          '<button class="btn btn--primary btn--block" type="button" data-action="add">' +
            icon('plus') + ' Добавить продукт' +
          '</button>' +
        '</div>') +
  '</div>';
}

/* ── Живые обновления ───────────────────────────────────────────── */

function updateFilterUI(screen) {
  screen.querySelectorAll('[data-storage]').forEach(function (button) {
    const active = !filters.soon && button.getAttribute('data-storage') === filters.storage;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const soon = screen.querySelector('[data-soon]');
  if (soon) soon.setAttribute('aria-pressed', filters.soon ? 'true' : 'false');

  const count = activeFilterCount();
  const badge = screen.querySelector('[data-filter-count]');
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  const status = screen.querySelector('[data-filter-status]');
  if (status) {
    const parts = [];
    if (filters.category !== 'all') parts.push(filters.category);
    if (filters.sort !== 'expiry') parts.push(SORT_LABELS[filters.sort]);
    status.hidden = parts.length === 0;
    const text = status.querySelector('[data-filter-status-text]');
    if (text) text.textContent = parts.join(' · ');
  }
}

function renderResultsOnly(screen) {
  if (!screen || !screen.isConnected) return;
  const host = screen.querySelector('[data-results]');
  if (!host) return;
  host.innerHTML = resultsHTML(store.getState(), store.getToday());
  updateFilterUI(screen);
}

/* ── Шторка продукта ────────────────────────────────────────────── */

function categoryOptions(current) {
  return DATA.CATEGORY_ORDER.map(function (category) {
    return '<option value="' + esc(category) + '"' + (category === current ? ' selected' : '') + '>' +
      esc(category) + '</option>';
  }).join('');
}

function unitOptions(current) {
  return DATA.UNITS.map(function (unit) {
    return '<option value="' + esc(unit) + '"' + (unit === current ? ' selected' : '') + '>' +
      esc(unit) + '</option>';
  }).join('');
}

function storageButtonsHTML(current) {
  return Object.keys(DATA.STORAGES).map(function (id) {
    const storage = DATA.STORAGES[id];
    return '<button type="button" data-storage-option="' + esc(id) + '" aria-pressed="' + (id === current) + '">' +
      esc(storage.label) + '</button>';
  }).join('');
}

function ingredientOptionsHTML() {
  return '<datalist id="pantry-ingredients">' +
    DATA.INGREDIENTS.map(function (item) {
      return '<option value="' + esc(item.name) + '"></option>';
    }).join('') +
  '</datalist>';
}

function defaultQty(meta) {
  if (!meta) return 1;
  if (meta.base === 'kg' || meta.base === 'l') return 500;
  return 1;
}

/* Упаковка из базы («400 g e», «0.5 l») → количество и единица ПОЛКИ. */
function netQuantity(text) {
  const match = String(text || '').replace(',', '.')
    .match(/^~?\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|grams?|ml|cl|l|lt|liters?|литр\w*|кг|г|мл|л)?/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = String(match[2] || '').toLowerCase();
  if (/^(kg|кг)$/.test(unit)) {
    return value >= 1 ? { qty: value, unit: 'кг' } : { qty: Math.round(value * 1000), unit: 'г' };
  }
  if (/^(g|г|gr|grams?)$/.test(unit)) return { qty: value, unit: 'г' };
  if (/^(ml|мл)$/.test(unit)) return { qty: value, unit: 'мл' };
  if (/^cl$/.test(unit)) return { qty: Math.round(value * 10), unit: 'мл' };
  if (/^(l|lt|liters?|литр\w*|л)$/.test(unit)) {
    return value >= 1 ? { qty: value, unit: 'л' } : { qty: Math.round(value * 1000), unit: 'мл' };
  }
  return null;
}

function openProductSheet(item) {
  const editing = Boolean(item);
  const today = store.getToday();
  const current = item || {
    name: '',
    qty: 1,
    unit: 'шт',
    category: 'Другое',
    storage: 'pantry',
    expires: '',
    price: '',
    barcode: ''
  };

  const content =
    '<form class="pantry-form" id="pantry-form" novalidate>' +
      '<div class="pantry-scan">' +
        '<button class="btn btn--ghost btn--block" type="button" data-scan>' +
          icon('scan') + 'Сканировать штрихкод или QR' +
        '</button>' +
        '<p class="field__hint">Наведите камеру на код товара — код и название подставим в карточку.</p>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field__label" for="pantry-name">Название <span>обязательно</span></label>' +
        '<input id="pantry-name" name="name" type="text" list="pantry-ingredients" maxlength="80" ' +
          'autocomplete="off" placeholder="Например, помидоры" value="' + esc(current.name) + '" ' +
          'aria-describedby="pantry-name-hint pantry-name-error pantry-autofill">' +
        '<p class="field__hint" id="pantry-name-hint">' +
          (editing
            ? 'Поля заполнены — поправьте только то, что нужно.'
            : 'Начните вводить название — подставим единицу, категорию, зону, срок и примерную цену.') +
        '</p>' +
        '<p class="pantry-autofill" id="pantry-autofill" data-autofill aria-live="polite" hidden></p>' +
        '<p class="field__error" id="pantry-name-error" data-error="name" hidden></p>' +
      '</div>' +
      '<div class="field-row field-row--qty">' +
        '<div class="field">' +
          '<label class="field__label" for="pantry-qty">Количество</label>' +
          '<input id="pantry-qty" name="qty" type="text" inputmode="decimal" autocomplete="off" ' +
            'value="' + esc(current.qty) + '" aria-describedby="pantry-qty-error">' +
          '<p class="field__error" id="pantry-qty-error" data-error="qty" hidden></p>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="pantry-unit">Единица</label>' +
          '<select id="pantry-unit" name="unit">' + unitOptions(current.unit) + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field__label" for="pantry-category">Категория</label>' +
        '<select id="pantry-category" name="category">' + categoryOptions(current.category) + '</select>' +
      '</div>' +
      '<div class="field">' +
        '<span class="field__label" id="pantry-storage-label">Где хранить</span>' +
        '<div class="segmented" role="group" aria-labelledby="pantry-storage-label">' +
          storageButtonsHTML(current.storage) +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field__label" for="pantry-expires">Срок годности <span>если известен</span></label>' +
        '<input id="pantry-expires" name="expires" type="date" value="' + esc(current.expires || '') + '">' +
        '<div class="quick-dates" role="group" aria-label="Быстрый срок">' +
          '<button type="button" data-days="3">+3 дня</button>' +
          '<button type="button" data-days="7">+7 дней</button>' +
          '<button type="button" data-days="30">+30 дней</button>' +
          '<button type="button" data-days="none">Без срока</button>' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field__label" for="pantry-price">Цена, ₽ <span>можно оставить пустой</span></label>' +
        '<input id="pantry-price" name="price" type="text" inputmode="decimal" autocomplete="off" ' +
          'value="' + esc(current.price || '') + '" aria-describedby="pantry-price-error">' +
        '<p class="field__error" id="pantry-price-error" data-error="price" hidden></p>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field__label" for="pantry-barcode">Штрихкод <span>если есть</span></label>' +
        '<input id="pantry-barcode" name="barcode" type="text" maxlength="64" autocomplete="off" spellcheck="false" ' +
          'value="' + esc(current.barcode || '') + '" aria-describedby="pantry-barcode-hint">' +
        '<p class="field__hint" id="pantry-barcode-hint" data-barcode-hint>Заполнится после сканирования. Можно ввести вручную.</p>' +
        '<button class="btn btn--quiet btn--block" type="button" data-lookup>' +
          icon('search') + '<span data-lookup-label aria-live="polite">Найти название в интернете</span>' +
        '</button>' +
        '<p class="field__hint">Запрос уходит только по нажатию: код — в открытую базу Open Food Facts.</p>' +
      '</div>' +
      '<p class="form-error" data-form-error role="alert" hidden></p>' +
      (editing
        ? '<div class="pantry-form__danger">' +
            '<button class="text-link text-link--danger" type="button" data-delete>' +
              icon('trash') + ' Удалить продукт' +
            '</button>' +
          '</div>'
        : '') +
      ingredientOptionsHTML() +
    '</form>';

  const sheet = openSheet({
    eyebrow: editing ? 'Продукт' : 'Новый продукт',
    title: editing ? item.name : 'Добавить на полку',
    subtitle: editing ? 'Измените количество, срок или цену.' : 'Название обязательно, остальное можно уточнить.',
    content: content,
    footer:
      '<button class="btn btn--ghost" type="button" data-cancel>Отмена</button>' +
      '<button class="btn btn--primary" type="submit" form="pantry-form" data-save>' +
        (editing ? 'Сохранить' : 'Добавить') +
      '</button>',
    initialFocus: '#pantry-name'
  });

  const form = sheet.dialog.querySelector('#pantry-form');
  const nameInput = form.querySelector('#pantry-name');
  const qtyInput = form.querySelector('#pantry-qty');
  const unitSelect = form.querySelector('#pantry-unit');
  const categorySelect = form.querySelector('#pantry-category');
  const expiresInput = form.querySelector('#pantry-expires');
  const priceInput = form.querySelector('#pantry-price');
  const barcodeInput = form.querySelector('#pantry-barcode');
  const barcodeHint = form.querySelector('[data-barcode-hint]');
  const scanButton = form.querySelector('[data-scan]');
  const lookupButton = form.querySelector('[data-lookup]');
  const lookupLabel = form.querySelector('[data-lookup-label]');
  const storageButtons = Array.prototype.slice.call(form.querySelectorAll('[data-storage-option]'));
  const autofill = form.querySelector('[data-autofill]');
  const nameHint = form.querySelector('#pantry-name-hint');
  const formError = form.querySelector('[data-form-error]');
  const saveButton = sheet.footer ? sheet.footer.querySelector('[data-save]') : null;
  const fields = { name: nameInput, qty: qtyInput, price: priceInput };
  const errors = {
    name: form.querySelector('[data-error="name"]'),
    qty: form.querySelector('[data-error="qty"]'),
    price: form.querySelector('[data-error="price"]')
  };
  const touched = {
    qty: editing,
    unit: editing,
    category: editing,
    storage: editing,
    expires: editing,
    price: editing
  };
  let activeMeta = editing
    ? (item.ingredientId ? E.ingredientById(item.ingredientId) : E.resolveIngredient(item.name))
    : null;
  let submitting = false;
  let lookupBusy = false;

  function setStorage(id) {
    storageButtons.forEach(function (button) {
      const active = button.getAttribute('data-storage-option') === id;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setAutofill(text) {
    if (text) {
      autofill.textContent = text;
      autofill.hidden = false;
      nameHint.hidden = true;
    } else {
      autofill.textContent = '';
      autofill.hidden = true;
      nameHint.hidden = false;
    }
  }

  function estimatePrice() {
    if (!activeMeta) return '';
    const amount = Number(qtyInput.value.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return '';
    const estimate = Math.round(E.estimateCost(activeMeta.id, amount, unitSelect.value));
    return estimate > 0 ? estimate : '';
  }

  function applyMeta(meta) {
    if (!meta) {
      setAutofill('');
      return;
    }
    const parts = [];

    if (!touched.unit && DATA.UNITS.indexOf(meta.unit) !== -1) {
      unitSelect.value = meta.unit;
    }
    if (!touched.qty) {
      const amount = defaultQty(meta);
      qtyInput.value = String(amount);
      parts.push(E.formatQty(amount, unitSelect.value));
    }
    if (!touched.category && DATA.CATEGORY_ORDER.indexOf(meta.category) !== -1) {
      categorySelect.value = meta.category;
      parts.push(meta.category);
    }
    if (!touched.storage && DATA.STORAGES[meta.storage]) {
      setStorage(meta.storage);
      parts.push(DATA.STORAGES[meta.storage].label);
    }
    if (!touched.expires) {
      const shelfLife = Number(meta.shelfLife) || 7;
      const date = E.addDays(today, shelfLife);
      expiresInput.value = date;
      parts.push('срок до ' + E.formatDateShort(date));
    }
    if (!touched.price) {
      const estimate = estimatePrice();
      if (estimate) {
        priceInput.value = String(estimate);
        parts.push('≈ ' + money(estimate));
      }
    }

    setAutofill(parts.length
      ? 'Из каталога: ' + parts.join(', ') + '. Проверьте.'
      : 'Продукт из каталога — проверьте поля.');
  }

  function clearError(key) {
    const input = fields[key];
    const error = errors[key];
    if (!input || !error) return;
    error.hidden = true;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  function showError(key, message) {
    const input = fields[key];
    const error = errors[key];
    if (!input || !error) return;
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  }

  function currentStorage() {
    const pressed = storageButtons.find(function (button) {
      return button.getAttribute('aria-pressed') === 'true';
    });
    return pressed ? pressed.getAttribute('data-storage-option') : 'pantry';
  }

  function fillFromName(name, ingredientId) {
    nameInput.value = name;
    activeMeta = ingredientId ? E.ingredientById(ingredientId) : E.resolveIngredient(name);
    if (activeMeta) applyMeta(activeMeta);
    else setAutofill('');
  }

  function setLookupBusy(busy) {
    lookupBusy = busy;
    if (!lookupButton) return;
    lookupButton.disabled = busy;
    lookupButton.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (lookupLabel) lookupLabel.textContent = busy ? 'Ищем в Open Food Facts…' : 'Найти название в интернете';
  }

  function applyLookupProduct(code, info, cached) {
    const source = cached ? 'Из памяти устройства' : 'Из Open Food Facts';
    if (nameInput.value.trim()) {
      toast(source + ': «' + info.name + '». Название уже заполнено — оставили ваше.', { duration: 7000 });
      return;
    }

    fillFromName(info.name, null);

    const parts = [];
    if (info.brand && E.normalizeName(info.brand) !== E.normalizeName(info.name)) parts.push(info.brand);
    const net = netQuantity(info.quantity);
    if (net && !touched.qty && !touched.unit && DATA.UNITS.indexOf(net.unit) !== -1) {
      qtyInput.value = String(net.qty);
      unitSelect.value = net.unit;
      touched.qty = true;
      touched.unit = true;
      if (!touched.price && activeMeta) {
        const estimate = estimatePrice();
        if (estimate) priceInput.value = String(estimate);
      }
      parts.push('в упаковке ' + E.formatQty(net.qty, net.unit));
    } else if (info.quantity) {
      parts.push(info.quantity);
    }

    setAutofill(source + ': ' + (parts.length ? parts.join(' · ') + '. ' : '') + 'Проверьте название и количество.');
    barcodeHint.textContent = 'Код ' + code + (cached ? ' — есть в памяти устройства.' : ' — найден в Open Food Facts.');
    toast(source + ': «' + info.name + '».');
  }

  async function runLookup() {
    if (lookupBusy) return;
    const code = lookup.codeForLookup(barcodeInput.value);
    if (!code) {
      toast('Код должен быть из 8–14 цифр. Отсканируйте его или введите вручную.', { tone: 'error' });
      barcodeInput.focus();
      return;
    }

    const remembered = lookup.cachedProduct(code);
    if (remembered) {
      applyLookupProduct(code, remembered, true);
      track('scan_lookup', { reason: 'found' });
      return;
    }

    if (!navigator.onLine) {
      toast('Нет интернета. Повторите, когда появится связь.', { tone: 'error' });
      track('scan_lookup', { reason: 'offline' });
      return;
    }

    if (!lookup.hasLookupConsent()) {
      const allowed = await confirmSheet({
        title: 'Найти продукт в интернете?',
        text: 'Код ' + code + ' уйдёт в открытую базу Open Food Facts. Названия, цены и данные о кухне останутся на устройстве.',
        confirmLabel: 'Найти',
        danger: false
      });
      if (!allowed) return;
      lookup.grantLookupConsent();
    }

    setLookupBusy(true);
    let result;
    try {
      result = await lookup.findProduct(code);
    } finally {
      setLookupBusy(false);
    }
    if (!result) return;

    if (result.status === 'found') track('scan_lookup', { reason: 'found' });
    else track('scan_lookup', { reason: result.status });

    if (!sheet.dialog.isConnected) return;

    if (result.status === 'found') {
      applyLookupProduct(code, result.product, false);
      return;
    }

    if (result.status === 'notfound') {
      toast('В базе Open Food Facts этого кода нет. Впишите название вручную.', { tone: 'error', duration: 7000 });
    } else {
      toast('Не получилось получить данные. Проверьте связь и попробуйте ещё раз.', { tone: 'error' });
    }
  }

  function applyScanText(raw) {
    const parsed = E.parseScanPayload(raw);

    if (parsed.code) {
      track('scan_ok', { kind: parsed.kind });
      barcodeInput.value = parsed.code;
      const known = store.getState().pantry.find(function (entry) {
        return entry.barcode === parsed.code && (!editing || entry.id !== item.id);
      });

      if (!nameInput.value.trim() && known) {
        fillFromName(known.name, known.ingredientId);
        barcodeHint.textContent = 'Код ' + parsed.code + ' — знакомый продукт «' + known.name + '».';
        toast('Код распознан: «' + known.name + '».');
        return;
      }

      if (!nameInput.value.trim()) {
        const remembered = lookup.cachedProduct(parsed.code);
        if (remembered) {
          fillFromName(remembered.name, null);
          barcodeHint.textContent = 'Код ' + parsed.code + ' — из памяти устройства: «' + remembered.name + '».';
          toast('Код ' + parsed.code + ': подставили «' + remembered.name + '» из памяти.');
          return;
        }
      }

      barcodeHint.textContent = 'Код ' + parsed.code + ' сохранён в карточке.';
      if (!nameInput.value.trim()) {
        toast('Код распознан. Впишите название продукта.');
        nameInput.focus();
      } else {
        toast('Код ' + parsed.code + ' добавлен к продукту.');
      }
      return;
    }

    if (parsed.name) {
      track('scan_ok', { kind: parsed.kind });
      if (!nameInput.value.trim()) {
        nameInput.value = parsed.name;
        activeMeta = E.resolveIngredient(parsed.name);
        if (activeMeta) applyMeta(activeMeta);
        else setAutofill('');
        toast('Из QR-кода подставлено название: «' + parsed.name + '».');
      } else {
        toast('QR-код распознан, но название уже заполнено.');
      }
      return;
    }

    toast('Код распознан, но данных о продукте в нём нет. Впишите название вручную.', { tone: 'error' });
    track('scan_fail', { reason: 'empty' });
  }

  function openScanSheet() {
    if (!isScannerSupported()) {
      toast('Камера недоступна: нужен HTTPS и разрешение. Введите код вручную.', { tone: 'error', duration: 6000 });
      track('scan_fail', { reason: 'unsupported' });
      return;
    }

    let scanner = null;
    const sheet = openSheet({
      eyebrow: 'Сканер',
      title: 'Наведите камеру',
      subtitle: 'Штрихкод или QR-код товара',
      className: 'sheet--scanner',
      content:
        '<div class="scanner">' +
          '<div class="scanner__viewport">' +
            '<video class="scanner__video" playsinline muted autoplay aria-label="Изображение с камеры"></video>' +
            '<span class="scanner__frame" aria-hidden="true"></span>' +
          '</div>' +
          '<p class="scanner__status" role="status" data-scan-status>Включаем камеру…</p>' +
          '<p class="scanner__hint">Держите код в рамке. Декодер работает офлайн.</p>' +
        '</div>',
      footer:
        '<button class="btn btn--ghost" type="button" data-scan-cancel>Отмена</button>' +
        '<button class="btn btn--quiet" type="button" data-scan-manual>Ввести вручную</button>',
      initialFocus: '[data-scan-cancel]',
      onClose: function () { if (scanner) scanner.stop(); }
    });

    const video = sheet.dialog.querySelector('.scanner__video');
    const status = sheet.dialog.querySelector('[data-scan-status]');

    scanner = createScanner({
      video: video,
      onStatus: function (text) { status.textContent = text; },
      onResult: function (text) {
        if (navigator.vibrate) navigator.vibrate(50);
        sheet.close();
        applyScanText(text);
      },
      onError: function (message, reason) {
        track('scan_fail', { reason: reason || 'failed' });
        status.textContent = message;
        status.classList.add('is-error');
        const cancel = sheet.dialog.querySelector('[data-scan-cancel]');
        if (cancel) cancel.textContent = 'Закрыть';
      }
    });

    sheet.dialog.querySelector('[data-scan-cancel]').addEventListener('click', sheet.close);
    sheet.dialog.querySelector('[data-scan-manual]').addEventListener('click', function () {
      sheet.close();
      barcodeInput.focus();
    });
    scanner.start();
  }

  if (scanButton) scanButton.addEventListener('click', openScanSheet);
  if (lookupButton) lookupButton.addEventListener('click', runLookup);

  nameInput.addEventListener('input', function () {
    clearError('name');
    formError.hidden = true;
    activeMeta = E.resolveIngredient(nameInput.value);
    if (activeMeta) applyMeta(activeMeta);
    else setAutofill('');
  });

  qtyInput.addEventListener('input', function () {
    touched.qty = true;
    clearError('qty');
    if (activeMeta && !touched.price) {
      const estimate = estimatePrice();
      if (estimate) priceInput.value = String(estimate);
    }
  });

  unitSelect.addEventListener('change', function () {
    touched.unit = true;
    if (activeMeta && !touched.price) {
      const estimate = estimatePrice();
      if (estimate) priceInput.value = String(estimate);
    }
  });

  categorySelect.addEventListener('change', function () {
    touched.category = true;
  });

  expiresInput.addEventListener('change', function () {
    touched.expires = true;
  });

  priceInput.addEventListener('input', function () {
    touched.price = true;
    clearError('price');
    formError.hidden = true;
  });

  storageButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      touched.storage = true;
      setStorage(button.getAttribute('data-storage-option'));
    });
  });

  form.querySelectorAll('[data-days]').forEach(function (button) {
    button.addEventListener('click', function () {
      touched.expires = true;
      const days = button.getAttribute('data-days');
      expiresInput.value = days === 'none' ? '' : E.addDays(today, Number(days));
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitting) return;

    const name = nameInput.value.trim();
    const amount = Number(qtyInput.value.trim().replace(',', '.'));
    const priceRaw = priceInput.value.trim();
    const price = priceRaw ? Number(priceRaw.replace(',', '.')) : 0;
    let invalid = false;

    if (!name) {
      showError('name', 'Впишите название продукта.');
      invalid = true;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showError('qty', 'Количество должно быть больше нуля.');
      invalid = true;
    }
    if (priceRaw && (!Number.isFinite(price) || price < 0)) {
      showError('price', 'Введите цену числом — ноль или больше.');
      invalid = true;
    }
    if (invalid) {
      focusFirstError(form);
      return;
    }

    const payload = {
      name: name,
      qty: amount,
      unit: unitSelect.value,
      category: categorySelect.value,
      storage: currentStorage(),
      expires: E.isValidISODate(expiresInput.value) ? expiresInput.value : null,
      price: Math.max(0, Math.round(price)),
      barcode: barcodeInput.value.trim()
    };
    if (editing && name !== item.name) payload.ingredientId = null;

    submitting = true;
    if (saveButton) saveButton.disabled = true;
    try {
      const saved = editing ? store.updatePantry(item.id, payload) : store.addPantry(payload);
      if (!saved) throw new Error('Продукт не найден — возможно, его уже удалили.');
      sheet.close();
      renderScreen({ focus: '[data-id="' + saved.id + '"]' });
      toast(editing ? '«' + saved.name + '» обновлён.' : '«' + saved.name + '» на полке.');
      track(editing ? 'product_edit' : 'product_add');
    } catch (error) {
      formError.textContent = error && error.message ? error.message : 'Не получилось сохранить продукт.';
      formError.hidden = false;
      toast('Не получилось сохранить продукт.', { tone: 'error' });
    } finally {
      submitting = false;
      if (saveButton) saveButton.disabled = false;
    }
  });

  const cancel = sheet.dialog.querySelector('[data-cancel]');
  if (cancel) cancel.addEventListener('click', sheet.close);

  const deleteButton = sheet.dialog.querySelector('[data-delete]');
  if (deleteButton) {
    deleteButton.addEventListener('click', async function () {
      const confirmed = await confirmSheet({
        eyebrow: 'Продукт',
        title: 'Удалить с полки?',
        text: '«' + item.name + '» исчезнет из списка. Сразу после удаления его можно вернуть.',
        confirmLabel: 'Удалить',
        danger: true
      });
      if (!confirmed) return;

      const removed = store.removePantry(item.id);
      sheet.close();
      if (!removed) {
        renderScreen();
        toast('Продукт уже удалён.', { tone: 'error' });
        return;
      }
      renderScreen({ focus: '[data-action="add"]' });
      toast('«' + removed.item.name + '» удалён с полки.', {
        action: 'Отменить',
        onAction: function () {
          store.insertPantry(removed.item, removed.index);
          refreshScreen('[data-id="' + removed.item.id + '"]');
        }
      });
    });
  }
}

/* ── Шторка фильтров ────────────────────────────────────────────── */

function openFiltersSheet() {
  const draft = { category: filters.category, sort: filters.sort };
  const categorySelect = '<select id="pantry-filter-category">' +
    '<option value="all"' + (draft.category === 'all' ? ' selected' : '') + '>Все категории</option>' +
    DATA.CATEGORY_ORDER.map(function (category) {
      return '<option value="' + esc(category) + '"' + (draft.category === category ? ' selected' : '') + '>' +
        esc(category) + '</option>';
    }).join('') +
  '</select>';
  const sortSelect = '<select id="pantry-filter-sort">' +
    Object.keys(SORT_LABELS).map(function (id) {
      return '<option value="' + esc(id) + '"' + (draft.sort === id ? ' selected' : '') + '>' +
        esc(SORT_LABELS[id]) + '</option>';
    }).join('') +
  '</select>';

  const sheet = openSheet({
    eyebrow: 'Полка',
    title: 'Фильтры',
    subtitle: 'Категория и порядок внутри зон хранения.',
    content:
      '<div class="fieldset">' +
        '<div class="field">' +
          '<label class="field__label" for="pantry-filter-category">Категория</label>' +
          categorySelect +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="pantry-filter-sort">Сортировка</label>' +
          sortSelect +
        '</div>' +
        '<p class="field__hint">Поиск и зоны хранения переключаются над списком.</p>' +
      '</div>',
    footer:
      '<button class="btn btn--quiet" type="button" data-reset>Сбросить</button>' +
      '<button class="btn btn--primary" type="button" data-apply>Показать</button>',
    initialFocus: '#pantry-filter-category'
  });

  const categoryInput = sheet.dialog.querySelector('#pantry-filter-category');
  const sortInput = sheet.dialog.querySelector('#pantry-filter-sort');

  categoryInput.addEventListener('change', function () { draft.category = categoryInput.value; });
  sortInput.addEventListener('change', function () { draft.sort = sortInput.value; });

  sheet.dialog.querySelector('[data-apply]').addEventListener('click', function () {
    filters.category = draft.category;
    filters.sort = draft.sort;
    sheet.close();
    renderScreen({ focus: '[data-action="filters"]' });
  });

  sheet.dialog.querySelector('[data-reset]').addEventListener('click', function () {
    filters.category = 'all';
    filters.sort = 'expiry';
    sheet.close();
    renderScreen({ focus: '[data-action="filters"]' });
  });
}

/* ── Действия экрана ────────────────────────────────────────────── */

async function restoreDemo() {
  if (store.hasData()) {
    const confirmed = await confirmSheet({
      eyebrow: 'Полка',
      title: 'Вернуть демо-кухню?',
      text: 'Текущие продукты, план и покупки заменятся демонстрационным набором.',
      confirmLabel: 'Вернуть демо',
      danger: true
    });
    if (!confirmed) return;
  }
  resetFilters();
  store.loadDemo();
}

function bindScreen(screen) {
  const search = screen.querySelector('#pantry-search');
  if (search) {
    const clear = screen.querySelector('[data-action="clear-search"]');
    const apply = debounce(function () {
      if (!screen.isConnected) return;
      filters.query = search.value.trim();
      if (clear) clear.hidden = !search.value;
      renderResultsOnly(screen);
    }, 170);
    search.addEventListener('input', function () {
      if (clear) clear.hidden = !search.value;
      apply();
    });
  }

  screen.addEventListener('click', function (event) {
    const target = event.target;
    if (!target.closest) return;

    const clear = target.closest('[data-action="clear-search"]');
    if (clear) {
      const input = screen.querySelector('#pantry-search');
      if (input) {
        input.value = '';
        filters.query = '';
        clear.hidden = true;
        renderResultsOnly(screen);
        input.focus();
      }
      return;
    }

    const storageChip = target.closest('[data-storage]');
    if (storageChip) {
      filters.storage = storageChip.getAttribute('data-storage');
      filters.soon = false;
      updateFilterUI(screen);
      renderResultsOnly(screen);
      return;
    }

    const soonChip = target.closest('[data-soon]');
    if (soonChip) {
      filters.soon = true;
      filters.storage = 'all';
      updateFilterUI(screen);
      renderResultsOnly(screen);
      return;
    }

    const action = target.closest('[data-action]');
    if (!action) return;
    const name = action.getAttribute('data-action');

    if (name === 'add') {
      openProductSheet(null);
      return;
    }

    if (name === 'edit') {
      const id = action.getAttribute('data-id');
      const item = store.getState().pantry.find(function (entry) { return entry.id === id; });
      if (item) openProductSheet(item);
      return;
    }

    if (name === 'filters') {
      openFiltersSheet();
      return;
    }

    if (name === 'rescue') {
      resetFilters();
      filters.soon = true;
      renderScreen({ focus: '[data-action="edit"]' });
      return;
    }

    if (name === 'reset') {
      resetFilters();
      renderScreen({ focus: '#pantry-search' });
      return;
    }

    if (name === 'reset-advanced') {
      filters.category = 'all';
      filters.sort = 'expiry';
      renderScreen({ focus: '[data-action="filters"]' });
      return;
    }

    if (name === 'demo') {
      restoreDemo();
    }
  });
}

function focusLater(scope, selector) {
  if (!selector) return;
  window.requestAnimationFrame(function () {
    const target = scope.querySelector(selector);
    if (target) target.focus({ preventScroll: false });
  });
}

function renderScreen(options) {
  const state = store.getState();
  const today = store.getToday();
  renderHTML(root, screenHTML(state, today));
  const screen = root.querySelector('.pantry-screen');
  if (!screen) return;
  bindScreen(screen);
  if (options && options.focus) focusLater(screen, options.focus);
}

function refreshScreen(focusSelector) {
  if (!root.querySelector('.pantry-screen')) return;
  renderScreen({ focus: focusSelector });
}

/* ── Экран ─────────────────────────────────────────────────────── */

let root = null;

export function pantryScreen(container) {
  root = container;
  renderScreen();
}
