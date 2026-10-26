# ПОЛКА App — архитектура и контракты

Мобильное PWA для кухонного журнала ПОЛКА. То же ядро, что у сайта
`../polka`, но отдельный мобильный интерфейс: без лендинга, с нижней
навигацией, шторками и офлайн-режимом.

## Решения

- **PWA, без фреймворка и сборки.** Нативные ES-модули, CSS, локальные шрифты.
  Открывается по HTTPS (или localhost) и устанавливается на iPhone/Android.
- **Без бэкенда.** Данные только в `localStorage` устройства. Перенос — JSON.
- **Ядро переиспользуется.** `js/data.js` и `js/engine.js` — копии из сайта
  `../polka`. Синхронизация: `tools/sync-core.sh`. Ядро не менять вручную.
- **Никаких автоматических внешних запросов.** Шрифты, иконки и картинки
  локальные. Ссылки на источник и видео рецепта открываются только по явному
  тапу во внешнем браузере; в приложении нет iframe, embed и превью. Данные
  о товаре по штрихкоду запрашиваются у открытой базы Open Food Facts только
  по кнопке «Найти название в интернете» (`js/lookup.js`); уходит только код.
- **Один экран — один модуль.** Экраны не мутируют состояние напрямую,
  только через `js/store.js`.

## Структура

```
index.html                  каркас: шапка, #screen, нижняя навигация, sprite
manifest.webmanifest        установка PWA
sw.js                       офлайн-кэш и обновления
css/tokens.css              палитра, шрифты, размеры, safe-area
css/base.css                сброс, типографика, кнопки, поля, списки, пустые состояния
css/shell.css               шапка, таббар, шторки, тосты, офлайн-баннер
css/screens/*.css           стили конкретных экранов
js/data.js                  каталог и 27 рецептов (копия ядра)
js/engine.js                чистая логика (копия ядра)
js/store.js                 состояние, localStorage, доменные операции
js/router.js                hash-роутер
js/ui.js                    помощники, тосты, шторки, подтверждения
js/pwa.js                   установка, service worker, обновления
js/scanner.js               камера и распознавание штрихкодов/QR
js/lookup.js                поиск товара по штрихкоду в Open Food Facts
js/analytics.js             локальные счётчики использования и отчёт
js/version.js               версия приложения (одна точка правды)
js/app.js                   запуск, маршруты, индикаторы, жизненный цикл
js/screens/pantry.js        экран «Полка»
js/screens/recipes.js       «Рецепты» и карточка рецепта
js/screens/plan.js          «План» и выбор блюда
js/screens/shopping.js      «Покупки»
js/screens/more.js          «Ещё»: статистика, настройки, данные, аналитика, установка
tests/engine.test.js        тесты ядра (копия)
tests/lookup.test.mjs       юнит-тесты поиска по коду
tests/e2e.mjs               E2E на Playwright (dev)
tools/sync-core.sh          копирование ядра из ../polka
docs/ARCHITECTURE.md        этот файл
```

## Маршруты

| Hash | Экран | Модуль |
|---|---|---|
| `#/pantry` | Полка (стартовый) | `pantryScreen(root, ctx)` |
| `#/recipes` | Рецепты | `recipesScreen(root, ctx)` |
| `#/recipes/:id` | Карточка рецепта | `recipeScreen(root, ctx)` |
| `#/plan` | План на 7 дней | `planScreen(root, ctx)` |
| `#/shopping` | Покупки | `shoppingScreen(root, ctx)` |
| `#/more` | Ещё | `moreScreen(root, ctx)` |

`ctx.params` содержит и query-параметры, и параметры пути (`id`).
Переходы — `router.navigate('recipes/oatmeal-apple')`. Не менять
`location.hash` напрямую. Для динамического заголовка — `router.setTitle()`.
`plan.js` дополнительно экспортирует `openPlanSettings()` — его использует «Ещё».

## Состояние

`js/store.js` — единственный владелец состояния. Схема:

```js
{
  version: 1,
  createdAt: "ISO",
  demo: true,
  demoSeed: 19,
  settings: { servings: 2, diet: "all", maxTime: 0 },
  pantry: [{ id, ingredientId, name, qty, unit, category, storage, expires, price, barcode, addedAt }],
  plan: { "2026-10-22": { breakfast: "recipe-id", lunch: "...", dinner: "..." } },
  shopping: [{ id, ingredientId, name, qty, unit, checked, source, price }],
  stats: { cooked: 4, history: { "2026-10-22": { count: 1, value: 160 } } }
}
```

Ключи: `polka.kitchen.v1` (совместим с сайтом), `polka.kitchen.v1.damaged` (резерв
повреждённых данных). Экспорт: `{ format: "polka", version: 1, exportedAt, state }`.

### Рецепты с внешним источником

`js/data.js` может содержать у рецепта необязательные поля:

```js
source: { name: "ЩИ · ВкусВилл", url: "https://…", note: "Адаптировано для ПОЛКИ" },
video: { title: "…", channel: "…", url: "https://www.youtube.com/watch?v=…" }
```

Это статические данные каталога, в `localStorage` они не попадают. Карточка
рецепта выводит их отдельным блоком «Источник и видео». Каждая ссылка — обычный
`<a target="_blank" rel="noopener noreferrer">`; приложение не загружает
страницы, видео и превью и не делает внешних запросов до тапа пользователя.

### API store

Чтение: `getState()`, `getToday()`, `isStorageOK()`, `getLastSavedAt()`,
`getPersistenceState()`, `getBootWarning()`, `hasData()`, `snapshot()`,
`shoppingSummary()`.

Подписка: `subscribe(fn)` → отписка. События: `save` (`{ok, at}`),
`replace` (`{message}`), `persistence`, `boot`.

Мутации (все сохраняют и возвращают результат):

- Полка: `addPantry(input)`, `updatePantry(id, patch)`, `removePantry(id)`
  → `{item, index}`, `insertPantry(item, index)`.
- Покупки: `addShopping(input)` → `{item, merged}`, `updateShopping(id, patch)`,
  `toggleShopping(id, checked)`, `removeShopping(id)` → `{item, index}`,
  `insertShopping(item, index)`, `mergeShopping(additions, mode)`.
- Рецепты: `addRecipeMissing(recipe, servings)` → `{additions, merged}`,
  `cook(recipe, servings)` → отчёт движка.
- Покупки → полка: `buyChecked()`, `clearChecked()`.
- План: `setPlanSlot(date, meal, recipeId)`, `clearPlanSlot(date, meal)`,
  `generatePlan({seed})` → `{plan, meals}`, `clearPlan()` → предыдущий план,
  `syncShoppingFromPlan()` → `{overview, additions, result}`.
- Настройки: `updateSettings({servings, diet, maxTime})`.
- Данные: `exportPayload()`, `exportText()`, `importState(candidate)`,
  `loadDemo()`, `clearAll()`, `replaceState(next, message)`, `reloadFromStorage()`.

Правила: не писать в `localStorage` из экранов, не мутировать `getState()`
напрямую, для отмены использовать `snapshot()` + `replaceState(snapshot, ...)`.
Перед опасным действием — `confirmSheet`. После отменяемого — тост с «Отменить».

## Сканер (`js/scanner.js`)

- `isScannerSupported()` — HTTPS (или localhost) и `getUserMedia`.
- `createScanner({video, onStatus, onResult, onError})` → `{start, stop}`.
  Кадры разбирает встроенный `BarcodeDetector`, если он есть; иначе лениво
  подключается `assets/vendor/zxing.min.js` (Apache-2.0, глобальный `ZXing`).
- Модуль сам управляет потоком камеры и останавливает его в `stop()`.
- Разбор содержимого кода — чистая функция ядра `E.parseScanPayload(raw)`
  → `{code, name, kind}`: EAN/UPC, GS1 `01`+GTIN из DataMatrix, название из
  QR (текст или параметр ссылки).
- Штрихкод хранится в продукте (`barcode`, ≤ 64 символов, чистит
  `E.cleanScanCode`). Знакомый код ищется по продуктам полки и подставляет
  название без интернета.
- Видео и декодер — локальные; сканирование не делает внешних запросов.

## Поиск по штрихкоду (`js/lookup.js`)

- Единственный модуль, который ходит в интернет: открытая база Open Food
  Facts (`/api/v2/product/{код}.json`), без ключа и регистрации.
- `codeForLookup(value)` — нормализация кода: 8–14 цифр, пробелы и дефисы
  игнорируются. `hasLookupConsent()` / `grantLookupConsent()` — разовое
  согласие пользователя, ключ `polka.lookup.v1`.
- `cachedProduct(code)` / `rememberProduct(code, info)` — локальная память
  найденного (до 200 записей): повторный скан того же кода работает офлайн.
- `lookupMemoryInfo()` → `{consent, count}`; `resetLookupData()` стирает
  согласие и память — вызывается из «Ещё» → «Память поиска по коду».
- `await findProduct(code)` → `{status: 'found'|'notfound'|'error'|'invalid',
  product, cached}`. Сначала память устройства, затем сеть с таймаутом 12 с;
  наружу уходит только код.
- Вызов — только из `pantry.js` по кнопке «Найти название в интернете».
  При загрузке, сканировании и сохранении запросов нет.

## Аналитика (`js/analytics.js`)

- Локальные счётчики в `localStorage`, ключ `polka.analytics.v1`; кухонное
  состояние не затрагивается.
- `initAnalytics({version, standalone})`, `track(name, props)`,
  `trackScreen(tab)`, `getSummary()`, `buildTextReport()`, `buildJsonReport()`,
  `resetAnalytics()`.
- В отчёте только счётчики действий и данные устройства; названий продуктов,
  цен и персональных данных нет.
- Отправка — только по кнопке в «Ещё» (Web Share / буфер / JSON-файл).
  Автоматических запросов нет.

## UI-слой (`js/ui.js`)

Экспортирует `DATA`, `E`, `esc`, `icon(name)`, `money`, `qty`, `plural`,
`capitalize`, `parseQty`, `render`, `$`, `$$`, `on`, `debounce`,
`emptyState`, `expiryBadge(status)`, `matchLabel`, `matchTone`,
`focusFirstError`, `scrollToTop`, `toast`, `openSheet`, `confirmSheet`,
`closeAllSheets`, `shareText`.

- **Всегда экранировать пользовательские данные через `esc()`** при вставке
  в HTML. `innerHTML` допустим только со собранной безопасной строкой.
- **Тост:** `toast('Текст', { action: 'Отменить', onAction, tone: 'error' })`.
- **Шторка:** `openSheet({ eyebrow, title, subtitle, content, footer, className,
  initialFocus, onMount, onClose })` → `{dialog, body, footer, close}`.
  Шторка сама управляет фокусом, Escape, фоном, жестом вниз и кнопкой «назад».
  Внутри `onMount` навешивать обработчики. Для формы удобно `footer` с кнопками.
- **Подтверждение:** `await confirmSheet({title, text, confirmLabel, danger})`
  → `true/false`. `danger: false` для неразрушающих действий.
- **Пустое состояние:** `emptyState({iconName, title, text, actionLabel,
  actionAttrs})`; обработчик — делегированием по `data-action`.

### Готовые классы

Каркас: `.screen`, `.screen-head`, `.screen-head--row`, `.screen-head__actions`,
`.eyebrow`, `.screen-title`, `.screen-lead`, `.section`, `.section-head`,
`.section-title`, `.section-note`, `.card`, `.card-pad`, `.note`, `.note--warn`,
`.note--danger`, `.note--ok`, `.summary-grid` (+ `__item/__value/__label`),
`.list`, `.list-row` (`__body/__name/__meta/__tail/__value/__sub`), `.group-head`,
`.empty` (`__icon/__title/__text`), `.badge` (+ variants), `.tag`, `.chips`/`.chip`,
`.btn` (+ `--primary/--ghost/--danger/--quiet/--small/--block/--grow`),
`.icon-btn`, `.text-link`, `.field` (+ `__label/__hint/__error`), `.field-row`,
`.field-row--qty`, `.fieldset`, `.form-error`, `.search-field`, `.segmented`,
`.stepper`, `.quick-dates`, `.meter`/`.meter__fill`, `.rule`, `.stack`, `.row-actions`.

Экранные стили добавлять в свой `css/screens/*.css`, не в общие файлы.
Не вводить новые глобальные токены без необходимости.

## Визуальный язык

- Тёплая бумага `--paper`, карточки `--card`, тёмно-зелёный `--kale-deep`,
  томатный акцент только для срочного/опасного, масло `--butter` для сроков.
- Заголовки — Bitter (serif), текст — Golos Text, метки и цифры — PT Mono.
- Редакционная вёрстка: крупные заголовки, тонкие линейки, минимум радиусов,
  «бумажная» тень `--shadow-note`. Не делать SaaS-дашборд из одинаковых плиток.
- Мобильный ритм: поля 20px/16px, шаг 4/8, основные кнопки ≥ 46px,
  тач-цели ≥ 44px, шрифт полей 16px (иначе iOS зумит).
- Safe-area: нижний отступ контента и шторок уже учтён в `shell.css`.
- Учитывать `prefers-reduced-motion`.

## Экраны: обязательное поведение

### Полка (`pantry.js`)

- Заголовок, сводка: продуктов, стоимость, скоро срок.
- Плашка о продуктах с истекающим сроком (если есть), переход к фильтру «скоро».
- Поиск, чипы фильтров (все / холодильник / морозилка / шкаф / скоро срок),
  расширенные фильтры (категория, сортировка) в шторке.
- Группы по зоне хранения, строки: имя, количество, категория, срок, цена.
  Тап по строке — редактирование.
- Добавление сканированием: кнопка «Сканировать штрихкод или QR» открывает
  камеру, код и название подставляются в форму; штрихкод хранится в карточке.
- Новый код: кнопка «Найти название в интернете» в шторке продукта. Первое
  нажатие — согласие на запрос к Open Food Facts, дальше название, бренд и
  объём подставляются и запоминаются на устройстве.
- Добавление/редактирование в шторке: имя с автоподстановкой из каталога
  (`E.resolveIngredient`), количество, единица, категория, зона, срок (+ быстрые
  кнопки), цена. Валидация с `aria-invalid`, ошибка рядом с полем. Удаление —
  подтверждение и тост с отменой. После сохранения — перерисовка и тост.
- Пустое состояние: добавить продукт / вернуть демо.

### Рецепты (`recipes.js`)

- Поиск, чипы: все / можно готовить / почти / быстро / вегетарианское /
  без глютена / спасти. Сортировка по совпадению.
- Карточки: название, описание, время, порции, стоимость, процент совпадения,
  чего не хватает. Тап — `#/recipes/:id`.
- Карточка рецепта: назад, мета, состав с количеством под текущие порции,
  отметки «на полке»/«докупить», шаги, подсказка. Степпер порций 1–12
  пересчитывает состав и нехватку.
- У рецептов с `source`/`video` — блок «Источник и видео» с внешними ссылками,
  названием канала и пометкой об адаптации. Ссылки открываются в новой вкладке
  браузера; встроенных медиа нет.
- Действия: «Готовить» (шторка с предпросмотром списаний и нехватки, затем
  `store.cook` + тост с отменой), «Добавить недостающее в покупки»,
  «В план» (7 дат + приём пищи).
- `E.recipeById`, `E.matchRecipe`, `E.collectRecipeMissing`, `E.recipeCost`.
- Не найдено — пустое состояние со сбросом фильтров.

### План (`plan.js`)

- Полоса 7 дней от сегодня, выбранный день, отметки заполненности.
- Три приёма: пустой слот открывает выбор блюда; заполненный — шторка действий
  («Открыть рецепт», «Заменить», «Убрать»).
- Сводка: приёмов, блюд, нехватка и стоимость. Кнопки: «Собрать покупки»
  (`syncShoppingFromPlan`), «Собрать план» (подтверждение при непустом плане),
  «Очистить» (тост с возвратом).
- Шторка настроек: порции, диета, максимальное время; сохраняются сразу,
  применяются при следующей сборке. Экспорт `openPlanSettings()`.
- Выбор блюда: поиск, только подходящие приёмы пищи, текущее отмечено,
  процент совпадения; выбор → `setPlanSlot` и тост.
- Пустой план — выразительное пустое состояние.

### Покупки (`shopping.js`)

- Сводка: куплено N из M, сумма, прогресс.
- Группы по категориям, чекбоксы (тап по строке), количество, цена, источник
  (план/рецепт/вручную), удаление с отменой.
- Добавление вручную в шторке (имя с подсказками, количество, единица).
- «Купить отмеченное» → `buyChecked`, тост с отменой.
- «Очистить отмеченные» → подтверждение, тост с отменой.
- «Собрать из плана» → `syncShoppingFromPlan`, информативный тост.
- «Поделиться списком» через `shareText` (текст с количеством и отметками).
- Пустое состояние: добавить позицию / открыть план.

### Ещё (`more.js`)

- Статистика: продуктов, стоимость, спасено за неделю, приготовлено,
  скоро срок/просрочено.
- Настройки плана: кнопка, открывающая `openPlanSettings()`.
- Данные: экспорт JSON (файл или Web Share), импорт JSON (≤ 4 МБ, проверка
  формата, подтверждение), демо, полная очистка. После импорта/демо/очистки —
  переход на полку.
- «Память поиска по коду»: статус согласия и число сохранённых кодов,
  сброс с подтверждением (`resetLookupData()`).
- Установка: если доступен `beforeinstallprompt` — кнопка; iOS — инструкция
  «Поделиться → На экран Домой»; если standalone — статус «Установлено».
- Аналитика использования: локальные счётчики, отправка отчёта по кнопке,
  скачивание JSON и сброс счётчиков.
- Блок «О приложении»: локальные данные, без аккаунтов и облака, версия.
- Офлайн-статус и состояние сохранения.

## Доступность

- Семантика: `main`, `nav`, `header`, `h1/h2/h3`, `button`, `label`.
- У каждой кнопки-иконки — `aria-label`; декоративные иконки `aria-hidden`.
- Активная вкладка — `aria-current="page"` (ставит роутер).
- Фокус видимый, не убирать outline без замены; шторки — `<dialog>`.
- Ошибки форм — текст + `aria-invalid`; тосты — `aria-live`.
- Статусы дублировать текстом, не только цветом.
- Все интерактивные элементы ≥ 44×44 px; шрифт в полях 16px.

## Проверки

```bash
node tests/engine.test.js
node tests/lookup.test.mjs
node --check js/screens/pantry.js   # и остальные модули
python3 -m http.server 8766 --bind 127.0.0.1
```

E2E: мобильный вьюпорт 390×844 и 320px, 16 проверок — каркас, пять разделов,
manifest и service worker, axe, отсутствие горизонтального переполнения,
UI-сценарии полки/рецепта/плана/покупок, сканер с фейковой камерой, поиск по
коду (согласие, память, «не найдено»), аналитика, источник и видео без
встроенных медиа, экспорт/импорт и офлайн после перезагрузки.
Скриншоты: `tests/screenshots/`.

Lighthouse на мобильном профиле: accessibility 100, best-practices 100,
SEO 100; performance 72 (72–74 в серии). Это следствие no-build сборки
(ненминифицированные CSS/JS, render-blocking ресурсы) и локального сервера
без сжатия. На хостинге с gzip/brotli и кэшем производительность будет выше;
доступность и офлайн-контракт важнее минификации.

## Ограничения

- Не добавлять фреймворки, бандлеры, CDN и автоматические внешние запросы.
  Внешние ссылки рецептов — только по тапу пользователя. Декодер сканера —
  единственная сторонняя библиотека: лежит в `assets/vendor`, кэшируется SW.
- Не менять `js/data.js`, `js/engine.js`, `tests/engine.test.js` вручную.
- Не трогать чужие экраны и общие файлы без согласования.
- Кухня не покидает устройство. Аналитика — локальные счётчики; отчёт уходит
  только по кнопке тестера. Наружу по кнопке уходит и штрихкод — для поиска
  товара в Open Food Facts; других сетевых обращений нет.
