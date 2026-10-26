/*
 * E2E-проверки мобильного приложения ПОЛКА.
 *
 * Требуется playwright-core (dev-зависимость, не входит в приложение):
 *   NODE_PATH=/path/to/node_modules \
 *   CHROME_PATH=/path/to/chrome \
 *   node tests/e2e.mjs
 *
 * Сервер: http://127.0.0.1:8766/ (tools/serve.sh).
 */

import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8766/';
const CHROME = process.env.CHROME_PATH || '/home/temir/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';
const AXE_PATH = process.env.AXE_PATH || '/tmp/opencode/lh/node_modules/axe-core/axe.min.js';
const CHROME_ARGS = process.env.CHROME_NO_PROXY ? ['--no-proxy-server'] : [];
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(ROOT, 'screenshots');
const FIXTURE = JSON.parse(await readFile(path.join(ROOT, 'fixtures', 'import.json'), 'utf8'));

const VIEWPORT = { width: 390, height: 844 };
const SMALL = { width: 320, height: 700 };

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed += 1;
  console.log('  ok  ' + name);
}

async function test(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.error('  FAIL ' + name);
    console.error(String(error && error.stack ? error.stack : error).split('\n').slice(0, 8).join('\n'));
  }
}

async function shot(page, name) {
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
}

function trackErrors(page, errors) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });
  page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.includes('favicon') || url.endsWith('/sw.js')) return;
    errors.push('requestfailed: ' + url + ' ' + (request.failure()?.errorText || ''));
  });
}

async function openApp(context, options = {}) {
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#screen .screen', { timeout: 10000 });
  await page.waitForTimeout(250);
  return { page, errors };
}

async function go(page, route) {
  await page.evaluate((target) => { window.location.hash = '#/' + target; }, route);
  await page.waitForTimeout(300);
}

async function waitNoSheets(page) {
  await page.waitForFunction(() => !document.querySelector('dialog.sheet'), null, { timeout: 5000 });
}

async function resetDemo(page) {
  await page.evaluate(async () => {
    const store = await import(new URL('js/store.js', document.baseURI).href);
    store.loadDemo();
  });
  await page.waitForTimeout(350);
}

function hasTool(tool) {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/* Видео для фейковой камеры: QR-код на белом фоне в формате Y4M. */
function scanFixture(text, name) {
  const dir = path.join(os.tmpdir(), 'polka-scan');
  const y4m = path.join(dir, name + '.y4m');
  if (existsSync(y4m)) return y4m;
  if (!hasTool('qrencode') || !hasTool('ffmpeg') || !(hasTool('convert') || hasTool('magick'))) return null;
  mkdirSync(dir, { recursive: true });
  const png = path.join(dir, name + '.png');
  const frame = path.join(dir, name + '-frame.png');
  execFileSync('qrencode', ['-8', '-s', '10', '-m', '2', '-o', png, text]);
  execFileSync(hasTool('convert') ? 'convert' : 'magick', [png, '-background', 'white', '-gravity', 'center', '-extent', '640x480', frame]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', frame, '-t', '1', '-r', '10', '-pix_fmt', 'yuv420p', '-f', 'yuv4mpegpipe', y4m]);
  return y4m;
}

async function withFakeCamera(y4m, initScript, fn) {
  const scanBrowser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: CHROME_ARGS.concat([
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-video-capture=' + y4m
    ])
  });
  try {
    const scanContext = await scanBrowser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      acceptDownloads: true
    });
    await scanContext.grantPermissions(['camera'], { origin: new URL(BASE).origin });
    if (initScript) await scanContext.addInitScript(initScript);
    const opened = await openApp(scanContext);
    await fn(opened);
    await expectNoErrors(opened.errors, 'scanner');
    await scanContext.close();
  } finally {
    await scanBrowser.close();
  }
}

async function openScanner(page) {
  await page.locator('#screen [data-action="add"]').first().click();
  await page.locator('[data-scan]').click();
  await page.waitForSelector('dialog.sheet--scanner .scanner__video', { timeout: 5000 });
  await page.waitForFunction(() => !document.querySelector('dialog.sheet--scanner'), null, { timeout: 20000 });
}

async function expectNoErrors(errors, label) {
  assert.deepEqual(errors, [], label + ': ошибки консоли/сети');
}

let browser = null;

async function main() {
  console.log('\nПОЛКА · E2E\n');
  await mkdir(SHOTS, { recursive: true });

  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow'
  });
  const { page, errors } = await openApp(context);

  await test('Каркас: приложение открывается на полке', async () => {
    assert.equal(await page.title(), 'Полка — ПОЛКА');
    assert.equal(await page.locator('[data-tab="pantry"]').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.tab').count(), 5);
    const text = await page.locator('#screen').innerText();
    assert(text.length > 20, 'экран полки пуст');
    await expectNoErrors(errors, 'boot');
    await shot(page, '01-pantry');
  });

  await test('Навигация: все пять разделов открываются', async () => {
    const routes = [
      ['recipes', 'Рецепты'],
      ['plan', 'План'],
      ['shopping', 'Покупки'],
      ['more', 'Ещё'],
      ['pantry', 'Полка']
    ];
    for (const [route, title] of routes) {
      await go(page, route);
      assert.equal(await page.locator('[data-tab="' + route + '"]').getAttribute('aria-current'), 'page');
      assert((await page.title()).startsWith(title), route + ': заголовок ' + (await page.title()));
      const text = await page.locator('#screen').innerText();
      assert(text.length > 10, route + ': пустой экран');
      await shot(page, '02-' + route);
    }
    await expectNoErrors(errors, 'navigation');
  });

  await test('PWA: manifest и service worker', async () => {
    const manifest = await page.evaluate(async () => {
      const response = await fetch('manifest.webmanifest');
      return { type: response.headers.get('content-type'), data: await response.json() };
    });
    assert.match(manifest.type || '', /manifest\+json|application\/json/);
    assert.equal(manifest.data.display, 'standalone');
    assert(manifest.data.start_url.includes('#/pantry'));
    assert(manifest.data.icons.some((icon) => icon.sizes === '192x192'));
    assert(manifest.data.icons.some((icon) => icon.purpose === 'maskable'));

    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
    const sw = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return {
        scope: registration.scope,
        cacheKeys: await caches.keys(),
        controlled: Boolean(navigator.serviceWorker.controller)
      };
    });
    assert(sw.controlled, 'service worker не управляет страницей');
    assert(sw.cacheKeys.some((key) => key.startsWith('polka-app-')), 'нет кэша приложения: ' + sw.cacheKeys.join(', '));

    const cdp = await context.newCDPSession(page);
    const appManifest = await cdp.send('Page.getAppManifest');
    assert.deepEqual(appManifest.errors, [], 'ошибки manifest');
    const installability = await cdp.send('Page.getInstallabilityErrors');
    const blocking = installability.installabilityErrors.filter((error) => error.errorId !== 'in-incognito');
    assert.deepEqual(blocking, [], 'приложение не устанавливается: ' + JSON.stringify(blocking));
  });

  await test('Store: полка, покупки, готовка, план и импорт', async () => {
    const result = await page.evaluate(async (fixtureData) => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      const E = window.POLKA_ENGINE;
      const before = store.snapshot();
      const out = {};
      try {
        const created = store.addPantry({ name: 'Тестовый продукт', qty: 2, unit: 'шт', price: 100 });
        out.added = Boolean(store.getState().pantry.find((item) => item.id === created.id));
        const edited = store.updatePantry(created.id, { name: 'помидоры', qty: 3 });
        out.edited = {
          ingredientId: edited.ingredientId,
          category: edited.category,
          storage: edited.storage,
          qty: edited.qty
        };
        const overridden = store.updatePantry(created.id, { category: 'Фрукты', storage: 'freezer' });
        out.overridden = { category: overridden.category, storage: overridden.storage };
        const removed = store.removePantry(created.id);
        store.insertPantry(removed.item, removed.index);
        out.removedAndRestored = Boolean(store.getState().pantry.find((item) => item.id === created.id));

        const first = store.addShopping({ name: 'Тестовая покупка', qty: 2, unit: 'шт' });
        const second = store.addShopping({ name: 'Тестовая покупка', qty: 2, unit: 'шт' });
        out.shoppingMerged = { merged: second.merged, qty: second.item.qty };
        store.toggleShopping(second.item.id, true);
        const bought = store.buyChecked();
        out.bought = bought.moved.length;
        out.boughtOnShelf = store.getState().pantry.some((item) => {
          return item.name === 'Тестовая покупка' && item.qty === 4;
        });

        const recipe = window.POLKA_DATA.RECIPES.find((item) => (item.ingredients || []).length > 2);
        const cookedBefore = store.getState().stats.cooked;
        const report = store.cook(recipe, recipe.servings);
        out.cooked = {
          before: cookedBefore,
          after: store.getState().stats.cooked,
          reportDeductions: report.deductions.length,
          recipe: recipe.id
        };

        const date = store.getToday();
        store.setPlanSlot(date, 'dinner', recipe.id);
        out.planSlot = Boolean(store.getState().plan[date] && store.getState().plan[date].dinner);
        const generated = store.generatePlan({ seed: 123 });
        out.generatedMeals = generated.meals;
        const synced = store.syncShoppingFromPlan();
        out.synced = Boolean(synced.result && synced.result.list.length);

        store.importState(fixtureData);
        out.imported = store.getState().pantry[0] && store.getState().pantry[0].id === 'p_test_import';
      } finally {
        store.replaceState(before, '');
      }
      out.restored = store.getState().pantry.length === before.pantry.length;
      return out;
    }, FIXTURE);

    assert.equal(result.added, true);
    assert.deepEqual(result.edited, { ingredientId: 'tomato', category: 'Овощи', storage: 'fridge', qty: 3 });
    assert.deepEqual(result.overridden, { category: 'Фрукты', storage: 'freezer' });
    assert.equal(result.removedAndRestored, true);
    assert.deepEqual(result.shoppingMerged, { merged: true, qty: 4 });
    assert(result.bought >= 1);
    assert.equal(result.boughtOnShelf, true);
    assert.equal(result.cooked.after, result.cooked.before + 1);
    assert(result.cooked.reportDeductions >= 0);
    assert.equal(result.planSlot, true);
    assert(result.generatedMeals > 0, 'план не собрался');
    assert.equal(result.synced, true);
    assert.equal(result.imported, true);
    assert.equal(result.restored, true);
  });

  await test('Доступность: axe на основных экранах', async () => {
    const axeSource = await readFile(AXE_PATH, 'utf8');
    for (const route of ['pantry', 'recipes', 'recipes/chickpea-curry', 'plan', 'shopping', 'more']) {
      await go(page, route);
      await page.addScriptTag({ content: axeSource });
      const result = await page.evaluate(async () => {
        return await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }
        });
      });
      const serious = result.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
      assert.deepEqual(
        serious.map((violation) => violation.id + ' (' + violation.nodes.length + ')'),
        [],
        route + ': серьёзные нарушения доступности'
      );
    }
  });

  await test('Малый экран 320px: нет горизонтального переполнения', async () => {
    await page.setViewportSize(SMALL);
    for (const route of ['pantry', 'recipes', 'recipes/chickpea-curry', 'plan', 'shopping', 'more']) {
      await go(page, route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, route + ': горизонтальное переполнение ' + overflow + 'px');
      await shot(page, '03-' + route + '-320');
    }
    await page.setViewportSize(VIEWPORT);
  });

  const uiContext = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    acceptDownloads: true
  });
  const ui = await openApp(uiContext);
  const uiPage = ui.page;

  await test('UI: полка — ручная категория, правка, удаление и возврат', async () => {
    await resetDemo(uiPage);
    await go(uiPage, 'more');
    await go(uiPage, 'pantry');
    const rescue = await uiPage.locator('.pantry-rescue .note__text').innerText();
    assert(!/ и [^,.]{1,40} и ещё/.test(rescue), 'спасательная заметка склеена: ' + rescue);

    await uiPage.locator('#screen [data-action="add"]').first().click();
    await uiPage.locator('#pantry-name').fill('кабачки');
    await uiPage.waitForTimeout(100);
    await uiPage.locator('#pantry-category').selectOption({ label: 'Фрукты' });
    await uiPage.locator('[data-storage-option="freezer"]').click();
    await uiPage.locator('[data-save]').click();
    await waitNoSheets(uiPage);

    const added = await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().pantry.find((item) => {
        return item.name === 'кабачки' && item.category === 'Фрукты' && item.storage === 'freezer';
      }) || null;
    });
    assert(added, 'ручная категория и зона не сохранились');

    await uiPage.locator('#screen .pantry-row[data-id="' + added.id + '"]').click();
    await uiPage.locator('#pantry-category').selectOption({ label: 'Овощи' });
    await uiPage.locator('[data-storage-option="fridge"]').click();
    await uiPage.locator('[data-save]').click();
    await waitNoSheets(uiPage);

    const edited = await uiPage.evaluate(async (id) => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      const item = store.getState().pantry.find((entry) => entry.id === id);
      return item ? { category: item.category, storage: item.storage } : null;
    }, added.id);
    assert.deepEqual(edited, { category: 'Овощи', storage: 'fridge' });

    await uiPage.locator('#screen .pantry-row[data-id="' + added.id + '"]').click();
    await uiPage.locator('[data-delete]').click();
    await uiPage.locator('dialog.sheet [data-confirm-ok]').click();
    await waitNoSheets(uiPage);
    assert.equal(await uiPage.evaluate(async (id) => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().pantry.some((item) => item.id === id);
    }, added.id), false);

    await uiPage.locator('.toast__action', { hasText: 'Отменить' }).last().click();
    await uiPage.waitForTimeout(350);
    assert.equal(await uiPage.evaluate(async (id) => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().pantry.some((item) => item.id === id);
    }, added.id), true, 'удаление не отменилось');

    await uiPage.locator('#screen .pantry-row[data-id="' + added.id + '"]').click();
    await uiPage.locator('[data-delete]').click();
    await uiPage.locator('dialog.sheet [data-confirm-ok]').click();
    await waitNoSheets(uiPage);
    assert.equal(await uiPage.evaluate(() => Boolean(history.state && history.state.modal)), false,
      'после удаления осталась служебная запись шторки');

    await uiPage.goBack();
    await uiPage.waitForTimeout(350);
    assert.equal(await uiPage.evaluate(() => location.hash), '#/more', 'Back не вернул на предыдущий экран');
    assert.equal(await uiPage.locator('dialog.sheet').count(), 0, 'Back оставил шторку');
    await resetDemo(uiPage);
    await uiPage.evaluate(() => { document.querySelectorAll('.toast').forEach((node) => node.remove()); });
  });

  await test('UI: рецепт — порции, готовка с отменой и недостающее в покупки', async () => {
    await resetDemo(uiPage);
    await go(uiPage, 'recipes/meatballs-mash');
    assert.equal(await uiPage.locator('[data-servings-output]').innerText(), '2');
    await uiPage.locator('[data-servings="1"]').click();
    await uiPage.locator('[data-servings="1"]').click();
    assert.equal(await uiPage.locator('[data-servings-output]').innerText(), '4');

    await go(uiPage, 'recipes/oatmeal-apple');
    assert.equal(await uiPage.locator('[data-servings-output]').innerText(), '2', 'порции перешли на другой рецепт');
    await go(uiPage, 'recipes/meatballs-mash');
    assert.equal(await uiPage.locator('[data-servings-output]').innerText(), '2', 'порции не сбросились');
    await uiPage.locator('[data-servings="1"]').click();
    await uiPage.locator('[data-servings="1"]').click();

    const cookedBefore = await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().stats.cooked;
    });
    await uiPage.locator('#screen [data-action="cook"]').click();
    await uiPage.locator('dialog.sheet [data-cook-confirm]').click();
    await waitNoSheets(uiPage);
    await uiPage.waitForTimeout(300);
    assert.equal(await uiPage.locator('[data-servings-output]').innerText(), '4', 'порции потерялись после готовки');
    const cookedAfter = await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().stats.cooked;
    });
    assert.equal(cookedAfter, cookedBefore + 1);

    const cookToast = uiPage.locator('.toast').filter({ hasText: 'Приготовлено' }).last();
    await cookToast.locator('.toast__action').click();
    await uiPage.waitForTimeout(400);
    const cookedUndo = await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().stats.cooked;
    });
    assert.equal(cookedUndo, cookedBefore, 'отмена готовки не вернула статистику');

    const missingRecipe = await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      const E = window.POLKA_ENGINE;
      const state = store.getState();
      const recipe = window.POLKA_DATA.RECIPES.find((entry) => {
        return E.matchRecipe(entry, state, store.getToday(), state.settings.servings).missingBlocking.length > 0;
      });
      return recipe ? recipe.id : '';
    });
    assert(missingRecipe, 'в демо нет рецепта с недостающими продуктами');
    await go(uiPage, 'recipes/' + missingRecipe);
    await uiPage.locator('#screen [data-action="missing"]').click();
    await uiPage.waitForFunction(() => {
      return Array.from(document.querySelectorAll('.toast')).some((node) => {
        return node.textContent.includes('В покупки добавлено');
      });
    }, null, { timeout: 3000 });
    await resetDemo(uiPage);
    await uiPage.evaluate(() => { document.querySelectorAll('.toast').forEach((node) => node.remove()); });
  });

  await test('UI: рецепт — источник и видео открываются только по ссылке', async () => {
    await resetDemo(uiPage);
    const external = [];
    const onRequest = (request) => {
      const url = request.url();
      if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) {
        external.push(url);
      }
    };
    uiPage.on('request', onRequest);
    try {
      await go(uiPage, 'recipes/chickpea-curry');
      const source = uiPage.locator('#screen [data-origin="source"]');
      const video = uiPage.locator('#screen [data-origin="video"]');
      assert.equal(await source.count(), 1, 'нет ссылки на источник');
      assert.equal(await video.count(), 1, 'нет ссылки на видео');
      assert.equal(await source.getAttribute('href'), 'https://vkusvill.ru/media/recipes/karri-s-nutom.html');
      assert.equal(await source.getAttribute('target'), '_blank');
      assert.equal(await source.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await video.getAttribute('href'), 'https://www.youtube.com/watch?v=67CGZuxJLdI');
      assert.equal(await video.getAttribute('target'), '_blank');
      assert.equal(await video.getAttribute('rel'), 'noopener noreferrer');
      assert.match(await source.innerText(), /ЩИ · ВкусВилл/);
      assert.match(await video.innerText(), /видео-инструкция/i);
      assert.match(await video.innerText(), /ВкусВилл · YouTube/);
      assert.equal(await uiPage.locator('#screen iframe, #screen video').count(), 0, 'медиа встроено в экран');
      assert.deepEqual(external, [], 'приложение само запросило внешние ресурсы');
    } finally {
      uiPage.off('request', onRequest);
    }
  });

  await test('UI: план — очистка с отменой, слот, замена и сборка', async () => {
    await resetDemo(uiPage);
    await go(uiPage, 'plan');
    assert(await uiPage.locator('.plan-slot--filled').count() > 0, 'в демо нет плана');

    await uiPage.locator('#screen [data-action="clear-plan"]').click();
    await uiPage.locator('dialog.sheet [data-confirm-ok]').click();
    await waitNoSheets(uiPage);
    await uiPage.waitForTimeout(300);
    assert.equal(await uiPage.locator('.plan-slot--filled').count(), 0, 'план не очистился');
    assert((await uiPage.locator('.plan-empty__title').innerText()).includes('чистый лист'));

    await uiPage.locator('.toast__action', { hasText: 'Отменить' }).last().click();
    await uiPage.waitForTimeout(350);
    assert(await uiPage.locator('.plan-slot--filled').count() > 0, 'очистка плана не отменилась');

    await uiPage.locator('.plan-slot--filled').first().click();
    await uiPage.locator('dialog.sheet [data-slot-open]').click();
    await uiPage.waitForTimeout(450);
    assert((await uiPage.evaluate(() => location.hash)).startsWith('#/recipes/'), 'слот не открыл рецепт');
    assert.equal(await uiPage.locator('dialog.sheet').count(), 0);
    await uiPage.goBack();
    await uiPage.waitForTimeout(350);
    assert.equal(await uiPage.evaluate(() => location.hash), '#/plan');

    await uiPage.locator('.plan-slot--filled').first().click();
    await uiPage.locator('dialog.sheet [data-slot-replace]').click();
    await uiPage.waitForTimeout(450);
    assert.equal(await uiPage.locator('dialog.sheet .sheet__title').innerText(), 'Выбрать блюдо');
    await uiPage.locator('[data-pick-id]').first().click();
    await waitNoSheets(uiPage);
    await uiPage.waitForTimeout(350);
    assert.equal(await uiPage.evaluate(() => location.hash), '#/plan');
    assert.equal(await uiPage.evaluate(() => Boolean(history.state && history.state.modal)), false);
    assert(await uiPage.locator('.plan-slot--filled').count() > 0);

    await uiPage.locator('#screen [data-action="generate"]').first().click();
    if (await uiPage.locator('dialog.sheet [data-confirm-ok]').count()) {
      await uiPage.locator('dialog.sheet [data-confirm-ok]').click();
    }
    await waitNoSheets(uiPage);
    await uiPage.waitForTimeout(350);
    assert(await uiPage.locator('.plan-slot--filled').count() > 0, 'план не собрался');

    await uiPage.locator('#screen [data-action="sync-shopping"]').click();
    await uiPage.waitForFunction(() => {
      return Array.from(document.querySelectorAll('.toast')).some((node) => /покуп/i.test(node.textContent));
    }, null, { timeout: 3000 });
    await resetDemo(uiPage);
    await uiPage.evaluate(() => { document.querySelectorAll('.toast').forEach((node) => node.remove()); });
  });

  await test('UI: покупки, экспорт и импорт', async () => {
    await resetDemo(uiPage);
    await go(uiPage, 'shopping');
    const before = await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().shopping.length;
    });
    assert(before > 0, 'в демо нет покупок');

    await uiPage.locator('#screen [data-shop-row]').first().locator('.shop-row__main').click();
    await uiPage.waitForTimeout(150);
    await uiPage.locator('#screen [data-action="buy"]').click();
    await uiPage.waitForTimeout(350);
    const afterBuy = await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().shopping.length;
    });
    assert(afterBuy < before, 'покупка не убрала отмеченную позицию');
    await uiPage.locator('.toast').filter({ hasText: 'Куплено' }).last().locator('.toast__action').click();
    await uiPage.waitForTimeout(350);
    assert.equal(await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().shopping.length;
    }), before, 'отмена покупки не вернула список');

    await uiPage.locator('#screen [data-shop-row]').first().locator('.shop-row__main').click();
    await uiPage.waitForTimeout(150);
    await uiPage.locator('#screen [data-action="clear"]').click();
    await uiPage.locator('dialog.sheet [data-confirm-ok]').click();
    await waitNoSheets(uiPage);
    await uiPage.waitForTimeout(300);
    assert(await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().shopping.length;
    }) < before, 'очистка отмеченных не сработала');
    await uiPage.locator('.toast__action', { hasText: 'Отменить' }).last().click();
    await uiPage.waitForTimeout(350);
    assert.equal(await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().shopping.length;
    }), before, 'отмена очистки не вернула список');

    await uiPage.locator('#screen [data-action="share"]').click();
    await uiPage.waitForTimeout(400);
    const shareDialog = await uiPage.locator('dialog.sheet').count();
    const shareToast = await uiPage.locator('.toast').filter({ hasText: /Список|Не удалось/ }).count();
    assert(shareDialog > 0 || shareToast > 0, 'кнопка «Поделиться» ничего не сделала');
    if (shareDialog > 0) {
      await uiPage.locator('dialog.sheet [data-sheet-close]').click();
      await waitNoSheets(uiPage);
    }

    await go(uiPage, 'more');
    const [download] = await Promise.all([
      uiPage.waitForEvent('download', { timeout: 5000 }),
      uiPage.locator('#screen [data-action="export"]').click()
    ]);
    assert(/^polka-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()));

    await uiPage.locator('#screen [data-action="import"]').click();
    await uiPage.locator('[data-import-input]').setInputFiles(path.join(ROOT, 'fixtures', 'import.json'));
    await uiPage.waitForTimeout(300);
    await uiPage.locator('dialog.sheet [data-confirm-ok]').click();
    await waitNoSheets(uiPage);
    await uiPage.waitForTimeout(650);
    assert.equal(await uiPage.evaluate(() => location.hash), '#/pantry');
    assert.equal(await uiPage.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().pantry[0] && store.getState().pantry[0].id;
    }), 'p_test_import');
    await resetDemo(uiPage);
    await uiPage.evaluate(() => { document.querySelectorAll('.toast').forEach((node) => node.remove()); });
  });

  await test('Аналитика: счётчики локальные, отчёт без данных о продуктах', async () => {
    await go(uiPage, 'more');
    const section = uiPage.locator('#more-analytics-title').locator('xpath=ancestor::section[1]');
    await section.waitFor({ timeout: 5000 });
    const text = await section.innerText();
    assert(text.includes('Аналитика использования'), 'нет заголовка раздела');
    assert(text.includes('Отправить отчёт'), 'нет кнопки отправки отчёта');
    assert(text.includes('Скачать JSON'), 'нет кнопки скачивания JSON');

    const stored = await uiPage.evaluate(() => {
      const raw = localStorage.getItem('polka.analytics.v1');
      return raw ? JSON.parse(raw) : null;
    });
    assert(stored, 'нет ключа polka.analytics.v1');
    assert(stored.totals.app_open >= 1, 'app_open не пишется');
    assert(stored.totals.product_add >= 1, 'product_add не пишется');
    assert(stored.totals.product_edit >= 1, 'product_edit не пишется');
    assert(stored.totals.recipe_open >= 1, 'recipe_open не пишется');
    assert(stored.totals.cook >= 1, 'cook не пишется');
    assert(stored.totals.plan_generate >= 1, 'plan_generate не пишется');
    assert(stored.routes.more >= 1, 'маршрут more не пишется');

    const [download] = await Promise.all([
      uiPage.waitForEvent('download'),
      section.locator('[data-action="report-download"]').click()
    ]);
    const name = download.suggestedFilename();
    assert(/^polka-analytics-\d{4}-\d{2}-\d{2}\.json$/.test(name), 'имя файла: ' + name);
    const payload = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(payload.format, 'polka-analytics');
    assert(payload.summary.routes.more >= 1, 'JSON: маршрут more не учтён');
    assert(payload.summary.events.product_add >= 1, 'JSON: product_add не учтён');
    const jsonText = JSON.stringify(payload);
    assert(!jsonText.includes('кабачки'), 'в отчёте есть название продукта');
  });

  await test('Поиск по коду: по кнопке, согласие, память, ошибки и сброс', async () => {
    await uiPage.evaluate(() => localStorage.removeItem('polka.lookup.v1'));
    await uiPage.reload({ waitUntil: 'networkidle' });
    await uiPage.waitForSelector('#screen .screen', { timeout: 10000 });
    await resetDemo(uiPage);
    const clearToasts = () => uiPage.evaluate(() => {
      document.querySelectorAll('.toast').forEach((node) => node.remove());
    });
    await clearToasts();

    const requests = [];
    const handler = (route) => {
      const url = route.request().url();
      requests.push(url);
      if (url.includes('4601234567999')) {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ status: 0, status_verbose: 'product not found' })
        });
        return;
      }
      if (url.includes('4601234567000')) {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'failure' })
        });
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 1,
          product: { product_name: 'Тестовое молоко 3,2%', brands: 'Ферма', quantity: '900 ml' }
        })
      });
    };
    await uiPage.route('https://world.openfoodfacts.org/**', handler);

    try {
      await go(uiPage, 'pantry');

      // без нажатия кнопки запросов нет
      await uiPage.locator('#screen [data-action="add"]').first().click();
      await uiPage.locator('#pantry-barcode').fill('4601234567890');
      await uiPage.waitForTimeout(400);
      assert.equal(requests.length, 0, 'запрос ушёл до нажатия кнопки');

      // отказ от согласия: запроса нет
      await uiPage.locator('[data-lookup]').click();
      await uiPage.locator('dialog.sheet [data-confirm-ok]').waitFor({ timeout: 5000 });
      assert((await uiPage.locator('dialog.sheet').last().innerText()).includes('Open Food Facts'), 'нет пояснения о базе');
      await uiPage.locator('dialog.sheet [data-confirm-cancel]').last().click();
      await uiPage.locator('dialog.sheet [data-confirm-ok]').waitFor({ state: 'detached', timeout: 3000 });
      assert.equal(requests.length, 0, 'после отказа ушёл запрос');
      assert.equal(await uiPage.evaluate(() => localStorage.getItem('polka.lookup.v1')), null, 'отказ сохранён как согласие');

      // согласие принято: найдено и подставлено
      await uiPage.locator('[data-lookup]').click();
      await uiPage.locator('dialog.sheet [data-confirm-ok]').waitFor({ timeout: 5000 });
      await uiPage.locator('dialog.sheet [data-confirm-ok]').click();
      await uiPage.waitForFunction(() => document.querySelector('#pantry-name').value.length > 0, null, { timeout: 5000 });
      assert.equal(await uiPage.locator('#pantry-name').inputValue(), 'Тестовое молоко 3,2%');
      assert.equal(await uiPage.locator('#pantry-qty').inputValue(), '900');
      assert.equal(await uiPage.locator('#pantry-unit').inputValue(), 'мл');
      assert((await uiPage.locator('[data-autofill]').innerText()).includes('Open Food Facts'), 'нет пометки источника');
      assert.equal(requests.length, 1, 'ожидался один запрос к базе');
      assert(requests[0].includes('4601234567890') && requests[0].includes('fields=product_name'),
        'в запросе не только код и поля: ' + requests[0]);
      await uiPage.locator('[data-save]').click();
      await waitNoSheets(uiPage);

      // повторный поиск того же кода — из памяти, без сети и без согласия
      await uiPage.locator('#screen [data-action="add"]').first().click();
      await clearToasts();
      await uiPage.locator('#pantry-barcode').fill('4601234567890');
      await uiPage.locator('[data-lookup]').click();
      await uiPage.waitForFunction(() => document.querySelector('#pantry-name').value === 'Тестовое молоко 3,2%',
        null, { timeout: 5000 });
      assert.equal(requests.length, 1, 'повторный поиск ушёл в сеть вместо памяти устройства');
      assert.equal(await uiPage.locator('dialog.sheet').count(), 1, 'согласие спросили повторно');
      assert((await uiPage.locator('[data-autofill]').innerText()).includes('памяти устройства'), 'нет пометки о памяти');
      await uiPage.locator('dialog.sheet [data-cancel]').click();
      await waitNoSheets(uiPage);

      // неизвестный код: 404 → честное «не найдено»
      await uiPage.locator('#screen [data-action="add"]').first().click();
      await clearToasts();
      await uiPage.locator('#pantry-barcode').fill('4601234567999');
      await uiPage.locator('[data-lookup]').click();
      await uiPage.waitForFunction(() => Array.from(document.querySelectorAll('.toast'))
        .some((node) => node.textContent.includes('этого кода нет')), null, { timeout: 5000 });
      assert.equal(await uiPage.locator('#pantry-name').inputValue(), '', 'название подставилось для неизвестного кода');
      assert.equal(requests.length, 2, 'запрос за неизвестным кодом не ушёл');
      await uiPage.locator('dialog.sheet [data-cancel]').click();
      await waitNoSheets(uiPage);

      // ошибка базы: 500 → понятный тост, без подстановки
      await uiPage.locator('#screen [data-action="add"]').first().click();
      await clearToasts();
      await uiPage.locator('#pantry-barcode').fill('4601234567000');
      await uiPage.locator('[data-lookup]').click();
      await uiPage.waitForFunction(() => Array.from(document.querySelectorAll('.toast'))
        .some((node) => node.textContent.includes('Не получилось получить данные')), null, { timeout: 5000 });
      assert.equal(await uiPage.locator('#pantry-name').inputValue(), '', 'название подставилось при ошибке базы');
      assert.equal(requests.length, 3, 'запрос за кодом с ошибкой не ушёл');
      await uiPage.locator('dialog.sheet [data-cancel]').click();
      await waitNoSheets(uiPage);

      // офлайн: без запроса, честный тост
      await uiPage.locator('#screen [data-action="add"]').first().click();
      await clearToasts();
      await uiContext.setOffline(true);
      await uiPage.locator('#pantry-barcode').fill('4601234567111');
      await uiPage.locator('[data-lookup]').click();
      await uiPage.waitForFunction(() => Array.from(document.querySelectorAll('.toast'))
        .some((node) => node.textContent.includes('Нет интернета')), null, { timeout: 5000 });
      assert.equal(requests.length, 3, 'офлайн-ветка ушла в сеть');
      assert.equal(await uiPage.locator('#pantry-name').inputValue(), '', 'название подставилось офлайн');
      await uiContext.setOffline(false);
      await uiPage.locator('dialog.sheet [data-cancel]').click();
      await waitNoSheets(uiPage);

      // 404 и 500 — часть сценария: браузер помечает их как ошибки консоли
      for (let i = ui.errors.length - 1; i >= 0; i -= 1) {
        if (/^console: Failed to load resource: the server responded with a status of (404|500) \(/.test(ui.errors[i])) {
          ui.errors.splice(i, 1);
        }
      }

      // точные счётчики и память кодов
      const stored = await uiPage.evaluate(() => {
        const lookupRaw = localStorage.getItem('polka.lookup.v1');
        const analyticsRaw = localStorage.getItem('polka.analytics.v1');
        return {
          lookup: lookupRaw ? JSON.parse(lookupRaw) : null,
          totals: analyticsRaw ? JSON.parse(analyticsRaw).totals : {}
        };
      });
      assert(stored.lookup && stored.lookup.consent === true, 'согласие не сохранено');
      assert(stored.lookup.cache['4601234567890'] && stored.lookup.cache['4601234567890'].name === 'Тестовое молоко 3,2%',
        'найденное не сохранилось в память');
      assert.equal(stored.totals.scan_lookup, 5, 'всего поисков: ' + stored.totals.scan_lookup);
      assert.equal(stored.totals['scan_lookup.found'], 2, 'найдено: ' + stored.totals['scan_lookup.found']);
      assert.equal(stored.totals['scan_lookup.notfound'], 1, 'не найдено: ' + stored.totals['scan_lookup.notfound']);
      assert.equal(stored.totals['scan_lookup.error'], 1, 'ошибок: ' + stored.totals['scan_lookup.error']);
      assert.equal(stored.totals['scan_lookup.offline'], 1, 'офлайн: ' + stored.totals['scan_lookup.offline']);

      // сброс памяти поиска на экране «Ещё»
      await go(uiPage, 'more');
      const resetRow = uiPage.locator('[data-action="lookup-reset"]');
      await resetRow.waitFor({ timeout: 5000 });
      const rowText = await resetRow.innerText();
      assert(rowText.includes('Память поиска по коду'), 'нет строки сброса: ' + rowText);
      assert(rowText.includes('разрешение выдано'), 'нет статуса согласия: ' + rowText);
      await resetRow.click();
      await uiPage.locator('dialog.sheet [data-confirm-ok]').waitFor({ timeout: 5000 });
      await uiPage.locator('dialog.sheet [data-confirm-ok]').click();
      await waitNoSheets(uiPage);
      await uiPage.waitForTimeout(300);
      assert.equal(await uiPage.evaluate(() => localStorage.getItem('polka.lookup.v1')), null, 'память поиска не удалилась');
      assert((await resetRow.innerText()).includes('пусто'), 'статус сброса не обновился');
    } finally {
      await uiPage.unroute('https://world.openfoodfacts.org/**', handler);
    }
  });

  await expectNoErrors(ui.errors, 'ui');
  await uiContext.close();

  await test('Сканер: QR-код подставляет название продукта', async () => {
    const fixture = scanFixture('MILK TEST 1L', 'name');
    if (!fixture) {
      console.log('  skip  нет qrencode/ffmpeg — фикстура камеры не собрана');
      return;
    }
    await withFakeCamera(fixture, null, async ({ page: scanPage }) => {
      await resetDemo(scanPage);
      await openScanner(scanPage);
      assert.equal(await scanPage.locator('#pantry-name').inputValue(), 'MILK TEST 1L');
      await scanPage.locator('[data-save]').click();
      await waitNoSheets(scanPage);
      const saved = await scanPage.evaluate(async () => {
        const store = await import(new URL('js/store.js', document.baseURI).href);
        const item = store.getState().pantry.find((entry) => entry.name === 'MILK TEST 1L');
        return item ? { name: item.name, barcode: item.barcode } : null;
      });
      assert.deepEqual(saved, { name: 'MILK TEST 1L', barcode: '' });
    });
  });

  await test('Сканер: штрихкод запоминается и подставляется в следующий раз', async () => {
    const fixture = scanFixture('4601234567890', 'code');
    if (!fixture) {
      console.log('  skip  нет qrencode/ffmpeg — фикстура камеры не собрана');
      return;
    }
    const disableNative = () => {
      Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
    };
    await withFakeCamera(fixture, disableNative, async ({ page: scanPage }) => {
      await resetDemo(scanPage);
      await openScanner(scanPage);
      assert.equal(await scanPage.locator('#pantry-barcode').inputValue(), '4601234567890');
      await scanPage.locator('#pantry-name').fill('Товар с кодом');
      await scanPage.locator('[data-save]').click();
      await waitNoSheets(scanPage);

      await openScanner(scanPage);
      assert.equal(await scanPage.locator('#pantry-barcode').inputValue(), '4601234567890');
      assert.equal(await scanPage.locator('#pantry-name').inputValue(), 'Товар с кодом');
      await scanPage.locator('[data-cancel]').click();
      await waitNoSheets(scanPage);
    });
  });

  await test('Офлайн: приложение открывается без сети, данные сохраняются', async () => {
    await go(page, 'pantry');
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
    const beforeOffline = await page.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return {
        count: store.getState().pantry.length,
        stored: localStorage.getItem(store.STORAGE_KEY) !== null
      };
    });
    assert.equal(beforeOffline.stored, true, 'данные не записаны в localStorage');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#screen .screen', { timeout: 10000 });
    assert.equal(await page.locator('#offline-banner').isVisible(), true, 'нет офлайн-баннера');
    const text = await page.locator('#screen').innerText();
    assert(text.length > 20, 'офлайн-экран пуст');
    assert.equal(await page.evaluate(async () => {
      const store = await import(new URL('js/store.js', document.baseURI).href);
      return store.getState().pantry.length;
    }), beforeOffline.count, 'после офлайн-перезагрузки потерялись данные');
    await shot(page, '04-offline');
    await context.setOffline(false);
  });

  await expectNoErrors(errors, 'app');

  await browser.close();

  console.log('\n' + passed + ' проверок прошло, ' + failed + ' упало.\n');
  if (failed) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  if (browser) {
    try {
      await browser.close();
    } catch (closeError) {
      /* браузер уже закрыт */
    }
  }
});
