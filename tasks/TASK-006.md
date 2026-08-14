# TASK-006 — Criteria Registry & Evaluators

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone B — Deterministic Core`

---

# 1. Goal

Реализовать центральный **Criteria Registry** и набор детерминированных evaluators, которые будут использоваться будущим Matching Engine.

Задача должна превратить пользовательские критерии из `UserRequest` в единообразно обрабатываемые правила:

```text
Criterion
↓
Evaluator
↓
Actual Property / PurchaseScenario Data
↓
CriterionEvaluationResult
```

Главный результат:

> одинаковый criterion должен оцениваться одинаково во всём продукте и не зависеть от конкретного UI-компонента, LLM-формулировки или случайного source adapter.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-002.md
tasks/TASK-003.md
tasks/TASK-005.md

docs/04-data/user-request-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md

docs/05-matching/matching-logic.md
docs/05-matching/hard-soft-criteria.md
docs/05-matching/confidence-status.md

docs/08-roadmap/implementation-plan.md
```

---

# 3. Dependencies

TASK-006 предполагает наличие formal contracts из TASK-002 и pilot fixtures из TASK-005.

Минимум должны существовать:

```text
Criterion
CriterionEvaluationResult
UserRequest
Property
Offer
PurchaseScenario
FieldEvidence / DataQuality-related contracts
```

Если TASK-002 ещё не выполнена в коде:

```text
TASK-006 is blocked
```

Если TASK-005 ещё не выполнена:

допустимо реализовать registry/evaluators на небольших unit fixtures, но benchmark integration должен быть отмечен как blocked, а не имитирован.

---

# 4. In Scope

Реализовать:

1. Criteria Registry;
2. evaluator interface;
3. reusable evaluator types;
4. criteria-specific mappings;
5. hard/soft priority semantics;
6. unknown/conflict/not-applicable handling;
7. fit result 0..1 для soft criteria;
8. hard failure semantics;
9. human-readable structured explanation data;
10. unit tests;
11. integration tests на Pilot Dataset.

---

# 5. Out of Scope

Не реализовывать в TASK-006:

- итоговый Match Score;
- ranking shortlist;
- Data Confidence aggregation;
- property search;
- UI;
- LLM explanation generation;
- constraint relaxation;
- source collection;
- database persistence.

TASK-006 оценивает **отдельный criterion**, а не весь объект.

---

# 6. Core Architecture

Правильная архитектура:

```text
Criterion
      ↓
Criteria Registry
      ↓
Criterion Definition
      ↓
Evaluator
      ↓
Evaluation Context
      ↓
CriterionEvaluationResult
```

---

# 7. Criteria Registry

Создать единый registry, например:

```ts
criteriaRegistry
```

или эквивалент.

Он должен связывать:

```text
criterion key
→ category
→ supported operators
→ evaluator type
→ applicable entity/property types
→ value parser/normalizer
→ unit
→ default UI label metadata if needed
→ source/freshness requirement metadata
```

---

# 8. No Scattered Business Logic

Запрещено:

```ts
if (criterion.field === "budget.price_max") { ... }
```

в десятках разных modules.

Field-specific rules должны быть централизованы.

---

# 9. Criterion Definition Contract

Рекомендуемая форма:

```yaml
criterion_definition:
  key:
  category:
  evaluator_type:
  supported_operators:
  applicable_property_types:
  source_requirement:
  freshness_requirement:
  unit:
  supports_tolerance:
  supports_soft_curve:
```

Названия могут отличаться, если semantics сохранены.

---

# 10. Evaluator Interface

Рекомендуемый interface:

```ts
evaluateCriterion({
  criterion,
  context
}): CriterionEvaluationResult
```

`context` должен иметь доступ только к необходимым normalized данным.

---

# 11. Evaluation Context

Минимум:

```text
Property
Offer
PurchaseScenario
relevant Evidence / verification status
current time
```

Не передавать evaluator весь application state.

---

# 12. Evaluator Types

Поддержать минимум:

- `boolean`
- `exact`
- `set`
- `min`
- `max`
- `range`
- `distance`
- `travel_time`
- `date`
- `categorical`
- `financial`
- `applicability`
- `derived`

Если TASK-002 использует другие naming conventions, следовать formal contract.

---

# 13. Criterion Status

`CriterionEvaluationResult.status` должен поддерживать:

```text
matched
partially_matched
not_matched
unknown
conflicting
not_applicable
hard_failed
```

---

# 14. Priority Semantics

Поддержать:

```text
must
preferred
neutral
avoid
exclude
unknown
```

Evaluator не должен сам менять priority.

Он получает priority уже подтверждённым из UserRequest.

---

# 15. Must

Если:

```text
priority = must
```

и факт подтверждённо нарушает условие:

```text
status = hard_failed
```

Soft fit не может компенсировать этот результат в будущей задаче.

---

# 16. Exclude

`exclude` — hard stop.

Пример:

```text
first floor = excluded
actual floor = 1
```

→ `hard_failed`.

---

# 17. Preferred

Для `preferred` evaluator возвращает:

```text
fit: 0..1
```

и semantic status.

---

# 18. Avoid

`avoid` — сильное отрицательное предпочтение, но не hard fail.

Пример:

```text
first floor = avoid
actual floor = 1
```

→ `not_matched` / low fit

но не `hard_failed`.

---

# 19. Neutral

`neutral` criterion не должен существенно влиять на будущий Match Score.

Evaluator может:

- вернуть фактическое сравнение;
- либо `not_applicable` для scoring.

Нельзя трактовать `neutral` как preference.

---

# 20. Unknown Priority

Если priority = `unknown`:

criterion не должен участвовать в definitive scoring до подтверждения пользователя.

---

# 21. Unknown Data Semantics

Критическое правило:

```text
unknown != fail
unknown != pass
```

Если actual value отсутствует:

```text
status = unknown
```

---

# 22. Must + Unknown

Если hard criterion unknown:

не ставить `matched`.

Не ставить `hard_failed`.

Вернуть:

```text
status = unknown
is_critical_unknown = true
```

или эквивалент в formal contract.

---

# 23. Conflicting Data

Если relevant field имеет unresolved conflict:

```text
status = conflicting
```

Если criterion must:

он становится critical conflict для будущего Matching Engine.

---

# 24. Stale Data

Stale не обязательно означает `unknown`.

Пример:

```text
price = 4.9m
verification = confirmed
freshness = stale
```

Criterion evaluator может вычислить numeric comparison, но result должен сохранить:

```text
freshness_status = stale
```

И не повышать verification semantics самостоятельно.

Data Confidence будет агрегироваться позже.

---

# 25. Claimed Data

Если:

```text
family mortgage = claimed
```

и criterion must:

Evaluator не должен возвращать окончательный `matched`.

Результат:

```text
status = unknown / partially_matched
verification_status = claimed
```

Конкретный status выбрать в соответствии с docs и formal contract, но must не должен считаться подтверждённо пройденным.

---

# 26. Not Applicable

Пример:

```text
elevator criterion
property_type = land
```

→ `not_applicable`

Не:

```text
false
```

---

# 27. Boolean Evaluator

Примеры:

- elevator;
- balcony;
- parking;
- gas connected;
- ready now.

Поддержать:

```text
required true
required false
unknown actual
not applicable
```

---

# 28. Exact Evaluator

Пример:

```text
rooms = 2
```

Actual:

```text
2 → matched
3 → not_matched / hard_failed depending priority
unknown → unknown
```

---

# 29. Set Evaluator

Пример:

```text
property_type ∈ {apartment, house}
```

Cross-type request должен работать без forced single value.

---

# 30. Min Evaluator

Пример:

```text
area >= 70
```

Actual:

```text
82 → matched
65 → fail or partial depending priority/tolerance
```

---

# 31. Max Evaluator

Пример:

```text
price <= 5_000_000
```

Для hard budget:

```text
4_900_000 → matched
5_100_000 → hard_failed
```

---

# 32. Range Evaluator

Пример:

```text
area 60..80
```

Поддержать:

- inclusive bounds;
- open min;
- open max.

---

# 33. Distance Evaluator

Пример:

```text
school <= 1000 m
```

Не вычислять расстояние внутри evaluator, если normalized distance отсутствует.

Evaluator оценивает готовый normalized value.

---

# 34. Travel Time Evaluator

Пример:

```text
office commute <= 40 min
```

Контекст должен различать:

- destination;
- transport mode;
- travel time value.

Не использовать `distance` как silent substitute for `travel_time`.

---

# 35. Date Evaluator

Пример:

```text
move_in_date <= deadline
```

Не подменять:

```text
handover date
```

на:

```text
construction completion date
```

если criterion относится к move-in.

---

# 36. Financial Evaluator

Для:

- listing price;
- total entry cost;
- initial payment;
- monthly payment.

Должен оценивать **PurchaseScenario**, когда criterion относится к способу покупки.

---

# 37. Property Price vs Purchase Scenario

Пример:

User:

```text
ежемесячный платёж <= 80k
```

Нельзя оценивать Property.listing_price.

Нужно:

```text
PurchaseScenario.monthly_payment
```

---

# 38. Zero Down

Criterion:

```text
zero_initial_payment
```

оценивается по конкретному PurchaseScenario / PropertyFinancingEligibility.

Не по рекламному banner property.

---

# 39. Financing Program

Criterion:

```text
family mortgage must
```

должен оцениваться через:

```text
PropertyFinancingEligibility / PurchaseScenario
```

а не через:

```text
property.financing.family_mortgage_available = guessed true
```

---

# 40. Categorical Evaluator

Пример:

```text
finishing_type = pre_finish OR finished
```

Поддержать allowed set.

---

# 41. Derived Evaluator

Для полей, которые уже рассчитаны отдельным trusted layer.

Пример:

```text
estimated_total_entry_cost
```

Evaluator не должен сам пересчитывать стоимость ремонта или платежи.

---

# 42. Soft Fit

Для soft criterion fit:

```text
0.0 → полностью не подходит
1.0 → полностью подходит
```

---

# 43. Exact Soft Fit

Для preferred exact criterion:

```text
matched → 1
not matched → 0
```

если нет более подходящей partial semantics.

---

# 44. Continuous Soft Fit

Для numeric preferred criteria можно использовать curve.

Пример:

```text
желательно до 30 минут
```

30 → 1

35 → lower fit

60 → near 0

Но конкретные curve parameters должны быть centralized/configurable.

---

# 45. No Arbitrary Production Curves

TASK-006 может реализовать test/configurable curves.

Нельзя объявлять случайные coefficients окончательной продуктовой логикой.

Если нужны initial defaults для tests:

- пометить `provisional`;
- хранить в config;
- покрыть tests.

---

# 46. Tolerance

Если UserRequest criterion содержит explicit tolerance:

Evaluator должен её уважать.

Пример:

```text
около 70 м²
```

если parser уже формализовал tolerance.

Evaluator не должен сам придумывать tolerance.

---

# 47. Hard Boundary

Для must criterion:

```text
price <= 5m
```

5,000,001 не должен считаться «почти подходит», если user не указал гибкость.

---

# 48. Soft Boundary

Для preferred:

```text
желательно до 5m
```

может использовать continuous fit.

---

# 49. Price From

Если Offer имеет:

```text
price_from = true
```

и нет exact price конкретного unit:

hard budget criterion не должен считаться подтверждённо пройденным.

Вернуть:

```text
unknown / insufficient exact value
```

с explanation code.

---

# 50. Availability

Если Offer:

```text
sold
```

он не должен проходить criterion availability.

Но availability может быть handled будущим pre-filter layer.

TASK-006 должна иметь хотя бы reusable evaluator/result semantics, если availability присутствует как criterion.

---

# 51. Source Requirements

Criterion Definition может указывать:

```text
source_requirement
```

Пример:

финансовое eligibility требует stronger evidence, чем balcony preference.

Evaluator не должен сам рассчитывать общий DataConfidence, но должен передать verification metadata дальше.

---

# 52. Freshness Requirements

Criterion Definition может указывать:

```text
freshness_requirement
```

Например:

```text
price → dynamic
availability → very dynamic
area → static
```

Evaluator возвращает actual freshness status.

---

# 53. CriterionEvaluationResult

Минимум:

```yaml
criterion_id:
criterion_key:
priority:
status:
fit:
actual:
target:
margin:
verification_status:
freshness_status:
evidence_refs:
is_hard:
is_critical_unknown:
is_critical_conflict:
explanation_code:
explanation_params:
```

Согласовать с TASK-002 schema.

---

# 54. Explanation Code

Не генерировать final prose в evaluator.

Возвращать structured codes.

Примеры:

```text
PRICE_WITHIN_LIMIT
PRICE_OVER_HARD_LIMIT
PRICE_EXACT_UNKNOWN
MONTHLY_PAYMENT_WITHIN_LIMIT
PROGRAM_APPLICABILITY_CLAIMED
FIRST_FLOOR_EXCLUDED
SCHOOL_DISTANCE_UNKNOWN
NOT_APPLICABLE_TO_PROPERTY_TYPE
```

---

# 55. Explanation Params

Пример:

```yaml
explanation_code: PRICE_OVER_HARD_LIMIT
explanation_params:
  actual: 5100000
  target: 5000000
  difference: 100000
```

Позже LLM/UI сможет сформулировать текст.

---

# 56. No LLM in Evaluators

TASK-006 полностью deterministic.

Запрещено:

```text
send criterion + property to LLM
→ ask "does it fit?"
```

---

# 57. Same Input → Same Output

Обязательный invariant:

```text
same Criterion
+
same Evaluation Context
→
same CriterionEvaluationResult
```

---

# 58. Criteria Categories

Минимальные группы:

```text
finance
property
timeline
location
infrastructure
mobility
condition
utilities
availability
```

---

# 59. MVP Criteria Registry — Finance

Минимум:

- `price_max`
- `total_entry_cost_max`
- `initial_payment_max`
- `zero_initial_payment`
- `monthly_payment_max`
- `financing_program`

---

# 60. MVP Criteria Registry — Property

Минимум:

- `property_type`
- `market_type`
- `rooms`
- `area_min`
- `area_max`
- `floor_min`
- `floor_max`
- `first_floor`
- `top_floor`
- `elevator`
- `balcony`
- `finishing_type`

---

# 61. MVP Criteria Registry — Timeline

Минимум:

- `ready_now`
- `move_in_deadline`
- `handover_deadline`

---

# 62. MVP Criteria Registry — Location

Минимум:

- `city`
- `district`
- `excluded_location`

Не реализовывать geo discovery в evaluator.

---

# 63. MVP Criteria Registry — Mobility

Минимум:

- `travel_time_max`
- `distance_max`

---

# 64. MVP Criteria Registry — Infrastructure

Минимум:

- `school_distance_max`
- `kindergarten_distance_max`
- `park_distance_max`
- `transport_distance_max`

---

# 65. MVP Criteria Registry — House / Utilities

Минимум:

- `land_area_min`
- `gas_connected`
- `water_connected`
- `electricity_connected`
- `road_access`

---

# 66. Applicability Matrix

Некоторые criteria применимы только к части property types.

Пример:

```text
land_area_min
→ house, townhouse, land
```

```text
elevator
→ apartment/apartments
```

Registry должен хранить это явно.

---

# 67. Correlated Criteria

Заложить возможность `criterion_group_id`.

Пример:

```text
school_distance
school_walk_time
```

могут описывать один пользовательский смысл.

TASK-006 не обязана реализовывать full anti-double-counting, но contract должен позволять future aggregation.

---

# 68. Evaluator Resolution

Нужен единый механизм:

```ts
resolveEvaluator(criterion)
```

Не выбирать evaluator вручную в Matching Engine.

---

# 69. Unknown Criterion Key

Если registry не знает criterion:

не игнорировать молча.

Вернуть controlled error / unsupported result.

---

# 70. Unsupported Criterion

Допустимый result:

```text
UNSUPPORTED_CRITERION
```

Это лучше, чем accidental zero fit.

---

# 71. Unit Handling

Numeric evaluator должен знать unit.

Не сравнивать:

```text
meters
vs
minutes
```

или:

```text
RUB
vs
percentage
```

---

# 72. Money Handling

Использовать domain Money contract TASK-002.

Не сравнивать formatted strings.

---

# 73. Percentage Handling

Проценты должны иметь единый representation.

Например:

```text
20
```

или:

```text
0.20
```

но не оба варианта одновременно.

Следовать TASK-002 contract.

---

# 74. Time Handling

Travel time:

```text
minutes
```

или formal duration type.

Не хранить `"40 мин"` внутри evaluator.

---

# 75. Dates

Использовать normalized dates/timestamps.

Не сравнивать raw strings.

---

# 76. Pilot Dataset Integration

Использовать TASK-005 benchmark cases.

Минимум проверить:

- strict budget pass/fail;
- first floor exclude;
- zero-down claimed;
- family mortgage unknown;
- move-in hard fail;
- gas unknown;
- property type cross-type;
- not-applicable elevator;
- price_from exact unknown.

---

# 77. Hard-fail Test Cases

Обязательно:

1. price over strict max;
2. first floor excluded;
3. move-in after deadline;
4. required gas confirmed absent;
5. required financing program confirmed not eligible.

---

# 78. Critical Unknown Test Cases

Обязательно:

1. exact price missing;
2. family mortgage only claimed;
3. gas unknown;
4. travel time missing;
5. hard criterion conflicting.

---

# 79. Soft Test Cases

Обязательно:

1. preferred price slightly above target;
2. preferred commute slightly above target;
3. avoid first floor;
4. preferred finishing mismatch;
5. preferred area partial fit.

---

# 80. Not Applicable Test Cases

Минимум:

```text
elevator vs land
balcony vs house if model marks it not applicable
land area vs apartment
```

---

# 81. Cross-type Test

Criterion:

```text
property_type ∈ {apartment, house}
```

Оба типа должны пройти.

Не отдавать скрытый bonus одному типу.

---

# 82. Conflict Test

Если:

```text
price evidence A != price evidence B
status = conflicting
```

hard price criterion не должен считаться definitive pass.

---

# 83. Stale Test

Если stale exact price:

numeric comparison может быть рассчитан, но:

```text
freshness_status = stale
```

обязательно сохраняется.

---

# 84. Claimed Financing Test

Если promotion заявляет zero-down, но eligibility не подтверждена:

```text
must zero-down
```

не проходит как confirmed match.

---

# 85. Test Curve Config

Если soft curves нужны:

создать config, например:

```text
matching/criteria-config
```

с provisional values.

Не прятать coefficients внутри evaluator functions.

---

# 86. Evaluator Unit Tests

Для каждого evaluator type нужны tests:

- matched;
- not matched;
- unknown;
- conflicting where applicable;
- hard semantics;
- soft semantics;
- not applicable.

---

# 87. Registry Tests

Проверить:

- unique criterion keys;
- evaluator exists;
- supported operator valid;
- unit defined where required;
- applicability defined;
- no duplicate aliases.

---

# 88. Contract Validation

Каждый `CriterionEvaluationResult` должен валидироваться schema TASK-002.

---

# 89. Error Handling

Не бросать generic uncaught errors на normal domain states:

```text
unknown
conflicting
not_applicable
```

Это обычные результаты.

Errors нужны для:

- malformed criterion;
- unsupported operator;
- missing registry definition;
- invalid unit.

---

# 90. Observability Hooks

Допустимо вернуть internal diagnostic metadata:

```text
evaluator_version
registry_version
```

Это пригодится для MatchResult audit.

---

# 91. Versioning

Criteria Registry должен иметь version:

```text
criteria-registry-v1
```

Evaluator logic должна иметь version или общий matching algorithm version hook.

---

# 92. No Global Property Quality

Запрещено добавлять criteria:

```text
good_floor
good_district
prestige
quality_score
```

без UserRequest-derived semantics.

---

# 93. No Commercial Bias

Registry не должен содержать критерии:

```text
partner_priority
commission
ad_boost
```

которые влияют на fit.

---

# 94. No Hidden New-build Bonus

Нельзя:

```text
if new_build → +0.1 fit
```

если пользователь не просил новостройку.

---

# 95. No Hidden Risk Penalty in Fit

Data uncertainty и risk могут позже влиять на internal ranking, но не должны молча менять criterion fit, если criterion относится к другой характеристике.

Пример:

```text
price matched
```

остаётся price matched даже при low confidence.

Confidence хранится отдельно.

---

# 96. Output Examples

Пример hard pass:

```json
{
  "criterion_id": "crit_price",
  "status": "matched",
  "fit": 1,
  "actual": 4890000,
  "target": 5000000,
  "verification_status": "confirmed",
  "freshness_status": "fresh",
  "explanation_code": "PRICE_WITHIN_LIMIT"
}
```

---

# 97. Output Example — Critical Unknown

```json
{
  "criterion_id": "crit_family_mortgage",
  "status": "unknown",
  "fit": null,
  "verification_status": "claimed",
  "is_critical_unknown": true,
  "explanation_code": "PROGRAM_APPLICABILITY_CLAIMED"
}
```

---

# 98. Output Example — Hard Fail

```json
{
  "criterion_id": "crit_floor",
  "status": "hard_failed",
  "fit": 0,
  "actual": 1,
  "target": "not_first_floor",
  "verification_status": "confirmed",
  "explanation_code": "FIRST_FLOOR_EXCLUDED"
}
```

---

# 99. Output Example — Not Applicable

```json
{
  "criterion_id": "crit_elevator",
  "status": "not_applicable",
  "fit": null,
  "actual": null,
  "target": true,
  "explanation_code": "NOT_APPLICABLE_TO_PROPERTY_TYPE"
}
```

---

# 100. Recommended Code Structure

Например:

```text
src/
  matching/
    criteria/
      registry.ts
      types.ts
      evaluators/
        boolean.ts
        exact.ts
        numeric.ts
        set.ts
        date.ts
        financial.ts
        distance.ts
        travel-time.ts
        applicability.ts
      config/
        soft-curves.ts
```

Имена могут отличаться.

---

# 101. No UI Dependencies

Matching domain layer не должен импортировать React/UI modules.

---

# 102. No Source Adapter Dependencies

Evaluator работает с normalized domain data.

Не импортировать parser конкретного сайта.

---

# 103. No LLM Dependencies

Evaluator module не должен требовать OpenAI client.

---

# 104. Acceptance Criteria

TASK-006 считается завершённой, если:

1. существует единый Criteria Registry;
2. criterion keys уникальны;
3. evaluator interface формализован;
4. основные evaluator types реализованы;
5. hard semantics работают;
6. soft fit работает;
7. avoid отличается от exclude;
8. unknown отличается от fail/pass;
9. claimed financing не считается confirmed match;
10. conflicting hard criterion не считается pass;
11. stale metadata сохраняется;
12. not_applicable поддерживается;
13. cross-type criteria работают;
14. financial criteria используют PurchaseScenario;
15. price_from не проходит exact hard budget;
16. explanation codes structured;
17. registry versioned;
18. evaluator output валидируется schema;
19. unit tests проходят;
20. Pilot Dataset integration tests проходят;
21. typecheck/lint/build проходят.

---

# 105. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан отдельный benchmark command:

```text
<package-manager> test:matching-criteria
```

или эквивалент.

---

# 106. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Registry version:
Criteria implemented:
Evaluator types:
Config:
Pilot benchmark cases:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 107. Out of Scope Reminder

TASK-006 не должна рассчитывать:

```text
overall Match Score
```

даже если individual fits уже существуют.

Итоговая агрегация — следующая отдельная задача.

---

# 108. Do Not Continue Automatically

После TASK-006:

**не начинать следующую задачу самостоятельно.**

---

# 109. Likely Next Task

Следующая логичная задача:

```text
TASK-007 — Matching Engine v1
```

Она объединит:

```text
Hard Gate
+
CriterionEvaluationResults
+
PurchaseScenario Eligibility
+
Weighted Soft Matching
+
MatchResult
```

---

# 110. Definition of Done

TASK-006 Done, когда любая поддерживаемая пользовательская характеристика из MVP может пройти единый deterministic evaluation pipeline и вернуть структурированный, объяснимый результат без LLM и без скрытых product assumptions.

---

# 111. Главный принцип для coding-agent

Criteria Registry — это единый словарь того, **как именно продукт понимает пользовательские условия**.

Нельзя позволить разным частям системы по-разному трактовать:

```text
до 5 млн
первый этаж не хочу
школа рядом
ПВ 0
въехать через год
```

Правильная модель:

```text
User criterion
      ↓
Registry
      ↓
Evaluator
      ↓
Normalized data
      ↓
Structured result
```

Главное правило:

> **Сначала одинаково оцениваем каждый criterion. Только после этого можно считать общий Match Score.**
