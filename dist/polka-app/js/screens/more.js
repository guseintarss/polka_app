/*
 * ПОЛКА · экран «Ещё».
 * Статистика кухни, настройки плана, перенос данных, аналитика и установка PWA.
 */

import * as store from '../store.js';
import * as router from '../router.js';
import * as pwa from '../pwa.js';
import { APP_VERSION } from '../version.js';
import {
  E, esc, icon, money, plural, render, toast,
  confirmSheet, closeAllSheets, shareText
} from '../ui.js';
import {
  track, getSummary, buildTextReport, buildJsonReport, resetAnalytics
} from '../analytics.js';
import { openPlanSettings, planSettingsSummary } from './plan.js';
import * as lookup from '../lookup.js';

const INSTALL_HINT = 'Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».';

let busy = false;

/* ── Живые статусы (подписки модуля, не экрана) ──────────────────── */

pwa.onInstallChange(function () {
  const box = document.querySelector('[data-more-install]');
  if (box) box.innerHTML = installMarkup();
});

window.addEventListener('online', updateNetwork);
window.addEventListener('offline', updateNetwork);

store.subscribe(function (event) {
  if (event.type === 'persistence') updatePersistence();
  if (event.type === 'save') updateSavedAt();
});

/* ── Экран ───────────────────────────────────────────────────────── */

export function moreScreen(root, ctx) {
  const state = store.getState();
  const summary = E.statsSummary(state, store.getToday());

  render(root,
    '<div class="screen more-screen" data-more-screen>' +
      '<header class="screen-head">' +
        '<p class="eyebrow">Кухня и данные</p>' +
        '<h1 class="screen-title">Ещё</h1>' +
        '<p class="screen-lead">Статистика, настройки плана и перенос кухни. Всё хранится на этом устройстве.</p>' +
      '</header>' +
      statsMarkup(summary) +
      settingsMarkup(state) +
      dataMarkup() +
      analyticsMarkup() +
      '<section class="section" aria-labelledby="more-install-title">' +
        '<div class="section-head">' +
          '<h2 class="section-title" id="more-install-title">Установка</h2>' +
          '<span class="section-note">pwa</span>' +
        '</div>' +
        '<div data-more-install>' + installMarkup() + '</div>' +
      '</section>' +
      aboutMarkup() +
    '</div>'
  );

  bindMoreEvents(root.querySelector('[data-more-screen]'));
}

function statsMarkup(summary) {
  const saved = summary.savedWeek;
  const savedProducts = saved.count;
  const chart = chartMarkup(summary.history);
  const riskSub = summary.expired
    ? 'просрочено: ' + summary.expired
    : 'просроченных нет';

  return '<section class="section" aria-labelledby="more-stats-title">' +
    '<div class="section-head">' +
      '<h2 class="section-title" id="more-stats-title">Кухня сейчас</h2>' +
      '<span class="section-note">на сегодня</span>' +
    '</div>' +
    '<div class="card more-ledger">' +
      '<div class="more-ledger__cell">' +
        '<span class="more-ledger__value">' + summary.pantryCount + '</span>' +
        '<span class="more-ledger__label">' + esc(plural(summary.pantryCount, ['продукт', 'продукта', 'продуктов'])) + ' на полке</span>' +
      '</div>' +
      '<div class="more-ledger__cell">' +
        '<span class="more-ledger__value">' + money(summary.totalValue) + '</span>' +
        '<span class="more-ledger__label">стоимость полки</span>' +
      '</div>' +
    '</div>' +
    '<div class="more-figures">' +
      '<div class="card more-figure">' +
        '<span class="more-figure__value">' + summary.cooked + '</span>' +
        '<span class="more-figure__label">приготовлено</span>' +
        '<span class="more-figure__sub">за всё время</span>' +
      '</div>' +
      '<div class="card more-figure' + (summary.expired ? ' is-danger' : '') + '">' +
        '<span class="more-figure__value">' + summary.expiring + '</span>' +
        '<span class="more-figure__label">скоро срок</span>' +
        '<span class="more-figure__sub' + (summary.expired ? ' is-danger' : '') + '">' + esc(riskSub) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="card more-saved">' +
      '<div class="more-saved__head">' +
        '<span class="more-saved__label">Спасено за неделю</span>' +
        '<span class="more-saved__value">' + money(saved.value) + '</span>' +
        '<span class="more-saved__sub">' + savedProducts + ' ' +
          esc(plural(savedProducts, ['продукт', 'продукта', 'продуктов'])) + '</span>' +
      '</div>' +
      (savedProducts || saved.value
        ? chart
        : '<p class="more-saved__calm">На этой неделе пока ничего не спасали. Готовьте из того, что скоро закончится, — продукты не пропадут.</p>') +
    '</div>' +
  '</section>';
}

function chartMarkup(history) {
  const max = history.reduce(function (top, day) {
    return Math.max(top, Number(day.value) || 0);
  }, 0);
  const label = 'Спасено по дням: ' + history.map(function (day) {
    return E.weekdayShort(day.date) + ' — ' + money(day.value);
  }).join(', ');

  const bars = history.map(function (day) {
    const value = Number(day.value) || 0;
    const percent = max ? Math.round((value / max) * 100) : 0;
    const height = percent ? Math.max(6, percent) : 2;
    return '<li class="more-chart__col">' +
      '<span class="more-chart__plot">' +
        '<span class="more-chart__bar' + (percent ? '' : ' is-empty') + '" style="height:' + height + '%"></span>' +
      '</span>' +
      '<span class="more-chart__day">' + esc(E.weekdayShort(day.date).slice(0, 2)) + '</span>' +
    '</li>';
  }).join('');

  return '<div class="more-chart-wrap" role="img" aria-label="' + esc(label) + '">' +
    '<ul class="more-chart" aria-hidden="true">' + bars + '</ul>' +
  '</div>';
}

function settingsMarkup(state) {
  return '<section class="section" aria-labelledby="more-settings-title">' +
    '<div class="section-head">' +
      '<h2 class="section-title" id="more-settings-title">План на неделю</h2>' +
    '</div>' +
    '<button class="more-row" type="button" data-action="plan-settings">' +
      '<span class="more-row__icon">' + icon('settings') + '</span>' +
      '<span class="more-row__body">' +
        '<span class="more-row__title">Настройки плана</span>' +
        '<span class="more-row__meta" data-plan-settings-summary>' + esc(planSettingsSummary(state.settings)) + '</span>' +
      '</span>' +
      '<span class="more-row__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
    '</button>' +
  '</section>';
}

function dataMarkup() {
  return '<section class="section" aria-labelledby="more-data-title">' +
    '<div class="section-head">' +
      '<h2 class="section-title" id="more-data-title">Данные</h2>' +
      '<span class="section-note">json</span>' +
    '</div>' +
    '<div class="more-actions">' +
      '<button class="more-action" type="button" data-action="export">' +
        '<span class="more-action__icon">' + icon('download') + '</span>' +
        '<span class="more-action__body">' +
          '<span class="more-action__title">Экспорт JSON</span>' +
          '<span class="more-action__meta">Файл polka-' + store.getToday() + '.json со всей кухней</span>' +
        '</span>' +
        '<span class="more-action__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '</button>' +
      '<button class="more-action" type="button" data-action="import">' +
        '<span class="more-action__icon">' + icon('upload') + '</span>' +
        '<span class="more-action__body">' +
          '<span class="more-action__title">Импорт JSON</span>' +
          '<span class="more-action__meta">Заменит текущие продукты, план и покупки</span>' +
        '</span>' +
        '<span class="more-action__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '</button>' +
      '<button class="more-action" type="button" data-action="demo">' +
        '<span class="more-action__icon">' + icon('rotate') + '</span>' +
        '<span class="more-action__body">' +
          '<span class="more-action__title">Демо-кухня</span>' +
          '<span class="more-action__meta">Полная полка, план и история для пробы</span>' +
        '</span>' +
        '<span class="more-action__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '</button>' +
      '<button class="more-action more-action--danger" type="button" data-action="clear">' +
        '<span class="more-action__icon">' + icon('trash') + '</span>' +
        '<span class="more-action__body">' +
          '<span class="more-action__title">Очистить кухню</span>' +
          '<span class="more-action__meta">Удалит всё без возможности отменить</span>' +
        '</span>' +
        '<span class="more-action__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '</button>' +
      '<button class="more-action" type="button" data-action="lookup-reset">' +
        '<span class="more-action__icon">' + icon('lock') + '</span>' +
        '<span class="more-action__body">' +
          '<span class="more-action__title">Память поиска по коду</span>' +
          '<span class="more-action__meta">' + esc(lookupMetaText()) + '</span>' +
        '</span>' +
        '<span class="more-action__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '</button>' +
    '</div>' +
    '<p class="more-hint">Файл содержит продукты, план, покупки, настройки и статистику. Импорт заменяет кухню целиком — перед загрузкой можно сделать экспорт.</p>' +
    '<input class="visually-hidden" type="file" accept="application/json,.json" data-import-input tabindex="-1" aria-hidden="true">' +
  '</section>';
}

/* ── Аналитика использования ─────────────────────────────────────── */

function eventCount(summary, name) {
  const value = summary.events ? Number(summary.events[name]) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function factRow(label, value, tone) {
  return '<div class="more-facts__row">' +
    '<dt>' + esc(label) + '</dt>' +
    '<dd' + (tone ? ' class="' + tone + '"' : '') + '>' + esc(String(value)) + '</dd>' +
  '</div>';
}

function analyticsDateText(value) {
  if (!value) return 'пока не было';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'пока не было';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(date);
}

function analyticsMarkup() {
  const summary = getSummary();
  const added = eventCount(summary, 'product_add') + eventCount(summary, 'product_edit');
  const scanned = eventCount(summary, 'scan_ok');
  const lookups = eventCount(summary, 'scan_lookup');
  const opened = eventCount(summary, 'recipe_open');
  const cooked = eventCount(summary, 'cook');
  const checked = eventCount(summary, 'shopping_check');

  return '<section class="section" aria-labelledby="more-analytics-title">' +
    '<div class="section-head">' +
      '<h2 class="section-title" id="more-analytics-title">Аналитика использования</h2>' +
      '<span class="section-note">на устройстве</span>' +
    '</div>' +
    '<div class="more-about card">' +
      '<p class="more-about__text">Считаются только действия: открытия экранов, добавления, сканирования. Без названий продуктов и цен. Автоматически ничего не отправляется.</p>' +
      '<dl class="more-facts">' +
        factRow('Первый запуск', analyticsDateText(summary.firstSeen)) +
        factRow('Дней с приложением', summary.daysActive) +
        factRow('Запусков', summary.sessions) +
        factRow('Добавлено продуктов', added) +
        factRow('Сканирований', scanned) +
        factRow('Поисков по коду', lookups) +
        factRow('Открыто рецептов', opened) +
        factRow('Приготовлено', cooked) +
        factRow('Отмечено покупок', checked) +
      '</dl>' +
    '</div>' +
    '<div class="more-actions">' +
      '<button class="more-action" type="button" data-action="report-share">' +
        '<span class="more-action__icon">' + icon('share') + '</span>' +
        '<span class="more-action__body">' +
          '<span class="more-action__title">Отправить отчёт</span>' +
          '<span class="more-action__meta">Откроется меню «Поделиться»: Telegram, почта, заметки</span>' +
        '</span>' +
        '<span class="more-action__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '</button>' +
      '<button class="more-action" type="button" data-action="report-download">' +
        '<span class="more-action__icon">' + icon('download') + '</span>' +
        '<span class="more-action__body">' +
          '<span class="more-action__title">Скачать JSON</span>' +
          '<span class="more-action__meta">Файл polka-analytics-' + store.getToday() + '.json с полными счётчиками</span>' +
        '</span>' +
        '<span class="more-action__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '</button>' +
      '<button class="more-action more-action--danger" type="button" data-action="analytics-reset">' +
        '<span class="more-action__icon">' + icon('trash') + '</span>' +
        '<span class="more-action__body">' +
          '<span class="more-action__title">Сбросить счётчики</span>' +
          '<span class="more-action__meta">Удалить историю использования с устройства</span>' +
        '</span>' +
        '<span class="more-action__tail" aria-hidden="true">' + icon('chevron-right') + '</span>' +
      '</button>' +
    '</div>' +
    '<p class="more-hint">Отчёт содержит только счётчики действий: без названий продуктов, цен и личных данных. Отправка — только по кнопке.</p>' +
  '</section>';
}

function installMarkup() {
  const install = pwa.getInstallState();
  if (install.standalone) {
    return '<div class="more-install more-install--ok">' +
      '<p class="more-install__title">' + icon('check-circle') + 'Приложение установлено</p>' +
      '<p class="more-install__text">ПОЛКА открывается с домашнего экрана и работает офлайн.</p>' +
    '</div>';
  }
  if (install.available) {
    return '<div class="more-install">' +
      '<p class="more-install__title">' + icon('install') + 'ПОЛКА на телефоне</p>' +
      '<p class="more-install__text">Отдельное окно, домашний экран и сохранённые данные без интернета.</p>' +
      '<button class="btn btn--primary btn--block" type="button" data-action="install">Установить на телефон</button>' +
    '</div>';
  }
  if (install.ios) {
    return '<div class="more-install">' +
      '<p class="more-install__title">' + icon('share') + 'Добавить на экран «Домой»</p>' +
      '<p class="more-install__text">В Safari нажмите <strong>«Поделиться» → «На экран Домой»</strong>. ПОЛКА появится среди приложений.</p>' +
      '<ol class="more-steps">' +
        '<li><span class="more-steps__num">1</span><span>Откройте ПОЛКУ в Safari.</span></li>' +
        '<li><span class="more-steps__num">2</span><span>Нажмите «Поделиться» в нижней панели.</span></li>' +
        '<li><span class="more-steps__num">3</span><span>Выберите «На экран Домой» и подтвердите.</span></li>' +
      '</ol>' +
    '</div>';
  }
  return '<div class="more-install">' +
    '<p class="more-install__title">' + icon('install') + 'Установка из браузера</p>' +
    '<p class="more-install__text">' + esc(INSTALL_HINT) + ' На компьютере — иконка установки в адресной строке.</p>' +
  '</div>';
}

function aboutMarkup() {
  const storageOK = store.isStorageOK();
  const persistence = persistenceInfo();
  const online = navigator.onLine;

  return '<section class="section" aria-labelledby="more-about-title">' +
    '<div class="section-head">' +
      '<h2 class="section-title" id="more-about-title">О приложении</h2>' +
      '<span class="section-note">локально</span>' +
    '</div>' +
    '<div class="more-about card">' +
      '<p class="more-about__text">ПОЛКА — кухонный журнал: полка, рецепты, план и покупки. Без аккаунтов и облака. Аналитика — локальные счётчики; отчёт уходит только по кнопке. Данные о товаре приходят из открытых баз Open Food Facts и Open Products Facts: по кнопке или после вашего разрешения, и наружу уходит только штрихкод.</p>' +
      '<p class="more-about__text">Кухня не покидает устройство. Перенос — только файлом JSON.</p>' +
      '<dl class="more-facts">' +
        '<div class="more-facts__row">' +
          '<dt>Версия</dt><dd>' + APP_VERSION + '</dd>' +
        '</div>' +
        '<div class="more-facts__row">' +
          '<dt>Сохранение</dt>' +
          '<dd class="' + (storageOK ? 'is-ok' : 'is-danger') + '">' +
            (storageOK ? 'на этом устройстве' : 'только в памяти') +
          '</dd>' +
        '</div>' +
        '<div class="more-facts__row">' +
          '<dt>Защита хранилища</dt>' +
          '<dd class="' + persistence.tone + '" data-more-persistence>' + esc(persistence.text) + '</dd>' +
        '</div>' +
        '<div class="more-facts__row">' +
          '<dt>Последнее сохранение</dt>' +
          '<dd data-more-saved-at>' + esc(savedAtText()) + '</dd>' +
        '</div>' +
        '<div class="more-facts__row">' +
          '<dt>Сеть</dt>' +
          '<dd class="' + (online ? 'is-ok' : 'is-warn') + '" data-more-network>' +
            (online ? 'в сети' : 'офлайн — данные с устройства') +
          '</dd>' +
        '</div>' +
      '</dl>' +
    '</div>' +
  '</section>';
}

function persistenceInfo() {
  const state = store.getPersistenceState();
  if (state === 'granted') return { text: 'защищено от очистки', tone: 'is-ok' };
  if (state === 'denied') return { text: 'браузер может очистить', tone: 'is-warn' };
  if (state === 'unsupported') return { text: 'не поддерживается', tone: '' };
  return { text: 'ещё не подтверждено', tone: '' };
}

function savedAtText() {
  const at = store.getLastSavedAt();
  if (!at) return 'ещё не сохранялось';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(at);
}

function updatePlanSummary() {
  const node = document.querySelector('[data-plan-settings-summary]');
  if (node) node.textContent = planSettingsSummary(store.getState().settings);
}

function updatePersistence() {
  const node = document.querySelector('[data-more-persistence]');
  if (!node) return;
  const info = persistenceInfo();
  node.textContent = info.text;
  node.className = info.tone;
}

function updateSavedAt() {
  const node = document.querySelector('[data-more-saved-at]');
  if (node) node.textContent = savedAtText();
}

function updateNetwork() {
  const node = document.querySelector('[data-more-network]');
  if (!node) return;
  const online = navigator.onLine;
  node.textContent = online ? 'в сети' : 'офлайн — данные с устройства';
  node.className = online ? 'is-ok' : 'is-warn';
}

/* ── События ─────────────────────────────────────────────────────── */

function bindMoreEvents(screen) {
  if (!screen) return;

  screen.addEventListener('click', function (event) {
    const target = event.target.closest('[data-action]');
    if (!target || !screen.contains(target)) return;
    const action = target.dataset.action;

    if (action === 'plan-settings') {
      openPlanSettings({ onChange: updatePlanSummary, onClose: updatePlanSummary });
    } else if (action === 'export') {
      exportKitchen(target);
    } else if (action === 'import') {
      const input = screen.querySelector('[data-import-input]');
      if (input) {
        input.value = '';
        input.click();
      }
    } else if (action === 'demo') {
      loadDemo();
    } else if (action === 'clear') {
      clearKitchen();
    } else if (action === 'install') {
      installApp();
    } else if (action === 'report-share') {
      shareReport(target);
    } else if (action === 'report-download') {
      downloadReport(target);
    } else if (action === 'analytics-reset') {
      resetCounters();
    } else if (action === 'lookup-reset') {
      resetLookupMemory();
    }
  });

  const input = screen.querySelector('[data-import-input]');
  if (input) {
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      input.value = '';
      if (file) handleImport(file);
    });
  }
}

/* ── Экспорт и импорт ────────────────────────────────────────────── */

function readFile(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result || '')); };
    reader.onerror = function () { reject(reader.error || new Error('read error')); };
    reader.readAsText(file);
  });
}

async function exportKitchen(button) {
  if (busy) return;
  busy = true;
  if (button) button.disabled = true;
  try {
    const name = 'polka-' + store.getToday() + '.json';
    const text = store.exportText();
    const blob = new Blob([text], { type: 'application/json' });
    let file = null;
    if (typeof File === 'function') {
      try { file = new File([blob], name, { type: 'application/json' }); } catch (error) { file = null; }
    }

    let canShare = false;
    if (file && navigator.share && navigator.canShare) {
      try { canShare = navigator.canShare({ files: [file] }); } catch (error) { canShare = false; }
    }

    if (canShare) {
      try {
        await navigator.share({
          files: [file],
          title: 'Кухня ПОЛКИ',
          text: 'Файл с продуктами, планом и покупками.'
        });
        track('export');
        toast('Файл отправлен. Кухня сохранена в JSON.');
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          toast('Экспорт отменён.');
          return;
        }
        // Не вышло поделиться — скачиваем файл.
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    track('export');
    toast('Файл ' + name + ' скачан.');
  } catch (error) {
    toast('Не получилось подготовить файл. Попробуйте ещё раз.', { tone: 'error' });
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
}

async function handleImport(file) {
  if (busy) return;

  if (file.size > store.MAX_IMPORT_BYTES) {
    toast('Файл больше 4 МБ. Экспорт ПОЛКИ обычно весит несколько килобайт — проверьте файл.', { tone: 'error' });
    return;
  }

  busy = true;
  try {
    let text = '';
    try {
      text = await readFile(file);
    } catch (error) {
      toast('Не удалось прочитать файл. Данные не изменены.', { tone: 'error' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      toast('Файл не похож на JSON. Кухня осталась прежней.', { tone: 'error' });
      return;
    }

    const candidate = parsed && parsed.state ? parsed.state : parsed;
    const looksValid = candidate && typeof candidate === 'object' && !Array.isArray(candidate) &&
      (Array.isArray(candidate.pantry) || (candidate.settings && typeof candidate.settings === 'object'));
    if (!looksValid) {
      toast('Это не экспорт ПОЛКИ. Текущие данные не изменены.', { tone: 'error' });
      return;
    }

    try {
      E.normalizeState(candidate, store.getToday());
    } catch (error) {
      toast('Данные в файле повреждены. Кухня осталась прежней.', { tone: 'error' });
      return;
    }

    const confirmed = await confirmSheet({
      title: 'Заменить кухню?',
      text: 'Текущие продукты, план, покупки, статистика и настройки заменятся данными из файла. Отменить это можно только повторным импортом.',
      confirmLabel: 'Загрузить файл',
      danger: false
    });
    if (!confirmed) return;

    try {
      store.importState(candidate);
    } catch (error) {
      toast('Не удалось загрузить кухню. Данные не изменены.', { tone: 'error' });
      return;
    }
    track('import');
    closeAllSheets();
    window.setTimeout(function () { router.navigate('pantry'); }, 80);
  } finally {
    busy = false;
  }
}

/* ── Демо и очистка ──────────────────────────────────────────────── */

async function loadDemo() {
  if (busy) return;
  if (store.hasData()) {
    const confirmed = await confirmSheet({
      title: 'Загрузить демо-кухню?',
      text: 'Текущие продукты, план, покупки и статистика заменятся демонстрационными. Настройки плана вернутся к стандартным.',
      confirmLabel: 'Загрузить демо',
      danger: false
    });
    if (!confirmed) return;
  }

  busy = true;
  try {
    store.loadDemo();
    track('demo_load');
    closeAllSheets();
    window.setTimeout(function () { router.navigate('pantry'); }, 80);
  } finally {
    busy = false;
  }
}

async function clearKitchen() {
  if (busy) return;
  const confirmed = await confirmSheet({
    title: 'Очистить кухню?',
    text: 'Исчезнут все продукты, план, список покупок и статистика. Это действие нельзя отменить; на всякий случай можно сначала сделать экспорт.',
    confirmLabel: 'Очистить всё'
  });
  if (!confirmed) return;

  busy = true;
  try {
    store.clearAll();
    closeAllSheets();
    window.setTimeout(function () { router.navigate('pantry'); }, 80);
  } finally {
    busy = false;
  }
}

/* ── Отчёт по аналитике ──────────────────────────────────────────── */

async function shareReport(button) {
  if (busy) return;
  busy = true;
  if (button) button.disabled = true;

  let outcome = 'failed';
  try {
    outcome = await shareText({
      title: 'ПОЛКА — отчёт об использовании',
      text: buildTextReport()
    });
  } catch (error) {
    outcome = 'failed';
  } finally {
    busy = false;
    if (button && button.isConnected) button.disabled = false;
  }

  track('report_share');
  if (outcome === 'shared') {
    toast('Отчёт отправлен.');
  } else if (outcome === 'copied') {
    toast('Отчёт скопирован — вставьте его в чат или письмо.');
  } else if (outcome === 'cancelled') {
    toast('Отправка отменена.');
  } else {
    toast('Не получилось поделиться. Скачайте JSON.', { tone: 'error' });
  }
}

function downloadReport(button) {
  if (busy) return;
  busy = true;
  if (button) button.disabled = true;
  try {
    const name = 'polka-analytics-' + store.getToday() + '.json';
    const blob = new Blob([buildJsonReport()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    track('report_download');
    toast('Файл ' + name + ' скачан.');
  } catch (error) {
    toast('Не получилось подготовить файл. Попробуйте ещё раз.', { tone: 'error' });
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
}

async function resetCounters() {
  if (busy) return;
  const confirmed = await confirmSheet({
    title: 'Сбросить счётчики?',
    text: 'История использования удалится с этого устройства. На кухню это не влияет.',
    confirmLabel: 'Сбросить',
    danger: true
  });
  if (!confirmed) return;

  busy = true;
  try {
    resetAnalytics();
    closeAllSheets();
    router.refresh({ scroll: false });
    toast('Счётчики сброшены.');
  } finally {
    busy = false;
  }
}

/* ── Память поиска по коду ───────────────────────────────────────── */

function lookupMetaText() {
  const info = lookup.lookupMemoryInfo();
  if (!info.consent && !info.count) return 'пусто: приложение ничего не запрашивало';
  const parts = [info.consent ? 'разрешение выдано' : 'без разрешения'];
  if (info.count) parts.push('сохранённых кодов: ' + info.count);
  return parts.join(' · ');
}

async function resetLookupMemory() {
  if (busy) return;
  const info = lookup.lookupMemoryInfo();
  if (!info.consent && !info.count) {
    toast('Память поиска по коду уже пуста.');
    return;
  }

  const confirmed = await confirmSheet({
    title: 'Забыть коды товаров?',
    text: 'Удалятся сохранённые названия и разрешение на поиск по коду. В следующий раз приложение спросит разрешение снова.',
    confirmLabel: 'Забыть',
    danger: true
  });
  if (!confirmed) return;

  busy = true;
  try {
    lookup.resetLookupData();
    closeAllSheets();
    router.refresh({ scroll: false });
    toast('Память поиска по коду очищена.');
  } finally {
    busy = false;
  }
}

/* ── Установка ───────────────────────────────────────────────────── */

async function installApp() {
  if (busy) return;
  busy = true;
  try {
    const outcome = await pwa.promptInstall();
    if (outcome === 'dismissed') {
      toast('Установка отложена. Браузер предложит её позже.');
    } else if (outcome === 'unavailable') {
      toast('Браузер не предложил установку. ' + INSTALL_HINT);
    }
    const box = document.querySelector('[data-more-install]');
    if (box) box.innerHTML = installMarkup();
  } finally {
    busy = false;
  }
}
