# TASK-008 — Data Confidence & Completeness Engine

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone B — Deterministic Core`

---

# 1. Goal

Реализовать отдельный детерминированный слой оценки качества данных:

```text
Field Evidence
+
Verification
+
Freshness
+
Conflicts
+
UserRequest relevance
      ↓
Data Confidence Engine
      ↓
DataConfidenceScore
DataCompletenessScore
Critical Unknowns
Critical Conflicts
Recommended Checks
```

Главный результат:

> система должна отдельно от Match Score показывать, насколько надёжны и полны данные, на которых построено соответствие объекта пользовательскому запросу.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-002.md
tasks/TASK-005.md
tasks/TASK-006.md
tasks/TASK-007.md

docs/04-data/source-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md

docs/05-matching/confidence-status.md
docs/05-matching/matching-logic.md

docs/06-data-collection/update-strategy.md
docs/06-data-collection/ingestion-flow.md
```

---

# 3. Dependencies

TASK-008 предполагает наличие:

- `FieldEvidence`;
- `VerificationStatus`;
- `FreshnessStatus`;
- `SourceConflict`;
- `CriterionEvaluationResult`;
- `UserRequest`;
- `MatchResult`;
- Pilot Dataset.

Если formal contracts из TASK-002 отсутствуют:

```text
TASK-008 is blocked
```

Не создавать параллельные domain interfaces.

---

# 4. In Scope

Реализовать:

1. field-level confidence calculation;
2. field-level completeness relevance;
3. request-specific Data Confidence;
4. request-specific Data Completeness;
5. freshness penalty;
6. conflict penalty;
7. verification weighting;
8. critical unknown detection;
9. critical conflict detection;
10. confidence bands;
11. completeness bands;
12. recommended checks;
13. algorithm versioning;
14. unit/integration tests;
15. Pilot Dataset benchmark.

---

# 5. Out of Scope

Не реализовывать:

- Match Score;
- final ranking;
- source crawling;
- live refresh execution;
- UI;
- expert request;
- LLM explanations;
- notifications;
- source trust learning;
- legal verification.

---

# 6. Core Separation

Критическое правило:

```text
Match Score
!=
Data Confidence
!=
Data Completeness
!=
Freshness
!=
Conflict Status
```

Ни одна из этих метрик не должна silently заменять другую.

---

# 7. Definitions

## Match Score

Насколько объект подходит пользователю.

## Data Confidence

Насколько надёжны используемые данные.

## Data Completeness

Насколько хватает данных для конкретного запроса.

## Freshness

Насколько данные актуальны по времени.

## Conflict

Есть ли нерешённые противоречия между evidence.

---

# 8. Request-specific Confidence

Confidence должен оцениваться не «для карточки вообще», а относительно `UserRequest`.

Пример:

Пользователь не интересуется школой.

Отсутствующая school distance не должна существенно снижать request-specific Confidence.

---

# 9. Request-specific Completeness

Если пользователь спрашивает:

```text
семейная ипотека must
```

а eligibility unknown:

Completeness по запросу должна снижаться сильно.

Если пользователь не задавал financing:

этот unknown может быть нерелевантен.

---

# 10. Field Confidence Formula

Базовая модель:

```text
Field Confidence
=
Verification Factor
× Freshness Factor
× Conflict Factor
× Evidence Quality Factor
```

Конкретные коэффициенты должны быть централизованы в config.

---

# 11. Verification Factor

Нужно поддержать минимум:

```text
confirmed
claimed
unconfirmed
conflicting
stale
unknown
```

Пример provisional semantics:

```text
confirmed → high
claimed → medium/low
unconfirmed → low
unknown → 0
```

Но exact weights не должны быть buried in code.

---

# 12. Freshness Factor

Использовать:

```text
fresh
aging
stale
expired
unknown
```

Пример:

```text
fresh   → 1.0
aging   → slight reduction
stale   → strong reduction
expired → 0 for current validity claims
unknown → low/unknown
```

---

# 13. Conflict Factor

Если field имеет unresolved conflict:

Confidence для этого field существенно снижается.

Не выбирать «среднее» значение автоматически.

---

# 14. Evidence Quality Factor

Допускается учитывать:

- evidence presence;
- source type;
- source priority;
- extraction confidence;
- manual verification.

Но source trust должен приходить из Source Model / policy, а не из hardcoded domain prejudice.

---

# 15. Extraction Confidence ≠ Verification Confidence

Критическое правило:

```text
extraction_confidence = 0.99
```

не означает:

```text
fact confirmed
```

OpenClaw может отлично прочитать рекламное заявление, которое остаётся `claimed`.

---

# 16. Field-level Output

Рекомендуемый contract:

```yaml
field_confidence:
  field:
  confidence_score:
  verification_status:
  freshness_status:
  conflict_status:
  evidence_count:
  critical:
  reasons:
  recommended_check:
```

---

# 17. Score Range

Использовать:

```text
0..100
```

для user-facing confidence/completeness.

Внутренние factors можно хранить 0..1.

---

# 18. Confidence Bands

Минимум:

```text
high
medium
low
critical
```

Thresholds должны быть config-driven.

---

# 19. Completeness Calculation

Completeness отвечает:

> Есть ли у нас данные по тем критериям, которые важны именно этому пользователю?

Рекомендуемая база:

```text
known relevant weight
/
total relevant weight
```

---

# 20. Unknown Hard Criterion

Если `must` criterion unknown:

- completeness сильно снижается;
- critical unknown count увеличивается;
- confidence может стать low/critical.

---

# 21. Unknown Preferred Criterion

Если preferred criterion unknown:

- completeness снижается;
- но меньше, чем для must.

---

# 22. Neutral Criterion

`neutral` criterion не должен существенно влиять на request completeness.

---

# 23. Not Applicable

`not_applicable`:

- не снижает completeness;
- не снижает confidence;
- исключается из denominator.

---

# 24. Confirmed Fail

Если hard criterion подтверждённо нарушен:

это не low confidence.

Наоборот, confidence может быть высоким.

Пример:

```text
price = 5.2m confirmed
budget <= 5m must
```

Match = hard_fail  
Confidence = high

Это обязательный benchmark case.

---

# 25. High Match + Low Confidence

Пример:

```text
Match = 92%
Confidence = 48%
```

если многие ключевые условия основаны на claims/unknowns.

Движок должен поддерживать это без противоречия.

---

# 26. Low Match + High Confidence

Пример:

```text
Match = 61%
Confidence = 94%
```

если данные хорошие, но объект просто хуже подходит.

---

# 27. Critical Unknowns

Сформировать отдельный список:

```yaml
critical_unknowns:
  - field:
    criterion_id:
    reason:
    current_status:
    recommended_check:
```

---

# 28. Critical Conflict

То же для conflict:

```yaml
critical_conflicts:
  - field:
    evidence_refs:
    reason:
    recommended_check:
```

---

# 29. Recommended Checks

Engine должен возвращать structured recommendations, не prose.

Примеры codes:

```text
REFRESH_PRICE
VERIFY_AVAILABILITY
VERIFY_FINANCING_APPLICABILITY
VERIFY_INITIAL_PAYMENT
RESOLVE_SOURCE_CONFLICT
VERIFY_HANDOVER_DATE
VERIFY_GAS_CONNECTION
```

---

# 30. No Expert Request Yet

TASK-008 не создаёт `ExpertRequest`.

Она только возвращает:

```text
recommended_checks
```

которые позже могут быть использованы UI/Expert Layer.

---

# 31. Freshness Relevance

Freshness policy зависит от field.

Пример:

```text
price
availability
financing
```

стареют быстрее, чем:

```text
area
floor
address
```

Engine должен читать policy metadata/config, а не использовать один TTL для всего.

---

# 32. Expired Data

Если:

```text
promotion.valid_until < now
```

promotion confidence/current applicability = 0.

Не показывать expired promotion как current.

---

# 33. Stale Does Not Mean False

```text
stale != false
```

Field value сохраняется, но confidence/freshness падают.

---

# 34. Conflict Does Not Mean Unknown Value Is Lost

История evidence сохраняется.

Confidence engine работает поверх conflict state, не уничтожает underlying values.

---

# 35. DataQuality Contract

Рекомендуемый result:

```yaml
data_quality:
  data_confidence_score:
  data_completeness_score:
  freshness_score:
  confidence_status:
  completeness_status:
  critical_unknown_count:
  critical_conflict_count:
  critical_override:
  field_results:
  recommended_checks:
  algorithm_version:
  calculated_at:
```

Согласовать с TASK-002.

---

# 36. Freshness Score

Допустимо иметь aggregate freshness score отдельно.

Он не должен заменять Confidence.

---

# 37. Critical Override

Даже если average confidence высокий:

один critical unknown по must criterion может установить:

```text
critical_override = true
```

Это полезно для UI:

> Есть важное условие, которое ещё не подтверждено.

---

# 38. Weighting by Priority

Рекомендуемая базовая логика:

```text
must      → highest data-quality importance
exclude   → highest
preferred → medium
avoid     → medium
neutral   → minimal / ignored
```

Конкретные coefficients — в config.

---

# 39. Weighting by Criterion Category

Можно поддержать дополнительную field importance.

Пример:

```text
availability
exact price
financing applicability
```

могут быть critical по operational policy.

Но user priority остаётся главным сигналом.

---

# 40. Double-counting Guard

Если несколько criteria используют одно и то же field/evidence:

не стоит дважды полностью штрафовать Confidence.

TASK-008 должна иметь field-level aggregation, а затем criterion relevance mapping.

---

# 41. Criterion-level vs Field-level

Правильная структура:

```text
FieldEvidence
↓
Field Confidence
↓
Criterion Data Quality
↓
Request-level Aggregate
```

Не считать independently все критерии, если они опираются на один field.

---

# 42. Multiple Evidence

Если field имеет несколько согласующихся evidence:

Confidence может повышаться.

Но не суммировать линейно до бесконечности.

---

# 43. Source Diversity

Если два независимых evidence подтверждают одно значение:

это может увеличить confidence.

Если два evidence из одного upstream origin:

не считать их полностью независимыми, если provenance это показывает.

MVP может оставить простой hook, если upstream graph ещё не реализован.

---

# 44. Manual Expert Evidence

Если evidence создано экспертом и валидно:

может повысить verification factor.

Но экспертный факт должен быть field-specific.

---

# 45. User Confirmation Evidence

Если пользователь исправил свой собственный request:

это подтверждает `UserRequest`, но не factual property data.

Не использовать user confirmation запроса как evidence цены/availability.

---

# 46. Source Trust

Source trust не должен быть universal.

Field-specific priority предпочтительнее.

Например:

- developer site может быть сильнее для unit availability;
- bank site — для bank offer;
- government source — для program rules.

---

# 47. Config

Создать централизованный config, например:

```text
src/matching/confidence/config/
```

с:

- verification factors;
- freshness factors;
- conflict factors;
- priority weights;
- confidence bands;
- completeness bands;
- critical field rules.

---

# 48. No Magic Numbers

Все thresholds и weights должны быть централизованы и versioned.

---

# 49. Algorithm Version

Например:

```text
confidence-v1
```

Изменение формулы требует новой версии.

---

# 50. Time Context

Передавать `current_time` явно.

Иначе freshness tests станут нестабильны.

---

# 51. MatchResult Integration

TASK-008 должна предоставить функцию, которая может дополнить `MatchResult`:

```text
data_confidence_score
data_completeness_score
```

но не менять `match_score`.

---

# 52. No Match Mutation

Запрещено:

```text
final_match = match_score × confidence
```

если это не отдельная будущая ranking policy.

---

# 53. Ranking Hook

Допустимо вернуть:

```text
confidence_penalty_candidate
```

или metadata для будущего ranking engine.

Но user-facing Match Score не менять.

---

# 54. Pilot Dataset Benchmarks

Использовать TASK-005 cases.

Минимум:

1. high match / high confidence;
2. high match / low confidence;
3. hard fail / high confidence;
4. critical finance unknown;
5. stale price;
6. conflicting price;
7. expired promotion;
8. unknown gas;
9. removed listing;
10. fully confirmed object.

---

# 55. Benchmark A — High Match / High Confidence

Expected:

```text
confidence = high
completeness = high
critical_unknown_count = 0
```

---

# 56. Benchmark B — High Match / Low Confidence

Много relevant fields:

```text
claimed
stale
unknown
```

Expected:

```text
match remains high
confidence low
```

---

# 57. Benchmark C — Hard Fail / High Confidence

Confirmed over-budget property.

Expected:

```text
Match hard_fail
Confidence high
```

---

# 58. Benchmark D — Claimed Family Mortgage

User:

```text
family mortgage must
```

Evidence:

```text
claimed
```

Expected:

- critical unknown;
- recommended check;
- confidence lower;
- completeness lower.

---

# 59. Benchmark E — Price Conflict

Two evidence values.

Expected:

- critical conflict if price must;
- no silent resolution;
- recommended `RESOLVE_SOURCE_CONFLICT`.

---

# 60. Benchmark F — Stale Availability

Expected:

- freshness low;
- critical override if availability is decision-critical;
- recommended refresh.

---

# 61. Benchmark G — Expired Promotion

Expected:

```text
promotion excluded from current-valid data
confidence for applicability = 0
```

---

# 62. Benchmark H — Gas Unknown

User:

```text
gas connected must
```

Expected:

- critical unknown;
- low completeness for relevant field;
- recommended verification.

---

# 63. Completeness Score Formula

Рекомендуемая основа:

```text
Σ(relevance_weight × known_factor)
/
Σ(relevance_weight)
```

где:

```text
known_factor:
confirmed/claimed value exists → structurally known
unknown → 0
conflicting → partial or 0 depending policy
not_applicable → excluded
```

Важно: completeness не равна confidence.

---

# 64. Claimed Counts as Known but Weak

Пример:

```text
zero-down = claimed true
```

Completeness может считать поле заполненным.

Confidence остаётся низким.

Это показывает разницу метрик.

---

# 65. Conflict Completeness

Conflict означает:

- данные существуют;
- но canonical certainty отсутствует.

Поэтому completeness может быть выше нуля, а confidence — низким.

---

# 66. Field Reason Codes

Поддержать structured reason codes.

Примеры:

```text
CONFIRMED_FRESH
CLAIMED_SOURCE_ONLY
FIELD_UNKNOWN
FIELD_CONFLICTING
FIELD_STALE
FIELD_EXPIRED
NO_EVIDENCE
MULTIPLE_AGREEING_EVIDENCE
CRITICAL_MUST_FIELD_UNKNOWN
```

---

# 67. Recommended Check Priority

Можно возвращать:

```text
critical
high
normal
```

на основании:

- UserRequest priority;
- field volatility;
- conflict;
- freshness;
- decision relevance.

---

# 68. No Refresh Execution

Engine не должен сам запускать refresh.

Он только формирует recommendation.

---

# 69. Update Strategy Compatibility

Output должен быть пригоден для будущего mapping:

```text
recommended_check
→ RefreshTask
```

из `update-strategy.md`.

---

# 70. Unit Tests

Минимум:

1. confirmed fresh field;
2. claimed fresh field;
3. unknown field;
4. stale field;
5. expired field;
6. conflicting field;
7. multiple agreeing evidence;
8. must unknown critical;
9. preferred unknown noncritical;
10. not_applicable excluded;
11. completeness vs confidence difference;
12. hard fail high confidence;
13. high match low confidence;
14. deterministic same input.

---

# 71. Integration Tests

На Pilot Dataset:

- confirmed apartment;
- stale secondary listing;
- price conflict;
- claimed zero-down;
- unknown gas house;
- expired promo;
- removed offer.

---

# 72. Score Validation

Проверить ranges:

```text
0 <= confidence <= 100
0 <= completeness <= 100
0 <= freshness <= 100
```

---

# 73. Band Tests

Boundary values confidence bands должны быть протестированы.

---

# 74. Critical Override Test

Средний score может быть высоким, но:

```text
must field unknown
```

должен включать critical override.

---

# 75. No UI Text Generation

Engine возвращает codes/params.

Финальный текст позже строит presentation layer.

---

# 76. Recommended Code Structure

Например:

```text
src/
  matching/
    confidence/
      engine.ts
      field-confidence.ts
      completeness.ts
      aggregation.ts
      config/
      reason-codes.ts
      types.ts
```

---

# 77. Pure Domain Layer

Не импортировать:

- React;
- database client;
- OpenAI;
- OpenClaw;
- web/network modules.

---

# 78. Input Validation

Перед calculation:

- validate UserRequest;
- validate evidence;
- validate criteria results;
- validate source/conflict refs.

---

# 79. Output Validation

`DataQuality` result должен проходить schema TASK-002.

---

# 80. Referential Integrity

Evidence refs должны существовать.

Не считать confidence для несуществующего evidence ID.

---

# 81. Performance

MVP target:

```text
50–100 properties
```

Confidence calculation должен выполняться локально быстро.

---

# 82. Acceptance Criteria

TASK-008 считается завершённой, если:

1. field-level confidence работает;
2. verification factor учитывается;
3. freshness factor учитывается;
4. conflict factor учитывается;
5. extraction confidence не подменяет verification;
6. request-specific completeness работает;
7. must unknown снижает completeness;
8. neutral irrelevant fields не штрафуют;
9. not_applicable исключается;
10. claimed может быть complete but low confidence;
11. conflict может быть complete but low confidence;
12. high match / low confidence поддерживается;
13. hard fail / high confidence поддерживается;
14. critical unknowns формируются;
15. critical conflicts формируются;
16. recommended checks формируются;
17. Match Score не изменяется;
18. config centralized;
19. algorithm versioned;
20. Pilot Dataset benchmark проходит;
21. typecheck/lint/test/build проходят.

---

# 83. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан отдельный command:

```text
<package-manager> test:confidence
```

или эквивалент.

---

# 84. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Algorithm version:
Confidence formula:
Completeness formula:
Config:
Reason codes:
Recommended checks:
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

# 85. Do Not Continue Automatically

После TASK-008:

**не начинать следующую задачу самостоятельно.**

---

# 86. Likely Next Task

Следующая задача зафиксирована:

```text
TASK-009 — Shortlist UI
```

После TASK-008 не начинать её автоматически; она выполняется только после отдельного запуска и review TASK-008.

---

# 87. Definition of Done

TASK-008 Done, когда для любого `MatchResult` система может независимо и воспроизводимо сказать:

- насколько надёжны данные;
- насколько они полны для конкретного UserRequest;
- какие критичные поля неизвестны;
- где есть конфликты;
- что нужно перепроверить;

не меняя Match Score.

---

# 88. Главный принцип для coding-agent

Не нужно «наказывать объект» за плохие данные внутри Match Score.

Правильная модель:

```text
Насколько подходит?
→ Match Score

Насколько можно доверять этому выводу?
→ Data Confidence

Хватает ли данных для этой задачи?
→ Data Completeness
```

Главное правило:

> **Соответствие и качество данных — разные измерения. Пользователь должен видеть оба.**
