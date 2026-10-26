/*
 * ПОЛКА · «Рецепты» и карточка рецепта.
 * Список хранит поиск и фильтр в модульном состоянии, карточка — порции.
 * Данные только читаются из store; изменения — только через методы store.
 */

import * as store from '../store.js';
import * as router from '../router.js';
import { track } from '../analytics.js';
import {
  DATA, E, esc, icon, money, qty, plural, capitalize, render, $, $$, on,
  emptyState, matchLabel, matchTone, toast, openSheet
} from '../ui.js';

const TOTAL_RECIPES = DATA.RECIPES.length;

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'ready', label: 'Можно готовить' },
  { id: 'almost', label: 'Почти' },
  { id: 'quick', label: 'Быстро' },
  { id: 'vegetarian', label: 'Вегетарианское' },
  { id: 'glutenFree', label: 'Без глютена' },
  { id: 'rescue', label: 'Спасти' }
];

const listState = { query: '', tag: 'all' };
let cardServings = null;
let cardRecipeId = '';

/* ── Общие помощники ─────────────────────────────────────────────── */

function recipePlural(count) {
  return plural(count, ['рецепт', 'рецепта', 'рецептов']);
}

function portionPlural(count) {
  return plural(count, ['порция', 'порции', 'порций']);
}

function clampServings(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 2;
  return Math.min(12, Math.max(1, number));
}

function currentServings(state) {
  if (cardServings === null) cardServings = clampServings(state.settings.servings);
  return cardServings;
}

function mealsText(recipe) {
  return recipe.meal.map(function (id) { return E.mealLabel(id); }).join(', ');
}

function missingShort(match) {
  const names = match.missingBlocking.map(function (ingredient) {
    const meta = E.ingredientById(ingredient.id);
    return meta ? meta.name : ingredient.id;
  });
  if (!names.length) return '';
  let text = 'Не хватает: ' + names.slice(0, 2).join(', ');
  if (names.length > 2) {
    const rest = names.length - 2;
    text += ' и ещё ' + rest + ' ' + plural(rest, ['продукт', 'продукта', 'продуктов']);
  }
  return text;
}

/* ── Список рецептов ─────────────────────────────────────────────── */

function rankedFor(state) {
  const today = store.getToday();
  if (listState.tag === 'rescue') {
    return E.rankRecipes(state, { query: listState.query, tag: 'all', sort: 'rescue' }, today)
      .filter(function (entry) { return entry.match.rescue > 0; });
  }
  return E.rankRecipes(state, { query: listState.query, tag: listState.tag }, today);
}

function filterCaption() {
  const parts = [];
  if (listState.query) parts.push('поиск: «' + listState.query + '»');
  const active = FILTERS.filter(function (filter) { return filter.id === listState.tag; })[0];
  if (listState.tag === 'rescue') parts.push('спасают продукты');
  else if (active && active.id !== 'all') parts.push(active.label.toLowerCase());
  return parts.length ? parts.join(' · ') : 'сначала лучшее совпадение';
}

function recipeCardHtml(entry, servings) {
  const recipe = entry.recipe;
  const match = entry.match;
  const ready = match.canCook;
  const rescue = match.rescue;
  return '<a class="recipe-card" href="#/recipes/' + encodeURIComponent(recipe.id) + '" data-recipe-card="' + esc(recipe.id) + '">' +
    '<div class="recipe-card__top">' +
      '<span class="recipe-card__meal">' + esc(mealsText(recipe)) + '</span>' +
      '<span class="recipe-card__time">' + icon('clock') + esc(recipe.time) + ' мин</span>' +
    '</div>' +
    '<h2 class="recipe-card__title">' + esc(recipe.title) + '</h2>' +
    '<p class="recipe-card__desc">' + esc(recipe.description) + '</p>' +
    '<div class="recipe-card__match">' +
      '<div class="recipe-card__match-head">' +
        '<span class="recipe-card__percent">' + match.percent + '<small>%</small></span>' +
        '<span class="recipe-card__status' + (ready ? ' is-ready' : '') + '">' + esc(matchLabel(match)) + '</span>' +
      '</div>' +
      '<div class="meter" aria-hidden="true"><span class="meter__fill ' + matchTone(match) + '" style="width:' + match.percent + '%"></span></div>' +
      (ready ? '' : '<p class="recipe-card__missing">' + esc(missingShort(match)) + '</p>') +
    '</div>' +
    '<div class="recipe-card__foot">' +
      '<span class="recipe-card__meta">≈ ' + money(E.recipeCost(recipe, servings)) + ' · рецепт на ' + servings + ' ' + portionPlural(servings) + '</span>' +
      (rescue > 0
        ? '<span class="badge badge--tomato recipe-card__rescue">' + icon('leaf') + 'Спасает ' + rescue + ' ' + plural(rescue, ['продукт', 'продукта', 'продуктов']) + '</span>'
        : '') +
    '</div>' +
  '</a>';
}

function listMarkup(entries, servings) {
  if (!entries.length) {
    const text = listState.query
      ? 'По запросу «' + listState.query + '» ничего нет. Попробуйте другое слово или сбросьте фильтры.'
      : 'Под этот фильтр пока ничего не подходит. Сбросьте его и посмотрите всю подборку.';
    return emptyState({
      iconName: 'search',
      title: 'Ничего не нашлось',
      text: text,
      actionLabel: 'Сбросить фильтры',
      actionAttrs: 'data-action="reset-filters"'
    });
  }
  return entries.map(function (entry) {
    return recipeCardHtml(entry, servings);
  }).join('');
}

function statusMarkup(count) {
  return '<strong>' + count + ' ' + recipePlural(count) + '</strong><span>' + esc(filterCaption()) + '</span>';
}

function applyList(root) {
  const screen = $('.recipes-screen', root);
  if (!screen) return;
  const state = store.getState();
  const entries = rankedFor(state);
  const results = $('[data-results]', screen);
  const status = $('[data-status]', screen);
  const input = $('[data-search]', screen);
  const clear = $('[data-clear-search]', screen);

  $$('[data-chip]', screen).forEach(function (chip) {
    chip.setAttribute('aria-pressed', String(chip.getAttribute('data-chip') === listState.tag));
  });
  if (clear && input) clear.hidden = input.value.length === 0;
  results.innerHTML = listMarkup(entries, state.settings.servings);
  status.innerHTML = statusMarkup(entries.length);
}

function clearSearch(root) {
  const screen = $('.recipes-screen', root);
  if (!screen) return;
  const input = $('[data-search]', screen);
  const clear = $('[data-clear-search]', screen);
  listState.query = '';
  if (input) {
    input.value = '';
    input.focus({ preventScroll: true });
  }
  if (clear) clear.hidden = true;
  applyList(root);
}

function bindList(root) {
  const screen = $('.recipes-screen', root);
  if (!screen) return;

  on(screen, 'input', '[data-search]', function (event, input) {
    listState.query = input.value.trim();
    const clear = $('[data-clear-search]', screen);
    if (clear) clear.hidden = input.value.length === 0;
    applyList(root);
  });

  on(screen, 'keydown', '[data-search]', function (event, input) {
    if (event.key !== 'Escape' || !input.value) return;
    event.preventDefault();
    clearSearch(root);
  });

  on(screen, 'click', '[data-clear-search]', function (event) {
    event.preventDefault();
    clearSearch(root);
  });

  on(screen, 'click', '[data-chip]', function (event, chip) {
    const tag = chip.getAttribute('data-chip');
    if (!tag || tag === listState.tag) return;
    listState.tag = tag;
    applyList(root);
    chip.scrollIntoView({ inline: 'center', block: 'nearest' });
  });

  on(screen, 'click', '[data-action="reset-filters"]', function () {
    listState.query = '';
    listState.tag = 'all';
    const input = $('[data-search]', screen);
    if (input) {
      input.value = '';
      input.focus({ preventScroll: true });
    }
    applyList(root);
  });
}

export function recipesScreen(root) {
  render(root,
    '<div class="screen recipes-screen">' +
      '<header class="screen-head recipes-head">' +
        '<p class="eyebrow">Кухня · подборка</p>' +
        '<h1 class="screen-title">Что приготовить</h1>' +
        '<p class="screen-lead"><strong>' + TOTAL_RECIPES + ' ' + recipePlural(TOTAL_RECIPES) + '</strong> в блокноте. Сначала — те, что лучше совпадают с полкой.</p>' +
      '</header>' +
      '<div class="search-field recipes-search">' +
        icon('search') +
        '<label class="visually-hidden" for="recipes-search">Поиск рецептов</label>' +
        '<input id="recipes-search" type="search" name="q" value="' + esc(listState.query) + '" placeholder="Блюдо или продукт" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-search>' +
        '<button class="search-field__clear" type="button" data-clear-search aria-label="Очистить поиск"' + (listState.query ? '' : ' hidden') + '>' + icon('close') + '</button>' +
      '</div>' +
      '<div class="chips recipes-chips" role="group" aria-label="Фильтры рецептов">' +
        FILTERS.map(function (filter) {
          return '<button class="chip" type="button" data-chip="' + filter.id + '" aria-pressed="' + (listState.tag === filter.id) + '">' + esc(filter.label) + '</button>';
        }).join('') +
      '</div>' +
      '<div class="recipes-status" data-status role="status" aria-live="polite"></div>' +
      '<div class="recipe-list" data-results></div>' +
    '</div>'
  );

  bindList(root);
  applyList(root);

  const active = $('.chip[aria-pressed="true"]', root);
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/* ── Карточка рецепта: разметка ─────────────────────────────────── */

function recipeHeadHtml(recipe) {
  return '<header class="recipe-head">' +
    '<button class="text-link recipe-back" type="button" data-action="back">' + icon('arrow-left') + 'Назад</button>' +
    '<p class="eyebrow">Рецепт · ' + esc(mealsText(recipe)) + '</p>' +
    '<h1 class="recipe-title">' + esc(recipe.title) + '</h1>' +
    '<p class="recipe-desc">' + esc(recipe.description) + '</p>' +
    '<ul class="recipe-tags" aria-label="Теги рецепта">' +
      recipe.tags.map(function (tag) {
        return '<li class="recipe-tag">' + esc(E.tagLabel(tag)) + '</li>';
      }).join('') +
    '</ul>' +
    '<p class="recipe-meta">' +
      '<span>' + icon('clock') + recipe.time + ' мин</span>' +
      '<span>' + icon('users') + 'на ' + recipe.servings + ' ' + plural(recipe.servings, ['порцию', 'порции', 'порций']) + '</span>' +
    '</p>' +
  '</header>';
}

function matchSummaryHtml(match, servings, cost) {
  const ready = match.canCook;
  return '<div class="match-summary">' +
    '<div class="match-summary__score">' +
      '<span class="match-summary__percent">' + match.percent + '<small>%</small></span>' +
      '<span class="match-summary__caption">совпадение</span>' +
    '</div>' +
    '<div class="match-summary__body">' +
      '<p class="match-summary__status' + (ready ? ' is-ready' : '') + '">' + esc(matchLabel(match)) + '</p>' +
      '<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + match.percent + '" aria-label="Совпадение с полкой">' +
        '<span class="meter__fill ' + matchTone(match) + '" style="width:' + match.percent + '%"></span>' +
      '</div>' +
      '<p class="match-summary__note">' + servings + ' ' + portionPlural(servings) + ' · ≈ ' + money(cost) + '</p>' +
      (ready
        ? '<p class="match-summary__missing is-ready">Все продукты на полке</p>'
        : '<p class="match-summary__missing">' + esc(missingShort(match)) + '</p>') +
      (match.rescue > 0
        ? '<p class="match-summary__rescue">Спасает ' + match.rescue + ' ' + plural(match.rescue, ['продукт', 'продукта', 'продуктов']) + ' со сроком</p>'
        : '') +
    '</div>' +
  '</div>';
}

function ingredientRowHtml(ingredient, recipe, state, servings, today) {
  const meta = E.ingredientById(ingredient.id);
  const name = meta ? meta.name : ingredient.id;
  const unit = ingredient.unit || (meta ? meta.unit : 'шт');
  const amount = ingredient.qty * (servings / recipe.servings);
  const available = E.availableQty(state, ingredient.id, unit, today);
  const present = E.hasIngredient(state, ingredient.id, amount, unit, today);
  const expiring = E.pantryEntries(state, ingredient.id).some(function (item) {
    const expiry = E.expiryState(item.expires, today);
    return expiry.tone === 'today' || expiry.tone === 'soon';
  });

  let tone = 'is-missing';
  let status = 'докупить';
  if (ingredient.optional) {
    tone = 'is-optional';
    status = 'по желанию';
  } else if (present) {
    tone = 'is-present';
    status = 'на полке';
  } else if (available > 0.0001) {
    status = 'докупить · есть ' + qty(available, unit);
  }

  return '<li class="ingredient-list__row ' + tone + '">' +
    '<span class="ingredient-list__dot" aria-hidden="true"></span>' +
    '<span class="ingredient-list__body">' +
      '<span class="ingredient-list__name">' + esc(name) + '</span>' +
      '<span class="ingredient-list__sub">' + esc(status) +
        (present && expiring ? '<span class="ingredient-list__flag">скоро срок</span>' : '') +
      '</span>' +
    '</span>' +
    '<span class="ingredient-list__qty">' + esc(qty(amount, unit)) + '</span>' +
  '</li>';
}

function ingredientsHtml(recipe, state, servings, today) {
  return '<div class="section-head">' +
      '<h2 class="section-title" id="recipe-ingredients-title">Состав</h2>' +
      '<span class="section-note">на ' + servings + ' ' + portionPlural(servings) + '</span>' +
    '</div>' +
    '<ul class="ingredient-list">' +
      recipe.ingredients.map(function (ingredient) {
        return ingredientRowHtml(ingredient, recipe, state, servings, today);
      }).join('') +
    '</ul>';
}

function actionsHtml(missingCount) {
  const missingLabel = missingCount > 0
    ? 'Добавить ' + missingCount + ' ' + plural(missingCount, ['недостающий продукт', 'недостающих продукта', 'недостающих продуктов']) + ' в покупки'
    : '';
  return '<h2 class="section-title" id="recipe-actions-title">Что дальше</h2>' +
    '<div class="recipe-actions__stack">' +
      '<button class="btn btn--primary recipe-actions__cook" type="button" data-action="cook">' + icon('pot') + 'Готовить</button>' +
      (missingCount > 0
        ? '<button class="btn btn--ghost" type="button" data-action="missing" aria-label="' + esc(missingLabel) + '">' +
            icon('basket') + 'Добавить недостающее в покупки' +
            '<span class="recipe-actions__count" aria-hidden="true">' + missingCount + '</span>' +
          '</button>'
        : '<button class="btn btn--ghost" type="button" disabled>' + icon('check') + 'Всё есть — покупать нечего</button>') +
      '<button class="btn btn--ghost" type="button" data-action="plan">' + icon('calendar') + 'В план</button>' +
    '</div>' +
    '<p class="recipe-actions__note">Готовка спишет продукты с полки. Отменить можно сразу после — кнопкой в сообщении.</p>';
}

function stepsHtml(recipe) {
  return '<ol class="recipe-steps">' +
      recipe.steps.map(function (step) {
        return '<li>' + esc(step) + '</li>';
      }).join('') +
    '</ol>' +
    (recipe.tip
      ? '<div class="note note--warn recipe-tip">' +
          '<p class="note__title">Подсказка</p>' +
          '<p class="note__text">' + esc(recipe.tip) + '</p>' +
        '</div>'
      : '');
}

function originHtml(recipe) {
  if (!recipe.source && !recipe.video) return '';
  return '<section class="section recipe-origin" aria-labelledby="recipe-origin-title">' +
      '<div class="section-head">' +
        '<h2 class="section-title" id="recipe-origin-title">Источник и видео</h2>' +
        '<span class="section-note">внешние ссылки</span>' +
      '</div>' +
      '<div class="recipe-origin__links">' +
        (recipe.source
          ? '<a class="origin-link" data-origin="source" href="' + esc(recipe.source.url) + '" target="_blank" rel="noopener noreferrer">' +
              '<span class="origin-link__icon">' + icon('book') + '</span>' +
              '<span class="origin-link__body">' +
                '<span class="origin-link__eyebrow">Рецепт на сайте</span>' +
                '<span class="origin-link__title">' + esc(recipe.source.name) + '</span>' +
                (recipe.source.note ? '<span class="origin-link__meta">' + esc(recipe.source.note) + '</span>' : '') +
              '</span>' +
              icon('external', 'origin-link__arrow') +
            '</a>'
          : '') +
        (recipe.video
          ? '<a class="origin-link origin-link--video" data-origin="video" href="' + esc(recipe.video.url) + '" target="_blank" rel="noopener noreferrer">' +
              '<span class="origin-link__icon">' + icon('play') + '</span>' +
              '<span class="origin-link__body">' +
                '<span class="origin-link__eyebrow">Видео-инструкция</span>' +
                '<span class="origin-link__title">' + esc(recipe.video.title) + '</span>' +
                '<span class="origin-link__meta">' + esc(recipe.video.channel) + ' · YouTube</span>' +
              '</span>' +
              icon('external', 'origin-link__arrow') +
            '</a>'
          : '') +
      '</div>' +
      '<p class="recipe-origin__note">Ссылки откроются в браузере. Приложение продолжит работать офлайн.</p>' +
    '</section>';
}

function recipeMarkup(recipe) {
  const state = store.getState();
  const today = store.getToday();
  const servings = currentServings(state);
  const match = E.matchRecipe(recipe, state, today, servings);
  const missing = E.collectRecipeMissing(recipe, state, servings, today);

  return '<div class="screen recipe-screen">' +
    recipeHeadHtml(recipe) +
    '<div class="card recipe-match">' +
      '<div data-region="match">' + matchSummaryHtml(match, servings, E.recipeCost(recipe, servings)) + '</div>' +
      '<div class="recipe-servings">' +
        '<div>' +
          '<span class="recipe-servings__label">Порции</span>' +
          '<span class="recipe-servings__hint">от 1 до 12</span>' +
        '</div>' +
        '<div class="stepper" role="group" aria-label="Количество порций">' +
          '<button type="button" data-servings="-1" aria-label="Уменьшить количество порций"' + (servings <= 1 ? ' disabled' : '') + '>' + icon('minus') + '</button>' +
          '<output data-servings-output>' + servings + '</output>' +
          '<button type="button" data-servings="1" aria-label="Увеличить количество порций"' + (servings >= 12 ? ' disabled' : '') + '>' + icon('plus') + '</button>' +
        '</div>' +
        '<p class="visually-hidden" data-servings-live aria-live="polite">Порции: ' + servings + '</p>' +
      '</div>' +
    '</div>' +
    '<section class="section recipe-ingredients" aria-labelledby="recipe-ingredients-title" data-region="ingredients">' +
      ingredientsHtml(recipe, state, servings, today) +
    '</section>' +
    '<section class="section recipe-steps-section" aria-labelledby="recipe-steps-title">' +
      '<div class="section-head">' +
        '<h2 class="section-title" id="recipe-steps-title">Как готовить</h2>' +
        '<span class="section-note">' + recipe.steps.length + ' ' + plural(recipe.steps.length, ['шаг', 'шага', 'шагов']) + '</span>' +
      '</div>' +
      stepsHtml(recipe) +
    '</section>' +
    originHtml(recipe) +
    '<section class="section recipe-actions" aria-labelledby="recipe-actions-title" data-region="actions">' +
      actionsHtml(missing.length) +
    '</section>' +
  '</div>';
}

/* ── Карточка рецепта: пересчёт порций ─────────────────────────── */

function updateServings(screen, recipe) {
  const state = store.getState();
  const today = store.getToday();
  const servings = currentServings(state);
  const match = E.matchRecipe(recipe, state, today, servings);
  const missing = E.collectRecipeMissing(recipe, state, servings, today);
  const matchRegion = $('[data-region="match"]', screen);
  const ingredientsRegion = $('[data-region="ingredients"]', screen);
  const actionsRegion = $('[data-region="actions"]', screen);

  if (matchRegion) matchRegion.innerHTML = matchSummaryHtml(match, servings, E.recipeCost(recipe, servings));
  if (ingredientsRegion) ingredientsRegion.innerHTML = ingredientsHtml(recipe, state, servings, today);
  if (actionsRegion) actionsRegion.innerHTML = actionsHtml(missing.length);

  const output = $('[data-servings-output]', screen);
  if (output) output.textContent = String(servings);
  const minus = $('[data-servings="-1"]', screen);
  const plus = $('[data-servings="1"]', screen);
  if (minus) minus.disabled = servings <= 1;
  if (plus) plus.disabled = servings >= 12;
  const live = $('[data-servings-live]', screen);
  if (live) live.textContent = 'Порции: ' + servings + ', ' + portionPlural(servings);
}

/* ── Шторка «Готовить» ─────────────────────────────────────────── */

function cookPreviewHtml(recipe, report, servings) {
  return '<div class="cook-summary">' +
      '<span><strong>' + servings + ' ' + portionPlural(servings) + '</strong></span>' +
      '<span>' + recipe.time + ' мин</span>' +
      '<span>' + esc(E.mealLabel(recipe.meal[0])) + '</span>' +
    '</div>' +
    (report.deductions.length
      ? '<div class="cook-block">' +
          '<h3 class="cook-block__title">Спишется с полки</h3>' +
          '<ul class="cook-list">' +
            report.deductions.map(function (item) {
              return '<li>' +
                '<span class="cook-list__name">' + esc(item.name) +
                  (item.urgent ? '<span class="badge badge--butter">скоро срок</span>' : '') +
                '</span>' +
                '<span class="cook-list__qty">− ' + esc(qty(item.take, item.unit)) + '</span>' +
              '</li>';
            }).join('') +
          '</ul>' +
        '</div>'
      : '<div class="note cook-note">' +
          '<p class="note__title">С полки ничего не спишется</p>' +
          '<p class="note__text">Нужных продуктов нет или они уже закончились.</p>' +
        '</div>') +
    (report.shortages.length
      ? '<div class="note note--warn cook-note">' +
          '<p class="note__title">Не хватит ' + report.shortages.length + ' ' + plural(report.shortages.length, ['продукта', 'продуктов', 'продуктов']) + '</p>' +
          '<ul class="cook-shortages">' +
            report.shortages.map(function (item) {
              return '<li><span>' + esc(item.name) + '</span><span>' + esc(qty(item.qty, item.unit)) + '</span></li>';
            }).join('') +
          '</ul>' +
        '</div>'
      : '<div class="note note--ok cook-note">' +
          '<p class="note__title">Всё есть</p>' +
          '<p class="note__text">Полка закрывает рецепт полностью.</p>' +
        '</div>') +
    (report.urgentCount
      ? '<div class="note note--ok cook-note">' +
          '<p class="note__title">Спасаете ' + report.urgentCount + ' ' + plural(report.urgentCount, ['продукт', 'продукта', 'продуктов']) + '</p>' +
          '<p class="note__text">Продукты со сроком на ' + money(report.savedValue) + ' пойдут в дело.</p>' +
        '</div>'
      : '');
}

function openCookSheet(recipe) {
  const state = store.getState();
  const servings = currentServings(state);
  const report = E.planCooking(recipe, state, servings, store.getToday());
  let busy = false;

  openSheet({
    eyebrow: 'Приготовление · ' + servings + ' ' + portionPlural(servings),
    title: recipe.title,
    subtitle: 'Проверьте, что спишется с полки. Передумать можно сразу после готовки.',
    className: 'recipe-sheet',
    content: cookPreviewHtml(recipe, report, servings),
    footer: '<button class="btn btn--ghost" type="button" data-cook-cancel>Отмена</button>' +
      '<button class="btn btn--primary" type="button" data-cook-confirm>Готовить</button>',
    initialFocus: '[data-cook-cancel]',
    onMount: function (dialog, entry) {
      const cancel = dialog.querySelector('[data-cook-cancel]');
      const confirm = dialog.querySelector('[data-cook-confirm]');

      cancel.addEventListener('click', function () { entry.close(); });

      confirm.addEventListener('click', function () {
        if (busy) return;
        busy = true;
        confirm.disabled = true;
        cancel.disabled = true;
        const snapshot = store.snapshot();
        let result;
        try {
          result = store.cook(recipe, servings);
        } catch (error) {
          busy = false;
          confirm.disabled = false;
          cancel.disabled = false;
          toast('Не получилось приготовить. Продукты остались на полке.', { tone: 'error' });
          return;
        }

        if (result) track('cook');
        entry.close();
        router.refresh({ scroll: false });
        if (!result) return;

        let message = 'Приготовлено: «' + recipe.title + '».';
        if (result.shortages.length) {
          message += ' Не хватило ' + result.shortages.length + ' ' +
            plural(result.shortages.length, ['продукта', 'продуктов', 'продуктов']) + '.';
        } else if (result.deductions.length) {
          message += result.urgentCount
            ? ' Спасено ' + result.urgentCount + ' ' + plural(result.urgentCount, ['продукт', 'продукта', 'продуктов']) + '.'
            : ' Полка обновлена.';
        } else {
          message += ' С полки ничего не списано.';
        }

        toast(message, {
          action: 'Отменить',
          onAction: function () {
            store.replaceState(snapshot, 'Приготовление отменено. Полка в прежнем виде.');
          }
        });
      });
    }
  });
}

/* ── Шторка «В план» ───────────────────────────────────────────── */

function defaultMeal(recipe) {
  const meals = Array.isArray(recipe.meal) ? recipe.meal : [];
  for (let index = 0; index < DATA.MEAL_ORDER.length; index += 1) {
    if (meals.indexOf(DATA.MEAL_ORDER[index]) !== -1) return DATA.MEAL_ORDER[index];
  }
  return DATA.MEAL_ORDER[0];
}

function planDatesHtml(dates) {
  return dates.map(function (iso, index) {
    const day = index === 0 ? 'Сегодня' : index === 1 ? 'Завтра' : capitalize(E.weekdayLong(iso));
    const meta = index <= 1
      ? capitalize(E.weekdayShort(iso)) + ' · ' + E.formatDateShort(iso)
      : E.formatDateShort(iso);
    return '<label class="plan-date">' +
      '<input class="plan-date__input" type="radio" name="plan-date" value="' + iso + '"' + (index === 0 ? ' checked' : '') + '>' +
      '<span class="plan-date__box">' +
        '<span class="plan-date__day">' + esc(day) + '</span>' +
        '<span class="plan-date__meta">' + esc(meta) + '</span>' +
      '</span>' +
    '</label>';
  }).join('');
}

function openPlanSheet(recipe) {
  const today = store.getToday();
  const dates = [];
  for (let index = 0; index < 7; index += 1) dates.push(E.addDays(today, index));
  const meal = defaultMeal(recipe);
  let busy = false;

  const content = '<form class="plan-picker" id="recipe-plan-form" data-plan-form>' +
    '<fieldset class="plan-picker__fieldset">' +
      '<legend class="plan-picker__legend">День</legend>' +
      '<div class="plan-dates">' + planDatesHtml(dates) + '</div>' +
    '</fieldset>' +
    '<fieldset class="plan-picker__fieldset">' +
      '<legend class="plan-picker__legend">Приём пищи</legend>' +
      '<div class="plan-meals">' +
        DATA.MEAL_ORDER.map(function (id) {
          return '<label class="plan-meal">' +
            '<input class="plan-meal__input" type="radio" name="plan-meal" value="' + id + '"' + (id === meal ? ' checked' : '') + '>' +
            '<span>' + esc(E.mealLabel(id)) + '</span>' +
          '</label>';
        }).join('') +
      '</div>' +
    '</fieldset>' +
    '<p class="plan-picker__hint">Если в выбранном слоте уже есть блюдо, оно заменится. Порции берутся из настроек плана.</p>' +
  '</form>';

  openSheet({
    eyebrow: 'План на неделю',
    title: 'Поставить в план',
    subtitle: recipe.title,
    className: 'recipe-sheet',
    content: content,
    footer: '<button class="btn btn--ghost" type="button" data-plan-cancel>Отмена</button>' +
      '<button class="btn btn--primary" type="submit" form="recipe-plan-form" data-plan-submit>В план</button>',
    initialFocus: 'input[name="plan-date"]:checked',
    onMount: function (dialog, entry) {
      const form = dialog.querySelector('[data-plan-form]');
      const submit = dialog.querySelector('[data-plan-submit]');
      const cancel = dialog.querySelector('[data-plan-cancel]');

      cancel.addEventListener('click', function () { entry.close(); });

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (busy) return;
        const date = form.querySelector('input[name="plan-date"]:checked');
        const mealInput = form.querySelector('input[name="plan-meal"]:checked');
        if (!date || !mealInput) {
          toast('Выберите день и приём пищи.', { tone: 'error' });
          return;
        }
        busy = true;
        submit.disabled = true;

        let saved = null;
        try {
          saved = store.setPlanSlot(date.value, mealInput.value, recipe.id);
        } catch (error) {
          saved = null;
        }
        if (!saved) {
          busy = false;
          submit.disabled = false;
          toast('Не получилось поставить блюдо в план. Попробуйте ещё раз.', { tone: 'error' });
          return;
        }

        entry.close();
        toast(capitalize(E.mealLabel(mealInput.value)) + ' в плане: ' + E.formatDateWithWeekday(date.value) + '.', {
          action: 'Открыть план',
          onAction: function () { router.navigate('plan'); }
        });
      });
    }
  });
}

/* ── Карточка рецепта: действия ────────────────────────────────── */

function addMissingToShopping(screen, recipe) {
  const servings = currentServings(store.getState());
  let result;
  try {
    result = store.addRecipeMissing(recipe, servings);
  } catch (error) {
    toast('Не получилось добавить продукты в покупки.', { tone: 'error' });
    return;
  }

  const count = result && result.additions ? result.additions.length : 0;
  if (!count) {
    toast('Всё есть на полке — покупать нечего.');
    updateServings(screen, recipe);
    return;
  }

  toast('В покупки добавлено: ' + count + ' ' + plural(count, ['позиция', 'позиции', 'позиций']) + '.', {
    action: 'Открыть покупки',
    onAction: function () { router.navigate('shopping'); }
  });
}

function bindRecipe(root, recipe) {
  const screen = $('.recipe-screen', root);
  if (!screen) return;

  on(screen, 'click', '[data-action="back"]', function (event) {
    event.preventDefault();
    router.back('recipes');
  });

  on(screen, 'click', '[data-servings]', function (event, button) {
    if (button.disabled) return;
    const step = Number(button.getAttribute('data-servings'));
    if (!Number.isFinite(step) || !step) return;
    const next = clampServings(currentServings(store.getState()) + step);
    if (next === cardServings) return;
    cardServings = next;
    updateServings(screen, recipe);
  });

  on(screen, 'click', '[data-action="cook"]', function () {
    openCookSheet(recipe);
  });

  on(screen, 'click', '[data-action="missing"]', function () {
    addMissingToShopping(screen, recipe);
  });

  on(screen, 'click', '[data-action="plan"]', function () {
    openPlanSheet(recipe);
  });
}

export function recipeScreen(root, ctx) {
  const id = ctx && ctx.params ? ctx.params.id : '';
  const recipe = id ? E.recipeById(id) : null;

  if (!recipe) {
    router.setTitle('Рецепт не найден');
    render(root,
      '<div class="screen recipe-screen">' +
        '<button class="text-link recipe-back" type="button" data-action="back-to-recipes">' + icon('arrow-left') + 'Назад к рецептам</button>' +
        '<div class="empty recipe-notfound">' +
          '<span class="empty__icon">' + icon('book') + '</span>' +
          '<h1 class="empty__title">Рецепт не найден</h1>' +
          '<p class="empty__text">Ссылка могла устареть. В подборке — все рецепты, которые подходят к вашей полке.</p>' +
          '<button class="btn btn--primary" type="button" data-action="to-recipes">К рецептам</button>' +
        '</div>' +
      '</div>'
    );
    const screen = $('.recipe-screen', root);
    on(screen, 'click', '[data-action="back-to-recipes"], [data-action="to-recipes"]', function () {
      router.navigate('recipes');
    });
    return;
  }

  router.setTitle(recipe.title);
  // router.refresh() перерисовывает тот же рецепт после готовки — это не новое открытие.
  const reopened = cardRecipeId === recipe.id && Boolean(root.querySelector('.recipe-screen'));
  if (cardServings === null || cardRecipeId !== recipe.id) {
    cardServings = clampServings(store.getState().settings.servings);
    cardRecipeId = recipe.id;
  }
  render(root, recipeMarkup(recipe));
  bindRecipe(root, recipe);
  if (!reopened) track('recipe_open');
}
