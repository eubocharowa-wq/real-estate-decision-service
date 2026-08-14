# TASK-011 — Comparison

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone A — Clickable Product`

---

# 1. Goal

Реализовать экран сравнения 2–4 объектов, который помогает пользователю увидеть **не просто различия характеристик**, а реальные trade-offs относительно его подтверждённого `UserRequest`.

Главный результат:

> пользователь должен понимать, какой объект сильнее по его обязательным и желательным условиям, какой способ покупки используется для каждого варианта, где есть компромиссы, а где данные ещё недостаточно надёжны для решения.

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
tasks/TASK-009.md
tasks/TASK-010.md

docs/04-data/user-request-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/04-data/source-model.md

docs/05-matching/matching-logic.md
docs/05-matching/hard-soft-criteria.md
docs/05-matching/confidence-status.md

docs/07-expert-services/choice-assistance.md
docs/08-roadmap/implementation-plan.md
```

Если UX-файлы существуют, использовать их дополнительно. Если нет — не придумывать отсутствующие спецификации.

---

# 3. Dependencies

TASK-011 предполагает наличие:

- `UserRequest`;
- `Property`;
- `Offer`;
- `PurchaseScenario`;
- `MatchResult`;
- `DataQuality`;
- shortlist state;
- property detail state;
- stable property/offer/scenario IDs.

Если TASK-009 и TASK-010 ещё не выполнены:

```text
TASK-011 is blocked
```

Не создавать отдельную копию domain state специально для comparison.

---

# 4. In Scope

Реализовать:

1. comparison route/page;
2. selection state на 2–4 объекта;
3. comparison view model builder;
4. common decision matrix;
5. Match Score comparison;
6. Data Confidence comparison;
7. PurchaseScenario comparison;
8. cross-type comparison;
9. strengths/trade-offs;
10. critical unknowns/conflicts;
11. must-criteria visibility;
12. scenario-specific conclusion structure;
13. remove/add object behavior;
14. empty/partial/error states;
15. responsive mobile behavior;
16. accessibility;
17. component/integration tests.

---

# 5. Out of Scope

Не реализовывать:

- expert chat;
- automatic final recommendation by LLM;
- document review;
- external URL ingestion;
- live source refresh;
- saved comparisons;
- shareable links;
- collaboration;
- notifications;
- map routing;
- transaction workflow.

---

# 6. Core Product Principle

Comparison не должен быть generic feature table.

Плохо:

```text
Объект A | Объект B | Объект C
Цена
Этаж
Метры
...
```

без связи с запросом.

Правильно:

```text
Что важно пользователю
↓
Как каждый объект проходит это условие
↓
Какой компромисс возникает
↓
Что подтверждено
↓
Что остаётся неизвестным
```

---

# 7. Comparison Size

Поддержать:

```text
minimum: 2
maximum: 4
```

Если выбран один объект:

показывать state:

```text
Добавьте ещё один вариант для сравнения.
```

---

# 8. Comparison Selection

Selection должна использовать stable IDs:

```text
property_id
selected_offer_id
purchase_scenario_id
```

Не хранить whole object snapshots в URL/local state без необходимости.

---

# 9. No Duplicate Property

Один и тот же `Property` не должен появляться дважды в comparison только из-за двух Offer.

Если пользователь хочет сравнить разные Offer одного Property, это должен быть отдельный явно предусмотренный режим, не основной comparison объектов.

Для TASK-011 сравниваем физические Property с выбранным Offer/Scenario.

---

# 10. Comparison Input Contract

Рекомендуемый input:

```yaml
comparison_input:
  user_request:
  items:
    - property:
      selected_offer:
      selected_purchase_scenario:
      match_result:
      data_quality:
      evidence:
  created_at:
```

---

# 11. Comparison View Model

Создать pure presentation contract, например:

```yaml
comparison_view:
  request_summary:
  columns:
  rows:
  decision_drivers:
  tradeoffs:
  critical_unknowns:
  conclusion:
```

---

# 12. Column Model

Каждая колонка — один объект.

Минимум:

```text
property_id
title
property_type
price
match_score
confidence_status
selected_offer
selected_purchase_scenario
```

---

# 13. Row Model

Каждая строка должна содержать:

```text
criterion / decision dimension
user target
importance
value/status per property
verification
freshness
comparison state
```

---

# 14. Compare by UserRequest First

Порядок строк должен начинаться с критериев пользователя:

1. must;
2. preferred;
3. avoid;
4. затем важные общие факты.

Не начинать с developer-defined property specs.

---

# 15. Must Criteria Section

Отдельно показать:

```text
Обязательные условия
```

Для каждого объекта:

- pass;
- critical unknown;
- conflict;
- hard fail.

---

# 16. Hard Fail Visibility

Если hard-fail объект попал в comparison через direct action:

не скрывать.

Показывать:

```text
Не проходит обязательное условие
```

и конкретную причину.

---

# 17. Preferred Criteria Section

Отдельно:

```text
Желательные условия
```

Здесь показываются:

- matched;
- partially matched;
- not matched;
- unknown.

---

# 18. Avoid Criteria

Показывать как:

```text
Лучше избежать
```

и сохранять отличие от `exclude`.

---

# 19. Neutral Criteria

Не обязаны занимать центральное место.

Можно показать ниже как facts, если они полезны.

---

# 20. Cross-type Comparison

Comparison должен позволять:

```text
new-build apartment
vs
secondary apartment
vs
house
```

Не требовать одинакового набора физических полей.

---

# 21. Common Decision Dimensions

Для cross-type сравнивать через общие последствия:

- Match Score;
- listing price;
- total entry cost;
- initial payment;
- monthly payment;
- move-in timing;
- usable area;
- commute;
- school access;
- condition/readiness;
- Data Confidence;
- critical unknowns.

---

# 22. Type-specific Facts

Дополнительные строки могут быть:

Apartment:

```text
floor
elevator
balcony
```

House:

```text
land area
gas
road access
```

Если поле не применимо:

```text
not_applicable
```

а не false.

---

# 23. Not Applicable UI

Показывать:

```text
Не относится к этому типу объекта
```

или compact symbol/label.

Не показывать:

```text
Нет
```

---

# 24. Match Score Comparison

Для каждого объекта:

```text
92% подходит
87% подходит
81% подходит
```

Это user-specific fit.

Не называть «рейтинг объекта».

---

# 25. Data Confidence Comparison

Показывать отдельно:

```text
Высокая
Средняя
Требует проверки
```

---

# 26. High Match + Low Confidence

Comparison должен ясно поддерживать ситуацию:

```text
A: Match 94%, Confidence low
B: Match 89%, Confidence high
```

Не выбирать A автоматически как «лучший».

---

# 27. PurchaseScenario Comparison

Для каждого объекта использовать конкретный selected scenario.

Показывать минимум:

- price;
- initial payment;
- monthly payment;
- program;
- term;
- mandatory costs;
- total entry cost, если есть;
- verification.

---

# 28. No Frankenstein Comparison

Нельзя для одной колонки взять:

```text
price from Offer A
monthly payment from Scenario B
promotion from Offer C
```

если они несовместимы.

---

# 29. Selected Scenario Label

Ясно показать:

```text
Сценарий покупки
```

и какой именно Offer/Program он использует.

---

# 30. Alternative Scenario Hook

Можно предусмотреть action:

```text
Сменить сценарий покупки
```

если у Property несколько валидных PurchaseScenario.

Полный scenario explorer не обязателен.

---

# 31. Decision Drivers

Создать structured блок:

```text
Что сильнее всего отличает эти варианты
```

Он строится deterministic из comparison rows.

---

# 32. Decision Driver Definition

`decision_driver` — критерий/измерение, где:

- высокая user importance;
- существенная разница между объектами;
- или критичный unknown/conflict.

---

# 33. Decision Driver Example

```yaml
decision_driver:
  criterion_id: monthly_payment
  importance: must
  spread:
    min: 58000
    max: 76000
  impact: high
```

---

# 34. Trade-offs

Сформировать structured trade-offs.

Пример:

```text
A дешевле на входе, но дальше от школы.
B дороже, но можно въехать сразу.
```

TASK-011 может формировать templates на основе codes/params.

Не нужен LLM.

---

# 35. No Universal Winner

Comparison не обязана выбирать один объект как winner.

Допустимые conclusion statuses:

```text
clear_leader
conditional_leader
near_tie
insufficient_data
no_valid_option
```

---

# 36. Conclusion Contract

Например:

```yaml
comparison_conclusion:
  status:
  leading_property_id:
  alternative_property_id:
  decision_drivers:
  conditions:
  unresolved_questions:
```

---

# 37. Clear Leader

Можно использовать только если:

- нет hard fail;
- confidence достаточен;
- один объект устойчиво сильнее по high-importance criteria.

Точная логика должна быть deterministic/configurable.

---

# 38. Conditional Leader

Пример:

```text
Вариант A выглядит сильнее, если подтвердится ПВ 0.
```

---

# 39. Near Tie

Если различия малы или trade-offs противоположны:

```text
near_tie
```

Это нормальный результат.

---

# 40. Insufficient Data

Если выбор зависит от неизвестного critical field:

не делать definitive conclusion.

---

# 41. No Valid Option

Если все сравниваемые объекты имеют hard fail:

показать:

```text
Ни один вариант не проходит все обязательные условия.
```

Не выбирать «лучший из плохих» автоматически.

---

# 42. Critical Unknowns Block

Отдельный блок:

```text
Что нужно проверить перед выбором
```

Сгруппировать по property.

---

# 43. Conflict Comparison

Пример:

```text
A — цена подтверждена
B — цена расходится между источниками
```

Это должно быть видно рядом с row.

---

# 44. Freshness

Для dynamic rows показывать freshness indicator.

Особенно:

- price;
- availability;
- financing;
- promotions.

---

# 45. No Silent Stale Data

Если один объект имеет stale price:

это должно быть заметно.

---

# 46. Row Ordering

Рекомендуемый порядок:

```text
1. Match / Confidence
2. Must criteria
3. Finance
4. Timing
5. Property fit
6. Location / mobility
7. Infrastructure
8. Type-specific facts
9. Unknowns / conflicts
```

Но фактический порядок должен учитывать UserRequest priority.

---

# 47. Comparison Highlights

UI может визуально подсвечивать:

- best confirmed value;
- hard fail;
- critical unknown.

Но «best» только внутри user criterion.

---

# 48. No Best Highlight for Irrelevant Fields

Не подсвечивать «самая большая площадь» как преимущество, если площадь не важна пользователю и не является decision dimension.

---

# 49. Comparison Header

Показать:

```text
Сравнение вариантов
```

и краткий request summary.

---

# 50. Request Summary

Пример:

```text
До 5 млн ₽ · семейная ипотека обязательно · въехать до сентября · школа желательно рядом
```

---

# 51. Edit Conditions CTA

Добавить:

```text
Изменить условия
```

---

# 52. Remove from Comparison

Каждый объект можно удалить.

Если остаётся 1:

переходим в incomplete comparison state.

---

# 53. Add Another Object

Если объектов < 4:

CTA:

```text
Добавить ещё вариант
```

возвращает в shortlist.

---

# 54. Back to Shortlist

Обязательная navigation.

---

# 55. Property Detail Link

Из заголовка/CTA каждой колонки можно открыть detail page.

---

# 56. Expert Choice Assistance Hook

Если comparison имеет 2–4 финалиста:

можно показать CTA:

```text
Помочь выбрать между этими вариантами
```

Он должен передать:

- `comparison_id`;
- property IDs;
- UserRequest;
- critical unknowns.

Если expert workflow ещё не реализован, action может быть placeholder только если scope это допускает.

---

# 57. No Generic Expert Lead

Не:

```text
Нужна консультация? Оставьте телефон.
```

Правильно:

```text
Разобрать именно эти варианты вместе.
```

---

# 58. View Model Builder

Создать pure function:

```ts
buildComparisonView(...)
```

Она:

- не вызывает LLM;
- не пересчитывает MatchResult;
- не пересчитывает DataConfidence;
- нормализует presentation structure.

---

# 59. Decision Driver Builder

Создать pure deterministic function:

```ts
buildDecisionDrivers(...)
```

---

# 60. Conclusion Builder

Создать:

```ts
buildComparisonConclusion(...)
```

с config-driven rules.

Не делать conclusion внутри React component.

---

# 61. Explanation Registry Reuse

Использовать общий explanation registry из TASK-009/010.

Не создавать новые тексты для тех же codes в разных местах.

---

# 62. Comparison Formatting Registry

Для row types:

```text
money
percent
duration
distance
date
boolean
categorical
status
```

создать централизованные formatters.

---

# 63. Responsive Desktop

Desktop может использовать comparison table/grid.

Важно:

- sticky property headers допустимы;
- horizontal readability;
- 2–4 columns.

---

# 64. Responsive Mobile

На mobile широкая таблица плохо работает.

Допустимые варианты:

- horizontally scrollable columns with sticky row labels;
- stacked criterion-by-criterion cards;
- switch between 2 selected items.

Нужно выбрать один понятный MVP pattern.

---

# 65. Mobile Must Preserve Comparison

Не превращать mobile version в отдельные карточки без возможности увидеть различие рядом.

---

# 66. Accessibility

Минимум:

- table semantics если используется table;
- headers связаны с cells;
- status not color-only;
- keyboard controls;
- remove/add buttons accessible;
- horizontally scrollable region keyboard/assistive-tech usable.

---

# 67. Empty State

0 selected:

```text
Выберите минимум два варианта для сравнения.
```

CTA в shortlist.

---

# 68. One Item State

1 selected:

```text
Добавьте ещё один вариант.
```

---

# 69. Four Item Limit

При 4 выбранных объектах:

```text
Добавить ещё
```

disabled/hidden.

Если user пытается добавить пятый:

controlled message.

---

# 70. Invalid Item

Если один selected property unavailable/missing:

не ломать весь comparison.

Показать error state для конкретной колонки и предложить удалить/заменить.

---

# 71. Changed Availability

Если объект стал unavailable между shortlist и comparison:

пометить явно.

Не продолжать показывать как нормального финалиста.

---

# 72. Stale Comparison State

Если underlying MatchResult версия устарела относительно UserRequest:

не показывать старую персонализацию как актуальную.

Нужен controlled application state:

```text
Условия изменились — пересчитайте сравнение.
```

Если такой pipeline ещё не реализован, хотя бы валидировать matching `user_request_id/version`.

---

# 73. UserRequest Version

Comparison должен быть связан с конкретным confirmed request version/id.

Не смешивать MatchResults от разных запросов.

---

# 74. Test Fixtures

Использовать Pilot Dataset comparison groups:

1. new-build vs secondary;
2. apartment vs house;
3. cheap uncertain vs expensive confirmed;
4. two close finalists;
5. all hard fail;
6. financing-driven difference.

---

# 75. Component Tests

Минимум:

1. renders 2 columns;
2. renders 4 columns;
3. prevents fifth item;
4. shows must criteria first;
5. hard fail visible;
6. unknown visible;
7. not_applicable not shown as false;
8. Match and Confidence separate;
9. PurchaseScenario values tied to correct property;
10. conflict visible;
11. stale visible;
12. remove object works;
13. one-item state works;
14. cross-type rows work;
15. mobile layout remains usable.

---

# 76. Integration Test

Минимальный flow:

```text
Shortlist
→ add Property A
→ add Property B
→ open Comparison
→ verify shared UserRequest
→ inspect must/soft rows
→ remove B
→ add C
→ open Property Detail
→ back to Comparison
```

---

# 77. No LLM Requirement

Comparison logic и conclusion v1 должны быть deterministic.

LLM может позже использовать structured conclusion для natural-language explanation.

---

# 78. No New Ranking Formula

Comparison не должна создавать новый hidden score.

Использовать:

- MatchResult;
- DataQuality;
- decision-driver rules.

---

# 79. No Commercial Influence

Не учитывать:

- commissions;
- partner sources;
- ad priority.

---

# 80. No Forced Winner

Если `near_tie` или `insufficient_data`:

так и показать.

---

# 81. Analytics Hooks

Можно предусмотреть:

```text
comparison_opened
comparison_item_added
comparison_item_removed
comparison_detail_opened
choice_assistance_clicked
```

Не подключать vendor.

---

# 82. Performance

Для 2–4 объектов comparison должен строиться локально из подготовленных данных.

Не запускать crawling при render.

---

# 83. Acceptance Criteria

TASK-011 считается завершённой, если:

1. comparison page существует;
2. поддерживает 2–4 Property;
3. связан с одним confirmed UserRequest;
4. must criteria видны первыми;
5. preferred/avoid отображаются отдельно;
6. hard fail не скрывается;
7. unknown/conflict видны;
8. not_applicable корректен;
9. Match Score и Confidence разделены;
10. PurchaseScenario сравниваются корректно;
11. Frankenstein scenario невозможен;
12. cross-type comparison работает;
13. decision drivers формируются;
14. trade-offs формируются;
15. conclusion поддерживает clear/conditional/near-tie/insufficient/no-valid;
16. winner не навязывается при недостатке данных;
17. add/remove работает;
18. limit 4 соблюдается;
19. mobile comparison usable;
20. accessibility basics выполнены;
21. component tests проходят;
22. integration test проходит;
23. typecheck/lint/test/build проходят.

---

# 84. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

---

# 85. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Route:
Comparison state:
View model:
Decision drivers:
Conclusion rules:
Cross-type behavior:
Components:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 86. Do Not Continue Automatically

После TASK-011:

**не начинать следующую задачу самостоятельно.**

---

# 87. Likely Next Task

Следующая логичная задача:

```text
TASK-012 — User URL Ingestion
```

Она позволит пользователю добавить найденный самостоятельно объект в ту же normalized comparison pipeline.

---

# 88. Definition of Done

TASK-011 Done, когда пользователь может поставить рядом 2–4 реальных финалиста и понять:

- какой лучше проходит обязательные условия;
- какой сильнее по предпочтениям;
- сколько и как придётся платить;
- где trade-off;
- где данные слабее;
- какие вопросы мешают принять решение.

---

# 89. Главный принцип для coding-agent

Comparison — это не таблица характеристик.

Правильная модель:

```text
UserRequest
      +
2–4 MatchResult
      +
PurchaseScenarios
      +
DataConfidence
      ↓
Decision Matrix
      ↓
Decision Drivers
      ↓
Trade-offs
      ↓
Conditional / Clear / Near-tie Conclusion
```

Главное правило:

> **Сравнивать нужно не объекты вообще, а последствия выбора каждого объекта для конкретного пользователя.**
