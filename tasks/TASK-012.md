# TASK-012 — User URL Ingestion

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone C — Pilot Dataset / User-Supplied Candidate`

---

# 1. Goal

Реализовать безопасный application flow:

> пользователь вставляет ссылку на найденный им объект недвижимости, а сервис пытается привести этот вариант к тем же нормализованным `Property / Offer / Evidence` contracts, которые используются для собственного shortlist и comparison.

Главный результат:

```text
User URL
   ↓
Validation
   ↓
Source Identification
   ↓
Access / Policy Gate
   ↓
Allowed Ingestion Method
   ↓
Raw Extraction Result
   ↓
Schema Validation
   ↓
Normalization
   ↓
Evidence
   ↓
Property / Offer Candidate
   ↓
Deduplication Hook
   ↓
Matching / Comparison
```

Главный принцип:

> **Пользовательская ссылка не создаёт отдельный “второй тип” объекта. После ingestion вариант должен пройти тот же normalized pipeline, что и остальные объекты.**

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
tasks/TASK-008.md
tasks/TASK-009.md
tasks/TASK-010.md
tasks/TASK-011.md

docs/04-data/property-model.md
docs/04-data/source-model.md
docs/04-data/deduplication.md

docs/06-data-collection/openclaw-role.md
docs/06-data-collection/sources.md
docs/06-data-collection/pilot-source-matrix.md
docs/06-data-collection/ingestion-flow.md
docs/06-data-collection/update-strategy.md
```

---

# 3. Dependencies

TASK-012 предполагает наличие formal contracts:

```text
Property
Offer
Source
SourceSnapshot
FieldEvidence
SourceConflict
UserRequest
MatchResult
```

и application flows:

```text
Shortlist
Property Detail
Comparison
```

Если core contracts ещё не реализованы:

```text
TASK-012 is blocked
```

Не создавать ad-hoc `ImportedListing` как параллельную production-domain модель.

---

# 4. Scope

В рамках TASK-012 реализовать:

1. UI для вставки URL;
2. URL validation;
3. source/domain identification;
4. source-policy gate interface;
5. ingestion status model;
6. user URL ingestion orchestrator;
7. provider-agnostic ingestion adapter interface;
8. controlled fixture/mock adapter;
9. normalization into `Property` + `Offer`;
10. field-level `Evidence`;
11. partial extraction handling;
12. manual confirmation fallback;
13. duplicate-resolution hook;
14. insertion into comparison candidate flow;
15. error/status UI;
16. unit/integration tests.

---

# 5. Out of Scope

Не реализовывать в TASK-012:

- массовый crawling;
- обход CAPTCHA;
- stealth / anti-bot circumvention;
- production scraping запрещённых площадок;
- полный Source Registry management UI;
- background scheduled refresh;
- marketplace partnership APIs;
- final deduplication engine;
- database persistence;
- document review;
- expert workflow;
- automatic legal interpretation of source terms.

---

# 6. Entry Points

Пользователь должен иметь возможность добавить URL минимум из:

```text
Shortlist
Comparison
```

Опционально:

```text
Property Detail
```

CTA:

```text
Добавить свой вариант
```

или:

```text
Добавить ссылку
```

---

# 7. User Experience

Минимальный flow:

```text
Вставьте ссылку на объект
        ↓
Проверяем источник
        ↓
Пытаемся извлечь доступные данные
        ↓
Показываем, что удалось понять
        ↓
Пользователь подтверждает / исправляет
        ↓
Вариант добавляется в сравнение
```

---

# 8. User-facing Promise

Не обещать:

```text
Мы автоматически прочитаем любой сайт
```

Правильнее:

```text
Добавьте ссылку на найденный объект. Если источник можно обработать автоматически, мы извлечём данные. Если нет — предложим добавить ключевые параметры вручную.
```

---

# 9. URL Input Contract

Минимум:

```yaml
user_url_ingestion_input:
  url:
  user_request_id:
  comparison_id:
  locale:
```

`user_request_id` / `comparison_id` могут быть optional в зависимости от entry point.

---

# 10. URL Validation

Проверять минимум:

- URL parseable;
- protocol `http` / `https`;
- hostname present;
- no local/internal addresses;
- no unsupported schemes;
- reasonable maximum length.

---

# 11. SSRF Guard

Запрещать network fetch для:

```text
localhost
127.0.0.1
::1
private RFC1918 networks
link-local
cloud metadata endpoints
```

и других internal/private destinations.

Если fetch реализован server-side, SSRF protection обязательна.

---

# 12. URL Canonicalization

Нормализовать технические части:

- trim;
- lowercase hostname;
- remove obvious tracking params where safe;
- preserve path/query parameters that identify listing.

Не изменять URL так, чтобы потерять entity identity.

---

# 13. Source Identification

Создать функцию/сервис:

```text
identifySourceFromUrl(url)
```

Результат минимум:

```yaml
source_identification:
  hostname:
  known_source_id:
  source_type:
  confidence:
  policy_status:
```

---

# 14. Unknown Source

Не считать неизвестный source автоматически разрешённым.

Возвращать:

```text
unknown_source
```

и переходить к controlled policy/manual flow.

---

# 15. Policy Gate

Перед автоматическим fetch/extraction обязательно вызвать policy decision.

Рекомендуемый contract:

```yaml
ingestion_policy_decision:
  source_id:
  can_access:
  can_automate:
  can_store:
  can_display:
  allowed_methods:
  requires_manual_review:
  reason_code:
```

---

# 16. Policy Is Not Boolean

Не использовать один флаг:

```text
allowed = true
```

Нужно различать:

- можно открыть;
- можно автоматизировать;
- можно хранить;
- можно показывать;
- можно обновлять.

---

# 17. User URL Does Not Override Source Rights

Критическое правило:

> То, что пользователь сам вставил ссылку, не означает автоматически право сервиса массово извлекать, хранить и переиспользовать контент источника.

User-provided URL меняет initiation context, но не отменяет source policy.

---

# 18. Known Restricted Sources

Если source policy указывает:

```text
PARTNER_API_ONLY
PERMISSION_REQUIRED
DO_NOT_AUTOCOLLECT
manual_only
blocked
```

TASK-012 не должна пытаться обходить это ограничение.

---

# 19. Safe Fallback

Если automatic ingestion запрещён или недоступен:

пользователь получает:

```text
Не можем автоматически извлечь данные с этого источника.
Вы можете добавить основные параметры вручную.
```

---

# 20. Ingestion Modes

Поддержать минимум:

```text
automatic_allowed
fixture_mock
manual_confirmation
unsupported
blocked
```

Архитектура должна позволять позже добавить:

```text
api
feed
browser_agent
openclaw
partner_connector
```

---

# 21. Provider-Agnostic Interface

Рекомендуемый interface:

```ts
interface UserUrlIngestionAdapter {
  canHandle(context): boolean;
  ingest(context): Promise<RawIngestionResult>;
}
```

или эквивалент.

---

# 22. No OpenClaw Hard Dependency

TASK-012 не должна делать OpenClaw обязательным core component.

OpenClaw позже может стать одной реализацией adapter/collector.

---

# 23. Fixture Adapter

Обязательно реализовать deterministic adapter для tests.

Например:

```text
FixtureUserUrlAdapter
```

Он может работать с test URLs вида:

```text
https://fixture.local/property/...
```

без реального network access.

---

# 24. Optional Allowed HTTP Adapter

Если scaffold уже позволяет безопасно реализовать generic HTTP ingestion:

он должен быть строго за policy gate.

Но production crawling коммерческих площадок не является Acceptance Criteria этой TASK.

---

# 25. Raw Ingestion Result

Рекомендуемый contract:

```yaml
raw_ingestion_result:
  ingestion_id:
  source_id:
  source_url:
  collected_at:
  status:
  raw_fields:
  extraction_confidence:
  warnings:
  adapter_version:
```

---

# 26. Raw ≠ Canonical

Raw extraction не должен напрямую становиться `Property`.

Правильный flow:

```text
Raw
→ Validation
→ Normalization
→ Evidence
→ Candidate Property/Offer
```

---

# 27. Extracted Fields

Минимально пытаться получить:

```text
title
property type
market type
address / location
rooms
area
floor
price / price_from
seller
availability
publication/update date
description snippets relevant to normalized fields
financing claims
```

Только если данные реально есть.

---

# 28. No Invented Fields

Если source не содержит:

```text
exact unit price
```

не выводить его из:

```text
price_from
```

Если не указан gas connection:

не предполагать его.

---

# 29. Source Semantics Preservation

Сохранять различия:

```text
"от 4,5 млн"
≠
"4,5 млн за этот объект"
```

```text
"газ по границе"
≠
"газ подключён"
```

```text
"семейная ипотека"
≠
"этот конкретный объект подтверждённо подходит под программу"
```

---

# 30. Normalization Result

После normalization получить минимум:

```yaml
normalized_ingestion:
  property_candidate:
  offer_candidate:
  evidence:
  warnings:
  unresolved_fields:
```

---

# 31. Candidate IDs

До canonical dedup допустимо использовать temporary IDs:

```text
candidate_property_id
candidate_offer_id
```

Но они не должны маскироваться под окончательные canonical IDs.

---

# 32. Property / Offer Separation

Даже из одной listing page необходимо создать отдельно:

```text
Property candidate
Offer candidate
```

---

# 33. Financing Claims

Если URL содержит:

```text
ПВ 0
семейная ипотека
ставка от ...
```

это должно попадать в:

```text
claim/evidence
```

а не автоматически в confirmed `PurchaseScenario`.

---

# 34. Evidence Mandatory for Critical Fields

Для extracted critical field сохранять:

- field path;
- raw value;
- normalized value;
- source URL;
- collected_at;
- evidence snippet/reference;
- extraction confidence;
- verification status.

---

# 35. Extraction Confidence

Не использовать extraction confidence как verification status.

---

# 36. Verification Status for User URL

По умолчанию extracted marketing/listing values должны быть:

```text
claimed
```

или `unconfirmed` согласно Source Model.

Не `confirmed` только потому, что parser уверенно прочитал страницу.

---

# 37. Partial Extraction

Partial ingestion — нормальный исход.

Например:

```text
цена есть
площадь есть
этаж unknown
availability unknown
```

Не считать весь ingestion failed.

---

# 38. Ingestion Status

Поддержать минимум:

```text
received
source_identified
policy_checked
extracting
partial
needs_confirmation
ready_for_normalization
normalized
duplicate_candidate
ready_for_comparison
blocked
failed
```

---

# 39. Controlled Error Codes

Минимум:

```text
INVALID_URL
UNSUPPORTED_PROTOCOL
PRIVATE_NETWORK_BLOCKED
SOURCE_UNKNOWN
SOURCE_BLOCKED
AUTOMATION_NOT_ALLOWED
FETCH_FAILED
EXTRACTION_FAILED
INVALID_STRUCTURE
INSUFFICIENT_DATA
DUPLICATE_SUSPECTED
```

---

# 40. User-facing Status Text

Не показывать raw error codes.

Примеры:

```text
Не удалось прочитать эту страницу автоматически.
Источник требует ручного добавления данных.
Ссылка недоступна.
```

---

# 41. Manual Confirmation Screen

После extraction показать:

```text
Проверьте, правильно ли мы поняли объект
```

Минимум editable:

- object type;
- city/location;
- price;
- rooms;
- area;
- floor;
- availability if known;
- seller/source.

---

# 42. Manual Confirmation ≠ Property Verification

Если пользователь исправил:

```text
price = 4.9m
```

это не превращает external property fact в `confirmed_by_source`.

Нужно сохранить provenance:

```text
user_corrected / user_supplied
```

если formal evidence model это поддерживает.

Если такого статуса нет — использовать отдельный evidence/source type, не менять enum молча.

---

# 43. Manual-only Source

Для blocked/unsupported source пользователь может вручную заполнить минимум данных.

Такой candidate должен иметь:

```text
source_type = user_link / manual
```

и более низкий/неопределённый Data Confidence до дополнительной проверки.

---

# 44. Minimum Data for Comparison

Чтобы добавить candidate в comparison, минимум нужны:

```text
property_type
location at usable level
some identity information
price or explicit price unknown
```

Точный minimum должен быть centralized.

---

# 45. Insufficient Data

Если данных слишком мало:

показывать:

```text
Недостаточно данных для сравнения.
```

и список 1–3 необходимых полей.

---

# 46. Duplicate Hook

После normalization вызвать:

```text
findDuplicateCandidates(...)
```

или application hook.

TASK-012 не обязана реализовывать полноценный dedup engine, но не должна игнорировать возможность дубля.

---

# 47. Suspected Duplicate UX

Если candidate похож на уже существующий Property:

показать:

```text
Похоже, этот объект уже есть в сервисе.
```

и варианты:

```text
Использовать существующий объект
Добавить как отдельное предложение
```

в зависимости от dedup evidence.

---

# 48. Do Not Auto-Merge Weak Match

Слабый duplicate score не должен автоматически объединять Property.

False-positive merge хуже duplicate record.

---

# 49. Same Property, New Offer

Если physical Property совпадает, но source/seller/price отличаются:

создать новый `Offer`, а не новый физический Property.

---

# 50. Comparison Integration

После successful normalization candidate должен быть пригоден для:

```text
Criteria Evaluators
Matching Engine
Data Confidence Engine
Comparison
```

---

# 51. Match After Ingestion

Если active `UserRequest` существует:

после normalization можно вызвать существующий matching pipeline.

Не реализовывать отдельный «URL match».

---

# 52. No Fake Match

Если данных недостаточно для hard criterion:

результат должен быть:

```text
unknown
eligible_with_unknowns
insufficient_data
```

по существующей логике.

Не додумывать missing fields ради красивого Match Score.

---

# 53. Comparison CTA

После successful ingestion:

```text
Добавить в сравнение
```

---

# 54. Existing Comparison Limit

Если в comparison уже 4 объекта:

не добавлять пятый silently.

Показать:

```text
В сравнении уже 4 варианта. Удалите один, чтобы добавить новый.
```

---

# 55. Original URL Preservation

Сохранять:

```text
original_url
```

как provenance.

Не заменять только canonical source homepage.

---

# 56. Redirect Handling

Если fetch разрешён и URL редиректит:

- ограничить число redirects;
- повторно проверить destination against SSRF rules;
- сохранить final URL;
- сохранить original URL.

---

# 57. Content Type

Автоматический adapter должен принимать только ожидаемые безопасные content types.

Не обрабатывать arbitrary binaries как HTML.

---

# 58. Size Limits

Установить разумный max response size.

Не загружать гигантские pages/files в память без ограничений.

---

# 59. Timeout

Network adapter должен иметь timeout.

Не блокировать user request indefinitely.

---

# 60. No Browser Automation Requirement

TASK-012 не требует Playwright/browser/OpenClaw для production URLs.

Browser-based ingestion — отдельная capability за policy gate.

---

# 61. Test Source Matrix Compatibility

Если `pilot-source-matrix.md` помечает source как:

```text
PERMISSION_REQUIRED
PARTNER_API_ONLY
DO_NOT_AUTOCOLLECT
```

tests должны подтверждать, что automatic adapter не запускается.

---

# 62. Source Policy Stub / Adapter

Поскольку полноценный runtime Source Registry может быть следующей TASK, допустимо создать interface:

```ts
SourcePolicyResolver
```

с fixture implementation.

Не hardcode source rules непосредственно в React component.

---

# 63. No Production Approval by URL Pattern

Запрещено:

```text
if hostname.includes("...") allowed = true
```

без policy registry/config.

Hostname mapping может идентифицировать source, но policy decision должен быть отдельным.

---

# 64. UI Components

Рекомендуемые components:

```text
AddUrlDialog
UrlInput
IngestionStatus
SourcePolicyNotice
ExtractedPropertyPreview
ManualPropertyConfirmation
DuplicateCandidateNotice
IngestionErrorState
```

---

# 65. Application Services

Рекомендуемые services:

```text
validateUserUrl
identifySourceFromUrl
resolveIngestionPolicy
ingestUserUrl
normalizeUserUrlResult
buildUserUrlEvidence
```

---

# 66. Pure Domain Boundary

Normalization/evidence logic не должна зависеть от React.

---

# 67. Fixture URLs

Для tests создать deterministic fixtures, например:

```text
https://fixture.example/newbuild/101
https://fixture.example/secondary/202
https://fixture.example/house/303
```

---

# 68. Required Fixture Cases

Минимум:

1. normal apartment URL;
2. new-build `price_from`;
3. house with gas claim;
4. financing claim;
5. partial page;
6. duplicate property/new offer;
7. unsupported source;
8. blocked source;
9. invalid URL;
10. private-network URL.

---

# 69. Required Unit Tests

Минимум:

1. valid URL accepted;
2. invalid scheme rejected;
3. localhost rejected;
4. private IP rejected;
5. known source identified;
6. unknown source handled;
7. blocked source never fetched;
8. manual-only fallback;
9. Property/Offer separation;
10. price_from preserved;
11. claim not converted to confirmed;
12. partial extraction valid;
13. evidence created;
14. duplicate hook invoked;
15. same property/new offer preserved.

---

# 70. Integration Test A

Flow:

```text
Comparison
→ Add URL
→ fixture source allowed
→ extraction
→ confirmation
→ normalization
→ matching
→ add candidate to comparison
```

---

# 71. Integration Test B

Flow:

```text
Add restricted-source URL
→ policy denies automation
→ no fetch
→ manual confirmation path
→ candidate created with manual/user evidence
```

---

# 72. Integration Test C

Flow:

```text
Add duplicate URL
→ duplicate candidate detected
→ existing Property selected
→ new Offer preserved
```

---

# 73. Integration Test D

Flow:

```text
Add partial URL
→ required field missing
→ needs_confirmation
→ user fills field
→ candidate validates
```

---

# 74. Security Test

Обязательно проверить:

```text
http://127.0.0.1
http://localhost
http://169.254.169.254
private-network host
```

не fetchятся.

---

# 75. No Secrets in Fixtures

Не хранить:

- auth cookies;
- session tokens;
- private URLs;
- API keys.

---

# 76. Logging

Логировать минимум:

```text
ingestion_id
source_id
policy decision
adapter
status
duration
error code
```

Не логировать unnecessary personal data.

---

# 77. Observability

Необходимый минимум для debugging:

```text
received
policy_denied
adapter_started
adapter_finished
normalization_failed
candidate_ready
```

---

# 78. Idempotency

Повторная обработка одного URL в одной session не должна бесконтрольно создавать новые duplicate candidates.

Нужен idempotency hook по:

```text
canonical URL / source listing ID
```

если доступно.

---

# 79. Ingestion Versioning

Сохранять:

```text
adapter_version
normalization_version
schema_version
```

---

# 80. No Current Source Claims in Core Schema

Не зашивать в domain code:

```text
Avito always blocked
CIAN always ...
```

Политики могут меняться.

Они принадлежат registry/config.

---

# 81. Acceptance Criteria

TASK-012 считается завершённой, если:

1. пользователь может вставить URL;
2. URL безопасно валидируется;
3. SSRF-sensitive URLs блокируются;
4. source identification существует;
5. policy gate вызывается до automatic fetch;
6. restricted source не обрабатывается автоматически;
7. fixture adapter работает;
8. raw extraction отделён от normalized data;
9. Property и Offer создаются отдельно;
10. critical fields получают evidence;
11. claims не превращаются в confirmed facts;
12. partial ingestion поддерживается;
13. manual confirmation fallback работает;
14. duplicate hook существует;
15. same Property/new Offer сохраняется корректно;
16. candidate можно передать в Matching Engine;
17. candidate можно добавить в Comparison;
18. original URL сохраняется;
19. ошибки/statuses контролируемы;
20. tests проходят;
21. typecheck/lint/test/build проходят.

---

# 82. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан отдельный command:

```text
<package-manager> test:user-url-ingestion
```

или эквивалент.

---

# 83. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Route / entry points:
Policy gate:
Adapter interface:
Fixture adapter:
Normalization:
Evidence:
Manual fallback:
Duplicate handling:
Comparison integration:
Security tests:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 84. Do Not Continue Automatically

После TASK-012:

**не начинать следующую задачу самостоятельно.**

---

# 85. Likely Next Task

Следующая логичная задача:

```text
TASK-013 — Source Registry & Policy Engine
```

Она должна превратить source policy из interface/config boundary в полноценный runtime registry для:

- access;
- storage;
- display;
- refresh;
- attribution;
- collection method;
- health/status.

---

# 86. Definition of Done

TASK-012 Done, когда пользователь может принести найденную им ссылку, а сервис безопасно:

- определит источник;
- проверит разрешённый способ обработки;
- извлечёт доступные данные либо предложит ручной fallback;
- сохранит provenance;
- нормализует вариант в `Property + Offer`;
- не выдаст claims за confirmed facts;
- передаст объект в стандартный matching/comparison pipeline.

---

# 87. Главный принцип для coding-agent

User URL Ingestion — не shortcut вокруг архитектуры и не разрешение “скрейпить всё”.

Правильная модель:

```text
Пользователь дал ссылку
      ↓
Источник определён
      ↓
Политика проверена
      ↓
Разрешённый способ ingestion
      ↓
Raw evidence
      ↓
Normalization
      ↓
Property / Offer
      ↓
Matching / Comparison
```

Главное правило:

> **Ссылка пользователя расширяет выбор, но не отменяет требования к provenance, source policy, verification и качеству данных.**
