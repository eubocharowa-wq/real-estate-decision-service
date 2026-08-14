# TASK-014 — First Approved Source Adapter PoC

## Status

`ready_with_gate`

## Priority

`P0`

## Milestone

`Milestone D — Live Source PoC`

---

# 1. Goal

Реализовать первый end-to-end source adapter для **одного источника, который явно разрешён Source Policy Engine для PoC/test ingestion**.

Цель TASK-014 — доказать, что архитектура source collection работает полностью:

```text
Source Registry
      ↓
Policy Gate
      ↓
Collection Plan
      ↓
Source Adapter
      ↓
Raw Result
      ↓
Schema Validation
      ↓
Normalization
      ↓
Field Evidence
      ↓
Duplicate Hook
      ↓
Canonical Candidate
      ↓
Matching Readiness
```

Главный результат:

> система должна получить данные из одного реально разрешённого source channel и провести их через тот же pipeline, который уже используется synthetic fixtures и User URL Ingestion.

---

# 2. Critical Precondition

Перед реализацией adapter необходимо выбрать **ровно один** source.

Источник можно выбрать только если Source Registry возвращает для текущего environment:

```text
operation = scheduled_collect / targeted_refresh / approved PoC collect
allowed = true
```

и разрешён конкретный collection method.

---

# 3. Do Not Choose Source by Convenience

Нельзя выбирать source только потому, что:

- страницу легко открыть;
- HTML простой;
- OpenClaw может её прочитать;
- сайт публичный;
- source есть в `pilot-source-matrix.md`.

Требуется policy approval.

---

# 4. If No Source Is Approved

Если ни один реальный источник не имеет разрешённого PoC/test collection mode:

```text
TASK-014 is blocked by source approval
```

Coding-agent обязан:

1. не обходить policy;
2. не создавать production scraper;
3. не менять Source Registry ради прохождения TASK;
4. завершить только adapter framework / fixture proof, если это прямо разрешено текущей TASK implementation note;
5. сообщить blocker.

---

# 5. Preferred Source Selection

Если несколько источников разрешены, выбрать source с:

- конкретными Property/Offer pages;
- стабильной структурой;
- полезными полями;
- минимальной технической сложностью;
- ясной policy;
- понятным attribution requirement.

Не выбирать marketplace-wide crawling как первый PoC.

---

# 6. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-002.md
tasks/TASK-005.md
tasks/TASK-008.md
tasks/TASK-012.md
tasks/TASK-013.md

docs/04-data/property-model.md
docs/04-data/source-model.md
docs/04-data/deduplication.md

docs/06-data-collection/openclaw-role.md
docs/06-data-collection/sources.md
docs/06-data-collection/pilot-source-matrix.md
docs/06-data-collection/update-strategy.md
docs/06-data-collection/ingestion-flow.md
```

---

# 7. Dependencies

TASK-014 предполагает наличие:

```text
Source Registry
Source Policy Engine
Collection Plan contract
Property
Offer
SourceSnapshot
FieldEvidence
Raw ingestion/staging contracts
Normalization pipeline
Duplicate hook
```

Если TASK-013 не выполнена:

```text
TASK-014 is blocked
```

---

# 8. In Scope

Реализовать:

1. source-specific adapter;
2. adapter registration;
3. policy-gated execution;
4. deterministic collection input;
5. raw result contract;
6. schema validation;
7. normalization;
8. `Property` / `Offer` separation;
9. field-level evidence;
10. partial-result handling;
11. source-change detection;
12. retry/idempotency boundaries;
13. fixture snapshots for tests;
14. integration with duplicate hook;
15. matching-readiness output;
16. structured logs/metrics;
17. tests.

---

# 9. Out of Scope

Не реализовывать:

- массовый crawling source;
- весь рынок;
- multi-source aggregation;
- source scheduler;
- refresh queue;
- OpenClaw orchestration across many sources;
- anti-bot circumvention;
- CAPTCHA bypass;
- account automation;
- authenticated scraping unless explicitly approved;
- production persistence if DB layer ещё не существует;
- general browser automation framework;
- second source adapter.

---

# 10. One Source Only

TASK-014 = **один source adapter**.

Не начинать параллельно:

```text
DEV-01 + DEV-02 + DEV-03
```

даже если структура похожа.

Цель — проверить pipeline, а не coverage.

---

# 11. Adapter Interface

Использовать provider-agnostic interface.

Например:

```ts
interface SourceAdapter {
  sourceId: string;
  method: CollectionMethod;

  canHandle(task: CollectionTask): boolean;

  collect(
    task: CollectionTask,
    context: CollectionContext
  ): Promise<RawCollectionResult>;
}
```

Имена могут отличаться.

---

# 12. No Direct Canonical Writes

Adapter не имеет права писать напрямую в canonical `Property` / `Offer`.

Правильный flow:

```text
Adapter
→ RawCollectionResult
→ Staging
→ Validation
→ Normalization
→ Evidence
→ Deduplication
→ Canonical Candidate
```

---

# 13. CollectionTask

Adapter должен принимать explicit task.

Минимум:

```yaml
collection_task:
  task_id:
  source_id:
  mode:
  target_urls:
  requested_fields:
  entity_type:
  freshness_requirement:
  priority:
  created_at:
```

---

# 14. Supported Mode

Для первого adapter достаточно:

```text
collect
```

и при необходимости:

```text
refresh
```

Не реализовывать discovery всего сайта, если это не нужно для PoC.

---

# 15. Narrow Target

Предпочтительный PoC:

```text
known concrete URLs
```

или небольшой explicit list.

Не:

```text
crawl all listings
```

---

# 16. Collection Method Must Match Policy

Если Source Policy Engine разрешил:

```text
http
```

adapter использует HTTP.

Если разрешён только:

```text
api
```

adapter использует API.

Нельзя заменять разрешённый method другим способом.

---

# 17. OpenClaw Boundary

Если selected source policy разрешает:

```text
openclaw / browser
```

OpenClaw может быть collector implementation.

Но:

```text
OpenClaw != adapter business logic
```

Adapter должен оставаться provider-specific mapping layer вокруг collection result.

---

# 18. Raw Result

Рекомендуемый contract:

```yaml
raw_collection_result:
  collection_run_id:
  source_id:
  source_url:
  collected_at:
  http_status:
  content_type:
  raw_payload_reference:
  extracted_fields:
  warnings:
  adapter_version:
  collector_version:
  status:
```

---

# 19. Raw Payload Storage

Следовать Source Policy.

Если raw storage запрещён:

не сохранять raw HTML/snapshot permanently.

Можно хранить только разрешённый transient processing representation.

---

# 20. SourceSnapshot

Если policy разрешает:

создать `SourceSnapshot`.

Минимум:

```text
snapshot_id
source_id
url
collected_at
content_hash
status
raw_reference / structured_reference
```

---

# 21. Extraction Scope

Для первого adapter извлекать только поля, которые реально нужны для MVP.

Минимум, если source их содержит:

```text
external listing/unit id
title
property type
market type
address/location
rooms
area
floor
building/project
price
price_from
availability
seller/developer
publication/update timestamps
handover/readiness
financing/promotion claims
source URL
```

---

# 22. Minimal Collection Principle

Не извлекать сотни fields «на будущее».

TASK-014 должна доказать pipeline на критичных полях.

---

# 23. Property vs Offer

Критическое правило:

Physical facts:

```text
area
floor
rooms
address
building
```

→ `Property`

Commercial facts:

```text
price
seller
availability
promotion
listing URL
```

→ `Offer`

---

# 24. Price Semantics

Сохранять:

```text
exact price
price_from
old price
discounted price
```

как разные semantics.

Не превращать `от 4.5m` в exact unit price.

---

# 25. Availability Semantics

Сохранять:

```text
available
reserved
sold
unknown
removed
```

если source позволяет определить.

`removed listing` не означает `sold`.

---

# 26. Timeline Semantics

Различать:

```text
construction completion
handover
ready now
move-in readiness
```

Не подменять одно другим.

---

# 27. Financing Claims

Если source пишет:

```text
ПВ 0
семейная ипотека
ставка от ...
```

adapter сохраняет:

```text
claim
+
evidence
```

Не создаёт confirmed eligibility.

---

# 28. Evidence Mandatory

Для критичных extracted fields создать `FieldEvidence`.

Минимум для:

```text
price
availability
handover/readiness
financing claims
```

---

# 29. Evidence Fields

Минимум:

```text
entity_type
entity_id/candidate_id
field_path
raw_value
normalized_value
source_id
source_url
snapshot_id if allowed
collected_at
verification_status
extraction_confidence
evidence_reference
adapter_version
```

---

# 30. Verification Default

Adapter сам не ставит:

```text
confirmed
```

если source model этого не разрешает.

Default для source claim:

```text
claimed
```

или appropriate `unconfirmed`.

---

# 31. Extraction Confidence

Adapter может вернуть:

```text
extraction_confidence
```

но это не verification confidence.

---

# 32. Normalization Layer

Source-specific extraction mapping должен преобразовываться в canonical fields.

Пример:

```text
"2-комн."
→ rooms = 2
```

---

# 33. Raw Preservation

Если raw value:

```text
"от 4 500 000 ₽"
```

нужно сохранить raw representation в evidence.

---

# 34. Unknown Preservation

Если field отсутствует:

```text
unknown
```

Не:

```text
false
0
""
```

---

# 35. Partial Success

Adapter может завершиться:

```text
partial
```

если critical subset извлечён, но некоторые fields отсутствуют.

Это нормальный result.

---

# 36. Hard Failure

Примеры:

```text
source blocked by policy
unexpected content type
page unavailable
schema changed critically
authentication required unexpectedly
```

---

# 37. Source Changed Detection

Если expected selectors/structure исчезли:

вернуть:

```text
SOURCE_CHANGED
```

или эквивалент.

Не продолжать extraction с случайными values.

---

# 38. No Brittle Silent Parsing

Если selector теперь указывает другой element:

tests должны ловить semantic mismatch через validation/invariants.

---

# 39. Fixture Snapshot

Создать минимальный legal/synthetic test fixture, отражающий structure source adapter.

Если правовой статус raw source HTML не позволяет хранить копию:

создать manually authored synthetic HTML/JSON fixture.

---

# 40. Synthetic Fixture Must Preserve Shape, Not Content

Fixture может имитировать:

- DOM structure;
- field labels;
- JSON response shape;

но не копировать большой объём source content.

---

# 41. Adapter Tests Must Be Offline

CI tests не должны зависеть от live source.

---

# 42. Optional Live Smoke Test

Допустим отдельный manually-triggered smoke test:

```text
live:source-adapter
```

только если policy разрешает.

Он не должен запускаться в CI.

---

# 43. Live Test Is Not Acceptance Requirement

Основные Acceptance Criteria проверяются fixture tests.

---

# 44. Idempotency

Один и тот же source record должен иметь stable external identity.

Повторная обработка не должна создавать новый physical Property без причины.

---

# 45. External ID

Если source предоставляет stable listing/unit ID:

сохранять его как external identity evidence.

---

# 46. Canonical URL

Если source позволяет canonical URL:

сохранять отдельно от original fetched URL.

---

# 47. Duplicate Hook

После normalization вызвать существующий duplicate candidate mechanism.

TASK-014 не реализует финальный dedup engine.

---

# 48. Same Property, Different Offer

Если adapter импортирует Offer для уже существующего Property:

создать новый Offer/refresh existing Offer согласно identity rules.

Не дублировать Property.

---

# 49. Conflict Creation

Если новое evidence противоречит canonical field:

не перезаписывать silently.

Создать/обновить `SourceConflict`.

---

# 50. No Silent Downgrade

Если новый source result имеет lower confidence/stale/partial data:

не затирать более сильное canonical evidence без conflict/resolution policy.

---

# 51. Matching Readiness

После normalization вернуть structured readiness:

```yaml
matching_readiness:
  ready:
  missing_critical_fields:
  warnings:
```

---

# 52. Ready Does Not Mean Complete

Property может быть ready for matching с unknowns.

---

# 53. Collection Result Status

Поддержать минимум:

```text
success
partial
blocked
source_changed
unavailable
failed
```

---

# 54. Error Codes

Минимум:

```text
POLICY_DENIED
SOURCE_CHANGED
FETCH_FAILED
TIMEOUT
UNEXPECTED_CONTENT_TYPE
PARSE_FAILED
VALIDATION_FAILED
NORMALIZATION_FAILED
RATE_LIMITED
AUTH_REQUIRED
```

---

# 55. Retry Policy

Adapter не должен бесконечно retry.

Retryable:

```text
timeout
temporary 5xx
rate limit according policy
```

Non-retryable:

```text
policy denied
source changed
validation logic error
```

---

# 56. Retry Config

Количество retries/backoff централизовано.

Не magic numbers в adapter.

---

# 57. Rate Limits

Следовать Source Policy / collection plan.

Не превышать configured concurrency/interval.

---

# 58. No Anti-Bot Circumvention

Если source возвращает:

```text
CAPTCHA
bot challenge
access denied
```

adapter:

```text
stop
→ report
→ fallback according policy
```

Не использовать stealth.

---

# 59. Logging

Structured log минимум:

```text
collection_run_id
source_id
task_id
method
status
duration
records_processed
fields_extracted
warnings
error_code
```

---

# 60. Metrics Hook

Можно заложить:

```text
success_rate
partial_rate
parse_error_rate
source_changed_count
average_duration
```

Без полноценной observability platform.

---

# 61. Adapter Versioning

Например:

```text
<source-id>-adapter-v1
```

Любое breaking extraction change должно менять version.

---

# 62. Parser/Normalizer Versioning

Сохранять отдельно, если это разные modules:

```text
adapter_version
normalization_version
schema_version
```

---

# 63. Policy Decision Audit

CollectionRun должен сохранять reference/metadata:

```text
policy_version
registry_version
operation
allowed_method
```

---

# 64. No Unapproved Runtime Override

Нельзя добавлять:

```text
force=true
ignorePolicy=true
```

в production path.

---

# 65. Development Override

Если test harness требует override:

он должен:

- работать только test environment;
- быть невозможен в production;
- быть очевидно назван;
- не менять registry policy.

---

# 66. Source Selection Record

В TASK deliverable указать:

```text
Selected source:
Why selected:
Environment:
Allowed operation:
Allowed method:
Policy decision:
```

---

# 67. If Selected Source Is From Pilot Matrix

Сопоставить runtime Source Registry entry с `pilot-source-matrix.md`.

Если текущий registry отличается от matrix:

сообщить `SPEC CONFLICT / POLICY UPDATE REQUIRED`.

Не исправлять молча.

---

# 68. Recommended First PoC Profile

Предпочтительно source с:

```text
concrete Property/Offer page
exact unit/listing identity
price
area
rooms
floor
availability
```

и без сложной authenticated navigation.

---

# 69. Not Recommended for First Adapter

Если есть выбор, не начинать с:

- broad marketplace search pages;
- account-only API;
- CAPTCHA-heavy flow;
- map provider;
- bank rules;
- source with unresolved permission.

---

# 70. Unit Tests — Parsing

Минимум:

1. external ID;
2. property type;
3. rooms;
4. area;
5. floor;
6. price;
7. price_from;
8. availability;
9. handover/readiness;
10. financing claim.

Только fields applicable выбранному source.

---

# 71. Unit Tests — Semantics

Минимум:

1. price_from not exact;
2. unknown not false;
3. claim not confirmed;
4. removed not sold;
5. timeline semantics preserved;
6. Property/Offer separated.

---

# 72. Unit Tests — Policy

Минимум:

1. adapter refuses wrong source;
2. adapter does not run if policy denies;
3. adapter only uses allowed method;
4. environment gate respected.

---

# 73. Unit Tests — Errors

Минимум:

1. missing expected structure;
2. malformed price;
3. empty page;
4. source changed;
5. timeout mapping;
6. policy denied.

---

# 74. Integration Test A — End-to-End Fixture

```text
CollectionTask
→ SourcePolicy
→ Adapter
→ RawResult
→ Validation
→ Normalization
→ FieldEvidence
→ Property + Offer Candidate
→ Matching Readiness
```

---

# 75. Integration Test B — Partial Result

```text
price present
area present
availability missing
```

Expected:

```text
partial
availability unknown
candidate retained
```

---

# 76. Integration Test C — Conflict

Existing canonical price:

```text
4.9m
```

New source evidence:

```text
5.1m
```

Expected:

```text
SourceConflict
```

а не silent overwrite.

---

# 77. Integration Test D — Duplicate

Existing Property matched strongly.

Expected:

```text
same Property
new/updated Offer
```

если identity rules это подтверждают.

---

# 78. Integration Test E — Policy Denied

Expected:

```text
adapter not invoked
collection status blocked
```

---

# 79. Network Security

Если adapter использует HTTP:

- SSRF-safe target;
- redirects checked;
- timeout;
- response size limit;
- content-type allowlist;
- TLS validation.

---

# 80. Secrets

Если API/source requires secret:

- secret только через environment;
- `.env.example` содержит placeholder name;
- secret не логируется;
- secret не попадает в fixture.

---

# 81. No Database Requirement

Если persistence layer ещё не существует:

использовать staging/application repository abstraction или file/test fixture output.

Не создавать DB schema в рамках TASK-014.

---

# 82. No UI Requirement

TASK-014 — data-collection task.

UI для adapter не нужен.

Можно добавить minimal developer diagnostics only if existing app conventions require it.

---

# 83. README

Создать короткий adapter README:

```text
source
policy prerequisites
collection method
supported fields
known limitations
fixture strategy
live smoke test instructions
```

---

# 84. Acceptance Criteria

TASK-014 считается завершённой, если:

1. выбран ровно один policy-approved PoC source;
2. selection/policy decision зафиксированы;
3. adapter реализует provider-agnostic interface;
4. adapter не запускается без policy allow;
5. используется только разрешённый method;
6. raw result отделён от canonical model;
7. validation layer работает;
8. Property и Offer разделены;
9. critical fields получают evidence;
10. claims не становятся confirmed;
11. price_from сохраняется;
12. partial results поддерживаются;
13. source_changed распознаётся;
14. duplicate hook вызывается;
15. conflicts не перезаписываются молча;
16. matching readiness формируется;
17. tests offline;
18. anti-bot circumvention отсутствует;
19. policy denied case протестирован;
20. typecheck/lint/test/build проходят.

---

# 85. Blocked Completion Rule

Если policy-approved source отсутствует, TASK не считается полностью выполненной как live PoC.

Допустимый отчёт:

```text
Adapter framework: implemented
Fixture pipeline: implemented
Live source adapter: blocked
Blocker: no approved source/method in Source Registry
```

Не писать `Done`, если live source gate не пройден.

---

# 86. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан отдельный command:

```text
<package-manager> test:source-adapter
```

Optional manual-only:

```text
<package-manager> smoke:source-adapter
```

если policy разрешает.

---

# 87. Deliverable Report

После выполнения сообщить:

```text
Selected source:
Environment:
Policy decision:
Collection method:
Adapter version:
Supported fields:
Raw result:
Normalization:
Evidence:
Duplicate/conflict behavior:
Matching readiness:
Fixture strategy:
Live smoke:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Policy blockers:
Spec conflicts:
Spec deviations:
```

---

# 88. Do Not Continue Automatically

После TASK-014:

**не начинать следующую задачу самостоятельно.**

---

# 89. Likely Next Task

После успешного PoC логичная следующая задача:

```text
TASK-015 — Refresh Queue & Update Orchestration
```

Она должна связать:

```text
freshness
recommended checks
source health
policy
priority
```

с controlled refresh tasks.

Если live adapter остаётся blocked по policy, сначала нужно закрыть source approval blocker.

---

# 90. Definition of Done

TASK-014 Done, когда один разрешённый source end-to-end проходит путь:

```text
Policy-approved source
      ↓
Adapter
      ↓
Raw Result
      ↓
Validation
      ↓
Normalization
      ↓
Evidence
      ↓
Duplicate / Conflict handling
      ↓
Matching-ready Property / Offer candidate
```

без обхода source policy, без silent assumptions и без прямой записи source data в canonical model.

---

# 91. Главный принцип для coding-agent

Первый adapter нужен не для максимального количества объектов.

Он нужен для проверки архитектуры на реальном source boundary.

Главное правило:

> **Сначала докажите, что один разрешённый источник корректно проходит весь pipeline. Только после этого масштабируйте collection на другие источники.**
