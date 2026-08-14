# TASK-019 — Real Buyer Pilot Hardening

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone F — Real Buyer Pilot`

---

# 1. Goal

Подготовить интегрированный продукт из TASK-018 к ограниченному пилоту с реальными покупателями.

TASK-019 не должна расширять функциональность без необходимости. Её задача — сделать существующий buyer journey:

- наблюдаемым;
- устойчивым к ошибкам;
- безопасным;
- понятным при неполных данных;
- пригодным для перехода от synthetic fixtures к реальным pilot data;
- измеримым с точки зрения продуктовой ценности;
- управляемым через release gates.

Главный результат:

> команда должна уметь дать продукт ограниченному числу реальных пользователей и понимать, что с ними происходит, где ломается путь, где не хватает данных и можно ли доверять выводам системы.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-005.md
tasks/TASK-007.md
tasks/TASK-008.md
tasks/TASK-009.md
tasks/TASK-010.md
tasks/TASK-011.md
tasks/TASK-012.md
tasks/TASK-013.md
tasks/TASK-014.md
tasks/TASK-015.md
tasks/TASK-016.md
tasks/TASK-017.md
tasks/TASK-018.md

docs/06-data-collection/sources.md
docs/06-data-collection/pilot-source-matrix.md
docs/06-data-collection/update-strategy.md
docs/06-data-collection/ingestion-flow.md

docs/07-expert-services/expert-layer.md

docs/08-roadmap/implementation-plan.md
docs/08-roadmap/backlog.md
```

---

# 3. Core Principle

TASK-019 — это hardening, а не feature expansion.

Правильная логика:

```text
Existing product
      ↓
Observe
      ↓
Find failure modes
      ↓
Add guards
      ↓
Add pilot data safely
      ↓
Measure user outcome
      ↓
Decide if pilot can expand
```

Не:

```text
Пилот ещё не запущен
→ добавим ещё десять функций
```

---

# 4. In Scope

Реализовать:

1. pilot release mode;
2. product telemetry contract;
3. buyer journey event tracking;
4. failure/error observability;
5. user feedback capture;
6. pilot session diagnostics;
7. source coverage diagnostics;
8. fixture/live-data separation;
9. real pilot data readiness checks;
10. source-policy release gates;
11. privacy/security hardening;
12. PII/data minimization review;
13. performance budget;
14. resilience/error recovery;
15. stale/unknown/conflict UX verification;
16. expert workflow pilot guards;
17. controlled feature flags;
18. pilot readiness checklist;
19. pilot test scenarios;
20. release/rollback procedure;
21. quality report.

---

# 5. Out of Scope

Не реализовывать:

- nationwide coverage;
- mass marketing;
- public unrestricted launch;
- full CRM;
- billing/subscriptions;
- B2B;
- mobile app;
- new property categories без необходимости;
- new Matching algorithm version без подтверждённого defect;
- new source adapters только ради количества;
- autonomous source expansion;
- bank approval;
- transaction execution;
- complex recommendation personalization by behavior.

---

# 6. Pilot Mode

Добавить explicit application mode:

```text
demo
pilot
production
```

или equivalent.

Для pilot mode должно быть понятно:

- какие data sources разрешены;
- какие capabilities включены;
- где используются fixture/mock flows;
- какие expert actions реально работают;
- какие source operations заблокированы.

---

# 7. No Hidden Demo Data

Synthetic Pilot Dataset нельзя незаметно смешивать с реальными объектами.

Каждая record provenance должна позволять определить:

```text
synthetic
manual_curated
approved_live_source
user_supplied
expert_supplied
```

---

# 8. Pilot Data Boundary

Пользовательский UI не должен показывать synthetic record как реальный live-market object.

Если pilot использует смешанный dataset:

каждый объект должен иметь environment-safe origin metadata.

---

# 9. Real Pilot Data Readiness

Перед использованием реального source data проверить:

```text
source policy approved for pilot
storage allowed
display allowed
refresh allowed or intentionally manual
attribution defined
adapter tested
field evidence present
freshness policy defined
```

---

# 10. Source Release Gate

Создать deterministic function/service:

```text
evaluateSourcePilotReadiness(source)
```

Результат минимум:

```yaml
source_pilot_readiness:
  source_id:
  ready:
  blockers:
  warnings:
  approved_operations:
  approved_environment:
  policy_version:
```

---

# 11. Fail Closed

Если source readiness неполная:

не включать его в pilot automatically.

---

# 12. Coverage Diagnostics

Для active pilot request система должна уметь различать:

```text
no matching objects found
```

от:

```text
data coverage insufficient
```

---

# 13. Coverage Contract

Рекомендуемый output:

```yaml
coverage_summary:
  geography:
  property_types:
  active_sources:
  unavailable_sources:
  blocked_sources:
  stale_sources:
  object_count:
  coverage_gaps:
  confidence:
  generated_at:
```

---

# 14. Coverage Is Not Market Completeness

Не утверждать:

```text
На рынке нет вариантов
```

если product coverage этого не доказывает.

---

# 15. User-facing Coverage Language

Допустимые формулировки:

```text
По подключённым источникам подходящих вариантов пока не найдено.
```

```text
По этому условию данных пока недостаточно.
```

---

# 16. Product Telemetry

Создать vendor-neutral telemetry interface.

Не подключать конкретную analytics platform, если её нет в project stack.

Пример:

```ts
trackProductEvent(event)
```

---

# 17. Core Buyer Journey Events

Минимум:

```text
buyer_journey_started
request_submitted
request_parsed
request_confirmation_viewed
request_confirmed
request_edited
matching_started
matching_completed
shortlist_viewed
property_opened
comparison_created
comparison_item_added
comparison_viewed
user_url_ingestion_started
user_url_ingestion_completed
expert_request_created
expert_result_viewed
decision_recomputed
journey_feedback_submitted
```

---

# 18. Event Contract

Минимум:

```yaml
product_event:
  event_id:
  event_name:
  journey_id:
  session_id:
  stage:
  occurred_at:
  app_version:
  environment:
  metadata:
```

---

# 19. No Sensitive Telemetry

Не логировать в analytics:

- full raw user request text;
- passport/document content;
- phone/email;
- precise personal financing profile;
- authentication tokens;
- private source URLs containing secrets;
- expert free-text containing sensitive personal data.

---

# 20. Allowed Telemetry Metadata

Допустимо:

```text
criterion_count
must_count
shortlist_count
comparison_count
match_status distribution
confidence band
error code
request type
property type
source type
```

без raw sensitive content.

---

# 21. Product Outcome Metrics

Минимум заложить hooks для измерения:

```text
request_confirmation_rate
request_edit_rate
shortlist_open_rate
property_detail_open_rate
comparison_creation_rate
expert_request_rate
journey_completion_rate
```

---

# 22. Decision-quality Proxy Metrics

Особенно важно измерять:

```text
user says shortlist relevant
user says comparison clarified choice
user says understands trade-offs better
user says understands what needs verification
```

---

# 23. Do Not Optimize for Clicks Only

Основной pilot success не должен быть:

```text
more property card clicks
```

Цель продукта — clarity of decision.

---

# 24. User Feedback Capture

Добавить compact feedback UI после ключевых stages.

Не длинную анкету.

---

# 25. Shortlist Feedback

Пример:

```text
Насколько эти варианты соответствуют тому, что вы искали?
```

Ответ:

```text
да
частично
нет
```

+ optional short comment.

---

# 26. Comparison Feedback

Пример:

```text
Стало ли понятнее, чем варианты отличаются для вас?
```

---

# 27. Expert Result Feedback

Пример:

```text
Помогла ли проверка понять, что делать дальше?
```

---

# 28. End-of-Journey Feedback

Минимум:

```text
Теперь мне понятнее, что стоит покупать
Да / Частично / Нет
```

Это близко к core product success criterion.

---

# 29. Feedback Contract

Рекомендуемый:

```yaml
pilot_feedback:
  feedback_id:
  journey_id:
  stage:
  question_code:
  answer:
  optional_comment:
  created_at:
```

---

# 30. Feedback Privacy

Optional comment считать potentially sensitive text.

Не отправлять его в generic analytics payload без отдельной policy.

---

# 31. Failure Observability

Создать structured error/event logging для major layers:

```text
parser
matching
confidence
shortlist
comparison
user URL ingestion
source policy
adapter
refresh
expert workflow
recompute
```

---

# 32. Error Contract

Минимум:

```yaml
application_error:
  error_id:
  error_code:
  layer:
  journey_id:
  recoverable:
  user_visible:
  occurred_at:
  context_ids:
  app_version:
```

---

# 33. Error Detail Separation

Technical stack trace может идти в server logs.

Не отправлять raw internal stack пользователю.

---

# 34. Pilot Error Dashboard Data

Не обязательно делать полноценный dashboard UI.

Но должны быть агрегируемые данные:

```text
error count by code
error count by journey stage
recovery success
most common failed transition
source-policy blocks
adapter failures
recompute failures
```

---

# 35. Journey Diagnostics

Для support/debug одного pilot session должно быть возможно увидеть:

```text
journey timeline
active UserRequest version
matching version
selected properties
comparison state
expert requests
refresh tasks
errors
decision updates
```

---

# 36. Diagnostics Must Avoid Sensitive Dumps

Использовать IDs/statuses/safe summaries.

Не raw personal content.

---

# 37. Correlation IDs

Добавить/переиспользовать:

```text
journey_id
request_id
collection_run_id
refresh_task_id
expert_request_id
```

для трассировки одного flow.

---

# 38. Performance Budget

Определить измеримые pilot budgets.

Например для fixture/persisted data:

```text
request confirmation render: fast
matching 50–100 candidates: sub-second or clearly bounded
shortlist page server/application preparation: bounded
comparison 2–4 objects: near-instant
```

Coding-agent должен зафиксировать фактические numbers после измерений, а не invent production SLA.

---

# 39. Performance Measurement

Добавить lightweight instrumentation:

```text
parser duration
matching duration
confidence duration
shortlist build duration
comparison build duration
expert context build duration
```

---

# 40. No Premature Distributed Optimization

Если current performance достаточна для pilot:

не добавлять queues/caches/services без измеренной необходимости.

---

# 41. Matching Performance Regression

Создать benchmark test на Pilot Dataset.

Проверять, что matching 50–100 candidates не деградирует неожиданно.

---

# 42. Confidence Performance Regression

То же для DataQuality.

---

# 43. E2E Journey Timing

Golden journey из TASK-018 должен логировать stage durations.

---

# 44. Error Recovery Review

Каждый major recoverable failure должен иметь user action.

---

# 45. Parser Failure

Показывать:

```text
Не удалось разобрать запрос.
Попробуйте сформулировать ещё раз.
```

с сохранением raw input.

---

# 46. Matching Failure

Не терять confirmed UserRequest.

Дать retry.

---

# 47. Source Refresh Failure

Показывать current known data + stale/unknown label.

Не блокировать весь product.

---

# 48. Expert Recompute Failure

ExpertResult сохраняется.

Recompute можно retry отдельно.

---

# 49. Comparison State Failure

Не терять selected IDs, если один item временно недоступен.

---

# 50. Session Recovery

Если browser reload:

в pilot mode восстановить минимум:

```text
journey_id
confirmed UserRequest
shortlist refs
comparison refs
```

если repository implementation позволяет.

---

# 51. Feature Flags

Создать centralized feature flag layer для pilot capabilities.

Минимум возможные flags:

```text
user_url_ingestion
live_source_poc
refresh
expert_requests
expert_workbench
manual_import
```

---

# 52. No Scattered Environment Checks

Не делать:

```ts
if (process.env.NODE_ENV...)
```

в десятках компонентов.

---

# 53. Feature Flag Contract

Например:

```yaml
feature_flag:
  key:
  enabled:
  environment:
  reason:
```

---

# 54. Source Feature Flags Are Not Policy

Feature flag:

```text
live_source_poc = true
```

не отменяет Source Policy Engine.

Оба gate должны пройти.

---

# 55. Kill Switch

Для risky pilot integrations нужен быстрый disable:

```text
live source adapter
user URL automatic ingestion
refresh execution
```

без выключения всего продукта.

---

# 56. Privacy Review

Проверить data flows:

```text
raw user request
UserRequest
household
financing
user URL
expert request
expert result
documents refs
analytics
logs
```

---

# 57. PII Inventory

Создать technical inventory:

```text
field / data class
where collected
why needed
where stored
where logged
retention expectation
```

---

# 58. Data Minimization

Если field не нужен для current buyer journey:

не собирать его только «на будущее».

---

# 59. Secrets Review

Проверить:

- `.env.example`;
- logs;
- source registry;
- test fixtures;
- CI config.

Никаких secrets в repo.

---

# 60. URL Safety Review

Повторно проверить SSRF protections из TASK-012.

Особенно:

- redirects;
- DNS/private network resolution;
- response size;
- content type;
- timeouts.

---

# 61. External Link Safety

Source links открывать безопасно.

Не рендерить source HTML внутри app.

---

# 62. Expert Data Access Review

Expert Workbench должен fail-closed по access boundary.

Даже в fixture pilot.

---

# 63. Auditability Review

Pilot critical operations должны оставлять audit trail:

```text
request confirmation
matching version
source policy decision
refresh execution
expert result
canonical evidence change
decision recompute
```

---

# 64. Unknown Semantics Regression Suite

Создать cross-module tests:

```text
unknown != false
unknown != matched
unknown != zero
```

---

# 65. Claim Semantics Regression Suite

Проверить:

```text
claimed != confirmed
```

во всех слоях:

```text
ingestion
matching
confidence
shortlist
detail
comparison
expert context
```

---

# 66. Property vs Offer Regression

Проверить:

```text
Property != Offer
```

на real pilot fixtures/imports.

---

# 67. Frankenstein Regression

Проверить, что ни один pilot flow не смешивает incompatible commercial terms.

---

# 68. Match vs Confidence Regression

Проверить:

```text
Match Score does not silently change because Confidence changed
```

если underlying criterion values те же.

---

# 69. Hard Criteria Regression

Проверить:

```text
confirmed hard fail
```

не попадает в primary shortlist.

---

# 70. No Silent Relaxation Regression

No-results flow не должен сам ослаблять must criteria.

---

# 71. Cross-type Regression

Apartment/house comparison должен работать после перехода на real pilot data.

---

# 72. Data Freshness Regression

Stale values остаются видимыми как stale.

Не превращаются в current.

---

# 73. Removed Listing Regression

`removed != sold`.

---

# 74. Expert Boundary Regression

Expert result не задаёт Match Score вручную.

---

# 75. Legal/Technical Boundary Regression

UI не должен выдавать:

```text
document review = legal opinion
onsite visual check = technical inspection
mortgage estimate = bank approval
```

---

# 76. Pilot Scenario Set

Создать минимум 8 pilot QA scenarios:

1. clear apartment request;
2. no-results hard constraints;
3. cross-type apartment/house;
4. claimed financing;
5. conflicting price;
6. stale availability;
7. user URL manual fallback;
8. expert verification updates decision.

---

# 77. Pilot Scenario 1 — Clear Request

Ожидается:

```text
parse
confirm
shortlist
detail
comparison
```

без errors.

---

# 78. Pilot Scenario 2 — No Results

Ожидается:

```text
no silent relaxation
clear explanation
edit request action
```

---

# 79. Pilot Scenario 3 — Cross-type

Ожидается:

```text
apartment + house
common decision dimensions
not_applicable handled
```

---

# 80. Pilot Scenario 4 — Claimed Financing

Ожидается:

```text
not confirmed
critical unknown if must
recommended check
```

---

# 81. Pilot Scenario 5 — Conflict

Ожидается:

```text
conflict visible
no silent canonical overwrite
```

---

# 82. Pilot Scenario 6 — Stale Data

Ожидается:

```text
stale label
refresh hook
current known value preserved
```

---

# 83. Pilot Scenario 7 — Restricted User URL

Ожидается:

```text
policy blocks automation
manual fallback
candidate remains matchable after manual confirmation
```

---

# 84. Pilot Scenario 8 — Expert Loop

Ожидается:

```text
ExpertRequest
ExpertResult
evidence update
recompute
decision change visible
```

---

# 85. User Pilot Cohorts

Не требуется реализовывать cohort management system.

Но telemetry должна позволять различать session labels:

```text
internal_test
friendly_pilot
real_buyer_pilot
```

если это задаётся безопасно.

---

# 86. Pilot Feedback Review Export

Создать simple developer/report output:

```text
pilot feedback summary
journey completion
common errors
common edits
common unknowns
common source gaps
```

Допустим CLI/report generator.

---

# 87. No Automated Product Change from Feedback

Feedback не должен автоматически менять:

- matching weights;
- source policy;
- parser defaults.

Сначала curator review.

---

# 88. Release Checklist

Создать pilot release checklist.

Минимум:

```text
build green
tests green
E2E golden journey green
no secrets
source policy reviewed
enabled sources pilot-approved
feature flags reviewed
privacy inventory reviewed
error recovery reviewed
expert flow available or disabled
demo data not exposed as live
known limitations documented
rollback plan ready
```

---

# 89. Release Gate Contract

Рекомендуемый machine-readable result:

```yaml
pilot_release_gate:
  ready:
  blockers:
  warnings:
  checks:
  evaluated_at:
  app_version:
```

---

# 90. Hard Blockers

Минимум:

- failing build;
- failing core regression tests;
- secrets detected;
- production/pilot source used without policy approval;
- synthetic data masquerading as live;
- broken hard-criteria semantics;
- broken Match/Confidence separation;
- expert/result evidence bypass;
- unsafe URL fetch path.

---

# 91. Warnings

Примеры:

- low source coverage;
- some sources manual-only;
- expert SLA undefined;
- low comparison sample size;
- refresh only fixture-backed.

Warnings не обязательно блокируют controlled pilot.

---

# 92. Rollback Plan

Pilot release должен иметь быстрый rollback.

Минимум:

```text
disable risky feature flags
disable live source adapter
fall back to curated/manual dataset
disable automatic refresh
disable user URL automatic ingestion
```

---

# 93. No Data Destruction on Rollback

Rollback не должен удалять existing evidence/audit records.

---

# 94. App Version

Pilot events/errors/results должны иметь:

```text
app_version
```

или build identifier.

---

# 95. Algorithm Versions

Продолжать сохранять:

```text
parser_version
criteria_registry_version
matching_version
confidence_version
source_registry_version
policy_version
expert_result_version
```

---

# 96. Pilot Known Limitations Page / README

Создать technical/pilot README с честным списком:

```text
what works
what is fixture-backed
what is manual
what source coverage exists
what is blocked
what user should not infer
```

---

# 97. No Marketing Overpromise

Pilot UI/README не должны утверждать:

```text
все объекты рынка
все сайты
точные ипотечные условия
юридически проверено
```

если это не подтверждено.

---

# 98. Test Data Separation

CI/test fixtures не должны случайно попадать в pilot runtime dataset без explicit flag.

---

# 99. Real Data Import Gate

Любой manual curated real pilot object должен пройти:

```text
schema validation
evidence validation
source policy check
provenance present
freshness status present
```

---

# 100. Pilot Data Validator

Создать reusable validator:

```text
validatePilotCandidate(...)
```

---

# 101. Pilot Candidate Validation

Минимум проверять:

```text
Property/Offer separation
source/evidence exists
price semantics
availability semantics
financing claim status
freshness
environment/source approval
```

---

# 102. No Orphan Data

Проверить referential integrity всех pilot entities.

---

# 103. Performance Test

Добавить reproducible command, например:

```text
test:pilot-performance
```

или benchmark script.

---

# 104. Pilot Regression Command

Желательно создать:

```text
test:pilot
```

который запускает:

- domain regressions;
- buyer journey E2E;
- pilot source policy checks;
- pilot data validation.

---

# 105. CI Integration

Если CI существует:

pilot-critical checks должны входить в CI или отдельный required workflow.

Не запускать live network smoke tests в standard CI.

---

# 106. Optional Live Smoke

Для approved source допускается manual smoke:

```text
smoke:pilot-source
```

только policy-approved.

---

# 107. Acceptance Criteria

TASK-019 считается завершённой, если:

1. explicit pilot mode существует;
2. synthetic/live/manual data различаются;
3. source pilot readiness gate существует;
4. coverage diagnostics существуют;
5. product telemetry interface существует;
6. core buyer journey events фиксируются;
7. sensitive telemetry исключена;
8. user feedback capture работает;
9. structured application errors фиксируются;
10. journey diagnostics возможны;
11. performance instrumentation добавлена;
12. matching/confidence benchmark есть;
13. recoverable errors имеют user actions;
14. feature flags centralized;
15. risky capabilities имеют kill switches;
16. source policy остаётся обязательным gate;
17. privacy/PII inventory создан;
18. secrets review пройден;
19. SSRF/source URL safeguards regression tested;
20. unknown/claim/Property-Offer/Frankenstein regressions проходят;
21. Match/Confidence separation regression проходит;
22. pilot QA scenarios formalized;
23. pilot data validator существует;
24. release gate существует;
25. hard blockers fail closed;
26. rollback plan документирован;
27. known limitations документированы;
28. `test:pilot` или equivalent проходит;
29. typecheck/lint/test/build проходят.

---

# 108. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Дополнительно, если созданы:

```text
<package-manager> test:pilot
<package-manager> test:pilot-performance
```

Live smoke — только вручную и только если policy разрешает.

---

# 109. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Pilot mode:
Feature flags:
Pilot source readiness:
Coverage diagnostics:
Telemetry events:
Feedback capture:
Error observability:
Journey diagnostics:
Privacy/PII review:
Security regressions:
Performance measurements:
Pilot data validation:
Pilot QA scenarios:
Release gate:
Rollback plan:
Known limitations:
Tests:
Typecheck:
Lint:
Build:
Pilot blockers:
Spec conflicts:
Spec deviations:
```

---

# 110. Do Not Continue Automatically

После TASK-019:

**не начинать следующую задачу самостоятельно.**

---

# 111. Likely Next Task

После TASK-019 следующая задача должна определяться результатами hardening и пилотной готовности.

Если release gate зелёный:

```text
TASK-020 — Real Buyer Pilot Execution & Feedback Loop
```

Если есть blocker:

сначала создаётся отдельная TASK на устранение конкретного blocker.

Не продолжать roadmap механически.

---

# 112. Definition of Done

TASK-019 Done, когда продукт можно безопасно дать ограниченной группе реальных покупателей и команда сможет ответить:

- где пользователь находится в journey;
- где и почему он остановился;
- какие данные были использованы;
- где coverage gap;
- где source restriction;
- какие unknown/conflicts остались;
- помог ли shortlist;
- помогло ли comparison;
- помогла ли expert verification;
- изменилось ли понимание выбора;
- можно ли расширять пилот дальше.

---

# 113. Главный принцип для coding-agent

Pilot hardening — это не попытка сделать продукт «идеальным».

Это переход от:

```text
функции работают
```

к:

```text
функции работают предсказуемо
ошибки видны
риски ограничены
источники контролируются
пользовательский результат измерим
```

Главное правило:

> **Перед реальным пилотом нужно не больше функций, а больше наблюдаемости, устойчивости, прозрачности данных и управляемых release gates.**
