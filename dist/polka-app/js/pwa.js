/*
 * ПОЛКА · PWA: установка, офлайн-кэш и обновления.
 * Работает и без service worker (например, по file://), просто без офлайна.
 */

let deferredPrompt = null;
const listeners = new Set();

function emit() {
  const state = getInstallState();
  listeners.forEach(function (listener) {
    try { listener(state); } catch (error) { console.error('POLKA pwa listener', error); }
  });
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

export function isIOS() {
  const ua = window.navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function getInstallState() {
  return {
    available: Boolean(deferredPrompt),
    standalone: isStandalone(),
    ios: isIOS()
  };
}

export function onInstallChange(listener) {
  listeners.add(listener);
  return function () { listeners.delete(listener); };
}

window.addEventListener('beforeinstallprompt', function (event) {
  event.preventDefault();
  deferredPrompt = event;
  emit();
});

window.addEventListener('appinstalled', function () {
  deferredPrompt = null;
  emit();
});

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  deferredPrompt.prompt();
  let outcome = 'dismissed';
  try {
    const choice = await deferredPrompt.userChoice;
    outcome = choice && choice.outcome ? choice.outcome : outcome;
  } catch (error) {
    outcome = 'dismissed';
  }
  if (outcome === 'accepted') {
    deferredPrompt = null;
    emit();
  }
  return outcome;
}

/* ── Service worker ─────────────────────────────────────────────── */

let registration = null;
let updateCallback = null;
let reloading = false;

export function registerServiceWorker(options) {
  const opts = options || {};
  updateCallback = opts.onUpdate || null;
  if (!('serviceWorker' in navigator)) return null;
  if (location.protocol === 'file:') return null;

  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (reg) {
    registration = reg;
    if (reg.waiting && navigator.serviceWorker.controller) notifyUpdate(reg);
    reg.addEventListener('updatefound', function () {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', function () {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) notifyUpdate(reg);
      });
    });
    return reg;
  }).catch(function (error) {
    console.warn('POLKA: service worker не зарегистрирован', error);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !registration) return;
    registration.update().catch(function () { /* офлайн — не страшно */ });
  });

  return function () { return registration; };
}

function notifyUpdate(reg) {
  if (updateCallback) updateCallback(reg);
}

export function applyUpdate() {
  if (!registration) return false;
  const worker = registration.waiting || registration.active;
  if (!worker) return false;
  worker.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

export function getRegistration() {
  return registration;
}
