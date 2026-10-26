/*
 * ПОЛКА · экран «Покупки».
 * Список по категориям, отметки, покупка отмеченного, сбор из плана
 * и отправка списка текстом. Мутации — только через store.
 */

import * as store from '../store.js';
import { navigate } from '../router.js';
import { track } from '../analytics.js';
import {
  DATA, E, esc, icon, money, qty, plural, capitalize,
  render as renderHTML, emptyState, toast, openSheet, confirmSheet,
  shareText, focusFirstError, prefersReducedMotion
} from '../ui.js';

const SOURCE_LABELS = { plan: 'из плана', recipe: 'из рецепта', manual: 'вручную' };
const POSITION_WORDS = ['позиция', 'позиции', 'позиций'];

let hideChecked = false;
let root = null;
let sharing = false;

/* ── Данные для разметки ────────────────────────────────────────── */

function categoryOf(item) {
  const meta = item.ingredientId ? E.ingredientById(item.ingredientId) : null;
  const category = meta ? meta.category : 'Другое';
  return DATA.CATEGORY_ORDER.indexOf(category) === -1 ? 'Другое' : category;
}

function sortItems(a, b) {
  return (a.checked ? 1 : 0) - (b.checked ? 1 : 0) || a.name.localeCompare(b.name, 'ru');
}

function groupedItems(state, onlyVisible) {
  const buckets = new Map();
  state.shopping.forEach(function (item) {
    if (onlyVisible && item.checked) return;
    const category = categoryOf(item);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(item);
  });

  const ordered = DATA.CATEGORY_ORDER.filter(function (category) {
    return buckets.has(category);
  });
  Array.from(buckets.keys()).forEach(function (category) {
    if (ordered.indexOf(category) === -1) ordered.push(category);
  });

  return ordered.map(function (category) {
    const items = buckets.get(category).slice().sort(sortItems);
    return {
      category: category,
      items: items,
      total: Math.round(items.reduce(function (sum, item) { return sum + (Number(item.price) || 0); }, 0))
    };
  });
}

function summaryNote(summary) {
  if (!summary.count) return '';
  if (summary.unknown) {
    const word = plural(summary.unknown, ['позиции', 'позиций', 'позиций']);
    return 'У ' + summary.unknown + ' ' + word + ' нет цены — сумма может вырасти.';
  }
  if (summary.checked === summary.count) return 'Всё отмечено — можно покупать.';
  return '';
}

function summaryHTML() {
  const summary = store.shoppingSummary();
  const percent = summary.count ? Math.round((summary.checked / summary.count) * 100) : 0;
  const note = summaryNote(summary);

  return '<section class="buy-summary card" aria-labelledby="buy-summary-title">' +
    '<div class="buy-summary__head">' +
      '<div class="buy-summary__count-wrap">' +
        '<p class="buy-summary__eyebrow" id="buy-summary-title">Список на неделю</p>' +
        '<p class="buy-summary__count">Куплено <strong data-buy-checked>' + summary.checked + '</strong> из ' +
          '<span data-buy-count>' + summary.count + '</span></p>' +
      '</div>' +
      '<div class="buy-summary__total-wrap">' +
        '<span class="buy-summary__total-label">сумма</span>' +
        '<span class="buy-summary__total" data-buy-total>' + money(summary.total) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="meter buy-summary__meter" data-buy-progress role="progressbar" aria-label="Прогресс покупок" ' +
      'aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '" ' +
      'aria-valuetext="Куплено ' + summary.checked + ' из ' + summary.count + '">' +
      '<span class="meter__fill" data-buy-fill style="width: ' + percent + '%"></span>' +
    '</div>' +
    '<p class="buy-summary__note" data-buy-note' + (note ? '' : ' hidden') + '>' + esc(note) + '</p>' +
  '</section>';
}

function actionsHTML(summary) {
  return '<section class="buy-actions" aria-label="Действия со списком">' +
    '<button class="btn btn--primary btn--block buy-buy" type="button" data-action="buy"' +
      (summary.checked ? '' : ' disabled') + '>' +
      icon('basket') +
      '<span>Купить отмеченное</span>' +
      '<span class="buy-buy__count" data-buy-buy-count' + (summary.checked ? '' : ' hidden') + '>' +
        summary.checked + '</span>' +
    '</button>' +
    '<div class="buy-tools">' +
      '<button class="btn btn--ghost" type="button" data-action="sync">' +
        icon('calendar') + '<span>Собрать из плана</span>' +
      '</button>' +
      '<button class="btn btn--ghost" type="button" data-action="share">' +
        icon('share') + '<span>Поделиться списком</span>' +
      '</button>' +
    '</div>' +
    '<div class="buy-actions__foot">' +
      '<button class="text-link text-link--danger buy-clear" type="button" data-action="clear"' +
        (summary.checked ? '' : ' disabled') + '>Очистить отмеченные</button>' +
    '</div>' +
  '</section>';
}

function rowHTML(item) {
  const price = Number(item.price) > 0 ? money(item.price) : 'без цены';
  const source = SOURCE_LABELS[item.source] || SOURCE_LABELS.manual;
  const meta = qty(item.qty, item.unit) + ' · ' + source;
  return '<li class="shop-row' + (item.checked ? ' is-checked' : '') + '" data-shop-row data-id="' +
      esc(item.id) + '" data-price="' + Math.max(0, Number(item.price) || 0) + '">' +
    '<label class="shop-row__main">' +
      '<input class="shop-check visually-hidden" type="checkbox" data-shop-check' +
        (item.checked ? ' checked' : '') + '>' +
      '<span class="shop-check__box" aria-hidden="true">' + icon('check') + '</span>' +
      '<span class="shop-row__body">' +
        '<span class="shop-row__name">' + esc(item.name) + '</span>' +
        '<span class="shop-row__meta">' +
          '<span>' + esc(meta) + '</span>' +
          '<span class="shop-row__state">куплено</span>' +
        '</span>' +
      '</span>' +
      '<span class="shop-row__price' + (Number(item.price) > 0 ? '' : ' is-unpriced') + '">' +
        esc(price) + '</span>' +
    '</label>' +
    '<button class="icon-btn shop-row__remove" type="button" data-action="remove" data-id="' +
      esc(item.id) + '" aria-label="Удалить ' + esc(item.name) + '">' + icon('trash') + '</button>' +
  '</li>';
}

function groupsHTML(state) {
  const groups = groupedItems(state, hideChecked);
  const visible = groups.reduce(function (sum, group) { return sum + group.items.length; }, 0);

  if (!state.shopping.length) {
    return '<div class="empty buy-empty">' +
      '<span class="empty__icon">' + icon('basket') + '</span>' +
      '<h3 class="empty__title">Список пуст</h3>' +
      '<p class="empty__text">Добавьте позицию вручную или соберите покупки из плана на неделю.</p>' +
      '<div class="buy-empty__actions">' +
        '<button class="btn btn--primary" type="button" data-action="add">' + icon('plus') + ' Добавить позицию</button>' +
        '<button class="btn btn--ghost" type="button" data-action="sync">' + icon('calendar') + ' Собрать из плана</button>' +
      '</div>' +
    '</div>';
  }

  if (!visible) {
    return emptyState({
      iconName: 'check-circle',
      title: 'Всё отмечено',
      text: 'Купленное спрятано. Покажите список, если хотите снять отметку или добавить позицию.',
      actionLabel: 'Показать купленное',
      actionAttrs: 'data-action="show-checked"'
    });
  }

  return groups.map(function (group, index) {
    const groupId = 'buy-group-' + index;
    return '<section class="buy-group" data-shop-group="' + index + '" aria-labelledby="' + groupId + '">' +
      '<div class="group-head">' +
        '<h3 class="group-head__name" id="' + groupId + '">' + esc(group.category) + '</h3>' +
        '<span class="group-head__meta" data-group-meta>' +
          esc(group.items.length + ' ' + plural(group.items.length, POSITION_WORDS) + ' · ' + money(group.total)) +
        '</span>' +
      '</div>' +
      '<ul class="list buy-list">' + group.items.map(rowHTML).join('') + '</ul>' +
    '</section>';
  }).join('');
}

function screenHTML(state) {
  const summary = store.shoppingSummary();
  const hasItems = state.shopping.length > 0;
  return '<div class="screen shopping-screen">' +
    '<header class="screen-head">' +
      '<p class="eyebrow">Покупки · ' + esc(capitalize(E.weekdayLong(store.getToday()))) + '</p>' +
      '<h1 class="screen-title">Покупки</h1>' +
      '<p class="screen-lead">' +
        (hasItems
          ? 'Отмечайте то, что уже в корзине. Купленное уйдёт на полку — со сроком и ценой.'
          : 'Соберите список из плана на неделю или добавьте позиции вручную.') +
      '</p>' +
    '</header>' +
    summaryHTML() +
    (hasItems
      ? actionsHTML(summary) +
        '<div class="section-head buy-list-head">' +
          '<h2 class="section-title">Список</h2>' +
          '<label class="buy-switch">' +
            '<input class="visually-hidden" type="checkbox" data-hide-checked role="switch"' +
              (hideChecked ? ' checked' : '') + '>' +
            '<span class="switch__track" aria-hidden="true"></span>' +
            '<span class="switch__label">Скрыть купленное</span>' +
          '</label>' +
        '</div>' +
        '<div class="buy-groups" data-groups tabindex="-1">' + groupsHTML(state) + '</div>' +
        '<div class="buy-add">' +
          '<button class="btn btn--primary btn--block" type="button" data-action="add">' +
            icon('plus') + ' Добавить позицию' +
          '</button>' +
        '</div>'
      : groupsHTML(state)) +
  '</div>';
}

/* ── Живое обновление ───────────────────────────────────────────── */

function updateSummary(screen) {
  const summary = store.shoppingSummary();
  const percent = summary.count ? Math.round((summary.checked / summary.count) * 100) : 0;

  const checked = screen.querySelector('[data-buy-checked]');
  if (checked) checked.textContent = String(summary.checked);
  const count = screen.querySelector('[data-buy-count]');
  if (count) count.textContent = String(summary.count);
  const total = screen.querySelector('[data-buy-total]');
  if (total) total.textContent = money(summary.total);

  const progress = screen.querySelector('[data-buy-progress]');
  if (progress) {
    progress.setAttribute('aria-valuenow', String(percent));
    progress.setAttribute('aria-valuetext', 'Куплено ' + summary.checked + ' из ' + summary.count);
  }
  const fill = screen.querySelector('[data-buy-fill]');
  if (fill) fill.style.width = percent + '%';

  const note = screen.querySelector('[data-buy-note]');
  if (note) {
    const text = summaryNote(summary);
    note.textContent = text;
    note.hidden = !text;
  }

  const buy = screen.querySelector('[data-action="buy"]');
  if (buy) {
    buy.disabled = summary.checked === 0;
    const badge = buy.querySelector('[data-buy-buy-count]');
    if (badge) {
      badge.textContent = String(summary.checked);
      badge.hidden = summary.checked === 0;
    }
  }

  const clear = screen.querySelector('[data-action="clear"]');
  if (clear) clear.disabled = summary.checked === 0;
}

function updateGroupMeta(group) {
  if (!group) return;
  const rows = Array.prototype.slice.call(group.querySelectorAll('[data-shop-row]:not([hidden])'));
  const sum = rows.reduce(function (total, row) {
    return total + (Number(row.getAttribute('data-price')) || 0);
  }, 0);
  const meta = group.querySelector('[data-group-meta]');
  if (meta) {
    meta.textContent = rows.length + ' ' + plural(rows.length, POSITION_WORDS) + ' · ' + money(sum);
  }
  group.hidden = rows.length === 0;
}

function updateRow(li, item) {
  if (!li) return;
  li.classList.toggle('is-checked', item.checked);
  const input = li.querySelector('[data-shop-check]');
  if (input) input.checked = item.checked;
}

function focusRowAt(screen, index) {
  const rows = Array.prototype.slice.call(screen.querySelectorAll('[data-shop-row]:not([hidden])'));
  if (!rows.length) {
    const fallback = screen.querySelector('[data-action="show-checked"]') ||
      screen.querySelector('[data-action="add"]') ||
      screen.querySelector('[data-hide-checked]');
    if (fallback) fallback.focus();
    return;
  }
  const row = rows[Math.max(0, Math.min(index, rows.length - 1))];
  const input = row.querySelector('[data-shop-check]');
  if (input) input.focus();
}

function focusLater(screen, options) {
  if (!options) return;
  window.requestAnimationFrame(function () {
    if (!screen.isConnected) return;
    if (options.focus) {
      const target = screen.querySelector(options.focus);
      if (target) target.focus();
      return;
    }
    if (options.focusItem) {
      const row = screen.querySelector('[data-shop-row][data-id="' + options.focusItem + '"]');
      const input = row ? row.querySelector('[data-shop-check]') : null;
      if (input) {
        input.focus();
        return;
      }
    }
    if (typeof options.focusRow === 'number') focusRowAt(screen, options.focusRow);
  });
}

function renderScreen(options) {
  const state = store.getState();
  renderHTML(root, screenHTML(state));
  const screen = root.querySelector('.shopping-screen');
  if (!screen) return;
  bindScreen(screen);
  focusLater(screen, options);
}

function refreshScreen(options) {
  if (!root.querySelector('.shopping-screen')) return;
  renderScreen(options);
}

/* ── Действия ───────────────────────────────────────────────────── */

function toggleChecked(screen, input) {
  const li = input.closest('[data-shop-row]');
  if (!li) return;
  const item = store.toggleShopping(li.getAttribute('data-id'), input.checked);
  if (!item) {
    input.checked = !input.checked;
    toast('Позиция не найдена — возможно, её уже удалили.', { tone: 'error' });
    return;
  }

  updateRow(li, item);
  updateSummary(screen);
  if (item.checked) track('shopping_check');

  if (hideChecked && item.checked) {
    li.hidden = true;
    updateGroupMeta(li.closest('[data-shop-group]'));
    const visible = screen.querySelector('[data-shop-row]:not([hidden])');
    if (!visible) {
      renderScreen({ focus: '[data-hide-checked]' });
      return;
    }
    const rows = Array.prototype.slice.call(screen.querySelectorAll('[data-shop-row]'));
    const index = rows.indexOf(li);
    let next = null;
    for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
      if (!rows[cursor].hidden) { next = rows[cursor]; break; }
    }
    if (!next) {
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (!rows[cursor].hidden) { next = rows[cursor]; break; }
      }
    }
    if (next) {
      const nextInput = next.querySelector('[data-shop-check]');
      if (nextInput) nextInput.focus({ preventScroll: true });
    } else {
      const toggle = screen.querySelector('[data-hide-checked]');
      if (toggle) toggle.focus({ preventScroll: true });
    }
  }
}

function scrollToGroups(focus) {
  const groups = root.querySelector('[data-groups]');
  if (!groups) return;
  groups.scrollIntoView({
    block: 'start',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth'
  });
  if (focus) {
    window.requestAnimationFrame(function () {
      if (groups.isConnected) groups.focus({ preventScroll: true });
    });
  }
}

function focusRestoredItem(id, fallback) {
  const row = id ? root.querySelector('[data-shop-row][data-id="' + id + '"]') : null;
  const input = row ? row.querySelector('[data-shop-check]') : null;
  if (input) {
    input.focus({ preventScroll: true });
    return;
  }
  refreshScreen(fallback);
}

function buyChecked() {
  const summary = store.shoppingSummary();
  if (!summary.checked) return;

  const snapshot = store.snapshot();
  const result = store.buyChecked();
  if (!result) {
    toast('Не получилось купить отмеченное.', { tone: 'error' });
    return;
  }

  renderScreen({ focusRow: 0 });
  const moved = result.moved.length;
  const firstMoved = result.moved[0];
  toast('Куплено: ' + moved + ' ' + plural(moved, POSITION_WORDS) + ' — на полке.', {
    action: 'Отменить',
    onAction: function () {
      hideChecked = false;
      store.replaceState(snapshot, 'Покупки восстановлены.');
      focusRestoredItem(firstMoved ? firstMoved.id : null, firstMoved ? { focusItem: firstMoved.id } : { focusRow: 0 });
    }
  });
}

async function clearChecked() {
  const summary = store.shoppingSummary();
  if (!summary.checked) return;

  const confirmed = await confirmSheet({
    eyebrow: 'Покупки',
    title: 'Очистить отмеченные?',
    text: 'Отмечено: ' + summary.checked + '. Эти позиции исчезнут из списка и не попадут на полку.',
    confirmLabel: 'Очистить',
    danger: true
  });
  if (!confirmed) return;

  const snapshot = store.snapshot();
  const removed = store.clearChecked();
  if (!removed) {
    toast('Отмеченных позиций уже нет.', { tone: 'error' });
    return;
  }

  renderScreen({ focusRow: 0 });
  const firstRemoved = removed[0];
  toast('Отмеченные убраны из списка.', {
    action: 'Отменить',
    onAction: function () {
      hideChecked = false;
      store.replaceState(snapshot, 'Покупки восстановлены.');
      focusRestoredItem(firstRemoved ? firstRemoved.id : null, firstRemoved ? { focusItem: firstRemoved.id } : { focusRow: 0 });
    }
  });
}

function syncFromPlan() {
  const result = store.syncShoppingFromPlan();
  if (!result.overview.meals) {
    toast('В плане пока пусто — сначала соберите план на неделю.');
    navigate('plan');
    return;
  }

  const changes = result.result || { added: 0, updated: 0, removed: 0, unchecked: 0 };
  const parts = [];
  if (changes.added) parts.push('добавлено ' + changes.added);
  if (changes.updated) parts.push('обновлено ' + changes.updated);
  if (changes.removed) parts.push('убрано ' + changes.removed);
  if (changes.unchecked) parts.push('снова в списке ' + changes.unchecked);

  const changed = parts.length > 0;
  renderScreen({ focusRow: 0 });
  toast(changed ? 'По плану: ' + parts.join(', ') + '.' : 'Список уже собран по плану — изменений нет.', {
    action: changed ? 'Открыть покупки' : undefined,
    onAction: changed ? function () {
      hideChecked = false;
      if (!root.querySelector('.shopping-screen')) {
        navigate('shopping');
        window.requestAnimationFrame(function () { scrollToGroups(true); });
        return;
      }
      renderScreen();
      scrollToGroups(true);
    } : undefined
  });
}

function removeItem(screen, button) {
  const li = button.closest('[data-shop-row]');
  if (!li) return;
  const visibleRows = Array.prototype.slice.call(screen.querySelectorAll('[data-shop-row]:not([hidden])'));
  const position = visibleRows.indexOf(li);
  const removed = store.removeShopping(li.getAttribute('data-id'));
  if (!removed) {
    renderScreen();
    toast('Позиция уже удалена.', { tone: 'error' });
    return;
  }
  renderScreen({ focusRow: Math.max(0, position) });
  toast('Позиция «' + removed.item.name + '» удалена.', {
    action: 'Отменить',
    onAction: function () {
      store.insertShopping(removed.item, removed.index);
      refreshScreen({ focusItem: removed.item.id });
    }
  });
}

function shareFallback(text) {
  const sheet = openSheet({
    eyebrow: 'Покупки',
    title: 'Список для отправки',
    subtitle: 'Автоматически поделиться не получилось. Скопируйте текст — он уже выделен.',
    content:
      '<div class="field">' +
        '<label class="field__label" for="share-text">Текст списка</label>' +
        '<textarea class="share-text" id="share-text" readonly rows="12" spellcheck="false">' + esc(text) + '</textarea>' +
      '</div>',
    footer: '<button class="btn btn--primary btn--block" type="button" data-share-close>Готово</button>',
    initialFocus: '#share-text',
    onMount: function (dialog) {
      const area = dialog.querySelector('#share-text');
      window.requestAnimationFrame(function () {
        if (!area) return;
        area.focus();
        area.select();
      });
    }
  });
  sheet.dialog.querySelector('[data-share-close]').addEventListener('click', sheet.close);
}

function buildShareText(state) {
  const summary = store.shoppingSummary();
  const groups = groupedItems(state, false);
  const lines = [
    'ПОЛКА · покупки',
    E.formatDateLong(store.getToday()) + ' · куплено ' + summary.checked + ' из ' + summary.count,
    ''
  ];

  groups.forEach(function (group) {
    lines.push(group.category);
    group.items.forEach(function (item) {
      const price = Number(item.price) > 0 ? ' · ' + money(item.price) : '';
      lines.push((item.checked ? '[x] ' : '[ ] ') + item.name + ' — ' + qty(item.qty, item.unit) + price);
    });
    lines.push('');
  });

  lines.push('Сумма: ' + money(summary.total));
  return lines.join('\n');
}

async function shareList(screen) {
  if (sharing) return;
  const state = store.getState();
  if (!state.shopping.length) {
    toast('Список пуст — пока нечем делиться.', { tone: 'error' });
    return;
  }

  const button = screen.querySelector('[data-action="share"]');
  const text = buildShareText(state);
  sharing = true;
  if (button) button.disabled = true;

  let outcome = 'failed';
  try {
    outcome = await shareText({ title: 'Покупки · ПОЛКА', text: text });
  } catch (error) {
    outcome = 'failed';
  } finally {
    sharing = false;
    if (button && button.isConnected) button.disabled = false;
  }

  if (outcome === 'shared') {
    toast('Список отправлен.');
  } else if (outcome === 'copied') {
    toast('Список скопирован в буфер обмена.');
  } else if (outcome === 'failed') {
    toast('Не получилось поделиться автоматически. Текст открыт для копирования.', { tone: 'error' });
    shareFallback(text);
  }
}

/* ── Шторка добавления ──────────────────────────────────────────── */

function defaultQty(meta) {
  if (!meta) return 1;
  if (meta.base === 'kg' || meta.base === 'l') return 500;
  return 1;
}

function openAddSheet() {
  const sheet = openSheet({
    eyebrow: 'Новая позиция',
    title: 'Добавить в покупки',
    subtitle: 'Название можно выбрать из каталога или вписать своё.',
    content:
      '<form class="buy-form" id="shopping-form" novalidate>' +
        '<div class="field">' +
          '<label class="field__label" for="shopping-name">Название <span>обязательно</span></label>' +
          '<input id="shopping-name" type="text" list="shopping-ingredients" maxlength="80" ' +
            'autocomplete="off" placeholder="Например, базилик" ' +
            'aria-describedby="shopping-name-hint shopping-name-error shopping-autofill">' +
          '<p class="field__hint" id="shopping-name-hint">Начните вводить — подставим единицу из каталога.</p>' +
          '<p class="buy-autofill" id="shopping-autofill" data-autofill aria-live="polite" hidden></p>' +
          '<p class="field__error" id="shopping-name-error" data-error="name" hidden></p>' +
        '</div>' +
        '<div class="field-row field-row--qty">' +
          '<div class="field">' +
            '<label class="field__label" for="shopping-qty">Количество</label>' +
            '<input id="shopping-qty" type="text" inputmode="decimal" autocomplete="off" value="1" ' +
              'aria-describedby="shopping-qty-error">' +
            '<p class="field__error" id="shopping-qty-error" data-error="qty" hidden></p>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="shopping-unit">Единица</label>' +
            '<select id="shopping-unit">' +
              DATA.UNITS.map(function (unit) {
                return '<option value="' + esc(unit) + '"' + (unit === 'шт' ? ' selected' : '') + '>' + esc(unit) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
        '</div>' +
        '<p class="form-error" data-form-error role="alert" hidden></p>' +
        '<datalist id="shopping-ingredients">' +
          DATA.INGREDIENTS.map(function (item) {
            return '<option value="' + esc(item.name) + '"></option>';
          }).join('') +
        '</datalist>' +
      '</form>',
    footer:
      '<button class="btn btn--ghost" type="button" data-cancel>Отмена</button>' +
      '<button class="btn btn--primary" type="submit" form="shopping-form" data-save>Добавить</button>',
    initialFocus: '#shopping-name'
  });

  const form = sheet.dialog.querySelector('#shopping-form');
  const nameInput = form.querySelector('#shopping-name');
  const qtyInput = form.querySelector('#shopping-qty');
  const unitSelect = form.querySelector('#shopping-unit');
  const autofill = form.querySelector('[data-autofill]');
  const nameHint = form.querySelector('#shopping-name-hint');
  const formError = form.querySelector('[data-form-error]');
  const saveButton = sheet.footer ? sheet.footer.querySelector('[data-save]') : null;
  const errors = {
    name: form.querySelector('[data-error="name"]'),
    qty: form.querySelector('[data-error="qty"]')
  };
  const touched = { qty: false, unit: false };
  let activeMeta = null;
  let submitting = false;

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

  function clearError(key) {
    const input = key === 'name' ? nameInput : qtyInput;
    const error = errors[key];
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    if (input) input.removeAttribute('aria-invalid');
  }

  function showError(key, message) {
    const input = key === 'name' ? nameInput : qtyInput;
    const error = errors[key];
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  nameInput.addEventListener('input', function () {
    clearError('name');
    formError.hidden = true;
    activeMeta = E.resolveIngredient(nameInput.value);
    if (!activeMeta) {
      setAutofill('');
      return;
    }
    const parts = [];
    if (!touched.unit && DATA.UNITS.indexOf(activeMeta.unit) !== -1) {
      unitSelect.value = activeMeta.unit;
    }
    if (!touched.qty) {
      const amount = defaultQty(activeMeta);
      qtyInput.value = String(amount);
      parts.push(E.formatQty(amount, unitSelect.value));
    }
    setAutofill(parts.length ? 'Из каталога: ' + parts.join(', ') + '. Цену посчитаем сами.' : '');
  });

  qtyInput.addEventListener('input', function () {
    touched.qty = true;
    clearError('qty');
  });

  unitSelect.addEventListener('change', function () {
    touched.unit = true;
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitting) return;

    const name = nameInput.value.trim();
    const amount = Number(qtyInput.value.trim().replace(',', '.'));
    let invalid = false;

    if (!name) {
      showError('name', 'Впишите название покупки.');
      invalid = true;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showError('qty', 'Количество должно быть больше нуля.');
      invalid = true;
    }
    if (invalid) {
      focusFirstError(form);
      return;
    }

    submitting = true;
    if (saveButton) saveButton.disabled = true;
    try {
      const result = store.addShopping({ name: name, qty: amount, unit: unitSelect.value });
      track('shopping_add');
      sheet.close();
      renderScreen({ focusItem: result.item.id });
      toast(result.merged ? 'Добавили к «' + result.item.name + '».' : '«' + result.item.name + '» в списке.');
    } catch (error) {
      formError.textContent = error && error.message ? error.message : 'Не получилось добавить позицию.';
      formError.hidden = false;
      toast('Не получилось добавить позицию.', { tone: 'error' });
    } finally {
      submitting = false;
      if (saveButton) saveButton.disabled = false;
    }
  });

  const cancel = sheet.dialog.querySelector('[data-cancel]');
  if (cancel) cancel.addEventListener('click', sheet.close);
}

/* ── Обработчики экрана ─────────────────────────────────────────── */

function bindScreen(screen) {
  screen.addEventListener('change', function (event) {
    const target = event.target;
    if (!target.closest) return;

    const hide = target.closest('[data-hide-checked]');
    if (hide) {
      hideChecked = hide.checked;
      renderScreen({ focus: '[data-hide-checked]' });
      return;
    }

    const check = target.closest('[data-shop-check]');
    if (check) toggleChecked(screen, check);
  });

  screen.addEventListener('click', function (event) {
    const target = event.target;
    if (!target.closest) return;
    const action = target.closest('[data-action]');
    if (!action) return;

    const name = action.getAttribute('data-action');
    if (name === 'add') {
      openAddSheet();
      return;
    }
    if (name === 'buy') {
      buyChecked();
      return;
    }
    if (name === 'clear') {
      clearChecked();
      return;
    }
    if (name === 'sync') {
      syncFromPlan();
      return;
    }
    if (name === 'share') {
      shareList(screen);
      return;
    }
    if (name === 'remove') {
      removeItem(screen, action);
      return;
    }
    if (name === 'show-checked') {
      hideChecked = false;
      renderScreen({ focus: '[data-hide-checked]' });
    }
  });
}

/* ── Экран ─────────────────────────────────────────────────────── */

export function shoppingScreen(container) {
  root = container;
  renderScreen();
}
