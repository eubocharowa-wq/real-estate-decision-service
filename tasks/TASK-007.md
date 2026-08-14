# TASK-007 — Matching Engine v1

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone B — Deterministic Core`

---

# 1. Goal

Реализовать первую полноценную версию Matching Engine, которая на вход получает:

- подтверждённый `UserRequest`;
- `Property`;
- связанные `Offer`;
- доступные `PurchaseScenario`;
- результаты отдельных criteria evaluators из TASK-006;
- verification/freshness metadata;

и возвращает структурированный `MatchResult`.

Главный результат:

> система должна детерминированно определить, подходит ли объект пользователю, насколько он подходит, почему, какие есть компромиссы и какие критичные данные остаются неподтверждёнными.

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
tasks/TASK-006.md

docs/04-data/user-request-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/04-data/source-model.md

docs/05-matching/matching-logic.md
docs/05-matching/hard-soft-criteria.md
docs/05-matching/confidence-status.md

docs/08-roadmap/implementation-plan.md
```

---

# 3. Dependencies

TASK-007 предполагает наличие:

```text
UserRequest contract
Property / Offer / PurchaseScenario contracts
Criterion contract
CriterionEvaluationResult contract
Criteria Registry
Evaluators
Pilot Dataset
```

Если TASK-006 ещё не выполнена:

```text
TASK-007 is blocked
```

Не дублировать evaluator logic внутри Matching Engine.

---

# 4. In Scope

Реализовать:

1. Matching Engine service;
2. hard-gate aggregation;
3. PurchaseScenario eligibility selection;
4. soft criteria aggregation;
5. `MatchScore`;
6. `PropertyFitScore`;
7. `FinancingFitScore`;
8. `eligibility_status`;
9. strengths;
10. compromises;
11. hard failures;
12. critical unknowns;
13. structured explanation payload;
14. algorithm versioning;
15. deterministic benchmark tests на Pilot Dataset.

---

# 5. Out of Scope

Не реализовывать в TASK-007:

- Data Confidence formula полностью, если она выделена в следующую задачу;
- LLM-generated prose;
- ranking всего рынка;
- diversity shortlist;
- search;
- source collection;
- live refresh;
- UI;
- expert verification;
- user notifications.

Matching Engine должен вернуть structured result, а не финальную маркетинговую карточку.

---

# 6. Core Pipeline

Правильная последовательность:

```text
UserRequest
      ↓
Candidate Property + Offers + PurchaseScenarios
      ↓
Hard Criteria Evaluation
      ↓
Scenario Eligibility
      ↓
Soft Criteria Evaluation
      ↓
Score Aggregation
      ↓
Unknown / Conflict Analysis
      ↓
MatchResult
```

---

# 7. Hard Gate First

До расчёта общего soft score нужно проверить:

- `must`;
- `exclude`;
- confirmed unavailability;
- невозможный PurchaseScenario;
- confirmed financing ineligibility, если financing criterion = must.

Если существует хотя бы один подтверждённый hard failure:

```text
eligibility_status = hard_fail
```

---

# 8. Hard Fail Cannot Be Compensated

Запрещено:

```text
budget hard fail
+
excellent area
+
good school
=
high match
```

Если обязательный критерий нарушен:

объект не считается подходящим.

---

# 9. Hard Unknown

Если обязательный критерий:

- unknown;
- claimed;
- conflicting;
- stale beyond allowed policy;

то объект не должен автоматически считаться hard pass.

Использовать:

```text
eligible_with_unknowns
```

или эквивалент из formal contract.

---

# 10. Eligibility Status

Минимум поддержать:

```text
eligible
eligible_with_unknowns
possible_match
hard_fail
insufficient_data
unavailable
```

---

# 11. Status Semantics

## eligible

Все hard criteria подтверждённо пройдены.

## eligible_with_unknowns

Нет подтверждённого hard fail, но есть critical unknown/conflict.

## possible_match

Данных недостаточно для уверенного вывода, но объект потенциально подходит.

## hard_fail

Есть подтверждённое нарушение must/exclude.

## insufficient_data

Не хватает базовых данных даже для корректного сопоставления.

## unavailable

Offer/Property подтверждённо недоступен.

---

# 12. PurchaseScenario Selection

Если UserRequest содержит financing criteria:

Matching Engine должен работать не только с Property, но и с подходящими `PurchaseScenario`.

Правильная логика:

```text
Property
  ├── Scenario A
  ├── Scenario B
  └── Scenario C
```

оцениваются отдельно.

---

# 13. Scenario-level Matching

Для каждого PurchaseScenario оценить:

- initial payment;
- monthly payment;
- financing program;
- promo applicability;
- total entry cost;
- assumptions;
- verification.

---

# 14. Best Scenario

Для итогового Property Match допускается выбрать лучший **совместимый** PurchaseScenario.

Но:

```text
best scenario
```

должен существовать как реальная связанная комбинация.

---

# 15. No Frankenstein Scenario

Запрещено собирать:

```text
цена из Offer A
+
ПВ из Offer B
+
ставка из Offer C
```

если эти условия не связаны одним PurchaseScenario.

---

# 16. Property-only Request

Если пользователь покупает за наличные и financing не участвует:

Matching Engine может работать без PurchaseScenario.

Но contract должен явно отражать:

```text
purchase_scenario_id = null
```

если это допустимо TASK-002 schema.

---

# 17. Criteria Groups

Рекомендуемые группы:

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

# 18. Property Fit vs Financing Fit

Разделять:

```text
property_fit_score
financing_fit_score
```

Это позволяет объяснить:

> Квартира хорошо подходит физически, но текущая схема покупки плохо соответствует вашему бюджету.

---

# 19. Overall Match Score

Итоговый `match_score` должен агрегировать только применимые soft criteria и confirmed/usable results.

Не включать unknown как 0.

---

# 20. Unknown Does Not Mean Zero

Критическое правило:

```text
unknown != bad fit
```

Если school distance unknown:

не давать 0 за школу.

Неизвестность должна снижать Confidence/Completeness, а не искажать Match Score.

---

# 21. Soft Score Formula

Рекомендуемая базовая логика:

```text
weighted_sum = Σ(fit_i × weight_i)
weight_sum   = Σ(weight_i for evaluable criteria)

soft_score = weighted_sum / weight_sum
```

Только для:

- applicable;
- evaluable;
- non-neutral;
- non-hard-failed criteria.

---

# 22. Score Scale

Пользовательский Match Score:

```text
0..100
```

Внутренний fit evaluator:

```text
0..1
```

---

# 23. No LLM Score

Запрещено:

```text
LLM decides match = 87%
```

Итог вычисляется детерминированно.

---

# 24. Weight Source

Weights должны приходить из:

- UserRequest;
- Criteria Registry;
- matching config;

но не быть зашиты случайными числами внутри aggregator.

---

# 25. Priority Weight Semantics

Рекомендуемая логика:

```text
must      → hard gate, optionally also explanatory soft contribution
exclude   → hard gate
preferred → weighted soft criterion
avoid     → negative/preference penalty semantics
neutral   → ignored for scoring
unknown   → ignored until confirmed
```

Точные коэффициенты должны быть централизованы.

---

# 26. Avoid Semantics

`avoid` не должен работать как hard fail.

Допустимый подход:

```text
match → high fit
avoid condition present → low fit
```

или negative utility, если formal model это поддерживает.

---

# 27. Must and Soft Contribution

Если must criterion пройден:

можно учитывать его в explanatory structure.

Но он не должен искусственно раздувать score так, чтобы много простых must conditions делали объект «99%».

---

# 28. Preferred Criteria Only

Основной soft score лучше строить преимущественно на `preferred` / `avoid`.

Hard criteria определяют eligibility.

---

# 29. Criterion Group Anti-double-counting

Если criteria имеют `criterion_group_id`:

например:

```text
school distance
school travel time
```

не нужно автоматически суммировать их как два полностью независимых требования.

TASK-007 должна хотя бы поддержать group-aware aggregation.

---

# 30. Group Aggregation

Для MVP допустим один из детерминированных подходов:

```text
max
average
best_available
explicit group config
```

Выбор хранить централизованно и документировать.

Не выбирать silently per object.

---

# 31. Not Applicable

`not_applicable` criterion:

- не снижает score;
- не увеличивает score;
- исключается из denominator.

---

# 32. Conflicting Soft Criterion

Если soft criterion conflicting:

его лучше исключить из Match Score denominator и передать в `compromises/unknowns`.

Не считать конфликт 0.

---

# 33. Stale Soft Criterion

Stale result может участвовать в fit, если value structurally usable.

Но freshness должна сохраниться для будущего Data Confidence.

---

# 34. Claimed Soft Criterion

Если soft criterion основан на claimed data:

fit можно вычислить отдельно от confidence.

Но explanation должен ясно маркировать, что факт заявлен, а не подтверждён.

---

# 35. Strengths

Сформировать structured `strengths`.

Пример:

```yaml
strength:
  criterion_id:
  code:
  impact:
  actual:
  target:
```

---

# 36. Strength Selection

Не выводить десятки strengths.

Для MVP:

```text
top 3–5
```

по contribution / importance.

---

# 37. Compromises

`compromises` — критерии, где объект:

- частично подходит;
- заметно хуже предпочтения;
- имеет trade-off;
- требует уступки.

---

# 38. Hard Failures

`hard_failures` должны быть отдельным массивом.

Пример:

```yaml
hard_failure:
  criterion_id:
  explanation_code:
  actual:
  target:
  evidence_refs:
```

---

# 39. Critical Unknowns

Отдельный массив:

```text
unknown_critical
```

Примеры:

- family mortgage applicability unknown;
- exact price unavailable;
- availability stale;
- gas status unknown.

---

# 40. Unknown Priority

Рекомендуется сортировать unknowns:

```text
critical
high
normal
```

Но не смешивать это с Refresh Priority напрямую без отдельного mapping.

---

# 41. Explanation Structure

MatchResult должен содержать structured explanation data.

Не final prose.

Пример:

```yaml
explanation:
  summary_code:
  strengths:
  compromises:
  hard_failures:
  critical_unknowns:
  tradeoffs:
```

---

# 42. Summary Code

Примеры:

```text
STRONG_MATCH
GOOD_MATCH_WITH_UNKNOWNS
CONDITIONAL_MATCH
HARD_CRITERIA_FAILED
INSUFFICIENT_DATA
UNAVAILABLE
```

---

# 43. No Universal Quality Language

Не создавать:

```text
BEST_PROPERTY
PREMIUM_OBJECT
GOOD_DISTRICT
```

если это не связано с конкретным UserRequest.

---

# 44. Match Score When Hard Fail

Рекомендуемая политика:

```text
hard_fail → match_score may still be computed internally for diagnostics
```

но user-facing ranking должен исключить объект.

Если contract предполагает `match_score = null` при hard_fail, следовать TASK-002.

Главное — не позволять высокому soft score маскировать hard fail.

---

# 45. Insufficient Data

Если отсутствуют базовые данные:

например:

- нет location;
- нет property type;
- нет price при обязательном budget;
- нет Offer/Scenario при financing requirement;

может использоваться:

```text
insufficient_data
```

---

# 46. Availability

Если Offer подтверждённо:

```text
sold
```

или equivalent unavailable:

```text
eligibility_status = unavailable
```

Не путать с hard_fail по пользовательскому критерию.

---

# 47. Multiple Offers

Если Property имеет несколько Offer:

Matching Engine может оценивать каждый Offer отдельно.

Итог Property Match должен ссылаться на конкретный selected Offer.

---

# 48. Selected Offer

Добавить в result, если schema позволяет:

```text
selected_offer_id
```

Если TASK-002 этого не предусматривает:

создать application-layer result extension или зафиксировать SPEC CONFLICT.

---

# 49. Offer Comparison

Один Property:

```text
Offer A — дешевле
Offer B — лучше financing
```

может иметь разные MatchResult per scenario.

Не схлопывать их до одной непроверенной смеси.

---

# 50. Scenario Ranking

Для одного Property допустимо выбрать лучший scenario по:

1. hard eligibility;
2. soft finance fit;
3. verification quality как tie-break metadata, если это явно допустимо;
4. deterministic tie-break.

Но не использовать общий Data Confidence как скрытый multiplier Match Score.

---

# 51. Tie-breaking

Если два сценария имеют одинаковый fit:

использовать deterministic tie-break.

Например:

```text
higher verification
lower total entry cost
stable scenario_id
```

Порядок должен быть централизован и тестируем.

---

# 52. Data Confidence Separation

TASK-007 обязана **не смешивать**:

```text
Match Score
```

и:

```text
Data Confidence
```

Если confidence aggregation ещё не реализована:

вернуть placeholder/interface hook, но не подменять.

---

# 53. Data Completeness Separation

То же правило для:

```text
data_completeness_score
```

Это отдельная метрика.

---

# 54. Ranking Score

Если `ranking_score` есть в schema:

TASK-007 не обязана полностью реализовать ranking logic.

Допустимо:

```text
ranking_score = null / not_calculated
```

если contract позволяет.

Не придумывать скрытый ranking formula.

---

# 55. MatchResult Contract

Минимум:

```yaml
match_result_id:
user_request_id:
property_id:
selected_offer_id:
purchase_scenario_id:
eligibility_status:
match_score:
property_fit_score:
financing_fit_score:
criteria_results:
hard_failures:
strengths:
compromises:
unknown_critical:
summary_code:
algorithm_version:
calculated_at:
```

Согласовать с TASK-002.

---

# 56. Algorithm Versioning

Использовать:

```text
matching-v1
```

или эквивалент.

Любое изменение формулы позже должно менять version.

---

# 57. Matching Context

Рекомендуемый service interface:

```ts
matchProperty({
  userRequest,
  property,
  offers,
  purchaseScenarios,
  evidence
}): MatchResult
```

или эквивалент.

---

# 58. Batch Matching

Также полезен:

```ts
matchProperties(...)
```

для списка candidates.

Но batch function не должна содержать отдельную scoring logic.

---

# 59. Determinism

Обязательный invariant:

```text
same normalized input
+
same registry version
+
same algorithm version
=
same MatchResult
```

---

# 60. No Current Time Drift Without Explicit Context

Если freshness зависит от now:

`current_time` передавать в context явно.

Иначе benchmark tests будут нестабильны.

---

# 61. Pilot Dataset Integration

Использовать TASK-005 UserRequest fixtures и benchmark manifest.

Минимум протестировать 5–10 meaningful cases.

---

# 62. Benchmark Case A — Strict Budget

User:

```text
price <= 5m must
```

Property:

```text
5.2m confirmed
```

Expected:

```text
hard_fail
```

---

# 63. Benchmark Case B — Unknown Mortgage

User:

```text
family mortgage must
```

Eligibility:

```text
claimed only
```

Expected:

```text
eligible_with_unknowns
```

или equivalent contract status.

Не `eligible`.

---

# 64. Benchmark Case C — Preferred Zero-down

User:

```text
zero-down preferred
```

Scenario:

```text
zero-down confirmed false
```

Expected:

- no hard fail;
- soft financing fit reduced;
- compromise exists.

---

# 65. Benchmark Case D — First Floor Excluded

Expected:

```text
hard_fail
```

если actual floor = 1 confirmed.

---

# 66. Benchmark Case E — Cross-type

User:

```text
apartment OR house
```

Оба типа могут быть eligible.

---

# 67. Benchmark Case F — House Gas Unknown

User:

```text
gas connected must
```

actual:

```text
unknown
```

Expected:

```text
eligible_with_unknowns
critical unknown
```

---

# 68. Benchmark Case G — Better Property, Worse Financing

Property A:

- property fit high;
- finance fit low.

Property B:

- property fit medium;
- finance fit high.

Expected:

оба имеют explainable separate scores.

---

# 69. Benchmark Case H — Price_from

User:

```text
price <= 5m must
```

Offer:

```text
price_from = 4.5m
exact unit price unknown
```

Expected:

```text
critical unknown
```

а не pass.

---

# 70. Benchmark Case I — Unavailable

Offer:

```text
sold
```

Expected:

```text
unavailable
```

---

# 71. Benchmark Case J — Soft Trade-off

User:

```text
school preferred
commute preferred
area preferred
```

Property:

- school strong;
- commute weak;
- area strong.

Expected:

- non-hard result;
- strength + compromise.

---

# 72. Score Precision

Рекомендуется внутренне считать с достаточной precision.

User-facing округление:

```text
integer 0..100
```

можно выполнять позже в presentation layer.

Не накапливать rounding error на каждом criterion.

---

# 73. Weight Normalization

Weight denominator должен учитывать только evaluable criteria.

Не включать:

- unknown;
- conflicting;
- not_applicable;
- neutral.

---

# 74. No Score Inflation from Missing Data

Если из 10 preferred criteria известен только один и он matched:

не стоит автоматически показывать объект как надёжный 100% без контекста.

Match Score может быть 100 по evaluable fit, но Data Completeness/Confidence должны отдельно показывать слабость данных.

Если UI позже решит иначе — это отдельная product decision.

---

# 75. Constraint Pressure Hook

Можно вернуть diagnostic metadata:

```text
near_hard_boundary
```

например:

```text
price = 4.99m
limit = 5m
```

Но constraint relaxation не реализовывать.

---

# 76. Trade-off Hook

Структура должна позволять позже показать:

> дешевле, но дальше;

> больше площадь, но хуже срок въезда.

TASK-007 может формировать pairwise structured dimensions, но не обязана писать prose.

---

# 77. No Commercial Bias

Запрещено учитывать:

- commission;
- partner flag;
- advertisement;
- promoted listing.

---

# 78. No Source Prestige Bonus in Match

Source trust влияет на Confidence, а не на соответствие пользовательским условиям.

---

# 79. No Universal New-build/Secondary Bonus

Тип недвижимости влияет только если пользователь его указал или criterion связан с последствиями.

---

# 80. No Hidden "Better District"

Location evaluator использует user criteria.

Никакого generic district ranking внутри Match Score.

---

# 81. Required Unit Tests

Минимум:

1. all hard pass;
2. one hard fail;
3. hard unknown;
4. hard conflict;
5. unavailable;
6. insufficient data;
7. preferred exact match;
8. preferred partial match;
9. avoid criterion;
10. neutral excluded from score;
11. not_applicable excluded;
12. unknown excluded from denominator;
13. group anti-double-counting;
14. multiple scenarios;
15. selected scenario deterministic;
16. no Frankenstein combination;
17. score reproducibility.

---

# 82. Required Integration Tests

На Pilot Dataset:

1. apartment under strict budget;
2. apartment over strict budget;
3. claimed family mortgage;
4. zero-down preferred;
5. house gas unknown;
6. first-floor exclusion;
7. cross-type request;
8. stale price;
9. conflicting price;
10. unavailable offer.

---

# 83. Snapshot Tests

Допустимо использовать snapshot для structured MatchResult fixtures.

Но snapshot не должен заменять semantic assertions.

---

# 84. Benchmark Manifest Extension

Если нужно, TASK-007 может добавить expected matching invariants в:

```text
benchmark-manifest.json
```

Например:

```yaml
expected:
  eligibility_status:
  required_hard_failure_codes:
  required_unknown_codes:
```

Не фиксировать точный Match Score для всех cases, пока weights считаются provisional.

---

# 85. Score Golden Cases

Допустимо создать 3–5 golden cases с точным score, если:

- weights зафиксированы в config;
- цель — regression test;
- documented as v1 algorithm behavior.

---

# 86. Matching Config

Рекомендуемая структура:

```text
src/matching/config/
```

с:

- priority weights;
- group aggregation;
- score normalization;
- tie-break rules.

---

# 87. No Magic Numbers

Ни один важный coefficient не должен быть buried в function body.

---

# 88. Error Handling

Normal domain states:

```text
unknown
conflicting
not_applicable
hard_fail
```

не являются exceptions.

Exceptions:

- malformed UserRequest;
- invalid CriterionEvaluationResult;
- broken reference;
- unsupported criterion;
- incompatible scenario structure.

---

# 89. Performance

MVP target:

```text
50–100 candidates
```

Matching должен работать локально быстро и без внешних вызовов.

Не нужна premature distributed optimization.

---

# 90. Pure Domain Layer

Matching Engine не должен:

- обращаться к DB напрямую;
- ходить в web;
- вызывать OpenAI;
- импортировать React;
- запускать OpenClaw.

Он получает готовые normalized inputs.

---

# 91. Input Validation

Перед matching:

- validate UserRequest;
- validate Property;
- validate Offer/Scenario;
- validate criteria results.

Не silently repair malformed domain objects.

---

# 92. Output Validation

Итоговый `MatchResult` должен валидироваться schema TASK-002.

---

# 93. Acceptance Criteria

TASK-007 считается завершённой, если:

1. существует `matchProperty` или эквивалент;
2. hard gate работает;
3. must fail не компенсируется;
4. must unknown не считается pass;
5. unavailable отделён от hard_fail;
6. PurchaseScenario оценивается отдельно;
7. Frankenstein scenario невозможен;
8. property fit и financing fit разделены;
9. overall Match Score детерминирован;
10. unknown не превращается в 0;
11. conflicting не превращается в 0;
12. not_applicable исключается;
13. neutral не влияет на score;
14. avoid не равен exclude;
15. strengths формируются;
16. compromises формируются;
17. hard failures формируются;
18. critical unknowns формируются;
19. Match Score отделён от Data Confidence;
20. algorithm version сохраняется;
21. Pilot Dataset tests проходят;
22. typecheck/lint/test/build проходят.

---

# 94. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан отдельный benchmark command:

```text
<package-manager> test:matching
```

или эквивалент.

---

# 95. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Algorithm version:
Aggregation logic:
Scenario selection:
Config:
Benchmark cases:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 96. Out of Scope Reminder

Не реализовывать в этой TASK:

```text
final Data Confidence engine
```

если он ещё не формализован в коде.

Не использовать confidence как multiplier Match Score.

---

# 97. Do Not Continue Automatically

После TASK-007:

**не начинать следующую задачу самостоятельно.**

---

# 98. Likely Next Task

Следующая логичная задача:

```text
TASK-008 — Data Confidence & Completeness Engine
```

После неё можно безопасно строить shortlist UI, где пользователь увидит отдельно:

```text
Насколько подходит
+
Насколько надёжны данные
```

---

# 99. Definition of Done

TASK-007 Done, когда для одного `UserRequest` и одного candidate Property система может воспроизводимо вернуть:

- подходит / не подходит;
- Match Score;
- лучший совместимый PurchaseScenario;
- причины;
- компромиссы;
- hard failures;
- critical unknowns;

без LLM, без скрытых assumptions и без смешивания соответствия с качеством данных.

---

# 100. Главный принцип для coding-agent

Matching Engine не отвечает:

> «Насколько хороший это объект вообще?»

Он отвечает только:

> **«Насколько этот объект и конкретный способ его покупки подходят этому пользователю при его подтверждённых условиях?»**

Правильная модель:

```text
UserRequest
      +
Normalized Property
      +
Offer
      +
PurchaseScenario
      ↓
Criteria Evaluations
      ↓
Hard Gate
      ↓
Soft Aggregation
      ↓
MatchResult
```

Главное правило:

> **Соответствие — это функция пользовательской задачи. Уверенность в данных — отдельная функция. Не смешивать их.**
