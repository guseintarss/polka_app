/*
 * Юнит-тесты модуля поиска по штрихкоду (js/lookup.js).
 * Запуск: node tests/lookup.test.mjs
 * Сеть не нужна: fetch подменяется, localStorage в Node недоступен —
 * модуль работает в памяти. Старый формат хранилища проверяется
 * через отдельный экземпляр модуля и подставной localStorage.
 */

import assert from 'node:assert/strict';
import {
  codeForLookup, cachedProduct, rememberProduct, findProduct,
  hasLookupConsent, grantLookupConsent, lookupMemoryInfo, resetLookupData,
  LOOKUP_SOURCES
} from '../js/lookup.js';

const FIELDS = 'product_name,product_name_ru,generic_name,brands,quantity,product_quantity,product_quantity_unit,categories_tags';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ok  ' + name);
  } catch (error) {
    failed += 1;
    console.error('  FAIL ' + name);
    console.error(String(error && error.stack ? error.stack : error).split('\n').slice(0, 6).join('\n'));
  }
}

const realFetch = globalThis.fetch;
let requests = [];

function stubFetch(handler) {
  requests = [];
  globalThis.fetch = async function (url, options) {
    requests.push({ url: String(url), options: options || {} });
    return handler(String(url), options || {});
  };
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: async function () { return payload; }
  };
}

function memoryStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: function (key) { return map.has(key) ? map.get(key) : null; },
    setItem: function (key, value) { map.set(key, String(value)); },
    removeItem: function (key) { map.delete(key); }
  };
}

console.log('\nПОЛКА · lookup\n');

await test('LOOKUP_SOURCES: два источника в порядке опроса, без адресов', () => {
  assert.deepEqual(LOOKUP_SOURCES, [
    { id: 'off', label: 'Open Food Facts' },
    { id: 'opf', label: 'Open Products Facts' }
  ]);
});

await test('codeForLookup: 8–14 цифр, пробелы и дефисы игнорируются', () => {
  assert.equal(codeForLookup('4601234567890'), '4601234567890');
  assert.equal(codeForLookup(' 460 1234-567890 '), '4601234567890');
  assert.equal(codeForLookup(4601234567890), '4601234567890');
  assert.equal(codeForLookup('12345678'), '12345678');
  assert.equal(codeForLookup('1234'), '');
  assert.equal(codeForLookup('4601234567890123'), '');
  assert.equal(codeForLookup('40a1234567890'), '');
  assert.equal(codeForLookup(''), '');
});

await test('согласие: по умолчанию нет, после выдачи есть', () => {
  resetLookupData();
  assert.equal(hasLookupConsent(), false);
  assert.deepEqual(lookupMemoryInfo(), { consent: false, count: 0 });
  grantLookupConsent();
  assert.equal(hasLookupConsent(), true);
  assert.equal(lookupMemoryInfo().consent, true);
});

await test('rememberProduct/cachedProduct: стабильная форма, мусор и чистота текста', () => {
  resetLookupData();
  rememberProduct('4600000000001', { name: 'Молоко 3,2%', brand: 'Ферма', quantity: '900 ml', extra: 'нет' });
  const milk = { name: 'Молоко 3,2%', brand: 'Ферма', quantity: '900 ml', categories: [], source: '' };
  assert.deepEqual(cachedProduct('4600000000001'), milk);
  assert.deepEqual(cachedProduct('460 0000-000001'), milk);

  rememberProduct('4600000000002', { name: '', brand: 'Только бренд' });
  assert.deepEqual(cachedProduct('4600000000002'), {
    name: 'Только бренд', brand: 'Только бренд', quantity: '', categories: [], source: ''
  });

  rememberProduct('4600000000003', { name: '', brand: '' });
  assert.equal(cachedProduct('4600000000003'), null);
  rememberProduct('123', { name: 'Мусор' });
  assert.equal(cachedProduct('123'), null);

  rememberProduct('4600000000004', { name: 'Тест\u0000\n  Продукт' });
  assert.equal(cachedProduct('4600000000004').name, 'Тест Продукт');
});

await test('категории: строки, дедуп, до 12, control-символы убираются', () => {
  resetLookupData();
  rememberProduct('4600000000010', {
    name: 'Товар',
    categories: [' en:dairies ', 'en:milks', 'en:dairies', '', '   ', 42, null, 'a\u0000b\nc']
  });
  assert.deepEqual(cachedProduct('4600000000010').categories, ['en:dairies', 'en:milks', 'a b c']);

  const many = [];
  for (let i = 0; i < 15; i += 1) many.push('en:tag-' + i);
  many.push('en:tag-0', 'en:tag-15');
  rememberProduct('4600000000011', { name: 'Товар', categories: many });
  const stored = cachedProduct('4600000000011');
  assert.equal(stored.categories.length, 12);
  assert.equal(stored.categories[0], 'en:tag-0');
  assert.equal(stored.categories[11], 'en:tag-11');
  assert.equal(stored.categories.indexOf('en:tag-15'), -1);
});

await test('память кодов: не больше 200, старые вытесняются', () => {
  resetLookupData();
  for (let i = 0; i < 205; i += 1) {
    rememberProduct('460000000' + String(1000 + i), { name: 'Товар ' + i });
  }
  assert.equal(lookupMemoryInfo().count, 200);
  assert.equal(cachedProduct('4600000001000'), null, 'самый старый код не вытеснился');
  assert.ok(cachedProduct('4600000001204'), 'последний код потерялся');
});

await test('findProduct: невалидный код и память без сети', async () => {
  resetLookupData();
  assert.deepEqual(await findProduct('abc'), { status: 'invalid' });

  rememberProduct('4600000000001', { name: 'Молоко' });
  stubFetch(() => { throw new Error('сеть не должна вызываться'); });
  try {
    const result = await findProduct('4600000000001');
    assert.equal(result.status, 'found');
    assert.equal(result.cached, true);
    assert.equal(result.product.name, 'Молоко');
    assert.equal(requests.length, 0, 'поиск из памяти ушёл в сеть');
  } finally {
    restoreFetch();
  }
});

await test('findProduct: точный URL, расширенные поля и приоритет product_name_ru', async () => {
  resetLookupData();
  stubFetch(function () {
    return jsonResponse(200, {
      status: 1,
      product: {
        product_name: 'Test milk',
        product_name_ru: 'Тестовое молоко',
        generic_name: 'Молоко питьевое',
        brands: 'Ферма, Другая',
        quantity: '900 ml',
        categories_tags: ['en:dairies', 'en:dairies', ' en:milks ', '', 7]
      }
    });
  });
  try {
    const found = await findProduct('4600000000009');
    assert.equal(found.status, 'found');
    assert.equal(found.cached, false);
    assert.deepEqual(found.product, {
      name: 'Тестовое молоко',
      brand: 'Ферма, Другая',
      quantity: '900 ml',
      categories: ['en:dairies', 'en:milks'],
      source: 'Open Food Facts'
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url,
      'https://world.openfoodfacts.org/api/v2/product/4600000000009.json?fields=' + FIELDS);
    assert.equal(requests[0].options.cache, 'no-store');
    assert.equal(requests[0].options.credentials, 'omit');
    assert.equal(requests[0].options.referrerPolicy, 'no-referrer');
    assert.deepEqual(requests[0].options.headers, { Accept: 'application/json' });
    assert.ok(requests[0].options.signal, 'запрос ушёл без AbortController.signal');

    assert.deepEqual(cachedProduct('4600000000009'), found.product);

    const again = await findProduct('4600000000009');
    assert.equal(again.status, 'found');
    assert.equal(again.cached, true);
    assert.deepEqual(again.product, found.product);
    assert.equal(requests.length, 1, 'повторный поиск ушёл в сеть');
  } finally {
    restoreFetch();
  }
});

await test('findProduct: quantity из product_quantity и единицы, имя из generic_name', async () => {
  resetLookupData();
  stubFetch(function () {
    return jsonResponse(200, {
      status: 1,
      product: {
        product_name_ru: '',
        product_name: '',
        generic_name: 'Салфетки',
        brands: 'Домашняя марка',
        quantity: '',
        product_quantity: 100,
        product_quantity_unit: 'шт'
      }
    });
  });
  try {
    const found = await findProduct('4600000000100');
    assert.equal(found.status, 'found');
    assert.equal(found.product.name, 'Салфетки');
    assert.equal(found.product.quantity, '100 шт');
  } finally {
    restoreFetch();
  }

  rememberProduct('4600000000101', { name: 'Молоко', quantity: '1 л', product_quantity: 1000, product_quantity_unit: 'ml' });
  assert.equal(cachedProduct('4600000000101').quantity, '1 л');
});

await test('findProduct: OFF 404 → OPF 200, источник запоминается', async () => {
  resetLookupData();
  stubFetch(function (url) {
    if (url.includes('world.openproductsfacts.org')) {
      return jsonResponse(200, {
        status: 1,
        product: {
          product_name: 'Бумажные полотенца',
          brands: 'Домашняя марка',
          quantity: '2 рулона',
          categories_tags: ['en:household', 'en:paper-products']
        }
      });
    }
    return jsonResponse(404, { status: 0 });
  });
  try {
    const result = await findProduct('4600000000301');
    assert.equal(result.status, 'found');
    assert.equal(result.cached, false);
    assert.equal(result.product.source, 'Open Products Facts');
    assert.deepEqual(result.product.categories, ['en:household', 'en:paper-products']);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].url.startsWith(
      'https://world.openfoodfacts.org/api/v2/product/4600000000301.json?fields='));
    assert.ok(requests[1].url.startsWith(
      'https://world.openproductsfacts.org/api/v2/product/4600000000301.json?fields='));
    assert.deepEqual(cachedProduct('4600000000301'), result.product);

    const again = await findProduct('4600000000301');
    assert.equal(again.status, 'found');
    assert.equal(again.cached, true);
    assert.equal(again.product.source, 'Open Products Facts');
    assert.equal(requests.length, 2, 'повторный поиск ушёл в сеть');
  } finally {
    restoreFetch();
  }
});

await test('findProduct: оба источника ответили «нет» → notfound', async () => {
  resetLookupData();
  stubFetch(function () { return jsonResponse(404, { status: 0 }); });
  try {
    assert.deepEqual(await findProduct('4600000000404'), { status: 'notfound' });
    assert.equal(requests.length, 2);
    assert.ok(requests[0].url.startsWith('https://world.openfoodfacts.org/'));
    assert.ok(requests[1].url.startsWith('https://world.openproductsfacts.org/'));
  } finally {
    restoreFetch();
  }

  stubFetch(function () { return jsonResponse(200, { status: 0 }); });
  try {
    assert.deepEqual(await findProduct('4600000000405'), { status: 'notfound' });
    assert.equal(requests.length, 2);
  } finally {
    restoreFetch();
  }

  stubFetch(function () { return jsonResponse(200, { status: 1, product: {} }); });
  try {
    assert.deepEqual(await findProduct('4600000000406'), { status: 'notfound' });
    assert.equal(requests.length, 2);
  } finally {
    restoreFetch();
  }
});

await test('findProduct: OFF 500 → error без перехода на OPF', async () => {
  resetLookupData();
  stubFetch(function () { return jsonResponse(500, {}); });
  try {
    assert.deepEqual(await findProduct('4600000000500'), { status: 'error' });
    assert.equal(requests.length, 1);
    assert.ok(requests[0].url.startsWith('https://world.openfoodfacts.org/'));
    assert.equal(cachedProduct('4600000000500'), null);
  } finally {
    restoreFetch();
  }
});

await test('findProduct: обрыв сети → error, ошибка не кэшируется', async () => {
  resetLookupData();
  stubFetch(function () { throw new Error('обрыв сети'); });
  try {
    assert.deepEqual(await findProduct('4600000000700'), { status: 'error' });
    assert.equal(requests.length, 1);
    assert.equal(cachedProduct('4600000000700'), null);

    assert.deepEqual(await findProduct('4600000000700'), { status: 'error' });
    assert.equal(requests.length, 2, 'повторный вызов не пошёл в сеть');
  } finally {
    restoreFetch();
  }
});

await test('findProduct: без fetch → error, без исключения', async () => {
  resetLookupData();
  globalThis.fetch = undefined;
  try {
    assert.deepEqual(await findProduct('4600000000800'), { status: 'error' });
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test('старый формат polka.lookup.v1 без categories/source читается', async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = memoryStorage({
    'polka.lookup.v1': JSON.stringify({
      version: 1,
      consent: true,
      cache: {
        '4600000000001': { name: 'Старое молоко', brand: 'Ферма', quantity: '1 л', at: 1700000000000 }
      }
    })
  });
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  try {
    const legacy = await import(new URL('../js/lookup.js?legacy=1', import.meta.url).href);
    assert.deepEqual(legacy.cachedProduct('4600000000001'), {
      name: 'Старое молоко', brand: 'Ферма', quantity: '1 л', categories: [], source: ''
    });
    assert.equal(legacy.lookupMemoryInfo().count, 1);

    legacy.rememberProduct('4600000000002', {
      name: 'Новое', categories: ['en:test'], source: 'Open Food Facts'
    });
    assert.deepEqual(legacy.cachedProduct('4600000000002'), {
      name: 'Новое', brand: '', quantity: '', categories: ['en:test'], source: 'Open Food Facts'
    });
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  }
});

await test('resetLookupData: согласие и память стираются', () => {
  grantLookupConsent();
  rememberProduct('4600000000001', { name: 'Молоко' });
  resetLookupData();
  assert.equal(hasLookupConsent(), false);
  assert.deepEqual(lookupMemoryInfo(), { consent: false, count: 0 });
  assert.equal(cachedProduct('4600000000001'), null);
});

console.log('\n' + passed + ' тестов прошло, ' + failed + ' упало.\n');
if (failed) process.exitCode = 1;
