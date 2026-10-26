/*
 * Тесты движка ПОЛКИ. Запуск: node tests/engine.test.js
 */
'use strict';

global.window = global;
require('../js/data.js');
require('../js/engine.js');

const assert = require('node:assert/strict');
const DATA = global.POLKA_DATA;
const E = global.POLKA_ENGINE;
const TODAY = '2026-10-20';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok  ' + name);
  } catch (error) {
    console.error('  FAIL ' + name);
    throw error;
  }
}

function freshState(overrides) {
  const state = E.emptyState(TODAY);
  state.demoSeed = 19;
  return Object.assign(state, overrides || {});
}

function addPantry(state, ingredientId, qty, unit, expires, price) {
  const meta = E.ingredientById(ingredientId);
  state.pantry.push({
    id: E.uid('p'),
    ingredientId: ingredientId,
    name: meta ? meta.name : ingredientId,
    qty: qty,
    unit: unit || (meta ? meta.unit : 'шт'),
    category: meta ? meta.category : 'Другое',
    storage: meta ? meta.storage : 'pantry',
    expires: expires === undefined ? null : expires,
    price: price || 0,
    addedAt: TODAY
  });
}

function stockRecipe(state, recipeId, skipIds) {
  const recipe = E.recipeById(recipeId);
  const skip = new Set(skipIds || []);
  recipe.ingredients.forEach((ingredient) => {
    if (ingredient.optional || skip.has(ingredient.id)) return;
    const meta = E.ingredientById(ingredient.id);
    addPantry(state, ingredient.id, ingredient.qty * 4, ingredient.unit || meta.unit, '2026-11-01', 10);
  });
}

console.log('\nКаталог и рецепты');

test('все ID продуктов уникальны', () => {
  const ids = DATA.INGREDIENTS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 60);
});

test('все ID рецептов уникальны, рецептов не меньше 20', () => {
  const ids = DATA.RECIPES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 20);
});

test('у продуктов корректные категории, зоны и единицы', () => {
  DATA.INGREDIENTS.forEach((item) => {
    assert.ok(item.id && item.name, 'id и имя');
    assert.ok(DATA.CATEGORY_ORDER.includes(item.category), 'категория: ' + item.id);
    assert.ok(DATA.STORAGES[item.storage], 'хранение: ' + item.id);
    assert.ok(DATA.UNITS.includes(item.unit), 'единица: ' + item.id);
    assert.ok(['kg', 'l', 'pcs'].includes(item.base), 'база: ' + item.id);
    assert.ok(Number.isFinite(item.price) && item.price >= 0, 'цена: ' + item.id);
    assert.ok(Number(item.shelfLife) > 0, 'срок: ' + item.id);
  });
});

test('каждый ингредиент рецепта существует в каталоге', () => {
  DATA.RECIPES.forEach((recipe) => {
    assert.ok(recipe.title && recipe.description, 'тексты: ' + recipe.id);
    assert.ok(Number(recipe.time) > 0, 'время: ' + recipe.id);
    assert.ok(Number(recipe.servings) > 0, 'порции: ' + recipe.id);
    assert.ok(Array.isArray(recipe.steps) && recipe.steps.length >= 3, 'шаги: ' + recipe.id);
    assert.ok(recipe.meal.length > 0, 'приёмы: ' + recipe.id);
    recipe.meal.forEach((meal) => assert.ok(DATA.MEAL_ORDER.includes(meal), 'приём: ' + recipe.id));
    recipe.tags.forEach((tag) => assert.ok(DATA.TAGS[tag], 'тег ' + tag + ': ' + recipe.id));
    recipe.ingredients.forEach((ingredient) => {
      const meta = E.ingredientById(ingredient.id);
      assert.ok(meta, 'ингредиент ' + ingredient.id + ' в ' + recipe.id);
      assert.ok(Number(ingredient.qty) > 0, 'количество ' + ingredient.id + ' в ' + recipe.id);
      if (ingredient.unit) assert.ok(DATA.UNITS.includes(ingredient.unit));
    });
  });
});

test('все продукты демо-кухни ссылаются на каталог', () => {
  const demo = DATA.buildDemoState(TODAY);
  demo.pantry.forEach((item) => assert.ok(E.ingredientById(item.ingredientId), item.name));
  demo.shopping.forEach((item) => {
    if (item.ingredientId) assert.ok(E.ingredientById(item.ingredientId), item.name);
  });
});

console.log('\nДаты и сроки');

test('addDays переходит через границу месяца и года', () => {
  assert.equal(E.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(E.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(E.addDays('2026-01-01', -1), '2025-12-31');
});

test('isValidISODate отвергает несуществующие даты', () => {
  assert.equal(E.isValidISODate('2026-02-28'), true);
  assert.equal(E.isValidISODate('2026-02-30'), false);
  assert.equal(E.isValidISODate('20.10.2026'), false);
  assert.equal(E.isValidISODate(null), false);
});

test('expiryState различает просрочку, сегодня, скоро и запас', () => {
  assert.equal(E.expiryState('2026-10-19', TODAY).tone, 'expired');
  assert.equal(E.expiryState(TODAY, TODAY).tone, 'today');
  assert.equal(E.expiryState('2026-10-21', TODAY).tone, 'soon');
  assert.equal(E.expiryState('2026-10-25', TODAY).tone, 'week');
  assert.equal(E.expiryState('2026-11-20', TODAY).tone, 'fresh');
  assert.equal(E.expiryState(null, TODAY).tone, 'none');
});

test('daysUntil и русские склонения работают', () => {
  assert.equal(E.daysUntil('2026-10-27', TODAY), 7);
  assert.equal(E.pluralRu(1, ['день', 'дня', 'дней']), 'день');
  assert.equal(E.pluralRu(3, ['день', 'дня', 'дней']), 'дня');
  assert.equal(E.pluralRu(11, ['день', 'дня', 'дней']), 'дней');
});

console.log('\nНормализация состояния');

test('normalizeState отвергает мусор', () => {
  assert.throws(() => E.normalizeState(null), /данные ПОЛКИ/);
  assert.throws(() => E.normalizeState('строка'), /данные ПОЛКИ/);
});

test('normalizeState чинит настройки, дубли и даты', () => {
  const dirty = {
    settings: { servings: 99, diet: 'кетогенная', maxTime: 17 },
    pantry: [
      { id: 'same', name: 'помидоры', qty: -2, unit: 'тонна', expires: '2026-02-30', price: -4 },
      { id: 'same', name: '  ', qty: 3, unit: 'шт' },
      { id: 'same', name: 'сыр', ingredientId: 'cheese', qty: 100, unit: 'г', expires: '2026-10-25', category: 'Непонятно' }
    ],
    shopping: [
      { id: 'same-shop', name: 'хлеб', qty: 0, checked: 'да', price: -10 },
      { id: 'same-shop', name: 'сыр', qty: 1, unit: 'г' },
      { id: 'bad id', name: 'яблоко', qty: 1, unit: 'шт' }
    ],
    plan: {
      '2026-10-20': { dinner: 'pan-pizza', breakfast: 'not-a-recipe', lunch: 42 },
      'не-дата': { dinner: 'pan-pizza' }
    },
    stats: { cooked: -3, history: { '2026-10-20': { count: 2, value: 150 }, '2026-13-40': { count: 1, value: 1 } } }
  };
  const state = E.normalizeState(dirty, TODAY);
  assert.equal(state.settings.servings, 12);
  assert.equal(state.settings.diet, 'all');
  assert.equal(state.settings.maxTime, 0);
  assert.equal(state.pantry.length, 2);
  assert.equal(state.pantry[0].qty, 1);
  assert.equal(state.pantry[0].expires, null);
  assert.equal(state.pantry[0].price, 0);
  assert.equal(state.pantry[1].name, 'сыр');
  assert.equal(state.pantry[1].category, 'Молочное');
  assert.notEqual(state.pantry[0].id, state.pantry[1].id);
  assert.equal(state.plan['2026-10-20'].dinner, 'pan-pizza');
  assert.equal(state.plan['2026-10-20'].breakfast, undefined);
  assert.equal(state.plan['не-дата'], undefined);
  assert.equal(state.stats.cooked, 0);
  assert.equal(state.stats.history['2026-10-20'].value, 150);
  assert.equal(Object.keys(state.stats.history).length, 1);
  assert.equal(new Set(state.shopping.map((item) => item.id)).size, state.shopping.length);
  state.shopping.forEach((item) => assert.match(item.id, /^[A-Za-z0-9_-]+$/));
});

test('normalizeState не пускает prototype-ключи в зону хранения', () => {
  assert.equal(E.storageOf(null, 'toString'), 'pantry');
  assert.equal(E.storageOf(null, '__proto__'), 'pantry');
  assert.equal(E.storageLabel('toString'), 'Шкаф');
  assert.equal(E.storageLabel('__proto__'), 'Шкаф');

  ['toString', '__proto__', 'constructor'].forEach((storage) => {
    const state = E.normalizeState({
      pantry: [{ name: 'морковь', qty: 1, unit: 'шт', storage: storage }]
    }, TODAY);
    assert.equal(state.pantry[0].storage, 'pantry');
    const groups = E.pantryGroups(state, {}, TODAY);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].id, 'pantry');
    assert.equal(groups[0].items.length, 1);
  });
  const recipeSource = E.normalizeState({
    shopping: [{ name: 'сыр', qty: 100, unit: 'г', source: 'recipe' }]
  }, TODAY);
  assert.equal(recipeSource.shopping[0].source, 'recipe');
});

console.log('\nШтрихкоды и QR');

test('normalizeState хранит и чистит штрихкод продукта', () => {
  const state = E.normalizeState({
    pantry: [
      { name: 'молоко', qty: 1, unit: 'л', barcode: ' 4601234567890 ' },
      { name: 'сыр', qty: 100, unit: 'г', barcode: {} },
      { name: 'хлеб', qty: 1, unit: 'шт', barcode: 'x'.repeat(200) },
      { name: 'кефир', qty: 1, unit: 'л', barcode: 123 }
    ]
  }, TODAY);
  assert.equal(state.pantry[0].barcode, '4601234567890');
  assert.equal(state.pantry[1].barcode, '');
  assert.equal(state.pantry[2].barcode.length, 64);
  assert.equal(state.pantry[3].barcode, '123');
});

test('parseScanPayload распознаёт штрихкод, GS1 и QR', () => {
  assert.deepEqual(E.parseScanPayload('4601234567890'), { code: '4601234567890', name: null, kind: 'barcode' });
  assert.deepEqual(E.parseScanPayload('4 607 000 000 001'), { code: '4607000000001', name: null, kind: 'barcode' });
  assert.deepEqual(E.parseScanPayload('010460123456789021ABC\u001d91XYZ'), { code: '04601234567890', name: null, kind: 'gs1' });
  assert.deepEqual(E.parseScanPayload('https://example.com/product?name=%D0%9C%D0%BE%D0%BB%D0%BE%D0%BA%D0%BE'), { code: null, name: 'Молоко', kind: 'qr' });
  assert.deepEqual(E.parseScanPayload('https://example.com/milk-1-l'), { code: null, name: 'milk 1 l', kind: 'qr' });
  assert.deepEqual(E.parseScanPayload('Молоко 1 л'), { code: null, name: 'Молоко 1 л', kind: 'text' });
  assert.deepEqual(E.parseScanPayload('\u0000Молоко\u001f'), { code: null, name: 'Молоко', kind: 'text' });
  assert.deepEqual(E.parseScanPayload(''), { code: null, name: null, kind: 'unknown' });
  assert.deepEqual(E.parseScanPayload('https://example.com/'), { code: null, name: null, kind: 'qr' });
});

console.log('\nСовпадение рецептов');

test('пустая полка: обязательное считается недостающим, специи не блокируют', () => {
  const oats = E.recipeById('oatmeal-apple');
  const match = E.matchRecipe(oats, freshState(), TODAY);
  assert.equal(match.canCook, false);
  assert.equal(match.score, 0);
  assert.equal(match.missingBlocking.length, 5);
  const salt = match.missing.find((item) => item.id === 'salt');
  assert.ok(salt, 'соль попала в недостающее');
  assert.ok(!match.missingBlocking.some((item) => item.id === 'salt'), 'соль не блокирует');
});

test('полный набор делает рецепт доступным на 100%', () => {
  const state = freshState();
  ['oats', 'milk', 'apple', 'cinnamon', 'honey'].forEach((id) => {
    addPantry(state, id, 500, E.ingredientById(id).unit, '2026-12-01', 100);
  });
  const match = E.matchRecipe(E.recipeById('oatmeal-apple'), state, TODAY);
  assert.equal(match.score, 1);
  assert.equal(match.percent, 100);
  assert.equal(match.missingBlocking.length, 0);
  assert.equal(match.canCook, true);
});

test('недостающее количество не считается наличием, а покупка — только дефицит', () => {
  const state = freshState();
  const recipe = E.recipeById('omelette-tomato');
  addPantry(state, 'egg', 3, 'шт', '2026-11-01', 90);
  addPantry(state, 'milk', 80, 'мл', '2026-11-01', 60);
  addPantry(state, 'tomato', 100, 'г', '2026-11-01', 70);
  addPantry(state, 'cheese', 40, 'г', '2026-11-01', 80);
  addPantry(state, 'oil', 10, 'мл', '2026-12-01', 20);
  addPantry(state, 'greens', 15, 'г', '2026-11-01', 30);
  addPantry(state, 'salt', 500, 'г', '2027-01-01', 10);
  const match = E.matchRecipe(recipe, state, TODAY);
  assert.equal(match.canCook, false);
  assert.deepEqual(match.missingBlocking.map((item) => item.id), ['tomato']);
  const missing = E.collectRecipeMissing(recipe, state, 2, TODAY);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].ingredientId, 'tomato');
  assert.equal(missing[0].qty, 50);
  const half = E.matchRecipe(recipe, state, TODAY, 1);
  assert.equal(half.canCook, true, 'на одну порцию хватает');
});

test('просроченный продукт не закрывает рецепт и не считается спасённым', () => {
  const state = freshState();
  const recipe = E.recipeById('omelette-tomato');
  addPantry(state, 'egg', 3, 'шт', '2026-11-01', 90);
  addPantry(state, 'milk', 80, 'мл', '2026-11-01', 60);
  addPantry(state, 'tomato', 200, 'г', '2026-10-19', 140);
  addPantry(state, 'cheese', 40, 'г', '2026-11-01', 80);
  addPantry(state, 'oil', 10, 'мл', '2026-12-01', 20);
  addPantry(state, 'greens', 15, 'г', '2026-11-01', 30);
  addPantry(state, 'salt', 500, 'г', '2027-01-01', 10);
  const match = E.matchRecipe(recipe, state, TODAY);
  assert.equal(match.canCook, false);
  assert.ok(match.missingBlocking.some((item) => item.id === 'tomato'));
  assert.equal(match.rescue, 0);
  const report = E.planCooking(recipe, state, 2, TODAY);
  assert.equal(report.deductions.some((item) => item.name === 'помидоры'), false);
  assert.equal(report.shortages.some((item) => item.ingredientId === 'tomato'), true);
});

test('скоропортящийся продукт добавляет спасение и стоимость', () => {
  const state = freshState();
  addPantry(state, 'tomato', 200, 'г', TODAY, 100);
  addPantry(state, 'egg', 3, 'шт', '2026-11-01', 90);
  addPantry(state, 'milk', 100, 'мл', '2026-11-01', 60);
  addPantry(state, 'cheese', 50, 'г', '2026-11-01', 80);
  addPantry(state, 'oil', 50, 'мл', '2026-12-01', 20);
  const match = E.matchRecipe(E.recipeById('omelette-tomato'), state, TODAY);
  assert.equal(match.rescue, 1);
  assert.equal(match.urgentValue, 100);
  assert.equal(match.canCook, true);
});

test('rankRecipes фильтрует по тегу, времени и наличию', () => {
  const state = freshState();
  const ready = E.rankRecipes(state, { tag: 'ready' }, TODAY);
  assert.equal(ready.length, 0);
  const quick = E.rankRecipes(state, { tag: 'quick' }, TODAY);
  assert.ok(quick.length > 0);
  quick.forEach((item) => assert.equal(item.recipe.tags.includes('quick'), true));
  const vegan = E.rankRecipes(state, { tag: 'vegan' }, TODAY);
  vegan.forEach((item) => assert.equal(item.recipe.tags.includes('vegan'), true));
});

console.log('\nПлан недели');

test('generatePlan создаёт 7 дней по три приёма без повторов-крайностей', () => {
  const state = E.normalizeState(DATA.buildDemoState(TODAY), TODAY);
  const plan = E.generatePlan(state, { startDate: TODAY, seed: 19 }, TODAY);
  const dates = Object.keys(plan);
  assert.equal(dates.length, 7);
  const usage = {};
  dates.forEach((date) => {
    assert.deepEqual(Object.keys(plan[date]).sort(), ['breakfast', 'dinner', 'lunch']);
    Object.keys(plan[date]).forEach((meal) => {
      const recipe = E.recipeById(plan[date][meal]);
      assert.ok(recipe, 'рецепт существует');
      assert.ok(recipe.meal.includes(meal), recipe.id + ' подходит для ' + meal);
      usage[recipe.id] = (usage[recipe.id] || 0) + 1;
    });
  });
  const counts = Object.values(usage);
  assert.ok(counts.length >= 14, 'разнообразие: ' + counts.length + ' блюд');
  assert.ok(Math.max.apply(null, counts) <= 3, 'без блюда 4+ раза подряд: ' + Math.max.apply(null, counts));
});

test('generatePlan уважает диету и лимит времени', () => {
  const state = freshState();
  const plan = E.generatePlan(state, { startDate: TODAY, days: 3, diet: 'vegetarian', maxTime: 30, seed: 4 }, TODAY);
  assert.equal(Object.keys(plan).length, 3, 'план не пустой');
  let meals = 0;
  Object.values(plan).forEach((day) => {
    Object.values(day).forEach((recipeId) => {
      meals += 1;
      const recipe = E.recipeById(recipeId);
      assert.ok(recipe.tags.includes('vegetarian') || recipe.tags.includes('vegan'), recipe.title);
      assert.ok(recipe.time <= 30, recipe.title + ': ' + recipe.time);
    });
  });
  assert.ok(meals >= 6, 'в плане есть блюда: ' + meals);
});

test('generatePlan честно возвращает пустой план, если рецептов нет', () => {
  const state = freshState();
  const plan = E.generatePlan(state, { startDate: TODAY, days: 3, diet: 'vegan', maxTime: 1, seed: 4 }, TODAY);
  assert.deepEqual(plan, {});
});

test('generatePlan детерминирован для одного seed', () => {
  const state = freshState();
  const a = E.generatePlan(state, { startDate: TODAY, seed: 7 }, TODAY);
  const b = E.generatePlan(state, { startDate: TODAY, seed: 7 }, TODAY);
  assert.deepEqual(a, b);
});

test('collectPlanMissing объединяет одинаковые продукты', () => {
  const state = freshState();
  state.plan[TODAY] = { breakfast: 'omelette-tomato', lunch: 'omelette-tomato', dinner: 'omelette-tomato' };
  const missing = E.collectPlanMissing(state, TODAY, 1);
  const tomatoes = missing.filter((item) => item.ingredientId === 'tomato');
  assert.equal(tomatoes.length, 1);
  assert.equal(tomatoes[0].qty, 450);
  assert.equal(tomatoes[0].sources.length, 1);
});

test('collectPlanMissing вычитает полку один раз на весь план', () => {
  const state = freshState();
  addPantry(state, 'tomato', 100, 'г', '2026-11-01', 70);
  state.plan[TODAY] = { breakfast: 'omelette-tomato', lunch: 'omelette-tomato' };
  const missing = E.collectPlanMissing(state, TODAY, 1, TODAY);
  const tomatoes = missing.filter((item) => item.ingredientId === 'tomato');
  assert.equal(tomatoes.length, 1);
  assert.equal(tomatoes[0].qty, 200);
});

test('срок продукта проверяется на дату каждого дня плана', () => {
  const state = freshState();
  stockRecipe(state, 'omelette-tomato', ['tomato']);
  addPantry(state, 'tomato', 200, 'г', '2026-10-22', 140);
  const lateDay = E.addDays(TODAY, 4);
  state.plan[lateDay] = { breakfast: 'omelette-tomato' };
  const missing = E.collectPlanMissing(state, TODAY, 7, TODAY);
  const tomatoes = missing.filter((item) => item.ingredientId === 'tomato');
  assert.equal(tomatoes.length, 1);
  assert.equal(tomatoes[0].qty, 150, 'помидор к позднему дню уже просрочен');

  const overview = E.planOverview(state, TODAY);
  const slot = overview.days[4].slots.breakfast;
  assert.equal(slot.match.canCook, false);
  assert.ok(slot.match.missingBlocking.some((item) => item.id === 'tomato'));
});

test('припасы распределяются по дням: ранний обед не оставляет поздний без продукта', () => {
  const state = freshState();
  stockRecipe(state, 'omelette-tomato', ['tomato']);
  addPantry(state, 'tomato', 200, 'г', '2026-11-01', 140);
  state.plan[TODAY] = { breakfast: 'omelette-tomato' };
  state.plan[E.addDays(TODAY, 1)] = { breakfast: 'omelette-tomato' };
  const overview = E.planOverview(state, TODAY);
  assert.equal(overview.days[0].slots.breakfast.match.canCook, true);
  assert.equal(overview.days[1].slots.breakfast.match.canCook, false);
  assert.ok(overview.days[1].slots.breakfast.match.missingBlocking.some((item) => item.id === 'tomato'));
});

console.log('\nПокупки и списание');

test('mergeShopping в режиме sync не дублирует и убирает лишнее из плана', () => {
  const list = [
    { id: 'm1', ingredientId: 'olives', name: 'оливки', qty: 100, unit: 'г', checked: false, source: 'manual', price: 90 },
    { id: 'p1', ingredientId: 'tomato', name: 'помидоры', qty: 200, unit: 'г', checked: false, source: 'plan', price: 56 }
  ];
  const additions = [
    { ingredientId: 'tomato', name: 'помидоры', qty: 300, unit: 'г', price: 84, source: 'plan' },
    { ingredientId: 'cheese', name: 'сыр', qty: 100, unit: 'г', price: 90, source: 'plan' }
  ];
  const first = E.mergeShopping(list, additions, 'sync', TODAY);
  assert.equal(first.list.length, 3);
  assert.equal(first.added, 1);
  assert.equal(first.removed, 0);
  assert.equal(first.list.find((item) => item.ingredientId === 'tomato').qty, 300);
  assert.equal(first.list.find((item) => item.ingredientId === 'tomato').price, 84);
  assert.equal(first.updated, 1);
  assert.equal(first.list.find((item) => item.ingredientId === 'olives').qty, 100);

  const second = E.mergeShopping(first.list, additions, 'sync', TODAY);
  assert.equal(second.list.length, 3);
  assert.equal(second.added, 0);
  assert.equal(second.removed, 0);

  const third = E.mergeShopping(second.list, additions.slice(0, 1), 'sync', TODAY);
  assert.equal(third.list.length, 2);
  assert.equal(third.list.some((item) => item.ingredientId === 'cheese'), false, 'позиция плана удалена');
  assert.equal(third.list.some((item) => item.ingredientId === 'olives'), true, 'ручная позиция осталась');
});

test('mergeShopping в режиме add суммирует количество и цену', () => {
  const list = [{ id: 'p1', ingredientId: 'tomato', name: 'помидоры', qty: 200, unit: 'г', checked: false, source: 'plan', price: 56 }];
  const result = E.mergeShopping(list, [{ ingredientId: 'tomato', name: 'помидоры', qty: 100, unit: 'г', price: 28 }], 'add', TODAY);
  assert.equal(result.list[0].qty, 300);
  assert.equal(result.list[0].price, 84);
  assert.equal(result.updated, 1);
});

test('mergeShopping в режиме sync пересчитывает цену и количество вниз', () => {
  const list = [{ id: 'p1', ingredientId: 'tomato', name: 'помидоры', qty: 300, unit: 'г', checked: false, source: 'plan', price: 84 }];
  const result = E.mergeShopping(list, [{ ingredientId: 'tomato', name: 'помидоры', qty: 150, unit: 'г', price: 42 }], 'sync', TODAY);
  assert.equal(result.list[0].qty, 150);
  assert.equal(result.list[0].price, 42);
  assert.equal(result.updated, 1);
});

test('sync не удаляет добавленное из рецепта', () => {
  const state = freshState();
  const recipe = E.recipeById('omelette-tomato');
  const additions = E.collectRecipeMissing(recipe, state, 2, TODAY);
  assert.ok(additions.length > 0);
  assert.ok(additions.every((item) => item.source === 'recipe'));

  const added = E.mergeShopping(state.shopping, additions, 'add', TODAY);
  const synced = E.mergeShopping(added.list, [], 'sync', TODAY);
  assert.equal(synced.removed, 0);
  assert.equal(synced.list.length, additions.length);
  assert.ok(synced.list.every((item) => item.source === 'recipe'));
});

test('рецепт поверх плана сохраняет количество после sync', () => {
  const list = [{ id: 'p1', ingredientId: 'tomato', name: 'помидоры', qty: 100, unit: 'г', checked: false, source: 'plan', price: 28 }];
  const added = E.mergeShopping(list, [{ ingredientId: 'tomato', name: 'помидоры', qty: 50, unit: 'г', price: 14, source: 'recipe' }], 'add', TODAY);
  assert.equal(added.list[0].qty, 150);
  assert.equal(added.list[0].source, 'recipe');
  const synced = E.mergeShopping(added.list, [{ ingredientId: 'tomato', name: 'помидоры', qty: 100, unit: 'г', price: 28, source: 'plan' }], 'sync', TODAY);
  assert.equal(synced.list[0].qty, 150, 'ручное дополнение из рецепта не обрезано планом');
  assert.equal(synced.removed, 0);
});

test('sync поднимает ручную позицию до дефицита плана, но не понижает её', () => {
  const low = E.mergeShopping(
    [{ id: 'm1', ingredientId: 'tomato', name: 'помидоры', qty: 50, unit: 'г', checked: false, source: 'manual', price: 25 }],
    [{ ingredientId: 'tomato', name: 'помидоры', qty: 100, unit: 'г', price: 56, source: 'plan' }],
    'sync',
    TODAY
  );
  assert.equal(low.list[0].qty, 100);
  assert.equal(low.list[0].price, 50);
  assert.equal(low.updated, 1);

  const high = E.mergeShopping(
    [{ id: 'm2', ingredientId: 'tomato', name: 'помидоры', qty: 150, unit: 'г', checked: false, source: 'manual', price: 84 }],
    [{ ingredientId: 'tomato', name: 'помидоры', qty: 100, unit: 'г', price: 56, source: 'plan' }],
    'sync',
    TODAY
  );
  assert.equal(high.list[0].qty, 150);
  assert.equal(high.updated, 0);
});

test('sync снимает отметку «куплено», если плану нужно больше', () => {
  const result = E.mergeShopping(
    [{ id: 'c1', ingredientId: 'tomato', name: 'помидоры', qty: 50, unit: 'г', checked: true, source: 'manual', price: 25 }],
    [{ ingredientId: 'tomato', name: 'помидоры', qty: 100, unit: 'г', price: 56, source: 'plan' }],
    'sync',
    TODAY
  );
  assert.equal(result.list[0].qty, 100);
  assert.equal(result.list[0].checked, false);
  assert.equal(result.unchecked, 1);
  assert.equal(result.updated, 1);

  const enough = E.mergeShopping(
    [{ id: 'c2', ingredientId: 'tomato', name: 'помидоры', qty: 150, unit: 'г', checked: true, source: 'manual', price: 84 }],
    [{ ingredientId: 'tomato', name: 'помидоры', qty: 100, unit: 'г', price: 56, source: 'plan' }],
    'sync',
    TODAY
  );
  assert.equal(enough.list[0].checked, true);
  assert.equal(enough.unchecked, 0);
  assert.equal(enough.updated, 0);
});

test('shoppingSummary считает отмеченное и неизвестные цены', () => {
  const summary = E.shoppingSummary([
    { price: 100, checked: true },
    { price: 250, checked: false },
    { price: 0, checked: false }
  ]);
  assert.deepEqual(summary, {
    total: 350, checkedTotal: 100, uncheckedTotal: 250,
    count: 3, checked: 1, unchecked: 2, unknown: 1
  });
});

test('applyCheckedToPantry переносит только отмеченное', () => {
  const state = freshState();
  state.shopping = [
    { id: 's1', ingredientId: 'cheese', name: 'сыр', qty: 200, unit: 'г', checked: true, source: 'manual', price: 180 },
    { id: 's2', ingredientId: 'bread', name: 'хлеб', qty: 1, unit: 'шт', checked: false, source: 'manual', price: 50 }
  ];
  const result = E.applyCheckedToPantry(state, TODAY);
  assert.equal(result.moved.length, 1);
  assert.equal(result.shopping.length, 1);
  assert.equal(result.shopping[0].ingredientId, 'bread');
  assert.equal(result.pantry.length, 1);
  assert.equal(result.pantry[0].ingredientId, 'cheese');
  assert.equal(result.pantry[0].expires, E.addDays(TODAY, E.ingredientById('cheese').shelfLife));
});

test('planCooking списывает продукты, конвертирует единицы и считает спасённое', () => {
  const state = freshState();
  const recipe = E.recipeById('omelette-tomato');
  addPantry(state, 'egg', 2, 'шт', '2026-11-01', 30);
  addPantry(state, 'milk', 1, 'л', '2026-11-01', 80);
  addPantry(state, 'tomato', 100, 'г', TODAY, 100);
  addPantry(state, 'cheese', 100, 'г', '2026-11-01', 90);
  const report = E.planCooking(recipe, state, 2, TODAY);
  assert.ok(report.deductions.length >= 4);
  const eggs = report.deductions.find((item) => item.name === 'яйца');
  assert.equal(eggs.take, 2);
  assert.equal(eggs.remove, true);
  const milk = report.deductions.find((item) => item.name === 'молоко');
  assert.equal(milk.take, 0.08);
  assert.equal(milk.unit, 'л');
  assert.equal(milk.remove, false);
  const tomato = report.deductions.find((item) => item.name === 'помидоры');
  assert.equal(tomato.urgent, true);
  assert.equal(tomato.value, 100);
  assert.equal(report.urgentCount, 1);
  assert.equal(report.savedValue, 100);

  E.addCookedStats(state, report, TODAY);
  assert.equal(state.stats.cooked, 1);
  assert.equal(state.stats.history[TODAY].count, 1);
  assert.equal(state.stats.history[TODAY].value, 100);
});

test('estimateCost переводит граммы, литры и штуки', () => {
  assert.equal(E.estimateCost('tomato', 500, 'г'), 140);
  assert.equal(E.estimateCost('tomato', 0.5, 'кг'), 140);
  assert.equal(E.estimateCost('milk', 500, 'мл'), 47.5);
  assert.equal(E.estimateCost('lemon', 2, 'шт'), 90);
  assert.equal(E.estimateCost('unknown', 2, 'шт'), 0);
});

console.log('\nСтатистика и полка');

test('statsSummary считает стоимость и риск', () => {
  const state = freshState();
  addPantry(state, 'tomato', 100, 'г', TODAY, 50);
  addPantry(state, 'cheese', 100, 'г', '2026-11-01', 100);
  addPantry(state, 'bread', 100, 'г', '2026-10-18', 30);
  const stats = E.statsSummary(state, TODAY);
  assert.equal(stats.pantryCount, 3);
  assert.equal(stats.totalValue, 180);
  assert.equal(stats.riskValue, 80);
  assert.equal(stats.expiring, 1);
  assert.equal(stats.expired, 1);
});

test('pantryGroups фильтрует и сортирует по сроку', () => {
  const state = freshState();
  addPantry(state, 'cheese', 100, 'г', '2026-11-01', 100);
  addPantry(state, 'tomato', 100, 'г', TODAY, 50);
  const groups = E.pantryGroups(state, { storage: 'fridge' }, TODAY);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'fridge');
  assert.equal(groups[0].items[0].ingredientId, 'tomato');
  assert.equal(groups[0].value, 150);
  const query = E.pantryGroups(state, { query: 'сыр' }, TODAY);
  assert.equal(query[0].items.length, 1);
});

test('getHero берёт запланированный ужин и не смешивает просрочку со срочным', () => {
  const state = freshState();
  addPantry(state, 'tomato', 100, 'г', TODAY, 50);
  addPantry(state, 'bread', 100, 'г', '2026-10-18', 30);
  state.plan[TODAY] = { dinner: 'pan-pizza' };
  const hero = E.getHero(state, TODAY);
  assert.equal(hero.dinner.id, 'pan-pizza');
  assert.equal(hero.dinnerSource, 'plan');
  assert.equal(hero.expiringCount, 1);
  assert.equal(hero.stats.expired, 1);
});

console.log('\nИсточники рецептов');

test('рецепты из ЩИ содержат точные ссылки источника и видео', () => {
  const expected = {
    'chickpea-curry': {
      source: 'https://vkusvill.ru/media/recipes/karri-s-nutom.html',
      video: 'https://www.youtube.com/watch?v=67CGZuxJLdI'
    },
    hummus: {
      source: 'https://vkusvill.ru/media/recipes/khumus-klassicheskiy.html',
      video: 'https://www.youtube.com/watch?v=s_7I7BgStPU'
    },
    'quinoa-avocado-salad': {
      source: 'https://vkusvill.ru/media/recipes/salat-s-kinoa-avokado-i-apelsinami.html',
      video: 'https://www.youtube.com/watch?v=wFRcUalZ4uw'
    }
  };
  Object.keys(expected).forEach((id) => {
    const recipe = E.recipeById(id);
    assert.ok(recipe, 'рецепт ' + id);
    assert.equal(recipe.source.name, 'ЩИ · ВкусВилл', 'источник ' + id);
    assert.equal(recipe.source.url, expected[id].source, 'ссылка источника ' + id);
    assert.ok(recipe.video.title && recipe.video.channel, 'видео ' + id);
    assert.equal(recipe.video.url, expected[id].video, 'ссылка видео ' + id);
  });
});

console.log('\n' + passed + ' тестов прошли.\n');
