/*
 * ПОЛКА · экран «План на неделю».
 * Семь дней, три приёма, нехватка по полке, сборка плана и покупок.
 * Шторка настроек экспортируется — её открывает и экран «Ещё».
 */

import * as store from '../store.js';
import * as router from '../router.js';
import { track } from '../analytics.js';
import {
  DATA, E, esc, icon, money, qty, plural, capitalize,
  render, toast, openSheet, confirmSheet, emptyState
} from '../ui.js';

const DIET_LABELS = {
  all: 'без ограничений',
  vegetarian: 'вегетарианское',
  vegan: 'веганское',
  glutenFree: 'без глютена'
};

const TIME_LABELS = {
  0: 'время не ограничено',
  20: 'до 20 минут',
  30: 'до 30 минут',
  45: 'до 45 минут'
};

let selectedDate = '';
let activePlan = null;

export function planSettingsSummary(settings) {
  const source = settings || {};
  const servings = Number(source.servings) || 2;
  const diet = DIET_LABELS[source.diet] || DIET_LABELS.all;
  const time = TIME_LABELS[source.maxTime] || TIME_LABELS[0];
  return servings + ' ' + plural(servings, ['порция', 'порции', 'порций']) + ' · ' + diet + ' · ' + time;
}

function mealLabel(meal) {
  return E.mealLabel(meal);
}

function ensureSelectedDate() {
  const start = store.getToday();
  if (selectedDate) {
    const offset = E.daysUntil(selectedDate, start);
    if (offset >= 0 && offset < 7) return selectedDate;
  }
  selectedDate = start;
  return selectedDate;
}

function isPlanMounted() {
  return Boolean(
    activePlan &&
    document.body.contains(activePlan.root) &&
    activePlan.root.querySelector('[data-plan-screen]')
  );
}

function refreshPlan() {
  if (!isPlanMounted()) return;
  renderPlan(activePlan.root, activePlan.ctx);
}

function focusSlot(date, meal) {
  window.requestAnimationFrame(function () {
    if (!isPlanMounted()) return;
    const node = activePlan.root.querySelector(
      '[data-action="slot"][data-date="' + date + '"][data-meal="' + meal + '"]'
    );
    if (node) node.focus({ preventScroll: true });
  });
}

function focusAction(name, scroll) {
  window.requestAnimationFrame(function () {
    if (!isPlanMounted()) return;
    const node = activePlan.root.querySelector('[data-action="' + name + '"]');
    if (node) node.focus({ preventScroll: !scroll });
  });
}

/* ── Экран ───────────────────────────────────────────────────────── */

export function planScreen(root, ctx) {
  ensureSelectedDate();
  activePlan = { root: root, ctx: ctx };
  renderPlan(root, ctx);
}

function renderPlan(root, ctx) {
  const state = store.getState();
  const overview = E.planOverview(state, store.getToday());
  const selected = overview.days.find(function (day) { return day.date === selectedDate; }) || overview.days[0];
  selectedDate = selected.date;
  activePlan = { root: root, ctx: ctx };

  const dayCount = DATA.MEAL_ORDER.reduce(function (sum, meal) {
    return sum + (selected.slots[meal] ? 1 : 0);
  }, 0);
  const dayTitle = selected.isToday
    ? 'Сегодня, ' + E.formatDateLong(selected.date)
    : capitalize(E.formatDateWithWeekday(selected.date));

  const html =
    '<div class="screen plan-screen" data-plan-screen>' +
      '<header class="screen-head screen-head--row">' +
        '<div>' +
          '<p class="eyebrow">Кухня · семь дней</p>' +
          '<h1 class="screen-title">План на неделю</h1>' +
          '<p class="screen-lead">Завтрак, обед и ужин. Считаем, что уже есть на полке, и что нужно докупить.</p>' +
          '<p class="plan-prefs">' + esc(planSettingsSummary(state.settings)) + '</p>' +
        '</div>' +
        '<div class="screen-head__actions">' +
          '<button class="icon-btn icon-btn--bordered" type="button" data-action="plan-settings" aria-label="Настройки плана">' +
            icon('settings') +
          '</button>' +
        '</div>' +
      '</header>' +
      '<div class="plan-week-wrap">' +
        '<div class="plan-week" role="group" aria-label="Дни недели">' +
          overview.days.map(function (day) {
            return renderDayButton(day);
          }).join('') +
        '</div>' +
      '</div>' +
      (overview.meals ? '' : emptyPlanMarkup()) +
      '<section class="section plan-day-section" aria-labelledby="plan-day-title">' +
        '<div class="section-head">' +
          '<h2 class="section-title" id="plan-day-title">' + esc(dayTitle) + '</h2>' +
          '<span class="section-note">' + dayCount + ' из 3</span>' +
        '</div>' +
        '<div class="plan-slots">' +
          DATA.MEAL_ORDER.map(function (meal) {
            return renderSlot(selected.date, meal, selected.slots[meal], state);
          }).join('') +
        '</div>' +
      '</section>' +
      (overview.meals ? summaryMarkup(overview) : '') +
    '</div>';

  render(root, html);
  bindScreen(root.querySelector('[data-plan-screen]'));
  window.requestAnimationFrame(function () {
    scrollToSelectedDay(root);
  });
}

function renderDayButton(day) {
  const filled = DATA.MEAL_ORDER.reduce(function (sum, meal) {
    return sum + (day.slots[meal] ? 1 : 0);
  }, 0);
  const selected = day.date === selectedDate;
  const label = capitalize(day.weekdayLong) + ', ' + E.formatDateLong(day.date) +
    (day.isToday ? ', сегодня' : '') + ', ' + filled + ' ' +
    plural(filled, ['приём', 'приёма', 'приёмов']) + ' пищи';
  const dots = [0, 1, 2].map(function (index) {
    return '<span class="plan-day__dot' + (index < filled ? ' is-on' : '') + '"></span>';
  }).join('');

  return '<button class="plan-day' +
      (selected ? ' is-selected' : '') +
      (day.isToday ? ' is-today' : '') + '"' +
      ' type="button" data-action="select-day" data-date="' + esc(day.date) + '"' +
      ' aria-pressed="' + (selected ? 'true' : 'false') + '"' +
      ' aria-label="' + esc(label) + '">' +
      '<span class="plan-day__weekday">' + esc(day.weekday) + '</span>' +
      '<span class="plan-day__num">' + day.day + '</span>' +
      '<span class="plan-day__dots" aria-hidden="true">' + dots + '</span>' +
      '<span class="plan-day__today">' + (day.isToday ? 'сегодня' : '') + '</span>' +
    '</button>';
}

function scrollToSelectedDay(root) {
  const strip = root.querySelector('.plan-week');
  const button = strip && strip.querySelector('.plan-day[aria-pressed="true"]');
  if (!strip || !button) return;
  const left = button.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2;
  strip.scrollLeft = Math.max(0, left);
}

function emptyPlanMarkup() {
  return '<section class="section">' +
    '<div class="plan-empty">' +
      '<div class="plan-empty__body">' +
        '<p class="plan-empty__eyebrow">План на неделю</p>' +
        '<h2 class="plan-empty__title">Семь дней — чистый лист</h2>' +
        '<p class="plan-empty__text">Соберите неделю из рецептов, которые почти готовы. ПОЛКА учтёт порции, диету, время и продукты на полке.</p>' +
        '<div class="plan-empty__actions">' +
          '<button class="btn btn--primary" type="button" data-action="generate">' + icon('sparkle') + 'Собрать план</button>' +
          '<button class="btn btn--ghost" type="button" data-action="plan-settings">' + icon('settings') + 'Настроить</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</section>';
}

function renderSlot(date, meal, slot, state) {
  const mealName = mealLabel(meal);
  if (!slot) {
    return '<button class="plan-slot plan-slot--empty" type="button"' +
        ' data-action="slot" data-date="' + esc(date) + '" data-meal="' + esc(meal) + '"' +
        ' aria-label="' + esc(mealName + ': добавить блюдо') + '">' +
        '<span class="plan-slot__body">' +
          '<span class="plan-slot__meal">' + esc(mealName) + '</span>' +
          '<span class="plan-slot__title plan-slot__title--empty">' + icon('plus') + 'Добавить</span>' +
          '<span class="plan-slot__meta">Свободно · выберите рецепт</span>' +
        '</span>' +
        '<span class="plan-slot__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '</button>';
  }

  const recipe = slot.recipe;
  const match = slot.match;
  const missing = match.missingBlocking.length;
  const status = match.canCook ? 'всё есть' : 'не хватает ' + missing + ' ' + plural(missing, ['продукта', 'продуктов', 'продуктов']);
  const tone = match.canCook ? 'is-ready' : (match.percent >= 60 ? 'is-warn' : 'is-danger');
  const percent = Math.max(2, Math.min(100, match.percent));

  return '<button class="plan-slot plan-slot--filled ' + tone + '" type="button"' +
      ' data-action="slot" data-date="' + esc(date) + '" data-meal="' + esc(meal) + '"' +
      ' aria-label="' + esc(mealName + ': ' + recipe.title + ', ' + recipe.time + ' минут, ' + status) + '">' +
      '<span class="plan-slot__body">' +
        '<span class="plan-slot__meal">' + esc(mealName) + '</span>' +
        '<span class="plan-slot__title">' + esc(recipe.title) + '</span>' +
        '<span class="plan-slot__meta">' +
          recipe.time + ' мин · ' + match.percent + '% совпадения · ' +
          '<span class="plan-slot__state ' + tone + '">' + esc(status) + '</span>' +
        '</span>' +
      '</span>' +
      '<span class="plan-slot__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '<span class="plan-slot__meter" aria-hidden="true"><span class="plan-slot__meter-fill ' + tone + '" style="width:' + percent + '%"></span></span>' +
    '</button>';
}

function summaryMarkup(overview) {
  const missing = overview.missingItems || [];
  let missingText = 'Всё для плана есть на полке.';
  if (missing.length) {
    const names = missing.slice(0, 4).map(function (item) { return item.name; });
    missingText = 'Докупить: ' + names.join(', ') +
      (missing.length > 4 ? ' и ещё ' + (missing.length - 4) : '') + '.';
  }

  return '<section class="section" aria-labelledby="plan-summary-title">' +
    '<div class="section-head">' +
      '<h2 class="section-title" id="plan-summary-title">Сводка на неделю</h2>' +
      '<span class="section-note">' + overview.servings + ' ' + plural(overview.servings, ['порция', 'порции', 'порций']) + '</span>' +
    '</div>' +
    '<div class="card plan-summary">' +
      '<dl class="plan-tally">' +
        '<div class="plan-tally__cell">' +
          '<dt class="plan-tally__label">Приёмов</dt>' +
          '<dd class="plan-tally__value">' + overview.meals + '<span class="plan-tally__of"> / 21</span></dd>' +
        '</div>' +
        '<div class="plan-tally__cell">' +
          '<dt class="plan-tally__label">Уникальных блюд</dt>' +
          '<dd class="plan-tally__value">' + overview.unique + '</dd>' +
        '</div>' +
        '<div class="plan-tally__cell">' +
          '<dt class="plan-tally__label">Докупить</dt>' +
          '<dd class="plan-tally__value">' + overview.missing + '<span class="plan-tally__of"> ' + plural(overview.missing, ['позиция', 'позиции', 'позиций']) + '</span></dd>' +
        '</div>' +
        '<div class="plan-tally__cell">' +
          '<dt class="plan-tally__label">Стоимость</dt>' +
          '<dd class="plan-tally__value">' + money(overview.cost) + '</dd>' +
        '</div>' +
      '</dl>' +
      '<p class="plan-summary__missing' + (missing.length ? '' : ' is-ok') + '">' + esc(missingText) + '</p>' +
    '</div>' +
    '<div class="plan-actions">' +
      '<button class="btn btn--primary btn--block" type="button" data-action="sync-shopping">' +
        icon('basket') + 'Собрать покупки' +
      '</button>' +
      '<div class="row-actions">' +
        '<button class="btn btn--ghost" type="button" data-action="generate">Собрать план</button>' +
        '<button class="btn btn--quiet" type="button" data-action="clear-plan">Очистить</button>' +
      '</div>' +
    '</div>' +
  '</section>';
}

/* ── События экрана ──────────────────────────────────────────────── */

function bindScreen(screen) {
  if (!screen) return;
  screen.addEventListener('click', function (event) {
    const target = event.target.closest('[data-action]');
    if (!target || !screen.contains(target)) return;
    const action = target.dataset.action;

    if (action === 'select-day') {
      selectDay(target.dataset.date);
    } else if (action === 'plan-settings') {
      openPlanSettings();
    } else if (action === 'slot') {
      openSlot(target.dataset.date, target.dataset.meal);
    } else if (action === 'generate') {
      requestGenerate();
    } else if (action === 'clear-plan') {
      requestClearPlan();
    } else if (action === 'sync-shopping') {
      syncShopping();
    }
  });
}

function selectDay(date) {
  if (!E.isValidISODate(date) || date === selectedDate) return;
  selectedDate = date;
  refreshPlan();
  window.requestAnimationFrame(function () {
    if (!isPlanMounted()) return;
    const button = activePlan.root.querySelector('.plan-day[aria-pressed="true"]');
    if (button) button.focus({ preventScroll: true });
  });
}

/* ── Слот: действия, выбор блюда ─────────────────────────────────── */

function currentSlot(date, meal) {
  const state = store.getState();
  const day = state.plan[date] || {};
  return E.recipeById(day[meal]);
}

function openSlot(date, meal) {
  const recipe = currentSlot(date, meal);
  if (recipe) openSlotActions(date, meal, recipe);
  else openPicker(date, meal);
}

function openSlotActions(date, meal, recipe) {
  const state = store.getState();
  const match = E.matchRecipe(recipe, state, date, state.settings.servings);
  const scale = state.settings.servings / recipe.servings;
  const missing = match.missingBlocking.slice(0, 5).map(function (ingredient) {
    const meta = E.ingredientById(ingredient.id);
    const unit = ingredient.unit || (meta ? meta.unit : 'шт');
    return '<li><span>' + esc(meta ? meta.name : ingredient.id) + '</span>' +
      '<span class="mono">' + esc(qty(ingredient.qty * scale, unit)) + '</span></li>';
  }).join('');
  const rule = match.canCook
    ? '<p class="slot-detail__ok">Всё есть на полке — можно готовить.</p>'
    : '<div class="slot-detail__missing">' +
        '<p class="slot-detail__missing-title">Нужно докупить</p>' +
        '<ul class="slot-detail__missing-list">' + missing + '</ul>' +
        (match.missingBlocking.length > 5
          ? '<p class="slot-detail__more">и ещё ' + (match.missingBlocking.length - 5) + '</p>'
          : '') +
      '</div>';

  const sheet = openSheet({
    eyebrow: mealLabel(meal) + ' · ' + E.formatDateShort(date),
    title: recipe.title,
    subtitle: capitalize(E.formatDateWithWeekday(date)),
    className: 'slot-sheet',
    content:
      '<div class="slot-detail">' +
        '<div class="slot-detail__meta">' +
          '<span class="badge">' + recipe.time + ' мин</span>' +
          '<span class="badge">' + match.percent + '% совпадения</span>' +
          '<span class="badge ' + (match.canCook ? 'badge--kale' : 'badge--butter') + '">' +
            (match.canCook ? 'всё есть' : 'не хватает ' + match.missingBlocking.length) +
          '</span>' +
        '</div>' +
        '<p class="slot-detail__desc">' + esc(recipe.description) + '</p>' +
        rule +
        '<button class="btn btn--quiet btn--block slot-detail__remove" type="button" data-slot-remove>' +
          icon('trash') + 'Убрать из плана' +
        '</button>' +
      '</div>',
    footer:
      '<button class="btn btn--primary" type="button" data-slot-open>Открыть рецепт</button>' +
      '<button class="btn btn--ghost" type="button" data-slot-replace>Заменить</button>',
    initialFocus: '[data-slot-open]'
  });

  sheet.dialog.querySelector('[data-slot-open]').addEventListener('click', function () {
    sheet.close();
    window.setTimeout(function () {
      router.navigate('recipes/' + recipe.id);
    }, 70);
  });

  sheet.dialog.querySelector('[data-slot-replace]').addEventListener('click', function () {
    sheet.close();
    window.setTimeout(function () { openPicker(date, meal); }, 70);
  });

  sheet.dialog.querySelector('[data-slot-remove]').addEventListener('click', function () {
    sheet.close();
    removeSlot(date, meal);
  });
}

function removeSlot(date, meal) {
  const state = store.getState();
  const recipeId = state.plan[date] && state.plan[date][meal];
  if (!recipeId) return false;
  const recipe = E.recipeById(recipeId);
  store.clearPlanSlot(date, meal);
  refreshPlan();
  focusSlot(date, meal);
  toast((recipe ? '«' + recipe.title + '»' : 'Блюдо') + ' убрано из плана.', {
    action: 'Отменить',
    onAction: function () {
      store.setPlanSlot(date, meal, recipeId);
      refreshPlan();
      focusSlot(date, meal);
      toast('Блюдо вернулось в план.');
    }
  });
  return true;
}

function openPicker(date, meal) {
  const state = store.getState();
  const currentId = state.plan[date] && state.plan[date][meal];
  const currentRecipe = E.recipeById(currentId);
  let query = '';

  const sheet = openSheet({
    eyebrow: 'План на неделю',
    title: 'Выбрать блюдо',
    subtitle: mealLabel(meal) + ' · ' + capitalize(E.formatDateLong(date)) +
      (currentRecipe ? ' · сейчас «' + currentRecipe.title + '»' : ''),
    className: 'pick-sheet',
    content:
      '<div class="picker">' +
        '<div class="search-field picker-search">' +
          icon('search') +
          '<input type="search" data-pick-search placeholder="Найти блюдо" ' +
            'aria-label="Поиск блюда на ' + esc(mealLabel(meal)) + '" autocomplete="off" enterkeyhint="search">' +
          '<button class="search-field__clear" type="button" data-pick-clear aria-label="Очистить поиск" hidden>' +
            icon('close') +
          '</button>' +
        '</div>' +
        '<p class="picker-count" data-pick-count aria-live="polite"></p>' +
        '<div class="pick-list" data-pick-results></div>' +
      '</div>',
    footer: currentRecipe
      ? '<button class="btn btn--ghost btn--block pick-remove" type="button" data-pick-remove>' +
          icon('trash') + 'Убрать из плана' +
        '</button>'
      : '',
    initialFocus: '[data-pick-search]'
  });

  const input = sheet.dialog.querySelector('[data-pick-search]');
  const clear = sheet.dialog.querySelector('[data-pick-clear]');
  const count = sheet.dialog.querySelector('[data-pick-count]');
  const results = sheet.dialog.querySelector('[data-pick-results]');

  function paint() {
    const ranked = E.rankRecipes(store.getState(), { query: query, tag: 'all', sort: 'match' }, store.getToday())
      .filter(function (entry) { return entry.recipe.meal.includes(meal); });
    count.textContent = query
      ? 'Найдено: ' + ranked.length + ' ' + plural(ranked.length, ['блюдо', 'блюда', 'блюд'])
      : ranked.length + ' ' + plural(ranked.length, ['блюдо', 'блюда', 'блюд']) + ' для этого приёма';

    if (!ranked.length) {
      results.innerHTML = emptyState({
        iconName: 'search',
        title: 'Ничего не нашлось',
        text: 'Попробуйте другое название или очистите поиск.'
      });
      return;
    }

    results.innerHTML = ranked.map(function (entry) {
      const recipe = entry.recipe;
      const match = entry.match;
      const isCurrent = recipe.id === currentId;
      const tone = match.canCook ? '' : (match.percent >= 60 ? 'is-warn' : 'is-danger');
      const percent = Math.max(2, Math.min(100, match.percent));
      const meta = recipe.time + ' мин · ' + match.percent + '% совпадения · ' +
        (match.canCook ? 'всё есть' : 'не хватает ' + match.missingBlocking.length);
      return '<button class="pick' + (isCurrent ? ' is-current' : '') + '" type="button"' +
          ' data-pick-id="' + esc(recipe.id) + '"' +
          ' aria-label="' + esc(recipe.title + ': ' + meta + (isCurrent ? ', уже в плане' : '')) + '">' +
          '<span class="pick__body">' +
            '<span class="pick__title">' + esc(recipe.title) +
              (isCurrent ? '<span class="badge badge--kale">в плане</span>' : '') +
            '</span>' +
            '<span class="pick__meta">' + esc(meta) + '</span>' +
            '<span class="pick__meter" aria-hidden="true">' +
              '<span class="pick__meter-fill ' + tone + '" style="width:' + percent + '%"></span>' +
            '</span>' +
          '</span>' +
          '<span class="pick__tail" aria-hidden="true">' + icon(isCurrent ? 'check' : 'plus') + '</span>' +
        '</button>';
    }).join('');
  }

  input.addEventListener('input', function () {
    query = input.value.trim();
    clear.hidden = !query;
    paint();
  });

  clear.addEventListener('click', function () {
    input.value = '';
    query = '';
    clear.hidden = true;
    paint();
    input.focus();
  });

  sheet.dialog.addEventListener('click', function (event) {
    const pick = event.target.closest('[data-pick-id]');
    if (!pick) return;
    const recipe = E.recipeById(pick.dataset.pickId);
    if (!recipe) return;
    if (recipe.id === currentId) {
      sheet.close();
      toast('Это блюдо уже стоит в плане.');
      return;
    }
    store.setPlanSlot(date, meal, recipe.id);
    sheet.close();
    refreshPlan();
    focusSlot(date, meal);
    toast('«' + recipe.title + '» — в плане на ' + E.formatDateLong(date) + '.');
  });

  const remove = sheet.dialog.querySelector('[data-pick-remove]');
  if (remove) {
    remove.addEventListener('click', function () {
      sheet.close();
      removeSlot(date, meal);
    });
  }

  paint();
}

/* ── Сборка, очистка, покупки ────────────────────────────────────── */

function requestGenerate() {
  const overview = E.planOverview(store.getState(), store.getToday());
  if (!overview.meals) {
    generateNow();
    return;
  }
  confirmSheet({
    title: 'Собрать план заново?',
    text: 'Текущий план на семь дней заменится новыми блюдами. Продукты на полке и список покупок останутся.',
    confirmLabel: 'Собрать заново',
    danger: false
  }).then(function (ok) {
    if (ok) generateNow();
  });
}

function generateNow() {
  const result = store.generatePlan({ seed: Math.floor(Math.random() * 90000) + 7 });
  refreshPlan();
  focusAction('generate', true);
  if (!result.meals) {
    toast('Не нашлось рецептов под эти настройки. Смягчите диету или ограничение по времени.', {
      tone: 'error',
      action: 'Настройки',
      onAction: function () { openPlanSettings(); }
    });
    return;
  }
  track('plan_generate');
  toast('План на семь дней собран: ' + result.meals + ' ' + plural(result.meals, ['приём', 'приёма', 'приёмов']) + ' пищи.');
}

function requestClearPlan() {
  const overview = E.planOverview(store.getState(), store.getToday());
  if (!overview.meals) {
    toast('План и так пустой.');
    return;
  }
  confirmSheet({
    title: 'Очистить план?',
    text: 'Все блюда исчезнут из плана на семь дней. Продукты, покупки и настройки останутся на месте.',
    confirmLabel: 'Очистить план'
  }).then(function (ok) {
    if (!ok) return;
    const snapshot = store.snapshot();
    if (!store.clearPlan()) return;
    refreshPlan();
    focusAction('generate', true);
    toast('План очищен.', {
      action: 'Отменить',
      onAction: function () {
        store.replaceState(snapshot, 'План восстановлен.');
        focusAction('generate', true);
      }
    });
  });
}

function syncShopping() {
  const overview = E.planOverview(store.getState(), store.getToday());
  if (!overview.meals) {
    toast('Сначала соберите план на неделю.');
    return;
  }
  const result = store.syncShoppingFromPlan();
  refreshPlan();
  focusAction('sync-shopping');
  const stats = result.result;
  if (!stats || (!stats.added && !stats.updated && !stats.removed)) {
    toast('Всё для плана уже есть в списке покупок.', {
      action: 'Открыть покупки',
      onAction: function () { router.navigate('shopping'); }
    });
    return;
  }
  const chunks = [];
  if (stats.added) chunks.push('добавили ' + stats.added + ' ' + plural(stats.added, ['позицию', 'позиции', 'позиций']));
  if (stats.updated) chunks.push('обновили ' + stats.updated);
  if (stats.removed) chunks.push('убрали ' + stats.removed);
  toast('Список покупок обновлён: ' + chunks.join(', ') + '.', {
    action: 'Открыть покупки',
    onAction: function () { router.navigate('shopping'); }
  });
}

/* ── Настройки плана (экспорт для «Ещё») ─────────────────────────── */

export function openPlanSettings(options) {
  const opts = options || {};
  const state = store.getState();
  const settings = state.settings;
  const statusText = 'Сохранено. Применится при следующей сборке.';

  const sheet = openSheet({
    eyebrow: 'План на неделю',
    title: 'Настройки плана',
    subtitle: 'Сохраняются сразу и применятся при следующей сборке.',
    className: 'plan-settings-sheet',
    content:
      '<div class="plan-settings">' +
        '<div class="plan-settings__row">' +
          '<div>' +
            '<p class="plan-settings__label" id="ps-servings-label">Порции</p>' +
            '<p class="plan-settings__hint">Сколько готовить за один раз</p>' +
          '</div>' +
          '<div class="stepper" role="group" aria-labelledby="ps-servings-label">' +
            '<button type="button" data-settings-step="-1" aria-label="Меньше порций">' + icon('minus') + '</button>' +
            '<output data-settings-servings aria-live="polite">' + settings.servings + '</output>' +
            '<button type="button" data-settings-step="1" aria-label="Больше порций">' + icon('plus') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="ps-diet">Диета</label>' +
          '<select id="ps-diet" data-settings-diet>' +
            Object.keys(DIET_LABELS).map(function (id) {
              return '<option value="' + id + '"' + (settings.diet === id ? ' selected' : '') + '>' +
                esc(DIET_LABELS[id]) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="ps-time">Максимальное время</label>' +
          '<select id="ps-time" data-settings-time>' +
            Object.keys(TIME_LABELS).map(function (id) {
              return '<option value="' + id + '"' + (String(settings.maxTime) === id ? ' selected' : '') + '>' +
                esc(TIME_LABELS[id]) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<p class="plan-settings__note">' + icon('info') +
          'Настройки влияют только на новую сборку. Уже выбранные блюда останутся в плане.</p>' +
        '<p class="plan-settings__status" data-settings-status role="status" aria-live="polite"></p>' +
      '</div>',
    footer: '<button class="btn btn--primary" type="button" data-settings-done>Готово</button>',
    initialFocus: '[data-settings-step="1"]',
    onClose: function () {
      refreshPlan();
      if (isPlanMounted()) {
        window.requestAnimationFrame(function () {
          if (!isPlanMounted()) return;
          const button = activePlan.root.querySelector('[data-action="plan-settings"]');
          if (button) button.focus({ preventScroll: true });
        });
      }
      if (typeof opts.onClose === 'function') opts.onClose();
    }
  });

  const value = sheet.dialog.querySelector('[data-settings-servings]');
  const minus = sheet.dialog.querySelector('[data-settings-step="-1"]');
  const plus = sheet.dialog.querySelector('[data-settings-step="1"]');
  const diet = sheet.dialog.querySelector('[data-settings-diet]');
  const time = sheet.dialog.querySelector('[data-settings-time]');
  const status = sheet.dialog.querySelector('[data-settings-status]');

  function apply(patch) {
    const wasPlus = document.activeElement === plus;
    const wasMinus = document.activeElement === minus;
    const next = store.updateSettings(patch);
    value.textContent = String(next.servings);
    minus.disabled = next.servings <= 1;
    plus.disabled = next.servings >= 12;
    if (wasPlus && plus.disabled) minus.focus({ preventScroll: true });
    else if (wasMinus && minus.disabled) plus.focus({ preventScroll: true });
    status.textContent = statusText;
    refreshPlan();
    if (typeof opts.onChange === 'function') opts.onChange(next);
  }

  minus.disabled = settings.servings <= 1;
  plus.disabled = settings.servings >= 12;

  minus.addEventListener('click', function () {
    if (store.getState().settings.servings <= 1) return;
    apply({ servings: store.getState().settings.servings - 1 });
  });

  plus.addEventListener('click', function () {
    if (store.getState().settings.servings >= 12) return;
    apply({ servings: store.getState().settings.servings + 1 });
  });

  diet.addEventListener('change', function () {
    apply({ diet: diet.value });
  });

  time.addEventListener('change', function () {
    apply({ maxTime: Number(time.value) });
  });

  sheet.dialog.querySelector('[data-settings-done]').addEventListener('click', function () {
    sheet.close();
  });
}
