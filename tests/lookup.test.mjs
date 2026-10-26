/*
 * Юнит-тесты модуля поиска по штрихкоду (js/lookup.js).
 * Запуск: node tests/lookup.test.mjs
 * Сеть не нужна: fetch подменяется, localStorage в Node недоступен —
 * модуль работает в памяти.
 */

import assert from 'node:assert/strict';
import {
  codeForLookup, cachedProduct, rememberProduct, findProduct,
  hasLookupConsent, grantLookupConsent, lookupMemoryInfo, resetLookupData
} from '../js/lookup.js';

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

console.log('\nПОЛКА · lookup\n');

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

await test('rememberProduct/cachedProduct: нормализация, мусор и чистота текста', () => {
  resetLookupData();
  rememberProduct('4600000000001', { name: 'Молоко 3,2%', brand: 'Ферма', quantity: '900 ml', extra: 'нет' });
  assert.deepEqual(cachedProduct('4600000000001'), { name: 'Молоко 3,2%', brand: 'Ферма', quantity: '900 ml' });
  assert.deepEqual(cachedProduct('460 0000-000001'), { name: 'Молоко 3,2%', brand: 'Ферма', quantity: '900 ml' });

  rememberProduct('4600000000002', { name: '', brand: 'Только бренд' });
  assert.deepEqual(cachedProduct('4600000000002'), { name: 'Только бренд', brand: 'Только бренд', quantity: '' });

  rememberProduct('4600000000003', { name: '', brand: '' });
  assert.equal(cachedProduct('4600000000003'), null);
  rememberProduct('123', { name: 'Мусор' });
  assert.equal(cachedProduct('123'), null);

  rememberProduct('4600000000004', { name: 'Тест\u0000\n  Продукт' });
  assert.equal(cachedProduct('4600000000004').name, 'Тест Продукт');
});

await test('память кодов: не больше 200, старые вытесняются', () => {
  resetLookupData();
  for (let i = 0; i < 205; i += 1) {
    rememberProduct('460000000' + String(1000 + i), { name: 'Товар ' + i });
  }
  assert.equal(lookupMemoryInfo().count, 200);
  assert.equal(cachedProduct('4600000001000'), null, 'самый старый код не вытеснился');
  assert(cachedProduct('4600000001204'), 'последний код потерялся');
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

await test('findProduct: найдено, 404, 500 и обрыв сети', async () => {
  resetLookupData();
  stubFetch(function (url) {
    if (url.includes('4600000000404')) return jsonResponse(404, { status: 0 });
    if (url.includes('4600000000500')) return jsonResponse(500, {});
    return jsonResponse(200, {
      status: 1,
      product: { product_name: 'Тестовое молоко', brands: 'Ферма', quantity: '900 ml' }
    });
  });
  try {
    const found = await findProduct('4600000000009');
    assert.equal(found.status, 'found');
    assert.equal(found.cached, false);
    assert.deepEqual(found.product, { name: 'Тестовое молоко', brand: 'Ферма', quantity: '900 ml' });
    assert.equal(requests[0].url,
      'https://world.openfoodfacts.org/api/v2/product/4600000000009.json?fields=product_name,brands,quantity');
    assert.equal(requests[0].options.referrerPolicy, 'no-referrer');
    assert.equal(requests[0].options.headers.Accept, 'application/json');

    const again = await findProduct('4600000000009');
    assert.equal(again.cached, true);
    assert.equal(requests.length, 1, 'повторный поиск ушёл в сеть');

    assert.equal((await findProduct('4600000000404')).status, 'notfound');
    assert.equal((await findProduct('4600000000500')).status, 'error');

    stubFetch(() => { throw new Error('обрыв сети'); });
    assert.equal((await findProduct('4600000000700')).status, 'error');
    assert.equal(requests.length, 1, 'обрыв сети не дошёл до fetch');
  } finally {
    restoreFetch();
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
