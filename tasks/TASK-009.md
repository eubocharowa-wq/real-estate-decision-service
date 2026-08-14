# TASK-009 — Shortlist UI

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone A — Clickable Product`

---

# 1. Goal

Реализовать пользовательский экран shortlist, который показывает не поток объявлений, а **5–10 наиболее релевантных вариантов недвижимости** с понятным объяснением:

- насколько объект подходит конкретному пользователю;
- почему он подходит;
- какие есть компромиссы;
- какие критичные данные не подтверждены;
- насколько надёжны данные;
- какой PurchaseScenario использован для сравнения.

Главный результат:

> пользователь должен быстро понять, какие варианты действительно заслуживают внимания и почему они попали в shortlist.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-004.md
tasks/TASK-005.md
tasks/TASK-006.md
tasks/TASK-007.md
tasks/TASK-008.md

docs/03-ux/user-flows.md
docs/03-ux/screens.md
docs/03-ux/edge-cases.md

docs/05-matching/matching-logic.md
docs/05-matching/confidence-status.md

docs/08-roadmap/implementation-plan.md
```

Если какие-либо UX-файлы ещё не существуют физически, не придумывать их содержание. Использовать требования текущей TASK и существующие contracts.

---

# 3. Dependencies

TASK-009 предполагает наличие:

- confirmed `UserRequest`;
- `MatchResult`;
- `DataQuality` / confidence result;
- Pilot Dataset;
- Matching Engine v1;
- Data Confidence Engine.

Если TASK-007/008 ещё не выполнены:

```text
TASK-009 is blocked
```

Не подменять их fake scoring logic внутри UI.

---

# 4. In Scope

Реализовать:

1. shortlist route/page;
2. shortlist data adapter/view model;
3. карточку объекта;
4. Match Score presentation;
5. Data Confidence presentation;
6. top reasons;
7. compromises;
8. critical unknowns;
9. selected PurchaseScenario summary;
10. freshness/source status;
11. unavailable/hard-fail exclusion behavior;
12. empty state;
13. loading state;
14. partial-data state;
15. responsive layout;
16. accessibility;
17. component/integration tests.

---

# 5. Out of Scope

Не реализовывать:

- property detail page;
- comparison page;
- external URL ingestion;
- source collection;
- map search;
- advanced filters;
- infinite scrolling;
- personalization by behavior;
- expert workflow;
- full search backend;
- live refresh execution.

---

# 6. Product Principle

Shortlist не должен выглядеть как обычный classifieds portal.

Не:

```text
100 карточек
сортировка по цене
бесконечный scroll
```

Правильно:

```text
5–10 вариантов
+
насколько подходит
+
почему
+
компромисс
+
что не подтверждено
```

---

# 7. Shortlist Input Contract

Рекомендуемый input:

```yaml
shortlist_input:
  user_request:
  matches:
  data_quality_by_property:
  generated_at:
```

UI не должен самостоятельно рассчитывать Match Score или Data Confidence.

---

# 8. Shortlist View Model

Создать отдельный presentation contract, например:

```yaml
shortlist_item_view:
  property_id:
  offer_id:
  purchase_scenario_id:
  title:
  subtitle:
  price:
  match_score:
  match_status:
  confidence_status:
  confidence_score:
  top_strengths:
  top_compromises:
  critical_unknowns:
  financing_summary:
  availability:
  freshness:
  source_summary:
  image:
```

View model строится из domain data, но не заменяет `MatchResult`.

---

# 9. Shortlist Size

Основной диапазон:

```text
5–10
```

Если eligible объектов меньше:

показать меньше.

Не добивать shortlist hard-fail объектами только ради количества.

---

# 10. Eligibility Filtering

Не показывать в основной shortlist:

```text
hard_fail
unavailable
```

как обычные релевантные варианты.

Они могут быть показаны отдельно позже, например как:

```text
Не подошли по обязательным условиям
```

но это не входит в обязательный scope TASK-009.

---

# 11. Eligible with Unknowns

`eligible_with_unknowns` допускается в shortlist.

Но карточка должна явно показывать:

> Есть важное условие, которое ещё нужно подтвердить.

---

# 12. Possible Match

`possible_match` может появляться ниже confirmed eligible вариантов, если данных недостаточно.

Не смешивать его визуально с уверенным `eligible`.

---

# 13. Sorting

Базовая сортировка shortlist должна использовать результат matching/ranking layer.

Если отдельный ranking engine ещё не существует:

для TASK-009 использовать deterministic order из provided input.

Не создавать новый hidden ranking formula в UI.

---

# 14. No Sorting by Commercial Factors

Запрещено учитывать:

- commission;
- partner flag;
- advertising;
- source relationship.

---

# 15. Shortlist Header

Экран должен объяснять контекст.

Пример:

```text
Подобрали варианты под ваши условия
```

Дополнительно:

```text
Показаны объекты, которые лучше всего соответствуют подтверждённым критериям.
```

---

# 16. Request Summary

Вверху коротко показать подтверждённые must-критерии.

Пример:

```text
До 5 млн ₽ · семейная ипотека обязательно · не первый этаж
```

Не дублировать всю форму.

---

# 17. Edit Request Action

Добавить:

```text
Изменить условия
```

которая возвращает пользователя к confirmation/request editing flow.

---

# 18. Shortlist Card — Required Content

Каждая карточка должна показывать минимум:

1. объект;
2. цену / price status;
3. Match Score;
4. Data Confidence;
5. 2–3 причины соответствия;
6. 1–2 компромисса;
7. critical unknown, если есть;
8. availability/freshness;
9. CTA открыть объект.

---

# 19. Match Score Presentation

Показывать:

```text
92% подходит
```

или аналогичную ясную формулировку.

Не писать:

```text
Рейтинг 9.2/10
```

потому что score персональный, а не универсальный.

---

# 20. Match Score Context

Рядом можно использовать:

```text
Именно под ваши условия
```

чтобы не создавать впечатление общего рейтинга объекта.

---

# 21. Data Confidence Presentation

Не путать с Match Score.

Рекомендуемый UI:

```text
Данные: высокая уверенность
```

или:

```text
Данные требуют проверки
```

Число confidence можно показывать только если presentation policy явно это предусматривает.

Для MVP достаточно semantic band.

---

# 22. Confidence Bands UI

Пример:

```text
high     → Данные подтверждены достаточно хорошо
medium   → Есть данные, которые стоит проверить
low      → Несколько важных условий не подтверждены
critical → Нельзя уверенно опираться на ключевые данные
```

Тексты должны быть централизованы.

---

# 23. Strengths

Показывать максимум:

```text
2–3
```

главных преимуществ относительно UserRequest.

Пример:

```text
✓ укладывается в бюджет
✓ можно въехать сразу
✓ школа в пределах нужной доступности
```

---

# 24. No Generic Benefits

Не показывать:

```text
хороший район
удачная планировка
перспективный ЖК
```

если это не результат user-specific criterion.

---

# 25. Compromises

Показывать 1–2 наиболее важных компромисса.

Пример:

```text
Компромисс: площадь меньше желаемой на 6 м²
```

или:

```text
До работы 47 мин при желаемых 40
```

---

# 26. Critical Unknown

Если есть:

```text
ПВ 0 пока не подтверждён
```

это должно быть видимо прямо в карточке.

Не прятать unknown в detail page.

---

# 27. Conflict Presentation

Если relevant field conflicting:

показывать:

```text
Цена расходится между источниками
```

или equivalent structured message.

Не выбирать одно значение визуально без указания конфликта.

---

# 28. Price Presentation

Поддержать:

- exact price;
- price_from;
- old/new price;
- unknown;
- conflicting.

---

# 29. Exact Price

Пример:

```text
4 890 000 ₽
```

---

# 30. Price From

Если:

```text
price_from = true
```

показывать:

```text
от 4 500 000 ₽
```

и не создавать впечатление, что это exact selected unit price.

---

# 31. Price Conflict

Если critical price conflicting:

```text
Цена требует уточнения
```

Можно показать диапазон/values только если presentation contract это поддерживает.

---

# 32. Financing Summary

Если selected PurchaseScenario существует:

минимум:

```text
ПВ
ежемесячный платёж
программа
```

только если значения доступны.

---

# 33. Financing Claim

Если financing condition claimed:

визуально маркировать:

```text
заявлено
```

а не подтверждено.

---

# 34. No Bank Approval Claim

Не писать:

```text
Ипотека одобрена
```

если банк не дал реального approval.

---

# 35. Availability

Показывать:

```text
В продаже
Бронь
Статус уточняется
```

в соответствии с domain status.

---

# 36. Freshness

Для dynamic fields полезно показывать:

```text
Проверено сегодня
Проверено 2 дня назад
Данные устарели
```

Не показывать technical TTL.

---

# 37. Source Summary

Карточка может показывать:

```text
Источник: сайт застройщика
```

или:

```text
2 источника
```

Полный provenance — на detail page.

---

# 38. Images

Если Pilot Dataset содержит image placeholder:

можно использовать.

Не делать визуальную привлекательность главным ranking signal.

UI должен работать и без изображения.

---

# 39. No Image Requirement

Карточка не должна ломаться, если image отсутствует.

---

# 40. Card CTA

Основной CTA:

```text
Посмотреть подробнее
```

или:

```text
Почему подходит
```

Если detail page ещё не реализована:

можно вести на technical placeholder route, но не имитировать полный detail.

---

# 41. Compare Hook

Можно добавить:

```text
Добавить к сравнению
```

как disabled/placeholder только если следующая comparison TASK явно планируется.

Лучше не делать неработающий CTA.

---

# 42. Shortlist Sections

Допустимая структура:

```text
Лучше всего подходят
```

и отдельно:

```text
Подходят, но нужно проверить
```

если это помогает различать `eligible` и `eligible_with_unknowns`.

---

# 43. Avoid Over-segmentation

Не создавать 5–6 сложных категорий shortlist.

MVP должен оставаться понятным.

---

# 44. Empty State — No Eligible Results

Если ни один объект не проходит hard criteria:

показать:

```text
По подтверждённым обязательным условиям подходящих вариантов пока нет.
```

Не нарушать must criteria молча.

---

# 45. No Silent Relaxation

Запрещено автоматически показывать over-budget объект как «почти подходит» в основном shortlist, если budget = must.

---

# 46. Relaxation Hook

Можно показать CTA:

```text
Посмотреть, какое условие сильнее всего ограничивает выбор
```

Но actual relaxation logic — отдельная будущая TASK.

---

# 47. Coverage Gap State

Если причина отсутствия результатов:

```text
insufficient source coverage
```

не писать:

```text
На рынке ничего нет
```

если система этого не знает.

Если coverage metadata пока отсутствует, не придумывать такой вывод.

---

# 48. Loading State

Loading должен отражать этап продукта без fake statistics.

Пример:

```text
Подбираем варианты под ваши условия…
```

Не писать:

```text
Проверяем 25 000 объектов
```

если это не реальный count.

---

# 49. Partial Results

Если часть matching data готова:

можно показать cached/ready results и status:

```text
Некоторые данные ещё обновляются.
```

Но live refresh integration не входит в TASK-009.

---

# 50. Error State

Если shortlist input invalid:

показать controlled state.

Не падать с raw exception.

---

# 51. Human-readable Explanation Codes

UI должен преобразовывать structured explanation codes из TASK-007 в user-facing labels.

Создать централизованный presentation mapping.

---

# 52. No LLM Needed

Для TASK-009 final short reasons можно строить deterministic templates.

Пример:

```text
PRICE_WITHIN_LIMIT
→ Укладывается в ваш бюджет
```

LLM explanation можно добавить позже.

---

# 53. Explanation Registry

Например:

```text
src/presentation/matching/
  explanation-registry.ts
```

Он должен поддерживать:

```text
code
→ formatter
```

с params.

---

# 54. User-specific Text

Formatter использует actual/target params.

Пример:

```text
AREA_BELOW_PREFERRED
→ Площадь на 6 м² меньше желаемой
```

---

# 55. View Model Builder

Создать pure function:

```ts
buildShortlistItemView(...)
```

которая:

- принимает domain data;
- возвращает presentation-safe data;
- не импортирует React.

---

# 56. Shortlist Builder

Если нужен:

```ts
buildShortlistView(...)
```

Он не должен пересчитывать matching.

---

# 57. UI Component Structure

Рекомендуемые components:

```text
ShortlistPage
ShortlistHeader
RequestSummary
ShortlistSection
PropertyMatchCard
MatchBadge
ConfidenceBadge
StrengthList
CompromiseList
UnknownAlert
FinancingSummary
AvailabilityStatus
FreshnessLabel
EmptyShortlistState
```

Имена могут отличаться.

---

# 58. Responsive Layout

Desktop:

```text
2–3 cards per row
```

или list/cards.

Mobile:

```text
1 card per row
```

Не использовать горизонтальную таблицу как основной layout.

---

# 59. Accessibility

Минимум:

- semantic headings;
- button labels;
- card CTA accessible;
- non-color status indicators;
- focus visible;
- images have alt/empty alt where decorative.

---

# 60. Status Not Only by Color

Confidence/unknown/hard statuses должны иметь текст/icon/label, не только цвет.

---

# 61. No False Precision

Если confidence semantic:

не показывать:

```text
63.427%
```

---

# 62. Source Dates

Formatting dates должно учитывать locale.

Не показывать raw ISO timestamps пользователю.

---

# 63. Currency

Использовать locale-aware formatting.

Не хранить formatted currency в domain model.

---

# 64. Comparison Readiness

Карточка должна иметь stable property/offer/scenario IDs, чтобы следующая comparison TASK могла использовать их без rebuilding state.

---

# 65. Analytics Hooks

Можно предусмотреть events:

```text
shortlist_viewed
property_card_opened
request_edit_clicked
```

Не подключать analytics vendor в этой TASK.

---

# 66. Test Fixtures

Использовать Pilot Dataset benchmark cases.

Обязательно UI cases:

1. high match + high confidence;
2. high match + low confidence;
3. eligible with critical unknown;
4. price_from;
5. conflicting price;
6. financing claim;
7. no image;
8. cross-type house;
9. no eligible results.

---

# 67. Component Tests

Минимум:

1. renders Match Score;
2. renders confidence separately;
3. renders top strengths;
4. renders compromise;
5. renders critical unknown;
6. price_from labeled correctly;
7. conflicting price not shown as confirmed exact;
8. financing claimed marked;
9. missing image does not break card;
10. hard_fail not shown in primary shortlist;
11. unavailable not shown;
12. eligible_with_unknowns shown with warning;
13. empty state shown when no eligible options.

---

# 68. Integration Test

Минимальный flow:

```text
Confirmed UserRequest
→ Pilot Dataset matches
→ Shortlist View Builder
→ render 5–10 cards
→ open one card CTA
```

Если detail route не готов:

assert technical navigation target/placeholder.

---

# 69. No Recalculation in UI

Запрещено:

```text
const match = calculateSomething(property)
```

в React component.

UI consumes `MatchResult`.

---

# 70. No Confidence Recalculation in UI

То же для confidence.

---

# 71. No Hidden Filtering

Если UI исключает hard_fail/unavailable:

это должно быть centralized shortlist policy, а не random `.filter()` в component.

---

# 72. Shortlist Policy Module

Рекомендуется:

```text
src/shortlist/policy.ts
```

где фиксируется:

- included statuses;
- max count;
- section grouping;
- deterministic ordering behavior.

---

# 73. Max Count

Default max count:

```text
10
```

или project-config value.

Если UserRequest `result_limit` указан:

уважать его в допустимом диапазоне.

Не hardcode в нескольких местах.

---

# 74. Result Limit

Если пользователь просил:

```text
5 вариантов
```

показывать максимум 5 eligible results.

---

# 75. Match Score Missing

Если MatchResult malformed/missing:

не создавать карточку с `0%`.

Это data/application error.

---

# 76. Confidence Missing

Если confidence engine ещё не дал результат:

показывать:

```text
Надёжность данных ещё не рассчитана
```

только если contract допускает partial state.

Не подставлять `medium`.

---

# 77. Hard-fail Objects

В primary shortlist:

```text
exclude
```

Можно использовать их позже для no-results explanation.

---

# 78. Unavailable Objects

Не показывать как активный выбор.

---

# 79. Stale Objects

Могут быть показаны, если match eligible, но freshness warning обязателен.

---

# 80. Cross-type Consistency

Карточки apartment/house должны иметь общую decision structure.

Не создавать completely unrelated layouts, которые невозможно сравнить визуально.

---

# 81. Type-specific Secondary Facts

Можно показывать:

Apartment:

```text
rooms · area · floor
```

House:

```text
area · land · utilities
```

Но primary match/reasons/confidence structure остаётся одинаковой.

---

# 82. No Generic Catalog Filters

В TASK-009 не добавлять sidebar:

```text
комнатность
этаж
площадь
```

как основной interaction.

Пользователь уже подтвердил условия.

---

# 83. Optional Post-match Filters

Можно заложить архитектурный hook на будущие filters, но не реализовывать без отдельной TASK.

---

# 84. Acceptance Criteria

TASK-009 считается завершённой, если:

1. shortlist page существует;
2. принимает готовые MatchResult;
3. primary shortlist содержит только допустимые statuses;
4. показывает 5–10 вариантов или user result limit;
5. Match Score виден;
6. Data Confidence показан отдельно;
7. strengths видны;
8. compromises видны;
9. critical unknowns видны;
10. price_from не выдаётся за exact price;
11. conflict не скрывается;
12. financing claim не выдаётся за confirmed;
13. unavailable/hard_fail исключены;
14. request summary показан;
15. edit request action существует;
16. empty state корректный;
17. UI не пересчитывает matching/confidence;
18. view model builder pure;
19. responsive layout работает;
20. accessibility basics выполнены;
21. component tests проходят;
22. integration test проходит;
23. typecheck/lint/test/build проходят.

---

# 85. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

---

# 86. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Route:
Components:
Shortlist policy:
View model:
Explanation registry:
Test fixtures:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 87. Do Not Continue Automatically

После TASK-009:

**не начинать следующую задачу самостоятельно.**

---

# 88. Likely Next Task

Следующая логичная задача:

```text
TASK-010 — Property Detail
```

Она должна раскрыть:

- факты;
- почему подходит;
- компромиссы;
- financing;
- unknowns;
- provenance;
- freshness.

---

# 89. Definition of Done

TASK-009 Done, когда пользователь после подтверждения запроса видит короткий, понятный shortlist и может для каждого варианта сразу ответить:

- насколько он мне подходит;
- почему;
- в чём компромисс;
- чему в данных можно доверять;
- что нужно ещё проверить.

---

# 90. Главный принцип для coding-agent

Shortlist — это не каталог.

Правильная карточка отвечает:

```text
Почему этот объект здесь?
Насколько он подходит мне?
Что в нём сильного?
Где компромисс?
Что ещё не подтверждено?
```

Главное правило:

> **Показывать меньше объектов, но давать больше смысла для решения.**
