/*
 * ПОЛКА · запуск приложения.
 * Собирает роутер, состояние, индикаторы и PWA-обвязку.
 */

import * as store from './store.js';
import * as router from './router.js';
import { toast } from './ui.js';
import { APP_VERSION } from './version.js';
import { initAnalytics, track, trackScreen } from './analytics.js';
import { pantryScreen } from './screens/pantry.js';
import { recipesScreen, recipeScreen } from './screens/recipes.js';
import { planScreen } from './screens/plan.js';
import { shoppingScreen } from './screens/shopping.js';
import { moreScreen } from './screens/more.js';
import { registerServiceWorker, applyUpdate, isStandalone, getInstallState } from './pwa.js';

const saveStatus = document.getElementById('save-status');
const saveStatusText = document.getElementById('save-status-text');
const demoBadge = document.getElementById('demo-badge');
const offlineBanner = document.getElementById('offline-banner');
let currentDay = '';

function timeLabel(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function updateSaveStatus(event) {
  if (!saveStatus || !saveStatusText) return;
  saveStatus.classList.remove('is-saving', 'is-error');
  if (!store.isStorageOK()) {
    saveStatus.classList.add('is-error');
    saveStatusText.textContent = 'только в памяти';
    saveStatus.title = 'Браузер не разрешает сохранение. Данные исчезнут после перезагрузки.';
    return;
  }
  if (event && event.ok === false) {
    saveStatus.classList.add('is-error');
    saveStatusText.textContent = 'не сохранено';
    saveStatus.title = 'Не получилось записать данные на устройство.';
    return;
  }
  const at = store.getLastSavedAt();
  if (at) {
    saveStatusText.textContent = 'сохранено ' + timeLabel(at);
    saveStatus.title = 'Кухня сохранена на этом устройстве в ' + timeLabel(at) + '. Облака нет.';
  } else {
    saveStatusText.textContent = 'локально';
    saveStatus.title = 'Данные хранятся только на этом устройстве.';
  }
}

function updateBadges() {
  const state = store.getState();
  if (!state) return;
  if (demoBadge) demoBadge.hidden = !state.demo;
  const shoppingBadge = document.querySelector('[data-badge="shopping"]');
  const unchecked = state.shopping.filter(function (item) { return !item.checked; }).length;
  if (shoppingBadge) {
    shoppingBadge.textContent = unchecked > 99 ? '99+' : String(unchecked);
    shoppingBadge.hidden = unchecked === 0;
  }
  const shoppingTab = document.querySelector('[data-tab="shopping"]');
  if (shoppingTab) {
    shoppingTab.setAttribute('aria-label', unchecked
      ? 'Покупки ' + unchecked + ', не отмечено'
      : 'Покупки');
  }
}

function checkDay() {
  const today = store.getToday();
  if (!currentDay) {
    currentDay = today;
    return;
  }
  if (today !== currentDay) {
    currentDay = today;
    router.refresh({ scroll: false });
    updateBadges();
    toast('Наступил новый день. Сроки и сводка обновились.');
  }
}

function setOnline(online) {
  if (!offlineBanner) return;
  offlineBanner.hidden = online;
  document.documentElement.classList.toggle('is-offline', !online);
}

function setupLifecycle() {
  store.subscribe(function (event) {
    if (event.type === 'save') {
      updateSaveStatus(event);
      updateBadges();
    }
    if (event.type === 'replace') {
      updateBadges();
      router.refresh({ scroll: false });
      if (event.message) toast(event.message);
    }
  });

  window.addEventListener('storage', function (event) {
    if (event.key !== null && event.key !== store.STORAGE_KEY) return;
    store.reloadFromStorage();
    updateBadges();
  });

  window.addEventListener('online', function () {
    setOnline(true);
    toast('Снова в сети.', { duration: 3500 });
  });
  window.addEventListener('offline', function () { setOnline(false); });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkDay();
  });
  window.setInterval(checkDay, 60000);

  registerServiceWorker({
    onUpdate: function () {
      toast('Доступна новая версия ПОЛКИ.', {
        action: 'Обновить',
        onAction: applyUpdate,
        duration: 15000
      });
    }
  });

  window.addEventListener('appinstalled', function () {
    track('install');
    toast('ПОЛКА установлена. Теперь она открывается с домашнего экрана.');
  });
}

function setupRoutes() {
  router.register('pantry', { title: 'Полка', tab: 'pantry', render: pantryScreen });
  router.register('recipes', { title: 'Рецепты', tab: 'recipes', render: recipesScreen });
  router.register('recipes/:id', { title: 'Рецепт', tab: 'recipes', render: recipeScreen });
  router.register('plan', { title: 'План на неделю', tab: 'plan', render: planScreen });
  router.register('shopping', { title: 'Покупки', tab: 'shopping', render: shoppingScreen });
  router.register('more', { title: 'Ещё', tab: 'more', render: moreScreen });
}

function init() {
  store.init();
  initAnalytics({ version: APP_VERSION, standalone: isStandalone() });
  currentDay = store.getToday();
  history.scrollRestoration = 'manual';
  document.documentElement.classList.toggle('is-standalone', isStandalone());
  document.documentElement.classList.toggle('is-ios', getInstallState().ios);
  setOnline(navigator.onLine);
  setupRoutes();
  router.onChange(function (route) { trackScreen(route.tab); });
  router.start({ root: document.getElementById('screen'), fallback: 'pantry' });
  setupLifecycle();
  updateSaveStatus(null);
  updateBadges();

  const warning = store.getBootWarning();
  if (warning) window.setTimeout(function () { toast(warning, { tone: 'error', duration: 8000 }); }, 700);
  if (!store.isStorageOK()) {
    updateSaveStatus({ ok: false });
    window.setTimeout(function () {
      toast('Браузер не разрешает сохранение. Кухня работает, но данные исчезнут после перезагрузки.', { tone: 'error', duration: 9000 });
    }, 1200);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
