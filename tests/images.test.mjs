/*
 * Тесты иллюстраций блюд: каждый рецепт получает картинку,
 * файл существует и остаётся локальным SVG без внешних ссылок.
 * Запуск: node tests/images.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { recipeImage } from '../js/recipe-images.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const context = { window: {} };
vm.createContext(context);
vm.runInContext(readFileSync(path.join(ROOT, 'js/data.js'), 'utf8'), context);
const recipes = context.window.POLKA_DATA.RECIPES;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok  ' + name);
  } catch (error) {
    failed += 1;
    console.error('  FAIL ' + name);
    console.error(String(error && error.stack ? error.stack : error).split('\n').slice(0, 6).join('\n'));
  }
}

test('у каждого рецепта есть иллюстрация', function () {
  assert.equal(recipes.length, 27);
  const missing = recipes.filter(function (recipe) {
    return recipeImage(recipe.id, recipe.title) === null;
  }).map(function (recipe) { return recipe.id; });
  assert.equal(missing.length, 0, 'нет картинки: ' + missing.join(', '));
});

test('картинки уникальны и лежат в assets/dishes', function () {
  const seen = new Set();
  recipes.forEach(function (recipe) {
    const image = recipeImage(recipe.id, recipe.title);
    assert.ok(image.src.startsWith('assets/dishes/'), recipe.id);
    assert.ok(existsSync(path.join(ROOT, image.src)), image.src);
    assert.ok(!seen.has(image.src), 'дубликат: ' + image.src);
    seen.add(image.src);
  });
  assert.equal(seen.size, recipes.length);
});

test('подпись описывает блюдо', function () {
  const image = recipeImage('syrniki', 'Сырники из творога');
  assert.equal(image.alt, 'Иллюстрация блюда «Сырники из творога»');
  assert.equal(recipeImage('unknown', 'Что-то'), null);
  assert.equal(recipeImage('syrniki').alt, 'Иллюстрация блюда «»');
});

test('SVG локальный и без активного содержимого', function () {
  recipes.forEach(function (recipe) {
    const image = recipeImage(recipe.id, recipe.title);
    const source = readFileSync(path.join(ROOT, image.src), 'utf8');
    assert.ok(source.startsWith('<svg'), recipe.id);
    assert.ok(!/<script|<image|href="http|url\(http/i.test(source), 'внешнее содержимое: ' + recipe.id);
    assert.ok(source.includes('<title>'), 'нет title: ' + recipe.id);
  });
});

console.log('\n' + passed + ' прошло, ' + failed + ' упало');
if (failed) process.exit(1);
