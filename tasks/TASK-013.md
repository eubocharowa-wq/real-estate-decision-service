# TASK-013 — Source Registry & Policy Engine

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone D — Live Source PoC`

---

# 1. Goal

Реализовать единый runtime **Source Registry & Policy Engine**, который определяет:

- какие источники известны системе;
- какие типы данных они покрывают;
- каким способом их разрешено обрабатывать;
- можно ли автоматически получать данные;
- можно ли хранить результат;
- можно ли показывать данные пользователю;
- можно ли обновлять их повторно;
- как нужно указывать источник;
- какие freshness/source-health правила применяются;
- какой collector/adapter разрешён для конкретного source.

Главный результат:

> ни один ingestion/collection flow не должен решать самостоятельно, «можно ли работать с этим сайтом». Это решение должно централизованно принимать Source Policy Engine.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-002.md
tasks/TASK-005.md
tasks/TASK-008.md
tasks/TASK-012.md

docs/04-data/source-model.md

docs/06-data-collection/openclaw-role.md
docs/06-data-collection/sources.md
docs/06-data-collection/pilot-source-matrix.md
docs/06-data-collection/update-strategy.md
docs/06-data-collection/ingestion-flow.md

docs/08-roadmap/implementation-plan.md
```

---

# 3. Dependencies

TASK-013 предполагает наличие formal contracts из TASK-002:

```text
Source
SourcePolicy
SourceSnapshot
FieldEvidence
CollectionRun
```

или их эквивалентов.

Если `SourcePolicy` не был формализован в TASK-002, допускается создать **application/domain contract** в рамках TASK-013, но нельзя менять смысл существующей source architecture.

---

# 4. In Scope

Реализовать:

1. Source Registry;
2. Source Policy contract;
3. runtime policy resolver;
4. source identification by hostname/domain;
5. collection-method policy;
6. access/storage/display/refresh permissions;
7. attribution requirements;
8. source status/health metadata;
9. field-specific source priority metadata;
10. field freshness policy metadata;
11. environment-specific approval;
12. policy decision audit structure;
13. fixture registry based on pilot source matrix;
14. integration with TASK-012 User URL Ingestion;
15. unit/integration tests.

---

# 5. Out of Scope

Не реализовывать в TASK-013:

- scraping adapters;
- OpenClaw browser collection;
- marketplace API integrations;
- production legal approval;
- source contract negotiation;
- scheduled refresh queue execution;
- source monitoring crawler;
- admin UI;
- real credentials;
- source analytics dashboard.

---

# 6. Core Architecture

Правильная зависимость:

```text
Source Registry
      ↓
Source Policy Engine
      ↓
Policy Decision
      ↓
Collection Orchestrator / User URL Ingestion
      ↓
Allowed Collector / Adapter
```

Не:

```text
Adapter
↓
сам решает, можно ли использовать источник
```

---

# 7. Source Registry

Создать единый runtime registry, например:

```ts
sourceRegistry
```

или эквивалент.

Каждая запись должна описывать известный source.

---

# 8. Source Identity

Минимум:

```yaml
source:
  source_id:
  name:
  source_type:
  domains:
  base_url:
  geography:
  coverage:
  status:
  environment_approval:
```

---

# 9. Source ID

Использовать стабильный opaque ID.

Например:

```text
src_dev_001
src_market_001
src_fin_001
```

Не строить бизнес-логику на человекочитаемом имени source.

---

# 10. Source Types

Поддержать минимум:

```text
developer_site
project_site
classified
agency_site
bank_site
government
registry
map_service
poi_provider
user_link
manual_expert
partner_feed
api
other
```

Следовать enum TASK-002, если naming отличается.

---

# 11. Source Status

Поддержать минимум:

```text
candidate
testing
active
degraded
paused
blocked
deprecated
manual_only
```

---

# 12. Status ≠ Legal Permission

`active` не должен автоматически означать:

```text
can_store = true
can_display = true
```

Все permission dimensions хранятся отдельно.

---

# 13. Environment Approval

Нужно различать минимум:

```text
development
test
pilot
production
```

Источник может быть:

```text
allowed in test
not approved in production
```

---

# 14. Production Gate

В registry/policy должна поддерживаться последовательность:

```text
TECHNICALLY_POSSIBLE
ACCESS_TERMS_CHECKED
RIGHT_TO_STORE_CONFIRMED
RIGHT_TO_DISPLAY_CONFIRMED
RIGHT_TO_REFRESH_CONFIRMED
ATTRIBUTION_DEFINED
PRODUCTION_APPROVED
```

Не обязательно буквально теми же enum, но смысл должен сохраняться.

---

# 15. Policy Dimensions

Source Policy должна отвечать минимум на:

```text
can_access
can_automate
can_store
can_display
can_refresh
can_derive
can_cache
```

Если какая-то dimension пока не нужна application layer, всё равно не сводить политику к одному boolean.

---

# 16. Policy Decision Contract

Рекомендуемый result:

```yaml
source_policy_decision:
  source_id:
  environment:
  operation:
  allowed:
  access:
  automation:
  storage:
  display:
  refresh:
  attribution:
  allowed_methods:
  required_conditions:
  reason_codes:
  policy_version:
  decided_at:
```

---

# 17. Operations

Поддержать минимум policy decisions для:

```text
identify
user_url_ingest
scheduled_collect
targeted_refresh
display
store
manual_import
expert_verification
```

---

# 18. Allowed Collection Methods

Поддержать минимум:

```text
api
partner_feed
xml_feed
http
browser
openclaw
manual
user_supplied
expert
none
```

---

# 19. Method Priority

По docs приоритет методов:

```text
API / partner feed
>
structured feed
>
HTTP
>
browser / OpenClaw
>
manual
```

Но только среди **разрешённых** методов.

---

# 20. No Automatic Fallback to Browser

Если API недоступен:

не переходить автоматически к OpenClaw/browser, если policy этого не разрешает.

---

# 21. Manual-only Sources

Для:

```text
manual_only
blocked automation
permission_required
partner_api_only
```

policy должен возвращать безопасный manual/partner flow.

---

# 22. Source Identification

Создать resolver:

```ts
identifySource(url)
```

Он должен:

- parse hostname;
- match known domains;
- support subdomains;
- return unknown source explicitly;
- not make policy decision itself.

---

# 23. Domain Matching

Поддержать:

```text
example.com
www.example.com
sub.example.com
```

с controlled wildcard semantics.

Не использовать небезопасное:

```ts
hostname.includes("example.com")
```

---

# 24. Unknown Source

Unknown source result:

```text
source_id = null
status = unknown
```

Policy default:

```text
automation denied
storage/display only according manual/user supplied flow
```

Не считать unknown source разрешённым.

---

# 25. Source Coverage

Registry должен позволять описать:

```text
property types
market types
geography
entity types
field coverage
```

Пример:

```text
new-build units
developer promotions
financing claims
```

---

# 26. Field-specific Source Priority

Нужно поддержать разные strengths для разных fields.

Пример:

```text
developer source
→ strong for unit availability

bank source
→ strong for financing offer

government source
→ strong for program rules
```

Не использовать universal source ranking.

---

# 27. Field Priority Contract

Например:

```yaml
field_authority:
  field_pattern:
  priority:
  authority_type:
  notes:
```

---

# 28. Source Trust vs Verification

Даже высокоприоритетный source не превращает marketing claim автоматически в confirmed.

Policy metadata влияет на evidence evaluation, но не отменяет verification semantics.

---

# 29. Freshness Policy

Registry должен позволять field-specific freshness requirements.

Минимум для:

```text
price
availability
promotion
financing rate
initial payment
handover date
static property facts
```

---

# 30. Freshness Values

Не hardcode product TTL в React/components.

Хранить policy/config, например:

```yaml
freshness:
  target_ttl:
  stale_after:
  critical_after:
```

---

# 31. TTL Values Are Configurable

Значения из `update-strategy.md` считаются examples/provisional.

TASK-013 не должна объявлять их immutable product truth.

---

# 32. `valid_until` Overrides Generic TTL

Если promotion/offer имеет:

```text
valid_until
```

это важнее generic freshness TTL.

---

# 33. Attribution

Source Policy должна позволять хранить:

```text
attribution_required
attribution_label
link_required
logo_allowed
display_restrictions
```

Не обязательно использовать logo в MVP.

---

# 34. No Invented Attribution Rights

Если docs не подтверждают право использовать logo:

не ставить:

```text
logo_allowed = true
```

по умолчанию.

---

# 35. Storage Policy

Различать:

```text
raw_content_storage
normalized_data_storage
snapshot_storage
derived_data_storage
```

Источник может разрешать не все типы одинаково.

---

# 36. Display Policy

Различать минимум:

```text
normalized facts
source link
evidence snippet
raw content
image/media
```

---

# 37. Refresh Policy

Поддержать:

```text
scheduled
targeted
user_triggered
manual_only
none
```

---

# 38. Collection Rate Metadata

Registry может хранить:

```text
min_interval
max_concurrency
daily_budget
```

как operational policy.

Но TASK-013 не реализует scheduler.

---

# 39. Source Health

Поддержать runtime health metadata:

```text
healthy
degraded
failing
unknown
```

---

# 40. Source Health ≠ Source Status

Пример:

```text
status = active
health = degraded
```

Источник разрешён, но временно плохо работает.

---

# 41. Health Inputs

Архитектурно заложить:

- recent success rate;
- recent error rate;
- last successful run;
- source_changed;
- auth issue;
- rate limited.

TASK-013 может использовать fixture values.

---

# 42. `source_changed`

Если parser/adapter обнаружил структурное изменение:

policy/runtime state должен позволять:

```text
health = degraded
reason = SOURCE_CHANGED
```

---

# 43. Versioning

Registry должен иметь:

```text
registry_version
policy_version
```

---

# 44. Auditability

Каждое policy decision должно быть воспроизводимо по:

```text
source_id
operation
environment
registry_version
policy_version
```

---

# 45. No Silent Policy Mutation

Изменения source policy должны быть видны в Git/config diff.

Не хранить production permissions только в scattered code conditions.

---

# 46. Configuration Location

Рекомендуемо:

```text
config/sources/
```

или:

```text
src/data-collection/source-registry/
```

Допустима JSON/YAML/TS config, если она:

- typed;
- validated;
- reviewable;
- versioned.

---

# 47. Schema Validation

Source Registry config должен проходить runtime validation.

Invalid source config должен ломать tests/build, а не silently ignore.

---

# 48. No Secrets

Registry не хранит:

- API keys;
- passwords;
- auth tokens;
- cookies.

Только secret references/config keys допустимы.

---

# 49. Secret Reference

Если source требует credentials:

```text
credential_ref = "SOURCE_X_API_KEY"
```

без значения secret.

---

# 50. Pilot Source Matrix Fixtures

Создать registry fixtures по текущему `pilot-source-matrix.md`.

Не трактовать их как production approval.

---

# 51. Required Pilot Source Entries

Минимум включить:

```text
DEV-01 Консоль
DEV-02 ВНЕШСТРОЙ
DEV-03 ОСТ
DEV-04 Стройкомплект
DEV-05 Новая Тула
DEV-06 Фамилия

MKT-01 ЦИАН
MKT-02 Яндекс Недвижимость
MKT-03 Домклик
MKT-04 Авито

FIN-01 ДОМ.РФ
FIN-02 ВТБ

GEO-01 Яндекс Карты
```

---

# 52. Important Matrix Semantics

Registry fixtures должны сохранить текущие conclusions из matrix:

```text
PERMISSION_REQUIRED
REVIEW_REQUIRED
PARTNER_API_ONLY
DO_NOT_AUTOCOLLECT
PARTNER_CHANNEL
```

в typed policy fields / reason codes.

---

# 53. Production Safety Rule

Ни один pilot source не должен стать:

```text
production_approved = true
```

только потому, что он есть в registry.

---

# 54. Example — Classified Source

Для source с policy:

```text
PARTNER_API_ONLY
DO_NOT_AUTOCOLLECT
```

expected decision:

```text
scheduled_collect via browser → denied
user_url_ingest via browser → denied
partner_api → conditionally allowed if configured
manual user input → allowed
```

---

# 55. Example — Developer Site under Review

Если:

```text
REVIEW_REQUIRED
```

test/pilot automatic PoC может быть разрешён только если configuration явно это допускает.

Production:

```text
denied until approval gate complete
```

---

# 56. Example — Government Source

Для authoritative government program data:

policy может иметь:

```text
high authority for program rules
```

но display/storage всё равно должны быть явными.

---

# 57. Example — Map Provider

Map source может разрешать:

```text
query usage
```

но запрещать/ограничивать:

```text
persistent storage of normalized geodata
```

Policy model должна уметь выразить это различие.

---

# 58. User URL Ingestion Integration

TASK-012 должна использовать `SourcePolicyResolver` из TASK-013 вместо fixture-only logic.

Flow:

```text
URL
→ identifySource
→ resolvePolicy(user_url_ingest)
→ choose allowed method
```

---

# 59. Collection Orchestrator Hook

Создать interface пригодный для будущего:

```ts
resolveCollectionPlan({
  source,
  operation,
  entityType,
  environment
})
```

---

# 60. Collection Plan

Рекомендуемый result:

```yaml
collection_plan:
  allowed:
  preferred_method:
  fallback_methods:
  storage_policy:
  display_policy:
  freshness_policy:
  attribution_policy:
  reason_codes:
```

---

# 61. No Collector Execution

TASK-013 формирует plan.

Она не запускает HTTP/OpenClaw/API collector.

---

# 62. Source Policy Reason Codes

Поддержать structured codes, например:

```text
PRODUCTION_NOT_APPROVED
PERMISSION_REQUIRED
PARTNER_API_ONLY
DO_NOT_AUTOCOLLECT
MANUAL_ONLY
SOURCE_BLOCKED
SOURCE_DEPRECATED
AUTOMATION_ALLOWED
STORAGE_NOT_APPROVED
DISPLAY_NOT_APPROVED
REFRESH_NOT_APPROVED
ATTRIBUTION_REQUIRED
SOURCE_DEGRADED
SOURCE_UNKNOWN
```

---

# 63. Deterministic Decisions

Обязательный invariant:

```text
same registry version
+
same operation
+
same environment
+
same source
=
same policy decision
```

---

# 64. Environment Overrides

Допустима структура:

```text
base policy
+
environment override
```

Но production override не должен случайно расширять права без explicit config.

---

# 65. Fail Closed

Если policy config неполный:

автоматизация должна быть:

```text
denied
```

а не разрешена.

---

# 66. Missing Permission

Если:

```text
can_store = unknown
```

система не должна считать:

```text
can_store = true
```

---

# 67. No Legal Inference by Code

Policy Engine не определяет право использования по тексту сайта автоматически.

Он исполняет уже зафиксированную review decision/config.

---

# 68. Source Onboarding State

Registry должен позволять source пройти стадии:

```text
candidate
testing
review_required
approved_for_pilot
production_approved
paused
blocked
deprecated
```

Если Source status enum TASK-002 отличается, использовать отдельный approval lifecycle field.

---

# 69. Source Capability Matrix

Для каждого source можно хранить:

```text
discover
collect
refresh
verify
user_url_ingest
display
```

---

# 70. Source Field Coverage

Пример:

```yaml
fields:
  price:
    supported: true
  availability:
    supported: true
  financing:
    supported: partial
```

Не обязательно моделировать каждый property field в v1, если contract позволяет pattern/group coverage.

---

# 71. Coverage Gaps

Policy/registry должен позволять distinguish:

```text
source has no result
```

от:

```text
source does not cover this entity/field
```

---

# 72. No Market-wide Conclusion

Если source coverage неполная:

другие layers не должны делать вывод:

```text
на рынке ничего нет
```

только по absence in this source.

---

# 73. Health-aware Planning

Если source:

```text
health = degraded
```

Collection Plan может выбрать разрешённый fallback method.

Но только из allowed methods.

---

# 74. No Policy Circumvention via Fallback

Если:

```text
browser denied
```

degraded API не означает:

```text
try browser anyway
```

---

# 75. Tests — Registry Validation

Минимум:

1. unique source IDs;
2. valid domains;
3. valid source types;
4. no duplicate domain ownership without explicit rule;
5. status valid;
6. production approvals explicit;
7. no secrets;
8. policy version present.

---

# 76. Tests — Source Identification

Минимум:

1. exact domain;
2. www subdomain;
3. known subdomain;
4. unknown domain;
5. malicious lookalike domain;
6. internationalized domain if used.

---

# 77. Lookalike Domain Test

Например:

```text
cian.ru.evil.example
```

не должен match source `cian.ru`.

---

# 78. Tests — Policy Decisions

Минимум:

1. active approved source operation allowed;
2. permission-required source denied in production;
3. partner-api-only source browser denied;
4. manual-only source manual allowed;
5. blocked source denied;
6. unknown source automation denied;
7. storage permission independent of access;
8. display permission independent of storage;
9. refresh permission independent;
10. attribution requirement returned.

---

# 79. Tests — Environment

Минимум:

```text
test allowed
production denied
```

для source under review.

---

# 80. Tests — Pilot Matrix

Проверить, что fixture policies отражают matrix.

Особенно:

- ЦИАН;
- Домклик;
- Авито;
- Фамилия;
- Яндекс Карты;
- ДОМ.РФ.

---

# 81. Integration Test — User URL

Flow:

```text
User URL
→ source identification
→ policy decision
→ allowed fixture adapter
```

и restricted case:

```text
User URL
→ source identification
→ automation denied
→ manual fallback
```

---

# 82. Integration Test — Collection Plan

Flow:

```text
source
+
target field
+
operation
+
environment
→ collection plan
```

---

# 83. No Network Tests Required

TASK-013 tests должны быть deterministic и не ходить в internet.

---

# 84. No Web Research in Runtime

Source policy не должна dynamically search web every time ingestion runs.

Policy updates происходят через explicit reviewed config changes.

---

# 85. README

Создать короткую техническую документацию, например:

```text
src/data-collection/source-registry/README.md
```

или:

```text
config/sources/README.md
```

Содержимое:

- purpose;
- config structure;
- approval lifecycle;
- how to add source;
- how to change policy;
- fail-closed rule;
- secrets prohibition.

---

# 86. Adding New Source Rule

Новый source нельзя считать production-ready, пока не заполнены:

```text
identity
coverage
access
storage
display
refresh
attribution
allowed methods
approval state
```

---

# 87. Source Change Review

Любое изменение:

```text
blocked → active
can_store false → true
production_approved false → true
```

должно быть явным Git diff.

---

# 88. Acceptance Criteria

TASK-013 считается завершённой, если:

1. существует единый Source Registry;
2. source identification работает;
3. policy dimensions разделены;
4. access != storage != display != refresh;
5. allowed collection methods явные;
6. unknown source fail-closed;
7. environment approval работает;
8. production approval explicit;
9. field-specific authority metadata поддерживается;
10. freshness policy поддерживается;
11. attribution policy поддерживается;
12. source health metadata поддерживается;
13. policy reason codes structured;
14. collection plan формируется;
15. TASK-012 использует policy resolver;
16. pilot source matrix represented as typed fixtures/config;
17. restricted sources не запускают automation;
18. no secrets in registry;
19. deterministic tests проходят;
20. typecheck/lint/test/build проходят.

---

# 89. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан отдельный command:

```text
<package-manager> test:source-policy
```

или эквивалент.

---

# 90. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Registry version:
Policy version:
Sources configured:
Policy dimensions:
Environment behavior:
Collection methods:
Freshness policy:
Attribution policy:
Pilot matrix mapping:
TASK-012 integration:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 91. Do Not Continue Automatically

После TASK-013:

**не начинать следующую задачу самостоятельно.**

---

# 92. Likely Next Task

Следующая логичная задача:

```text
TASK-014 — First Approved Source Adapter PoC
```

Она должна взять **один источник, прошедший соответствующий policy gate**, и реализовать первый end-to-end adapter:

```text
Source
→ Collector
→ RawResult
→ Validation
→ Normalization
→ Evidence
→ Pilot DB / fixture pipeline
```

Если ни один source ещё не production-approved, TASK-014 должна работать только в явно разрешённом PoC/test режиме либо ждать approval.

---

# 93. Definition of Done

TASK-013 Done, когда система для любого известного источника может детерминированно ответить:

- кто это;
- что он покрывает;
- разрешено ли обращаться к нему;
- каким методом;
- можно ли хранить результат;
- можно ли показывать данные;
- можно ли обновлять;
- как нужно указывать источник;
- какие freshness правила применяются;
- разрешён ли этот источник в текущем environment.

---

# 94. Главный принцип для coding-agent

Наличие URL и техническая возможность открыть страницу не означают право использовать источник в продукте.

Правильная модель:

```text
Source exists
      ↓
Policy known
      ↓
Operation requested
      ↓
Environment checked
      ↓
Allowed collection method selected
      ↓
Only then collection
```

Главное правило:

> **Технически доступно ≠ разрешено для автоматизации, хранения, показа и обновления. Source Policy Engine должен быть обязательным gate перед collection.**
