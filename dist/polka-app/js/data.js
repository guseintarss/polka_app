/*
 * ПОЛКА — данные демо-кухни.
 * Каталог продуктов и 27 рецептов. Цены примерные, для расчёта сметы.
 * Файл подключается как обычный скрипт и отдаёт всё через window.POLKA_DATA.
 */
(function (global) {
  'use strict';

  const INGREDIENTS = [
    // Овощи и зелень
    { id: 'tomato', name: 'помидоры', unit: 'г', base: 'kg', price: 280, category: 'Овощи', shelfLife: 7, storage: 'fridge', aliases: ['помидор', 'томат', 'томаты'] },
    { id: 'cucumber', name: 'огурцы', unit: 'г', base: 'kg', price: 220, category: 'Овощи', shelfLife: 7, storage: 'fridge', aliases: ['огурец'] },
    { id: 'onion', name: 'лук', unit: 'г', base: 'kg', price: 80, category: 'Овощи', shelfLife: 30, storage: 'pantry', aliases: ['луковица', 'лук репчатый'] },
    { id: 'garlic', name: 'чеснок', unit: 'зубчик', base: 'pcs', price: 8, category: 'Овощи', shelfLife: 60, storage: 'pantry', aliases: ['зубчик чеснока'] },
    { id: 'ginger', name: 'имбирь', unit: 'г', base: 'kg', price: 450, category: 'Овощи', shelfLife: 20, storage: 'fridge', aliases: ['корень имбиря', 'имбирь свежий'] },
    { id: 'carrot', name: 'морковь', unit: 'г', base: 'kg', price: 70, category: 'Овощи', shelfLife: 30, storage: 'pantry', aliases: ['морковка'] },
    { id: 'potato', name: 'картофель', unit: 'г', base: 'kg', price: 60, category: 'Овощи', shelfLife: 30, storage: 'pantry', aliases: ['картошка', 'картофелина'] },
    { id: 'cabbage', name: 'капуста', unit: 'г', base: 'kg', price: 55, category: 'Овощи', shelfLife: 30, storage: 'fridge', aliases: [] },
    { id: 'bellPepper', name: 'болгарский перец', unit: 'г', base: 'kg', price: 320, category: 'Овощи', shelfLife: 10, storage: 'fridge', aliases: ['перец сладкий', 'перец болгарский'] },
    { id: 'zucchini', name: 'кабачки', unit: 'г', base: 'kg', price: 180, category: 'Овощи', shelfLife: 10, storage: 'fridge', aliases: ['кабачок', 'цукини'] },
    { id: 'broccoli', name: 'брокколи', unit: 'г', base: 'kg', price: 380, category: 'Овощи', shelfLife: 7, storage: 'fridge', aliases: [] },
    { id: 'spinach', name: 'шпинат', unit: 'г', base: 'kg', price: 600, category: 'Зелень', shelfLife: 4, storage: 'fridge', aliases: [] },
    { id: 'greens', name: 'зелень', unit: 'г', base: 'kg', price: 900, category: 'Зелень', shelfLife: 3, storage: 'fridge', aliases: ['петрушка', 'укроп', 'кинза', 'зелёный лук'] },
    { id: 'lettuce', name: 'салат', unit: 'г', base: 'kg', price: 550, category: 'Зелень', shelfLife: 4, storage: 'fridge', aliases: ['листья салата'] },
    { id: 'beet', name: 'свёкла', unit: 'г', base: 'kg', price: 70, category: 'Овощи', shelfLife: 30, storage: 'pantry', aliases: ['свекла'] },
    { id: 'pumpkin', name: 'тыква', unit: 'г', base: 'kg', price: 120, category: 'Овощи', shelfLife: 60, storage: 'pantry', aliases: [] },
    { id: 'mushrooms', name: 'шампиньоны', unit: 'г', base: 'kg', price: 380, category: 'Овощи', shelfLife: 5, storage: 'fridge', aliases: ['грибы', 'шампиньон'] },
    { id: 'corn', name: 'кукуруза', unit: 'г', base: 'kg', price: 240, category: 'Овощи', shelfLife: 365, storage: 'pantry', aliases: ['кукуруза консервированная'] },
    { id: 'peas', name: 'зелёный горошек', unit: 'г', base: 'kg', price: 300, category: 'Заморозка', shelfLife: 180, storage: 'freezer', aliases: ['горошек', 'горох зелёный'] },
    { id: 'avocado', name: 'авокадо', unit: 'шт', base: 'pcs', price: 120, category: 'Овощи', shelfLife: 5, storage: 'fridge', aliases: [] },
    { id: 'olives', name: 'оливки', unit: 'г', base: 'kg', price: 900, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: ['маслины'] },

    // Фрукты и ягоды
    { id: 'apple', name: 'яблоки', unit: 'г', base: 'kg', price: 140, category: 'Фрукты', shelfLife: 20, storage: 'fridge', aliases: ['яблоко'] },
    { id: 'banana', name: 'бананы', unit: 'г', base: 'kg', price: 110, category: 'Фрукты', shelfLife: 5, storage: 'pantry', aliases: ['банан'] },
    { id: 'lemon', name: 'лимон', unit: 'шт', base: 'pcs', price: 45, category: 'Фрукты', shelfLife: 20, storage: 'fridge', aliases: ['лимоны'] },
    { id: 'orange', name: 'апельсины', unit: 'г', base: 'kg', price: 190, category: 'Фрукты', shelfLife: 20, storage: 'fridge', aliases: ['апельсин'] },
    { id: 'grapefruit', name: 'грейпфруты', unit: 'г', base: 'kg', price: 170, category: 'Фрукты', shelfLife: 14, storage: 'fridge', aliases: ['грейпфрут'] },
    { id: 'berries', name: 'ягоды', unit: 'г', base: 'kg', price: 450, category: 'Заморозка', shelfLife: 180, storage: 'freezer', aliases: ['вишня', 'смородина', 'смесь ягод'] },
    { id: 'pear', name: 'груши', unit: 'г', base: 'kg', price: 180, category: 'Фрукты', shelfLife: 20, storage: 'fridge', aliases: ['груша'] },

    // Белок
    { id: 'egg', name: 'яйца', unit: 'шт', base: 'pcs', price: 14, category: 'Белок', shelfLife: 25, storage: 'fridge', aliases: ['яйцо', 'яиц'] },
    { id: 'chickenBreast', name: 'куриное филе', unit: 'г', base: 'kg', price: 480, category: 'Белок', shelfLife: 3, storage: 'fridge', aliases: ['курица', 'куриная грудка', 'филе курицы'] },
    { id: 'chickenThigh', name: 'куриные бёдра', unit: 'г', base: 'kg', price: 380, category: 'Белок', shelfLife: 3, storage: 'fridge', aliases: ['куриное бедро', 'бедро курицы'] },
    { id: 'beef', name: 'говядина', unit: 'г', base: 'kg', price: 750, category: 'Белок', shelfLife: 3, storage: 'fridge', aliases: ['фарш говяжий', 'говяжий фарш', 'мясо'] },
    { id: 'pork', name: 'свинина', unit: 'г', base: 'kg', price: 520, category: 'Белок', shelfLife: 3, storage: 'fridge', aliases: ['свиной фарш'] },
    { id: 'fish', name: 'белая рыба', unit: 'г', base: 'kg', price: 420, category: 'Белок', shelfLife: 2, storage: 'fridge', aliases: ['рыба', 'треска', 'минтай', 'судак'] },
    { id: 'salmon', name: 'лосось', unit: 'г', base: 'kg', price: 1200, category: 'Белок', shelfLife: 2, storage: 'fridge', aliases: ['семга', 'сёмга', 'красная рыба'] },
    { id: 'shrimp', name: 'креветки', unit: 'г', base: 'kg', price: 900, category: 'Заморозка', shelfLife: 180, storage: 'freezer', aliases: ['креветка'] },
    { id: 'tofu', name: 'тофу', unit: 'г', base: 'kg', price: 450, category: 'Белок', shelfLife: 10, storage: 'fridge', aliases: [] },
    { id: 'beans', name: 'фасоль', unit: 'г', base: 'kg', price: 260, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: ['фасоль консервированная', 'красная фасоль'] },
    { id: 'chickpeas', name: 'нут', unit: 'г', base: 'kg', price: 300, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: ['турецкий горох'] },
    { id: 'lentils', name: 'чечевица', unit: 'г', base: 'kg', price: 140, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: ['красная чечевица'] },
    { id: 'tuna', name: 'тунец', unit: 'г', base: 'kg', price: 950, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: ['тунец консервированный'] },

    // Молочное
    { id: 'milk', name: 'молоко', unit: 'мл', base: 'l', price: 95, category: 'Молочное', shelfLife: 7, storage: 'fridge', aliases: [] },
    { id: 'kefir', name: 'кефир', unit: 'мл', base: 'l', price: 90, category: 'Молочное', shelfLife: 7, storage: 'fridge', aliases: [] },
    { id: 'yogurt', name: 'йогурт', unit: 'г', base: 'kg', price: 250, category: 'Молочное', shelfLife: 10, storage: 'fridge', aliases: ['греческий йогурт', 'натуральный йогурт'] },
    { id: 'sourCream', name: 'сметана', unit: 'г', base: 'kg', price: 260, category: 'Молочное', shelfLife: 10, storage: 'fridge', aliases: [] },
    { id: 'butter', name: 'сливочное масло', unit: 'г', base: 'kg', price: 900, category: 'Молочное', shelfLife: 30, storage: 'fridge', aliases: ['масло сливочное'] },
    { id: 'cheese', name: 'сыр', unit: 'г', base: 'kg', price: 900, category: 'Молочное', shelfLife: 14, storage: 'fridge', aliases: ['твёрдый сыр', 'сыр твёрдый', 'пармезан'] },
    { id: 'feta', name: 'фета', unit: 'г', base: 'kg', price: 1300, category: 'Молочное', shelfLife: 14, storage: 'fridge', aliases: ['брынза'] },
    { id: 'cottageCheese', name: 'творог', unit: 'г', base: 'kg', price: 420, category: 'Молочное', shelfLife: 7, storage: 'fridge', aliases: [] },

    // Крупы, хлеб, макароны
    { id: 'rice', name: 'рис', unit: 'г', base: 'kg', price: 160, category: 'Крупы', shelfLife: 365, storage: 'pantry', aliases: ['рис круглый', 'рис длиннозёрный'] },
    { id: 'buckwheat', name: 'гречка', unit: 'г', base: 'kg', price: 140, category: 'Крупы', shelfLife: 365, storage: 'pantry', aliases: ['гречневая крупа'] },
    { id: 'pasta', name: 'паста', unit: 'г', base: 'kg', price: 220, category: 'Крупы', shelfLife: 365, storage: 'pantry', aliases: ['макароны', 'спагетти', 'лапша'] },
    { id: 'flour', name: 'мука', unit: 'г', base: 'kg', price: 90, category: 'Крупы', shelfLife: 365, storage: 'pantry', aliases: ['пшеничная мука'] },
    { id: 'oats', name: 'овсяные хлопья', unit: 'г', base: 'kg', price: 130, category: 'Крупы', shelfLife: 365, storage: 'pantry', aliases: ['овсянка', 'геркулес'] },
    { id: 'bread', name: 'хлеб', unit: 'г', base: 'kg', price: 140, category: 'Хлеб', shelfLife: 3, storage: 'pantry', aliases: ['батон', 'буханка'] },
    { id: 'tortilla', name: 'тортильи', unit: 'шт', base: 'pcs', price: 30, category: 'Хлеб', shelfLife: 10, storage: 'pantry', aliases: ['лепёшки', 'лаваш'] },
    { id: 'bulgur', name: 'булгур', unit: 'г', base: 'kg', price: 180, category: 'Крупы', shelfLife: 365, storage: 'pantry', aliases: [] },
    { id: 'quinoa', name: 'киноа', unit: 'г', base: 'kg', price: 420, category: 'Крупы', shelfLife: 365, storage: 'pantry', aliases: [] },
    { id: 'couscous', name: 'кускус', unit: 'г', base: 'kg', price: 200, category: 'Крупы', shelfLife: 365, storage: 'pantry', aliases: [] },

    // Бакалея
    { id: 'oil', name: 'растительное масло', unit: 'мл', base: 'l', price: 180, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: ['подсолнечное масло', 'масло растительное'] },
    { id: 'oliveOil', name: 'оливковое масло', unit: 'мл', base: 'l', price: 890, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: [] },
    { id: 'salt', name: 'соль', unit: 'г', base: 'kg', price: 60, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: [], staple: true },
    { id: 'pepper', name: 'чёрный перец', unit: 'г', base: 'kg', price: 2400, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: ['перец чёрный', 'перец молотый'], staple: true },
    { id: 'sugar', name: 'сахар', unit: 'г', base: 'kg', price: 90, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: [], staple: true },
    { id: 'honey', name: 'мёд', unit: 'г', base: 'kg', price: 700, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: ['мед'] },
    { id: 'soySauce', name: 'соевый соус', unit: 'мл', base: 'l', price: 350, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: [] },
    { id: 'tomatoPaste', name: 'томатная паста', unit: 'г', base: 'kg', price: 280, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: ['паста томатная'] },
    { id: 'mustard', name: 'горчица', unit: 'г', base: 'kg', price: 250, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: [] },
    { id: 'mayo', name: 'майонез', unit: 'г', base: 'kg', price: 420, category: 'Бакалея', shelfLife: 30, storage: 'fridge', aliases: [] },
    { id: 'vinegar', name: 'уксус', unit: 'мл', base: 'l', price: 120, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: [] },
    { id: 'bakingPowder', name: 'разрыхлитель', unit: 'г', base: 'kg', price: 800, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: ['сода', 'разрыхлитель теста'] },
    { id: 'cinnamon', name: 'корица', unit: 'г', base: 'kg', price: 6000, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: [] },
    { id: 'paprika', name: 'паприка', unit: 'г', base: 'kg', price: 8000, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: ['перец паприка'] },
    { id: 'curry', name: 'карри', unit: 'г', base: 'kg', price: 3000, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: ['приправа карри', 'порошок карри'] },
    { id: 'cumin', name: 'зира', unit: 'г', base: 'kg', price: 4000, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: ['кумин', 'зира молотая'] },
    { id: 'tahini', name: 'паста тахини', unit: 'г', base: 'kg', price: 1300, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: ['тахини', 'кунжутная паста', 'паста из кунжута'] },
    { id: 'spices', name: 'специи', unit: 'г', base: 'kg', price: 6000, category: 'Бакалея', shelfLife: 730, storage: 'pantry', aliases: ['приправа', 'смесь специй'], staple: true },
    { id: 'nuts', name: 'орехи', unit: 'г', base: 'kg', price: 900, category: 'Бакалея', shelfLife: 180, storage: 'pantry', aliases: ['грецкие орехи', 'миндаль'] },
    { id: 'coconutMilk', name: 'кокосовое молоко', unit: 'мл', base: 'l', price: 190, category: 'Бакалея', shelfLife: 365, storage: 'pantry', aliases: [] }
  ];

  const CATEGORY_ORDER = ['Овощи', 'Фрукты', 'Зелень', 'Белок', 'Молочное', 'Крупы', 'Хлеб', 'Бакалея', 'Заморозка', 'Другое'];

  const STORAGES = {
    fridge: { id: 'fridge', label: 'Холодильник', short: 'холод', icon: 'snow' },
    freezer: { id: 'freezer', label: 'Морозилка', short: 'мороз', icon: 'flake' },
    pantry: { id: 'pantry', label: 'Шкаф', short: 'шкаф', icon: 'shelf' }
  };

  const MEALS = {
    breakfast: { id: 'breakfast', label: 'Завтрак', short: 'завтрак' },
    lunch: { id: 'lunch', label: 'Обед', short: 'обед' },
    dinner: { id: 'dinner', label: 'Ужин', short: 'ужин' }
  };

  const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'];

  const TAGS = {
    quick: { id: 'quick', label: 'Быстро', short: 'до 20 минут' },
    vegetarian: { id: 'vegetarian', label: 'Вегетарианское', short: 'без мяса и рыбы' },
    vegan: { id: 'vegan', label: 'Веганское', short: 'без продуктов животных' },
    glutenFree: { id: 'glutenFree', label: 'Без глютена', short: 'без пшеницы и злаков с глютеном' },
    highProtein: { id: 'highProtein', label: 'Много белка', short: 'сытное, белковое' },
    budget: { id: 'budget', label: 'Бюджетно', short: 'из простых продуктов' }
  };

  const UNITS = ['г', 'кг', 'мл', 'л', 'шт', 'зубчик', 'пучок', 'уп'];

  const RECIPES = [
    {
      id: 'oatmeal-apple',
      title: 'Овсянка с яблоком и корицей',
      description: 'Тёплая, нежная каша. Яблоко даёт сладость, корица — ощущение, что это не просто овсянка.',
      meal: ['breakfast'],
      tags: ['vegetarian', 'quick', 'budget'],
      time: 12,
      servings: 2,
      ingredients: [
        { id: 'oats', qty: 70 }, { id: 'milk', qty: 250 }, { id: 'apple', qty: 150 },
        { id: 'cinnamon', qty: 1 }, { id: 'honey', qty: 15 }, { id: 'salt', qty: 1 }
      ],
      steps: [
        'Поставьте молоко на огонь, добавьте щепотку соли.',
        'Всыпьте хлопья и варите 5–7 минут, помешивая.',
        'Яблоко нарежьте кубиками и добавьте за минуту до готовности.',
        'Снимите с огня, положите мёд и корицу. Дайте постоять под крышкой минуту.'
      ],
      tip: 'Если молока мало — разбавьте водой, каша не заметит.'
    },
    {
      id: 'syrniki',
      title: 'Сырники из творога',
      description: 'Плотные снаружи, нежные внутри. Хороши и в завтрак, и вместо десерта.',
      meal: ['breakfast'],
      tags: ['vegetarian', 'highProtein'],
      time: 25,
      servings: 2,
      ingredients: [
        { id: 'cottageCheese', qty: 400 }, { id: 'egg', qty: 1 }, { id: 'flour', qty: 40 },
        { id: 'sugar', qty: 20 }, { id: 'oil', qty: 20 }, { id: 'sourCream', qty: 60 }
      ],
      steps: [
        'Смешайте творог, яйцо, сахар и муку до однородности.',
        'Сформируйте небольшие шайбы мокрыми руками.',
        'Обжарьте на разогретом масле по 2–3 минуты с каждой стороны.',
        'Подавайте со сметаной. Если творог влажный — добавьте ещё ложку муки.'
      ],
      tip: 'Творог берите сухой: с влажным сырники расползутся.'
    },
    {
      id: 'omelette-tomato',
      title: 'Омлет с помидорами',
      description: 'Быстрый способ использовать помидоры, которые уже просят внимания.',
      meal: ['breakfast'],
      tags: ['vegetarian', 'quick', 'highProtein', 'glutenFree'],
      time: 15,
      servings: 2,
      ingredients: [
        { id: 'egg', qty: 3 }, { id: 'milk', qty: 80 }, { id: 'tomato', qty: 150 },
        { id: 'cheese', qty: 40 }, { id: 'oil', qty: 10 }, { id: 'greens', qty: 15, optional: true }, { id: 'salt', qty: 1 }
      ],
      steps: [
        'Взбейте яйца с молоком и солью.',
        'Помидоры нарежьте кружками и быстро обжарьте на масле.',
        'Залейте яйцами, накройте крышкой и готовьте 4–5 минут на маленьком огне.',
        'Посыпьте сыром и зеленью, дайте сыру расплавиться.'
      ],
      tip: 'Помидоры можно не обжаривать, а положить прямо в яйца — будет нежнее.'
    },
    {
      id: 'buckwheat-egg',
      title: 'Гречка с яйцом и луком',
      description: 'Простой завтрак из того, что обычно уже стоит в шкафу.',
      meal: ['breakfast'],
      tags: ['vegetarian', 'budget', 'glutenFree'],
      time: 25,
      servings: 2,
      ingredients: [
        { id: 'buckwheat', qty: 150 }, { id: 'egg', qty: 2 }, { id: 'onion', qty: 80 },
        { id: 'butter', qty: 15 }, { id: 'salt', qty: 2 }
      ],
      steps: [
        'Промойте гречку, залейте водой в пропорции 1:2 и посолите.',
        'Варите под крышкой 15–17 минут, пока вода не впитается.',
        'Лук нарежьте и обжарьте на масле до мягкости.',
        'Сварите яйца, смешайте гречку с луком. Подавайте с половинками яиц.'
      ],
      tip: 'Гречку можно сварить с вечера — утром останется только разогреть.'
    },
    {
      id: 'avocado-toast',
      title: 'Тост с авокадо и яйцом',
      description: 'Минута на сборку, ноль поводов для паники. Хороший завтрак, когда спешите.',
      meal: ['breakfast'],
      tags: ['vegetarian', 'quick', 'highProtein'],
      time: 12,
      servings: 2,
      ingredients: [
        { id: 'bread', qty: 120 }, { id: 'avocado', qty: 1 }, { id: 'egg', qty: 2 },
        { id: 'lemon', qty: 1 }, { id: 'greens', qty: 10, optional: true }, { id: 'salt', qty: 1 }
      ],
      steps: [
        'Подсушите хлеб на сухой сковороде или в тостере.',
        'Авокадо разомните вилкой с соком лимона и солью.',
        'Сварите яйца всмятку — 6 минут после закипания.',
        'Намажьте авокадо на хлеб, сверху положите очищенное яйцо и зелень.'
      ],
      tip: 'Если авокадо твёрдое, положите его рядом с бананом на пару часов.'
    },
    {
      id: 'yogurt-banana',
      title: 'Йогурт с бананом и орехами',
      description: 'Пять минут, миска и ложка. Завтрак для тех, кто ещё не проснулся.',
      meal: ['breakfast'],
      tags: ['vegetarian', 'quick', 'glutenFree', 'highProtein'],
      time: 5,
      servings: 2,
      ingredients: [
        { id: 'yogurt', qty: 300 }, { id: 'banana', qty: 150 }, { id: 'nuts', qty: 30 },
        { id: 'honey', qty: 15 }
      ],
      steps: [
        'Разложите йогурт по мискам.',
        'Бананы нарежьте кружками, орехи крупно порубите.',
        'Добавьте банан и орехи к йогурту, полейте мёдом.'
      ],
      tip: 'Вместо банана подойдут любые ягоды из морозилки.'
    },
    {
      id: 'cottage-toast',
      title: 'Бутерброд с творогом и огурцом',
      description: 'Свежий, хрустящий и без готовки. Собирается быстрее, чем закипает чайник.',
      meal: ['breakfast'],
      tags: ['vegetarian', 'quick', 'highProtein'],
      time: 8,
      servings: 2,
      ingredients: [
        { id: 'bread', qty: 100 }, { id: 'cottageCheese', qty: 150 }, { id: 'cucumber', qty: 100 },
        { id: 'greens', qty: 10 }, { id: 'salt', qty: 1 }
      ],
      steps: [
        'Подсушите хлеб.',
        'Смешайте творог с солью и мелко нарезанной зеленью.',
        'Намажьте на хлеб, сверху положите тонкие кружки огурца.'
      ],
      tip: 'Творог можно заменить мягким сыром или густым йогуртом.'
    },
    {
      id: 'chicken-noodle-soup',
      title: 'Куриный суп с лапшой',
      description: 'Суп, который спасает вечер и заодно расходует курицу с овощами.',
      meal: ['lunch'],
      tags: ['highProtein', 'budget'],
      time: 50,
      servings: 2,
      ingredients: [
        { id: 'chickenBreast', qty: 400 }, { id: 'carrot', qty: 100 }, { id: 'onion', qty: 100 },
        { id: 'potato', qty: 200 }, { id: 'pasta', qty: 80 }, { id: 'greens', qty: 20, optional: true },
        { id: 'salt', qty: 3 }, { id: 'pepper', qty: 1 }
      ],
      steps: [
        'Курицу залейте холодной водой, доведите до кипения и снимите пену.',
        'Варите 25 минут, затем добавьте нарезанные картофель, морковь и лук.',
        'Через 10 минут положите лапшу и варите ещё 5 минут.',
        'Посолите, поперчите, добавьте зелень и дайте супу постоять 5 минут.'
      ],
      tip: 'Лапшу лучше хранить отдельно, иначе к утру она съест весь бульон.'
    },
    {
      id: 'greek-salad',
      title: 'Греческий салат',
      description: 'Соберите всё, что хрустит, и залейте маслом. Летом — ужин, зимой — напоминание о нём.',
      meal: ['lunch'],
      tags: ['vegetarian', 'quick', 'glutenFree', 'budget'],
      time: 15,
      servings: 2,
      ingredients: [
        { id: 'tomato', qty: 250 }, { id: 'cucumber', qty: 200 }, { id: 'bellPepper', qty: 100 },
        { id: 'feta', qty: 150 }, { id: 'olives', qty: 80 }, { id: 'oliveOil', qty: 25 },
        { id: 'salt', qty: 1 }
      ],
      steps: [
        'Нарежьте помидоры, огурцы и перец крупными кусками.',
        'Фету нарежьте кубиками, оливки — пополам.',
        'Смешайте овощи, посолите, полейте оливковым маслом.',
        'Сверху разложите фету и оливки. Перемешивать перед подачей не нужно.'
      ],
      tip: 'Салат не любит холодильник: собирайте прямо перед едой.'
    },
    {
      id: 'tomato-pasta',
      title: 'Паста с томатами и базиликом',
      description: 'Томаты, чеснок и масло — база, к которой не нужно ничего добавлять.',
      meal: ['lunch'],
      tags: ['vegetarian', 'quick', 'budget'],
      time: 25,
      servings: 2,
      ingredients: [
        { id: 'pasta', qty: 250 }, { id: 'tomato', qty: 300 }, { id: 'garlic', qty: 2 },
        { id: 'oliveOil', qty: 25 }, { id: 'cheese', qty: 50 }, { id: 'greens', qty: 15 },
        { id: 'salt', qty: 2 }
      ],
      steps: [
        'Поставьте вариться пасту в подсоленной воде.',
        'Помидоры нарежьте, чеснок раздавите и прогрейте в масле 30 секунд.',
        'Добавьте помидоры и готовьте 8–10 минут, пока не получится соус.',
        'Соедините пасту с соусом, добавьте зелень и сыр.'
      ],
      tip: 'Оставьте полстакана воды от пасты: она сделает соус шелковистым.'
    },
    {
      id: 'chicken-pilaf',
      title: 'Плов с курицей',
      description: 'Большая кастрюля на два дня. Утром вкуснее, чем вечером.',
      meal: ['lunch'],
      tags: ['highProtein', 'budget'],
      time: 60,
      servings: 2,
      ingredients: [
        { id: 'rice', qty: 250 }, { id: 'chickenThigh', qty: 500 }, { id: 'carrot', qty: 150 },
        { id: 'onion', qty: 100 }, { id: 'garlic', qty: 3 }, { id: 'oil', qty: 30 },
        { id: 'salt', qty: 3 }, { id: 'pepper', qty: 1 }
      ],
      steps: [
        'Обжарьте курицу в масле до золотистой корочки.',
        'Добавьте лук и морковь, готовьте 7 минут.',
        'Всыпьте промытый рис, воткните зубчики чеснока, посолите и поперчите.',
        'Залейте водой на 1,5 см выше риса, накройте крышкой и томите 25 минут на маленьком огне.',
        'Дайте постоять 10 минут и перемешайте.'
      ],
      tip: 'Чеснок кладут целиком — он отдаст аромат, но не сгорит.'
    },
    {
      id: 'lentil-soup',
      title: 'Чечевичный суп с томатами',
      description: 'Густой, тёплый и полностью растительный. Из шкафа, а не из доставки.',
      meal: ['lunch'],
      tags: ['vegan', 'vegetarian', 'glutenFree', 'budget', 'highProtein'],
      time: 35,
      servings: 2,
      ingredients: [
        { id: 'lentils', qty: 180 }, { id: 'tomato', qty: 250 }, { id: 'carrot', qty: 100 },
        { id: 'onion', qty: 100 }, { id: 'garlic', qty: 2 }, { id: 'tomatoPaste', qty: 40 },
        { id: 'oil', qty: 20 }, { id: 'salt', qty: 3 }, { id: 'spices', qty: 1, optional: true }
      ],
      steps: [
        'Обжарьте лук, морковь и чеснок в масле до мягкости.',
        'Добавьте томатную пасту и помидоры, прогрейте 2 минуты.',
        'Всыпьте промытую чечевицу, залейте 800 мл воды и доведите до кипения.',
        'Варите 20–25 минут, посолите и добавьте специи.'
      ],
      tip: 'Красная чечевица разваривается быстрее зелёной — проверяйте раньше.'
    },
    {
      id: 'bulgur-chicken',
      title: 'Булгур с курицей и овощами',
      description: 'Сытный обед из одной сковороды. Овощи можно брать любые, что найдутся.',
      meal: ['lunch'],
      tags: ['highProtein', 'budget'],
      time: 35,
      servings: 2,
      ingredients: [
        { id: 'bulgur', qty: 200 }, { id: 'chickenBreast', qty: 350 }, { id: 'bellPepper', qty: 150 },
        { id: 'zucchini', qty: 200 }, { id: 'onion', qty: 80 }, { id: 'oil', qty: 20 },
        { id: 'salt', qty: 2 }, { id: 'paprika', qty: 2 }
      ],
      steps: [
        'Нарежьте курицу и обжарьте в масле до готовности.',
        'Добавьте лук, перец и кабачок, готовьте 5–7 минут.',
        'Всыпьте булгур, паприку и соль, перемешайте.',
        'Залейте 400 мл горячей воды, накройте крышкой и томите 15 минут.'
      ],
      tip: 'Если нет булгура, подойдёт кускус, но ему хватит 5 минут.'
    },
    {
      id: 'tuna-sandwich',
      title: 'Сэндвич с тунцом',
      description: 'Обед без плиты. Тунец, яйцо и хрустящий огурец — всё, что нужно.',
      meal: ['lunch'],
      tags: ['quick', 'highProtein', 'budget'],
      time: 10,
      servings: 2,
      ingredients: [
        { id: 'bread', qty: 150 }, { id: 'tuna', qty: 150 }, { id: 'egg', qty: 2 },
        { id: 'cucumber', qty: 100 }, { id: 'yogurt', qty: 60 }, { id: 'greens', qty: 15 },
        { id: 'salt', qty: 1 }
      ],
      steps: [
        'Сварите яйца вкрутую — 9 минут.',
        'Разомните тунец вилкой, смешайте с йогуртом и солью.',
        'Нарежьте огурец и яйца, добавьте зелень.',
        'Соберите сэндвичи и прижмите их ладонью, чтобы начинка не выпадала.'
      ],
      tip: 'Йогурт можно заменить майонезом, но тогда добавьте немного лимона.'
    },
    {
      id: 'potato-casserole',
      title: 'Картофельная запеканка с фаршем',
      description: 'Большой противень, минимум внимания. Хорошо разогревается на следующий день.',
      meal: ['lunch'],
      tags: ['highProtein'],
      time: 65,
      servings: 2,
      ingredients: [
        { id: 'potato', qty: 600 }, { id: 'beef', qty: 400 }, { id: 'onion', qty: 100 },
        { id: 'milk', qty: 150 }, { id: 'cheese', qty: 80 }, { id: 'butter', qty: 20 },
        { id: 'salt', qty: 3 }, { id: 'pepper', qty: 1 }
      ],
      steps: [
        'Картофель нарежьте тонкими кружками и отварите 8 минут.',
        'Обжарьте фарш с луком, посолите и поперчите.',
        'Смажьте форму маслом, выложите половину картофеля, затем фарш и оставшийся картофель.',
        'Залейте молоком, посыпьте сыром и запекайте 30 минут при 190 °C.'
      ],
      tip: 'Если нет молока, разведите ложку сметаны в воде — соус всё равно получится.'
    },
    {
      id: 'oven-chicken',
      title: 'Курица с картофелем в духовке',
      description: 'Один противень, один запах на всю кухню. Почти не требует участия.',
      meal: ['dinner'],
      tags: ['glutenFree', 'highProtein'],
      time: 55,
      servings: 2,
      ingredients: [
        { id: 'chickenThigh', qty: 600 }, { id: 'potato', qty: 500 }, { id: 'garlic', qty: 3 },
        { id: 'oliveOil', qty: 25 }, { id: 'paprika', qty: 2 }, { id: 'lemon', qty: 1 },
        { id: 'salt', qty: 3 }
      ],
      steps: [
        'Разогрейте духовку до 200 °C.',
        'Картофель нарежьте дольками, смешайте с маслом, солью и паприкой.',
        'Курицу натрите солью и паприкой, положите кожей вверх на противень.',
        'Добавьте картофель и зубчики чеснока, запекайте 40–45 минут.',
        'Перед подачей сбрызните лимоном.'
      ],
      tip: 'Если противень тесный, лучше взять два: овощи должны лежать в один слой.'
    },
    {
      id: 'fish-broccoli',
      title: 'Рыба с брокколи',
      description: 'Лёгкий ужин, который собирается на одном противне за полчаса.',
      meal: ['dinner'],
      tags: ['glutenFree', 'highProtein', 'quick'],
      time: 30,
      servings: 2,
      ingredients: [
        { id: 'fish', qty: 400 }, { id: 'broccoli', qty: 300 }, { id: 'lemon', qty: 1 },
        { id: 'oliveOil', qty: 25 }, { id: 'garlic', qty: 2 }, { id: 'salt', qty: 2 }
      ],
      steps: [
        'Разогрейте духовку до 200 °C.',
        'Брокколи разделите на соцветия, смешайте с маслом и солью.',
        'Рыбу выложите на противень, посолите, добавьте чеснок и кружки лимона.',
        'Запекайте 15–18 минут, пока рыба не станет матовой.'
      ],
      tip: 'Рыба готова, когда легко расслаивается вилкой. Не передержите.'
    },
    {
      id: 'vegetable-stew',
      title: 'Овощное рагу с фасолью',
      description: 'Густое, томатное, сытное. Отлично использует кабачки и перец.',
      meal: ['dinner'],
      tags: ['vegan', 'vegetarian', 'glutenFree', 'budget', 'highProtein'],
      time: 35,
      servings: 2,
      ingredients: [
        { id: 'zucchini', qty: 250 }, { id: 'bellPepper', qty: 150 }, { id: 'tomato', qty: 250 },
        { id: 'beans', qty: 200 }, { id: 'onion', qty: 100 }, { id: 'garlic', qty: 2 },
        { id: 'oil', qty: 20 }, { id: 'salt', qty: 2 }, { id: 'paprika', qty: 1 }
      ],
      steps: [
        'Обжарьте лук и чеснок в масле.',
        'Добавьте кабачок и перец, готовьте 5 минут.',
        'Положите помидоры и фасоль, посолите, добавьте паприку.',
        'Тушите 15 минут без крышки, чтобы соус стал густым.'
      ],
      tip: 'Если фасоль сухая, замочите её с вечера и варите до мягкости отдельно.'
    },
    {
      id: 'meatballs-mash',
      title: 'Котлеты с пюре',
      description: 'Домашний ужин без гастрономических амбиций. Просто хорошо.',
      meal: ['dinner'],
      tags: ['highProtein'],
      time: 50,
      servings: 2,
      ingredients: [
        { id: 'beef', qty: 400 }, { id: 'egg', qty: 1 }, { id: 'bread', qty: 80 },
        { id: 'onion', qty: 100 }, { id: 'potato', qty: 600 }, { id: 'milk', qty: 100 },
        { id: 'butter', qty: 20 }, { id: 'salt', qty: 3 }, { id: 'pepper', qty: 1 }
      ],
      steps: [
        'Размочите хлеб в молоке и отожмите.',
        'Смешайте фарш, яйцо, хлеб и мелко нарезанный лук, посолите и поперчите.',
        'Сформируйте котлеты и обжарьте по 4 минуты с каждой стороны.',
        'Сварите картофель, разомните с маслом и оставшимся молоком.',
        'Подавайте котлеты с пюре и соусом со сковороды.'
      ],
      tip: 'Фарш станет нежнее, если дать ему постоять в холодильнике 20 минут.'
    },
    {
      id: 'shakshuka',
      title: 'Шакшука',
      description: 'Яйца в томатном соусе. Завтрак, обед и ужин в одной сковороде.',
      meal: ['dinner', 'breakfast'],
      tags: ['vegetarian', 'quick', 'glutenFree', 'highProtein', 'budget'],
      time: 25,
      servings: 2,
      ingredients: [
        { id: 'egg', qty: 4 }, { id: 'tomato', qty: 400 }, { id: 'bellPepper', qty: 150 },
        { id: 'onion', qty: 100 }, { id: 'garlic', qty: 2 }, { id: 'oliveOil', qty: 20 },
        { id: 'paprika', qty: 2 }, { id: 'salt', qty: 2 }, { id: 'greens', qty: 10, optional: true }
      ],
      steps: [
        'Обжарьте лук, перец и чеснок в оливковом масле.',
        'Добавьте помидоры, паприку и соль, тушите 10–12 минут.',
        'Сделайте в соусе углубления и аккуратно вбейте яйца.',
        'Накройте крышкой и готовьте 5–7 минут до нужной плотности желтка.',
        'Посыпьте зеленью и подавайте прямо в сковороде.'
      ],
      tip: 'Соус должен быть густым: если помидоры водянистые, поварите дольше.'
    },
    {
      id: 'mushroom-risotto',
      title: 'Ризотто с грибами',
      description: 'Кремовый рис без сливок. Требует внимания, но не требует навыков.',
      meal: ['dinner'],
      tags: ['vegetarian', 'glutenFree'],
      time: 40,
      servings: 2,
      ingredients: [
        { id: 'rice', qty: 200 }, { id: 'mushrooms', qty: 300 }, { id: 'onion', qty: 100 },
        { id: 'cheese', qty: 60 }, { id: 'butter', qty: 30 }, { id: 'oil', qty: 10 },
        { id: 'salt', qty: 2 }
      ],
      steps: [
        'Обжарьте грибы в масле до золотистого цвета и отложите.',
        'В той же сковороде обжарьте лук, добавьте рис и прогрейте минуту.',
        'Подливайте горячую воду по половнику, помешивая, пока рис не станет мягким — около 20 минут.',
        'Верните грибы, добавьте масло и сыр, посолите и перемешайте.'
      ],
      tip: 'Вода должна быть горячей: холодная остановит приготовление риса.'
    },
    {
      id: 'chicken-tacos',
      title: 'Тако с курицей',
      description: 'Сборка на столе: каждый берёт своё. Дети и гости заняты делом.',
      meal: ['dinner'],
      tags: ['highProtein', 'quick'],
      time: 30,
      servings: 2,
      ingredients: [
        { id: 'tortilla', qty: 4 }, { id: 'chickenBreast', qty: 350 }, { id: 'tomato', qty: 200 },
        { id: 'bellPepper', qty: 100 }, { id: 'yogurt', qty: 100 }, { id: 'cheese', qty: 60 },
        { id: 'lemon', qty: 1 }, { id: 'salt', qty: 2 }, { id: 'paprika', qty: 2 }
      ],
      steps: [
        'Нарежьте курицу полосками, посыпьте паприкой и солью.',
        'Обжарьте курицу с перцем на сильном огне 7–8 минут.',
        'Подсушите тортильи на сухой сковороде.',
        'Соберите тако с курицей, помидорами, йогуртом и сыром, сбрызните лимоном.'
      ],
      tip: 'Йогурт смешайте с соком лимона — получится быстрый соус вместо сметаны.'
    },
    {
      id: 'pumpkin-quinoa',
      title: 'Тыква с киноа и фетой',
      description: 'Тёплый салат, который заменяет ужин. Красивый даже в контейнере.',
      meal: ['dinner'],
      tags: ['vegetarian', 'glutenFree', 'highProtein'],
      time: 45,
      servings: 2,
      ingredients: [
        { id: 'pumpkin', qty: 500 }, { id: 'quinoa', qty: 180 }, { id: 'feta', qty: 100 },
        { id: 'greens', qty: 20 }, { id: 'oliveOil', qty: 20 }, { id: 'salt', qty: 2 }
      ],
      steps: [
        'Разогрейте духовку до 200 °C.',
        'Тыкву нарежьте ломтиками, посолите и смажьте маслом.',
        'Запекайте 25–30 минут до мягкости и карамельных краёв.',
        'Промойте киноа и сварите в подсоленной воде 12 минут.',
        'Смешайте киноа с тыквой, добавьте фету и зелень, полейте маслом.'
      ],
      tip: 'Киноа перед варкой обязательно промойте — иначе будет горчить.'
    },
    {
      id: 'pan-pizza',
      title: 'Пицца на сковороде',
      description: 'Тесто без расстойки, начинка из того, что есть. Вечер перестаёт быть томным.',
      meal: ['dinner'],
      tags: ['vegetarian', 'budget'],
      time: 30,
      servings: 2,
      ingredients: [
        { id: 'flour', qty: 200 }, { id: 'tomato', qty: 200 }, { id: 'cheese', qty: 120 },
        { id: 'olives', qty: 60 }, { id: 'oil', qty: 15 }, { id: 'bakingPowder', qty: 5 },
        { id: 'salt', qty: 2 }
      ],
      steps: [
        'Смешайте муку, разрыхлитель и соль, добавьте 100 мл воды и замесите мягкое тесто.',
        'Раскатайте тесто по размеру сковороды и смажьте маслом.',
        'Выложите тонкие кружки помидоров, оливки и сыр.',
        'Накройте крышкой и готовьте на маленьком огне 12–15 минут.',
        'Дайте пицце постоять 2 минуты перед нарезкой.'
      ],
      tip: 'Сковорода должна быть толстой и сухой, иначе тесто прилипнет.'
    },
    {
      id: 'chickpea-curry',
      title: 'Карри с нутом',
      description: 'Густое карри из нута и кокосового молока. Пряности прогреваются вместе с луком, поэтому вкус получается глубоким, а не просто острым.',
      meal: ['lunch', 'dinner'],
      tags: ['vegetarian', 'vegan', 'glutenFree', 'budget'],
      time: 30,
      servings: 2,
      ingredients: [
        { id: 'oil', qty: 20 }, { id: 'onion', qty: 120 }, { id: 'garlic', qty: 2 },
        { id: 'ginger', qty: 10 }, { id: 'curry', qty: 5 }, { id: 'paprika', qty: 2 },
        { id: 'tomato', qty: 300 }, { id: 'chickpeas', qty: 250 }, { id: 'coconutMilk', qty: 200 },
        { id: 'rice', qty: 180 }, { id: 'greens', qty: 15, optional: true }, { id: 'salt', qty: 2 }
      ],
      steps: [
        'Нарежьте лук, чеснок и имбирь. Помидоры — кубиками.',
        'Разогрейте масло в глубокой сковороде. Обжарьте лук 3–4 минуты, добавьте чеснок, имбирь, карри и паприку. Прогрейте 30 секунд.',
        'Добавьте помидоры и тушите 5–7 минут, пока соус не станет густым.',
        'Влейте кокосовое молоко, добавьте нут и соль. Готовьте 10 минут на небольшом огне.',
        'Подавайте с рисом, посыпав зеленью.'
      ],
      tip: 'Нут из банки промойте и обсушите — соус не станет водянистым.',
      source: {
        name: 'ЩИ · ВкусВилл',
        url: 'https://vkusvill.ru/media/recipes/karri-s-nutom.html',
        note: 'Адаптировано для ПОЛКИ'
      },
      video: {
        title: 'Карри с нутом | Рецепты кулинара ВкусВилл',
        channel: 'ВкусВилл',
        url: 'https://www.youtube.com/watch?v=67CGZuxJLdI'
      }
    },
    {
      id: 'hummus',
      title: 'Хумус классический',
      description: 'Кремовый хумус из нута, тахини и лимона. Подавайте с хлебом, овощами или как соус к ужину.',
      meal: ['lunch', 'dinner'],
      tags: ['vegetarian', 'vegan', 'glutenFree', 'quick', 'budget'],
      time: 20,
      servings: 2,
      ingredients: [
        { id: 'chickpeas', qty: 375 }, { id: 'tahini', qty: 60 }, { id: 'garlic', qty: 1 },
        { id: 'oliveOil', qty: 30 }, { id: 'lemon', qty: 1 }, { id: 'cumin', qty: 2 },
        { id: 'salt', qty: 1 }, { id: 'paprika', qty: 2, optional: true }
      ],
      steps: [
        'Слейте нут, промойте и обсушите.',
        'Пробейте нут с тахини, чесноком, лимонным соком, зирой и солью.',
        'Не прекращая взбивать, влейте оливковое масло и 3–4 столовые ложки холодной воды.',
        'Попробуйте и добавьте соль или лимон. Подавайте с паприкой и маслом.'
      ],
      tip: 'Холодная вода делает хумус воздушным; добавляйте её по ложке.',
      source: {
        name: 'ЩИ · ВкусВилл',
        url: 'https://vkusvill.ru/media/recipes/khumus-klassicheskiy.html',
        note: 'Адаптировано для ПОЛКИ'
      },
      video: {
        title: 'Хумус — идеальный рецепт! Как приготовить хумус в домашних условиях',
        channel: 'Рецепты в гостях у Вани',
        url: 'https://www.youtube.com/watch?v=s_7I7BgStPU'
      }
    },
    {
      id: 'quinoa-avocado-salad',
      title: 'Салат с киноа, авокадо и апельсином',
      description: 'Свежий салат с крупой, авокадо и цитрусом. Хорош и как лёгкий ужин, и в контейнере на работу.',
      meal: ['lunch', 'dinner'],
      tags: ['vegetarian', 'vegan', 'glutenFree'],
      time: 25,
      servings: 2,
      ingredients: [
        { id: 'quinoa', qty: 100 }, { id: 'lettuce', qty: 65 }, { id: 'cucumber', qty: 130 },
        { id: 'avocado', qty: 1 }, { id: 'orange', qty: 200 }, { id: 'grapefruit', qty: 100 },
        { id: 'olives', qty: 50 }, { id: 'oliveOil', qty: 10 }, { id: 'salt', qty: 1 },
        { id: 'pepper', qty: 1, optional: true }
      ],
      steps: [
        'Промойте киноа и отварите в подсоленной воде 12–15 минут. Остудите.',
        'Огурец нарежьте тонкими ломтиками, авокадо — кубиками.',
        'У апельсина и грейпфрута срежьте кожуру и белые волокна, разделите на кусочки.',
        'Смешайте салат, киноа, огурец, авокадо, цитрусы и оливки.',
        'Заправьте оливковым маслом, солью и перцем.'
      ],
      tip: 'Не перемешивайте салат слишком активно — авокадо быстро разминается.',
      source: {
        name: 'ЩИ · ВкусВилл',
        url: 'https://vkusvill.ru/media/recipes/salat-s-kinoa-avokado-i-apelsinami.html',
        note: 'Адаптировано для ПОЛКИ'
      },
      video: {
        title: 'Полезный и вкусный салат с киноа и авокадо',
        channel: 'Готовим Вместе в Германии',
        url: 'https://www.youtube.com/watch?v=wFRcUalZ4uw'
      }
    }
  ];

  function addDaysISO(iso, days) {
    const parts = String(iso).split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2] + days, 12, 0, 0, 0);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function buildDemoState(today) {
    const day = (n) => addDaysISO(today, n);

    const pantry = [
      { id: 'p01', ingredientId: 'tomato', name: 'помидоры', qty: 400, unit: 'г', category: 'Овощи', storage: 'fridge', expires: day(1), price: 112, addedAt: day(-2) },
      { id: 'p02', ingredientId: 'greens', name: 'зелень', qty: 80, unit: 'г', category: 'Зелень', storage: 'fridge', expires: day(2), price: 72, addedAt: day(-1) },
      { id: 'p03', ingredientId: 'chickenBreast', name: 'куриное филе', qty: 600, unit: 'г', category: 'Белок', storage: 'fridge', expires: day(2), price: 288, addedAt: day(-1) },
      { id: 'p04', ingredientId: 'egg', name: 'яйца', qty: 8, unit: 'шт', category: 'Белок', storage: 'fridge', expires: day(12), price: 112, addedAt: day(-4) },
      { id: 'p05', ingredientId: 'milk', name: 'молоко', qty: 700, unit: 'мл', category: 'Молочное', storage: 'fridge', expires: day(3), price: 67, addedAt: day(-2) },
      { id: 'p06', ingredientId: 'buckwheat', name: 'гречка', qty: 800, unit: 'г', category: 'Крупы', storage: 'pantry', expires: day(180), price: 112, addedAt: day(-30) },
      { id: 'p07', ingredientId: 'rice', name: 'рис', qty: 900, unit: 'г', category: 'Крупы', storage: 'pantry', expires: day(240), price: 144, addedAt: day(-30) },
      { id: 'p08', ingredientId: 'pasta', name: 'паста', qty: 500, unit: 'г', category: 'Крупы', storage: 'pantry', expires: day(300), price: 110, addedAt: day(-20) },
      { id: 'p09', ingredientId: 'potato', name: 'картофель', qty: 1200, unit: 'г', category: 'Овощи', storage: 'pantry', expires: day(30), price: 72, addedAt: day(-5) },
      { id: 'p10', ingredientId: 'onion', name: 'лук', qty: 500, unit: 'г', category: 'Овощи', storage: 'pantry', expires: day(20), price: 40, addedAt: day(-8) },
      { id: 'p11', ingredientId: 'garlic', name: 'чеснок', qty: 6, unit: 'зубчик', category: 'Овощи', storage: 'pantry', expires: day(40), price: 48, addedAt: day(-12) },
      { id: 'p12', ingredientId: 'oliveOil', name: 'оливковое масло', qty: 500, unit: 'мл', category: 'Бакалея', storage: 'pantry', expires: day(365), price: 445, addedAt: day(-45) },
      { id: 'p13', ingredientId: 'salt', name: 'соль', qty: 500, unit: 'г', category: 'Бакалея', storage: 'pantry', expires: day(700), price: 30, addedAt: day(-60) },
      { id: 'p14', ingredientId: 'pepper', name: 'чёрный перец', qty: 50, unit: 'г', category: 'Бакалея', storage: 'pantry', expires: day(500), price: 120, addedAt: day(-60) },
      { id: 'p15', ingredientId: 'lemon', name: 'лимон', qty: 2, unit: 'шт', category: 'Фрукты', storage: 'fridge', expires: day(5), price: 90, addedAt: day(-3) },
      { id: 'p16', ingredientId: 'cheese', name: 'сыр', qty: 250, unit: 'г', category: 'Молочное', storage: 'fridge', expires: day(7), price: 225, addedAt: day(-3) },
      { id: 'p17', ingredientId: 'yogurt', name: 'йогурт', qty: 300, unit: 'г', category: 'Молочное', storage: 'fridge', expires: day(4), price: 75, addedAt: day(-2) },
      { id: 'p18', ingredientId: 'bread', name: 'хлеб', qty: 400, unit: 'г', category: 'Хлеб', storage: 'pantry', expires: day(2), price: 56, addedAt: day(-1) },
      { id: 'p19', ingredientId: 'feta', name: 'фета', qty: 200, unit: 'г', category: 'Молочное', storage: 'fridge', expires: day(9), price: 240, addedAt: day(-3) },
      { id: 'p20', ingredientId: 'cucumber', name: 'огурцы', qty: 300, unit: 'г', category: 'Овощи', storage: 'fridge', expires: day(4), price: 66, addedAt: day(-2) },
      { id: 'p21', ingredientId: 'beef', name: 'говядина', qty: 500, unit: 'г', category: 'Белок', storage: 'fridge', expires: day(1), price: 375, addedAt: day(-1) },
      { id: 'p22', ingredientId: 'butter', name: 'сливочное масло', qty: 180, unit: 'г', category: 'Молочное', storage: 'fridge', expires: day(25), price: 162, addedAt: day(-6) },
      { id: 'p23', ingredientId: 'berries', name: 'ягоды', qty: 300, unit: 'г', category: 'Заморозка', storage: 'freezer', expires: day(160), price: 135, addedAt: day(-40) },
      { id: 'p24', ingredientId: 'honey', name: 'мёд', qty: 400, unit: 'г', category: 'Бакалея', storage: 'pantry', expires: null, price: 280, addedAt: day(-90) }
    ];

    const shopping = [
      { id: 's01', ingredientId: 'olives', name: 'оливки', qty: 120, unit: 'г', checked: false, source: 'manual', price: 108 },
      { id: 's02', ingredientId: null, name: 'базилик', qty: 1, unit: 'пучок', checked: false, source: 'manual', price: 0 }
    ];

    const history = {};
    const saved = [
      { offset: -6, count: 0, value: 0 },
      { offset: -5, count: 1, value: 140 },
      { offset: -4, count: 2, value: 260 },
      { offset: -3, count: 0, value: 0 },
      { offset: -2, count: 1, value: 90 },
      { offset: -1, count: 3, value: 420 },
      { offset: 0, count: 1, value: 160 }
    ];
    saved.forEach((entry) => {
      history[day(entry.offset)] = { count: entry.count, value: entry.value };
    });

    return {
      version: 1,
      createdAt: new Date().toISOString(),
      demo: true,
      demoSeed: 19,
      settings: { servings: 2, diet: 'all', maxTime: 0 },
      pantry: pantry,
      shopping: shopping,
      plan: {},
      stats: { cooked: 4, history: history }
    };
  }

  global.POLKA_DATA = {
    INGREDIENTS: INGREDIENTS,
    RECIPES: RECIPES,
    CATEGORY_ORDER: CATEGORY_ORDER,
    STORAGES: STORAGES,
    MEALS: MEALS,
    MEAL_ORDER: MEAL_ORDER,
    TAGS: TAGS,
    UNITS: UNITS,
    addDaysISO: addDaysISO,
    buildDemoState: buildDemoState
  };
})(window);
