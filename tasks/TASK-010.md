# TASK-010 — Property Detail

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone A — Clickable Product`

---

# 1. Goal

Реализовать страницу подробного разбора одного объекта, которая объясняет пользователю:

- что это за объект;
- насколько он подходит под подтверждённый `UserRequest`;
- почему он подходит;
- где есть компромиссы;
- какой `PurchaseScenario` используется;
- какие данные подтверждены;
- какие заявлены, устарели или конфликтуют;
- какие критичные вопросы нужно проверить перед решением;
- из каких источников получены данные.

Главный результат:

> страница объекта должна помогать принять решение, а не просто показывать расширенную карточку объявления.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-005.md
tasks/TASK-006.md
tasks/TASK-007.md
tasks/TASK-008.md
tasks/TASK-009.md

docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/04-data/source-model.md

docs/05-matching/matching-logic.md
docs/05-matching/confidence-status.md

docs/07-expert-services/expert-layer.md
docs/08-roadmap/implementation-plan.md
```

Если UX-файлы существуют, использовать их дополнительно. Если нет — не придумывать отсутствующие спецификации.

---

# 3. Dependencies

TASK-010 предполагает наличие:

- `Property`;
- `Offer`;
- `PurchaseScenario`;
- `MatchResult`;
- `DataQuality`;
- `FieldEvidence`;
- shortlist navigation state/route from TASK-009.

Если TASK-007/008/009 ещё не выполнены:

```text
TASK-010 is blocked
```

Не пересчитывать matching/confidence внутри detail page.

---

# 4. In Scope

Реализовать:

1. property detail route/page;
2. detail view model builder;
3. блок Match Summary;
4. блок Facts;
5. блок Why It Fits;
6. блок Compromises;
7. блок Financing;
8. блок Unknowns / Conflicts;
9. блок Provenance / Sources;
10. freshness presentation;
11. alternative offers for same Property, если есть;
12. CTA для comparison hook;
13. CTA для expert verification hook;
14. responsive layout;
15. accessibility;
16. component/integration tests.

---

# 5. Out of Scope

Не реализовывать:

- comparison page;
- full expert workflow;
- document upload;
- onsite scheduling;
- live refresh execution;
- user URL ingestion;
- map integration;
- transaction flow;
- source crawling;
- LLM-generated legal conclusions.

---

# 6. Core Product Principle

Detail page не должна быть:

```text
Фото
Цена
Метры
Описание продавца
```

Правильная структура:

```text
Факты
↓
Почему подходит именно вам
↓
Компромиссы
↓
Сценарий покупки
↓
Что не подтверждено
↓
Источники
↓
Что стоит проверить дальше
```

---

# 7. Route

Рекомендуемый route:

```text
/property/[propertyId]
```

или equivalent app-router structure.

Если конкретный `Offer` / `PurchaseScenario` важен для context, route/state должен позволять передать selected IDs.

---

# 8. Input Contract

Рекомендуемый input:

```yaml
property_detail_input:
  user_request:
  property:
  offers:
  selected_offer:
  purchase_scenarios:
  selected_purchase_scenario:
  match_result:
  data_quality:
  field_evidence:
  source_conflicts:
```

---

# 9. Detail View Model

Создать pure presentation contract, например:

```yaml
property_detail_view:
  identity:
  headline:
  key_facts:
  match_summary:
  strengths:
  compromises:
  financing:
  availability:
  timeline:
  data_quality:
  unknowns:
  conflicts:
  source_sections:
  alternative_offers:
  actions:
```

View model не заменяет domain entities.

---

# 10. Header

Верхняя часть страницы должна показывать:

- тип объекта;
- location;
- key physical summary;
- текущую выбранную цену;
- availability;
- Match Score;
- Data Confidence.

---

# 11. Match Summary

Пример:

```text
92% подходит под ваши условия
```

Рядом:

```text
Данные: высокая уверенность
```

Не объединять эти два значения.

---

# 12. Why It Fits

Показать 3–5 главных strengths.

Пример:

```text
✓ укладывается в обязательный бюджет
✓ можно въехать до вашего срока
✓ подходит по семейной ипотеке
✓ школа в нужной доступности
```

Только user-specific criteria.

---

# 13. No Generic Praise

Не показывать:

```text
отличная квартира
перспективный район
ликвидный объект
```

если это не вычислено отдельной спецификацией и не относится к UserRequest.

---

# 14. Compromises

Показать критерии, где объект:

- частично соответствует;
- уступает предпочтению;
- требует компромисса.

Пример:

```text
Площадь на 7 м² меньше желаемой.
```

---

# 15. Hard Fail Detail

Если detail page открыта по прямой ссылке для hard-fail объекта:

не скрывать hard fail.

Показывать:

```text
Не соответствует обязательному условию
```

с причиной.

Не показывать его как полноценный подходящий вариант.

---

# 16. Critical Unknowns

Отдельный заметный блок:

```text
Что ещё нужно подтвердить
```

Примеры:

- точная цена;
- наличие;
- семейная ипотека;
- первоначальный взнос;
- срок передачи;
- подключён ли газ.

---

# 17. Unknown vs Conflict

Не смешивать.

## Unknown

Данных нет / не подтверждены.

## Conflict

Есть противоречащие друг другу evidence.

---

# 18. Conflict Presentation

Пример:

```text
Цена расходится между источниками:
4 890 000 ₽
5 050 000 ₽
```

Показывать source/date рядом, если возможно.

---

# 19. Facts Section

Показывать normalized facts, relevant к property type.

Для квартиры:

- rooms;
- area;
- floor;
- finishing;
- building;
- readiness.

Для дома:

- house area;
- land area;
- utilities;
- road access;
- readiness.

---

# 20. No False Completeness

Не показывать:

```text
Газ: нет
```

если status = unknown.

Показывать:

```text
Газ: не подтверждено
```

---

# 21. Verification Labels

Для relevant facts поддержать user-facing labels:

```text
Подтверждено
Заявлено источником
Не подтверждено
Есть расхождение
Данные устарели
Нет данных
```

---

# 22. Freshness

Для dynamic fields:

- price;
- availability;
- financing;
- promotion;

показывать last checked.

Пример:

```text
Цена проверена сегодня
```

---

# 23. Stale Data

Если stale:

```text
Данные могли измениться
```

или equivalent.

Не показывать stale value как silently current.

---

# 24. Financing Section

Если selected PurchaseScenario существует, показать:

- Offer price;
- initial payment;
- loan amount;
- monthly payment;
- program;
- rate structure;
- term;
- mandatory costs;
- promotion;
- assumptions;
- verification.

---

# 25. Financing Scenario Context

Ясно показать:

> Расчёт относится к конкретному сценарию покупки.

Не создавать впечатление, что любой посетитель может купить объект на этих условиях.

---

# 26. Claimed Financing

Если условие только claimed:

маркировать:

```text
Условие заявлено, но ещё не подтверждено для этого объекта.
```

---

# 27. Staged Rate

Если ставка:

```text
0.1% первый год
12% далее
```

показывать периоды отдельно.

Не писать просто:

```text
Ставка 0.1%
```

---

# 28. Price Impact

Если promo/financing изменяет цену объекта:

показывать это явно.

Пример:

```text
Цена по этой программе выше базовой на 300 000 ₽.
```

если такие данные существуют.

---

# 29. Total Entry Cost

Если рассчитан:

показывать:

```text
Сколько потребуется на входе
```

с breakdown.

Не путать с listing price.

---

# 30. Alternative Offers

Если один Property имеет несколько Offer:

показать отдельный блок:

```text
Другие предложения по этому же объекту
```

---

# 31. Offer Separation

Для каждого Offer показывать:

- seller/source;
- price;
- availability;
- commercial terms;
- financing differences.

Не объединять их в одну строку.

---

# 32. No Frankenstein Comparison

Нельзя показывать:

```text
минимальная цена
+
лучший ПВ
+
лучшая ставка
```

как единый selected scenario, если они из разных несовместимых Offer.

---

# 33. Sources Section

Показать user-facing provenance.

Минимум:

```text
Источник
URL / source label
Проверено
Что подтверждает
```

---

# 34. Field-level Provenance

Для критичных полей желательно показать:

```text
Цена
→ источник A
→ проверено тогда-то
```

---

# 35. Source Count

Если несколько evidence:

показать:

```text
Подтверждается 2 источниками
```

только если действительно независимые/согласующиеся evidence.

---

# 36. No Source Trust Theater

Не писать:

```text
Надёжный источник
```

без formal source trust policy.

Лучше:

```text
Официальный сайт застройщика
Банк
Государственный источник
```

если source type это подтверждает.

---

# 37. Images / Media

Если media доступно:

можно показать галерею.

Но page должна быть полноценной и без фото.

---

# 38. Image Source

Если показываются source images:

соблюдать соответствующую source policy/licensing.

Pilot fixtures могут использовать placeholders.

---

# 39. Map Hook

Можно предусмотреть место для location summary.

Но полноценная карта не входит в TASK-010.

---

# 40. Availability Block

Показывать:

```text
В продаже
Забронирован
Статус уточняется
Продан
Объявление снято
```

в соответствии с domain model.

---

# 41. Removed Listing

Не писать:

```text
Продано
```

если статус только `removed`.

---

# 42. Timeline

Показывать отдельно:

- construction completion;
- handover;
- move-in readiness;

если эти даты различаются.

---

# 43. No Date Substitution

Не использовать:

```text
Q4 construction completion
```

как:

```text
ключи в Q4
```

если evidence этого не подтверждает.

---

# 44. Request-specific Facts Order

Вверху Facts лучше показывать то, что важнее UserRequest.

Например:

- budget;
- move-in;
- financing;
- area;

а не фиксированный generic order.

View model может сортировать по criterion importance.

---

# 45. Data Confidence Section

Отдельный блок:

```text
Насколько надёжны данные
```

Показать:

- confidence band;
- completeness band;
- critical unknown count;
- critical conflict count.

---

# 46. No Confidence as Fit

Не писать:

```text
Надёжность 70% → объект подходит на 70%
```

---

# 47. Recommended Checks

Использовать `recommended_checks` из TASK-008.

Показывать:

```text
Что стоит проверить перед решением
```

---

# 48. Recommended Check Examples

```text
Уточнить актуальную цену
Подтвердить наличие
Проверить применимость семейной ипотеки
Проверить ПВ
Уточнить срок передачи
```

---

# 49. Expert Verification Hook

Добавить CTA:

```text
Проверить этот вопрос
```

или:

```text
Попросить экспертную проверку
```

только рядом с конкретным unknown/conflict.

Если expert workflow ещё не реализован:

CTA может вести на placeholder request route/state.

---

# 50. No Generic Lead Form

Не делать основной CTA:

```text
Оставьте телефон
```

без контекста.

---

# 51. Comparison Hook

Добавить:

```text
Добавить к сравнению
```

если state contract готов.

Если TASK-011 Comparison ещё не реализована, можно сохранять local selection / placeholder behavior только при явном scope.

---

# 52. Back to Shortlist

Обязательная secondary navigation:

```text
Вернуться к вариантам
```

---

# 53. View Model Builder

Создать pure function, например:

```ts
buildPropertyDetailView(...)
```

Она:

- не вызывает сеть;
- не пересчитывает matching;
- не пересчитывает confidence;
- форматирует domain data для presentation.

---

# 54. Explanation Registry Reuse

Использовать explanation registry из TASK-009.

Не создавать второй независимый mapping тех же codes.

---

# 55. Verification Label Registry

Создать централизованный mapping:

```text
verification status
→ label
→ description
```

---

# 56. Freshness Label Registry

Аналогично:

```text
freshness status
→ user-facing label
```

---

# 57. Property-type Presentation Registry

Можно централизовать:

```text
apartment
house
townhouse
land
```

→ relevant fact groups.

---

# 58. No Domain Logic in React

React components не должны определять:

- source conflict;
- match;
- confidence;
- scenario compatibility.

Они получают готовый view model.

---

# 59. No Direct Raw Source Data

UI работает с normalized/canonical data + evidence.

Не рендерить сырой parser payload как authoritative fact.

---

# 60. Loading State

Если detail data загружается:

```text
Загружаем данные объекта…
```

без fake external search progress.

---

# 61. Partial State

Если detail загружен, но некоторые sections отсутствуют:

показать честный:

```text
Нет данных
```

вместо пустого блока.

---

# 62. Error State

Если property ID не найден:

controlled 404-like state:

```text
Объект не найден
```

---

# 63. Invalid Match Context

Если property существует, но MatchResult для текущего UserRequest отсутствует:

не подставлять universal score.

Показывать:

```text
Соответствие этому запросу ещё не рассчитано.
```

---

# 64. Direct Link Context

Если пользователь открыл property URL без active UserRequest:

страница может показать факты, но блок:

```text
Почему подходит именно вам
```

нельзя выдумывать.

Нужно CTA:

```text
Описать свои условия
```

---

# 65. Responsive Layout

Desktop:

- main content;
- sticky summary/financing block optional.

Mobile:

- single column;
- critical unknowns не прятать в accordions по умолчанию.

---

# 66. Accessibility

Минимум:

- semantic sections;
- headings;
- accessible labels;
- status text not color-only;
- focus navigation;
- links/buttons semantic.

---

# 67. Test Fixtures

Использовать Pilot Dataset cases:

1. high match/high confidence apartment;
2. high match/low confidence apartment;
3. price conflict;
4. price_from;
5. two offers same property;
6. claimed financing;
7. staged rate;
8. house with gas unknown;
9. removed secondary listing;
10. hard-fail direct-open case.

---

# 68. Component Tests

Минимум:

1. renders Match Score;
2. renders confidence separately;
3. renders strengths;
4. renders compromises;
5. renders critical unknowns;
6. renders verification labels;
7. stale field marked;
8. conflict shows multiple evidence values/labels;
9. price_from labeled;
10. alternative offers separated;
11. staged rate displayed in periods;
12. claimed financing marked;
13. removed listing not shown as sold;
14. page works without image;
15. no active UserRequest → no personalized fit claim.

---

# 69. Integration Test

Минимальный flow:

```text
Shortlist
→ open Property Detail
→ selected Offer/Scenario preserved
→ MatchResult shown
→ unknown/checks shown
→ back to shortlist
```

---

# 70. No LLM Dependency

TASK-010 не требует LLM.

Structured explanation codes можно форматировать deterministic templates.

---

# 71. Analytics Hooks

Можно предусмотреть:

```text
property_detail_viewed
source_section_opened
expert_check_clicked
comparison_add_clicked
```

Не подключать analytics vendor.

---

# 72. Performance

Page should render from already prepared application data without live crawling.

Не блокировать initial render OpenClaw/browser refresh.

---

# 73. Live Refresh Hook

Можно показать button/hook:

```text
Проверить актуальность
```

только если соответствующая task/update workflow существует.

Иначе не делать неработающий CTA.

---

# 74. Security / Source URLs

Внешние source URLs:

- открывать безопасно;
- не вставлять непроверенный HTML;
- использовать proper rel attributes, если external link.

---

# 75. Acceptance Criteria

TASK-010 считается завершённой, если:

1. property detail route существует;
2. page получает domain data, а не пересчитывает их;
3. Match Score показан;
4. Data Confidence показан отдельно;
5. strengths показаны;
6. compromises показаны;
7. critical unknowns показаны;
8. conflicts показаны явно;
9. facts различают unknown/false/not_applicable;
10. financing scenario показан отдельно;
11. staged rate не схлопывается;
12. alternative Offer не смешиваются;
13. provenance показан;
14. freshness показана;
15. recommended checks показаны;
16. direct-open hard fail не маскируется;
17. no UserRequest не получает персональный score;
18. responsive layout работает;
19. accessibility basics выполнены;
20. component tests проходят;
21. integration test проходит;
22. typecheck/lint/test/build проходят.

---

# 76. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

---

# 77. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Route:
View model:
Components:
Explanation registry reuse:
Verification/freshness presentation:
Alternative offers:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 78. Do Not Continue Automatically

После TASK-010:

**не начинать следующую задачу самостоятельно.**

---

# 79. Likely Next Task

Следующая логичная задача:

```text
TASK-011 — Comparison
```

Она объединит 2–4 объекта в общую decision matrix по пользовательским критериям.

---

# 80. Definition of Done

TASK-010 Done, когда пользователь может открыть один вариант и понять:

- что это за объект;
- почему он подходит именно ему;
- где компромиссы;
- сколько и как он сможет заплатить;
- что подтверждено;
- чему пока нельзя полностью доверять;
- что нужно проверить до решения.

---

# 81. Главный принцип для coding-agent

Property Detail — это не «карточка объявления побольше».

Правильная страница отвечает:

```text
Что это?
Почему подходит мне?
Где компромисс?
Каким способом я это покупаю?
Насколько надёжны данные?
Что ещё проверить?
Откуда взяты факты?
```

Главное правило:

> **Чем ближе пользователь к решению, тем меньше маркетинга и тем больше прозрачности по фактам, условиям и неопределённости.**
