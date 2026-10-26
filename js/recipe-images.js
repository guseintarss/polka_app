/*
 * ПОЛКА · иллюстрации блюд.
 * Локальные SVG в assets/dishes: рисуются в палитре приложения, работают
 * офлайн и не требуют лицензий на фотографии. Ядро о картинках не знает —
 * соответствие «рецепт → файл» живёт только на уровне приложения.
 */

const DISHES = [
  'avocado-toast',
  'buckwheat-egg',
  'bulgur-chicken',
  'chicken-noodle-soup',
  'chicken-pilaf',
  'chicken-tacos',
  'chickpea-curry',
  'cottage-toast',
  'fish-broccoli',
  'greek-salad',
  'hummus',
  'lentil-soup',
  'meatballs-mash',
  'mushroom-risotto',
  'oatmeal-apple',
  'omelette-tomato',
  'oven-chicken',
  'pan-pizza',
  'potato-casserole',
  'pumpkin-quinoa',
  'quinoa-avocado-salad',
  'shakshuka',
  'syrniki',
  'tomato-pasta',
  'tuna-sandwich',
  'vegetable-stew',
  'yogurt-banana'
];

export function recipeImage(id, title) {
  if (DISHES.indexOf(id) === -1) return null;
  return {
    src: 'assets/dishes/' + id + '.svg',
    alt: 'Иллюстрация блюда «' + String(title || '') + '»'
  };
}
