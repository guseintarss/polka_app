/*
 * ПОЛКА · общий UI-слой.
 * Иконки, экранирование, тосты, шторки, подтверждения и мелкие помощники.
 * Не знает о бизнес-логике: экраны передают готовую разметку.
 */

export const DATA = window.POLKA_DATA;
export const E = window.POLKA_ENGINE;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function icon(name, className) {
  return '<svg class="icon ' + (className || '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
}

export function money(value) {
  return E.formatMoney(value);
}

export function qty(value, unit) {
  return E.formatQty(value, unit);
}

export function plural(number, forms) {
  return E.pluralRu(number, forms);
}

export function capitalize(value) {
  const text = String(value || '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function todayISO() {
  return E.todayISO();
}

export function parseQty(value) {
  const number = Number(String(value == null ? '' : value).trim().replace(',', '.'));
  return Number.isFinite(number) ? number : NaN;
}

export function render(root, html) {
  root.innerHTML = html;
  return root;
}

export function $(selector, root) {
  return (root || document).querySelector(selector);
}

export function $$(selector, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

export function on(root, type, selector, handler, options) {
  root.addEventListener(type, function (event) {
    const target = event.target.closest ? event.target.closest(selector) : null;
    if (!target || !root.contains(target)) return;
    handler(event, target);
  }, options);
}

export function debounce(fn, wait) {
  let timer = null;
  return function () {
    const args = arguments;
    const self = this;
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { fn.apply(self, args); }, wait || 180);
  };
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function emptyState(options) {
  const opts = options || {};
  return '<div class="empty">' +
    '<span class="empty__icon">' + icon(opts.iconName || 'shelf') + '</span>' +
    '<h3 class="empty__title">' + esc(opts.title || 'Пока пусто') + '</h3>' +
    (opts.text ? '<p class="empty__text">' + esc(opts.text) + '</p>' : '') +
    (opts.actionLabel
      ? '<button class="btn btn--primary" type="button" ' + (opts.actionAttrs || '') + '>' + esc(opts.actionLabel) + '</button>'
      : '') +
  '</div>';
}

export function expiryBadge(status) {
  if (!status) return '';
  let variant = 'badge--plain';
  if (status.tone === 'expired' || status.tone === 'today') variant = 'badge--tomato';
  else if (status.tone === 'soon') variant = 'badge--butter';
  else if (status.tone === 'week') variant = 'badge--sage';
  else if (status.tone === 'none') variant = 'badge--plain';
  return '<span class="badge ' + variant + '">' + esc(status.label) + '</span>';
}

export function matchLabel(match) {
  if (!match) return '';
  if (match.canCook) return 'всё есть';
  const missing = match.missingBlocking.length;
  return 'не хватает ' + missing + ' ' + plural(missing, ['продукта', 'продуктов', 'продуктов']);
}

export function matchTone(match) {
  if (!match) return '';
  if (match.canCook) return '';
  if (match.percent >= 60) return 'meter__fill--warn';
  return 'meter__fill--danger';
}

export function focusFirstError(scope) {
  const invalid = scope.querySelector('[aria-invalid="true"]');
  if (invalid) invalid.focus();
}

export function scrollToTop(behavior) {
  const main = document.getElementById('main');
  if (main) main.scrollIntoView({ behavior: behavior || (prefersReducedMotion() ? 'auto' : 'smooth'), block: 'start' });
  else window.scrollTo(0, 0);
}

/* ── Тосты ───────────────────────────────────────────────────────── */

export function toast(message, options) {
  const opts = options || {};
  const region = document.getElementById('toast-region');
  if (!region) return null;

  while (region.children.length >= 2) region.removeChild(region.firstElementChild);

  const node = document.createElement('div');
  node.className = 'toast' + (opts.tone === 'error' ? ' toast--error' : '');
  node.setAttribute('role', opts.tone === 'error' ? 'alert' : 'status');
  const text = document.createElement('span');
  text.className = 'toast__text';
  text.textContent = message;
  node.appendChild(text);

  let timer = null;
  function remove() {
    if (timer) window.clearTimeout(timer);
    if (node.parentNode) node.parentNode.removeChild(node);
  }

  if (opts.action) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'toast__action';
    action.textContent = opts.action;
    action.addEventListener('click', function () {
      remove();
      if (opts.onAction) {
        try { opts.onAction(); } catch (error) { toast('Не получилось выполнить действие.', { tone: 'error' }); }
      }
    });
    node.appendChild(action);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast__close';
  close.setAttribute('aria-label', 'Закрыть сообщение');
  close.innerHTML = icon('close');
  close.addEventListener('click', remove);
  node.appendChild(close);

  region.appendChild(node);
  timer = window.setTimeout(remove, opts.duration || (opts.action ? 9000 : 5500));
  return { close: remove };
}

/* ── Шторки и модальный стек ─────────────────────────────────────── */

let modalSeq = 0;
const modalStack = [];
let historyCleanupPending = false;

function syncScrollLock() {
  document.documentElement.classList.toggle('has-sheet', modalStack.length > 0);
}

/*
 * Закрытая шторка может оставить свою запись в истории ниже открытой.
 * Когда такая запись оказывается наверху, снимаем её, чтобы Back
 * не упирался в невидимую шторку.
 */
function cleanupStaleModalHistory() {
  if (historyCleanupPending) return;
  const modalId = history.state && history.state.modal;
  if (!modalId) return;
  const stillOpen = modalStack.some(function (entry) {
    return entry.open && entry.id === modalId;
  });
  if (stillOpen) return;
  historyCleanupPending = true;
  history.back();
}

window.addEventListener('popstate', function () {
  historyCleanupPending = false;
  cleanupStaleModalHistory();
});

export function openSheet(options) {
  const opts = options || {};
  const id = 'modal-' + (++modalSeq);
  const trigger = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet ' + (opts.className || '');
  dialog.setAttribute('aria-labelledby', id + '-title');
  if (opts.labelledBy) dialog.removeAttribute('aria-labelledby');
  dialog.innerHTML =
    '<div class="sheet__grab" data-sheet-grab aria-hidden="true"></div>' +
    '<div class="sheet__head">' +
      '<div class="sheet__head-text">' +
        (opts.eyebrow ? '<p class="sheet__eyebrow">' + esc(opts.eyebrow) + '</p>' : '') +
        '<h2 class="sheet__title" id="' + id + '-title">' + esc(opts.title || '') + '</h2>' +
        (opts.subtitle ? '<p class="sheet__subtitle">' + esc(opts.subtitle) + '</p>' : '') +
      '</div>' +
      '<button class="icon-btn sheet__close" type="button" data-sheet-close aria-label="Закрыть">' + icon('close') + '</button>' +
    '</div>' +
    '<div class="sheet__body" data-sheet-body>' + (opts.content || '') + '</div>' +
    (opts.footer ? '<div class="sheet__foot">' + opts.footer + '</div>' : '');

  document.body.appendChild(dialog);

  const entry = {
    id: id,
    dialog: dialog,
    open: true,
    close: function () { closeEntry(entry, false); },
    onClose: opts.onClose || null
  };
  modalStack.push(entry);

  if (opts.history !== false) {
    history.pushState(Object.assign({}, history.state || {}, { modal: id }), '');
  }

  function closeEntry(current, fromHistory) {
    if (!current.open) return;
    current.open = false;
    window.removeEventListener('popstate', onPopState);
    try { current.dialog.close(); } catch (error) { /* уже закрыта */ }
    const index = modalStack.indexOf(current);
    if (index !== -1) modalStack.splice(index, 1);
    current.dialog.remove();
    syncScrollLock();
    if (!fromHistory && history.state && history.state.modal === current.id) {
      history.back();
    }
    if (fromHistory) window.setTimeout(cleanupStaleModalHistory, 0);
    if (current.onClose) current.onClose();
    if (trigger && trigger.isConnected && typeof trigger.focus === 'function') {
      window.requestAnimationFrame(function () { trigger.focus({ preventScroll: true }); });
    }
  }

  function onPopState() {
    if (!entry.open) return;
    if (history.state && history.state.modal === entry.id) return;
    closeEntry(entry, true);
  }

  dialog.addEventListener('cancel', function (event) {
    event.preventDefault();
    closeEntry(entry, false);
  });
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) closeEntry(entry, false);
  });
  dialog.querySelector('[data-sheet-close]').addEventListener('click', function () {
    closeEntry(entry, false);
  });
  window.addEventListener('popstate', onPopState);

  // Сдвиг вниз по ручке закрывает шторку — привычный мобильный жест.
  const grab = dialog.querySelector('[data-sheet-grab]');
  let startY = null;
  let delta = 0;
  grab.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    startY = event.clientY;
    delta = 0;
    dialog.style.transition = 'none';
    grab.setPointerCapture(event.pointerId);
  });
  grab.addEventListener('pointermove', function (event) {
    if (startY === null) return;
    delta = Math.max(0, event.clientY - startY);
    dialog.style.transform = 'translateY(' + delta + 'px)';
  });
  function finishDrag() {
    if (startY === null) return;
    startY = null;
    dialog.style.transition = '';
    dialog.style.transform = '';
    if (delta > 92) closeEntry(entry, false);
    delta = 0;
  }
  grab.addEventListener('pointerup', finishDrag);
  grab.addEventListener('pointercancel', finishDrag);

  dialog.showModal();
  syncScrollLock();

  if (opts.onMount) opts.onMount(dialog, entry);
  window.requestAnimationFrame(function () {
    const initial = opts.initialFocus ? dialog.querySelector(opts.initialFocus) : null;
    if (initial) initial.focus({ preventScroll: true });
  });

  return {
    dialog: dialog,
    body: dialog.querySelector('[data-sheet-body]'),
    footer: dialog.querySelector('.sheet__foot'),
    close: entry.close
  };
}

export function closeAllSheets() {
  modalStack.slice().reverse().forEach(function (entry) {
    try { entry.close(); } catch (error) { /* noop */ }
  });
}

export function confirmSheet(options) {
  const opts = options || {};
  return new Promise(function (resolve) {
    let settled = false;
    function settle(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }
    const sheet = openSheet({
      title: opts.title || 'Подтвердить',
      eyebrow: opts.eyebrow,
      className: opts.danger === false ? '' : 'sheet--danger',
      content: '<p class="confirm-text">' + esc(opts.text || '') + '</p>' +
        (opts.detail ? opts.detail : ''),
      footer: '<button class="btn btn--ghost" type="button" data-confirm-cancel>' + esc(opts.cancelLabel || 'Отмена') + '</button>' +
        '<button class="btn ' + (opts.danger === false ? 'btn--primary' : 'btn--danger') + '" type="button" data-confirm-ok>' + esc(opts.confirmLabel || 'Подтвердить') + '</button>',
      initialFocus: '[data-confirm-cancel]',
      onClose: function () { settle(false); }
    });
    sheet.dialog.querySelector('[data-confirm-cancel]').addEventListener('click', function () {
      settle(false);
      sheet.close();
    });
    sheet.dialog.querySelector('[data-confirm-ok]').addEventListener('click', function () {
      settle(true);
      sheet.close();
    });
  });
}

/* ── Поделиться текстом ──────────────────────────────────────────── */

export async function shareText(options) {
  const opts = options || {};
  if (navigator.share) {
    try {
      await navigator.share({ title: opts.title || 'ПОЛКА', text: opts.text || '' });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelled';
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(opts.text || '');
      return 'copied';
    } catch (error) { /* нет доступа к буферу */ }
  }
  return 'failed';
}
