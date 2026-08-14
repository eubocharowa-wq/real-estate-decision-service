# TASK-018 — End-to-End Buyer Journey Integration

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone F — Real Buyer Pilot Readiness`

---

# 1. Goal

Связать ранее реализованные product/domain modules в **один воспроизводимый end-to-end buyer journey**, чтобы пользователь мог пройти основной путь продукта от свободного запроса до обновлённого решения после экспертной проверки.

Целевой flow:

```text
Natural-language request
        ↓
Parser
        ↓
Request Confirmation
        ↓
Confirmed UserRequest
        ↓
Matching Pipeline
        ↓
Shortlist
        ↓
Property Detail
        ↓
Comparison
        ↓
Expert Request
        ↓
Expert Workbench / Expert Result
        ↓
Evidence Update
        ↓
Match + DataQuality Recompute
        ↓
Updated Decision
```

Главный результат:

> продукт должен впервые работать как единая система, а не как набор отдельно протестированных экранов и domain modules.

---

# 2. Main Principle

TASK-018 не должна изобретать новую продуктовую логику.

Она должна:

- соединить существующие contracts;
- проверить переходы между этапами;
- устранить integration gaps;
- гарантировать consistency IDs/versions/state;
- показать, что один buyer journey проходит полностью на controlled fixtures.

---

# 3. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-002.md
tasks/TASK-003.md
tasks/TASK-004.md
tasks/TASK-005.md
tasks/TASK-006.md
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

docs/05-matching/matching-logic.md
docs/05-matching/confidence-status.md

docs/06-data-collection/ingestion-flow.md
docs/06-data-collection/update-strategy.md

docs/07-expert-services/expert-layer.md
docs/07-expert-services/choice-assistance.md

docs/08-roadmap/implementation-plan.md
docs/08-roadmap/backlog.md
```

Если какой-то из task-dependent modules ещё не реализован, integration должна честно отмечать blocker.

---

# 4. Dependencies

TASK-018 предполагает наличие следующих working layers:

```text
Core Schemas
UserRequest Parser
Request Confirmation
Pilot Dataset
Criteria Registry
Matching Engine
Data Confidence Engine
Shortlist UI
Property Detail
Comparison
User URL Ingestion
Source Registry & Policy Engine
Source Adapter boundary
Refresh Queue
Expert Request Workflow
Expert Workbench
Expert Result Review
```

Не создавать временную параллельную реализацию отсутствующего слоя внутри TASK-018.

---

# 5. In Scope

Реализовать:

1. buyer journey application state;
2. route/state integration;
3. ID/version consistency;
4. transition guards;
5. confirmed request propagation;
6. matching pipeline orchestration;
7. shortlist integration;
8. property detail navigation;
9. comparison integration;
10. expert request integration;
11. expert result propagation;
12. Match/DataQuality recomputation after expert result;
13. refresh/status hooks;
14. user URL candidate integration into current journey;
15. controlled error/recovery states;
16. fixture-based full journey;
17. end-to-end integration tests;
18. smoke test/demo scenario;
19. instrumentation hooks;
20. final integration README.

---

# 6. Out of Scope

Не реализовывать:

- new Matching formula;
- new source adapter;
- new expert logic;
- production DB architecture from scratch;
- authentication system from scratch;
- payment;
- CRM;
- live nationwide search;
- background worker infrastructure beyond existing abstractions;
- new landing page;
- visual redesign;
- mobile app;
- full analytics platform;
- real production source approvals.

---

# 7. Canonical Buyer Journey

Минимальный happy path:

```text
1. Пользователь описывает задачу
2. Parser формирует structured request
3. Пользователь подтверждает критерии
4. Matching Engine оценивает Pilot Dataset
5. Пользователь получает shortlist
6. Открывает Property Detail
7. Добавляет 2–3 варианта в Comparison
8. Видит trade-offs
9. Создаёт ExpertRequest по critical unknown
10. Эксперт завершает проверку
11. Новое evidence попадает в pipeline
12. DataQuality пересчитывается
13. MatchResult пересчитывается
14. Пользователь видит updated decision context
```

---

# 8. Application Journey State

Создать единый application-level state contract.

Рекомендуемый минимум:

```yaml
buyer_journey:
  journey_id:
  session_id:
  raw_request_text:
  parsed_request_ref:
  confirmed_user_request_id:
  confirmed_user_request_version:
  shortlist_state:
  selected_property_id:
  comparison_id:
  comparison_property_ids:
  expert_request_ids:
  active_expert_request_id:
  last_recompute_at:
  current_stage:
  created_at:
  updated_at:
```

---

# 9. Current Stage

Поддержать минимум:

```text
request_entry
request_confirmation
matching
shortlist
property_detail
comparison
expert_request
expert_in_progress
expert_result
updated_decision
```

---

# 10. Journey State Is Not Domain Model

`BuyerJourney` — application/workflow state.

Он не должен загрязнять:

```text
Property
Offer
UserRequest
MatchResult
```

workflow-specific fields.

---

# 11. State Ownership

Нужно выбрать один source of truth для journey state.

Допустимо:

- server application state;
- session-scoped repository;
- DB repository if persistence уже существует.

Не держать conflicting copies одновременно в:

```text
URL
React local state
global store
fixture module
```

без явной ownership policy.

---

# 12. Session Without Auth

Если authentication ещё не реализована:

использовать stable anonymous:

```text
session_id
```

или equivalent.

Не блокировать E2E journey auth requirement.

---

# 13. Request Version Consistency

Все downstream results должны ссылаться на один confirmed:

```text
user_request_id
user_request_version
```

---

# 14. Request Edited After Matching

Если пользователь меняет условия после shortlist:

старые:

```text
MatchResult
ComparisonConclusion
ExpertContextPackage
```

не должны считаться актуальными автоматически.

---

# 15. Stale Result State

Поддержать:

```text
recompute_required
```

или equivalent application state.

---

# 16. Recompute Trigger

Изменение confirmed UserRequest должно инициировать:

```text
criteria refresh if needed
→ Match recompute
→ DataQuality recompute
→ shortlist update
```

---

# 17. No Silent Reuse of Old Match

Нельзя показывать старый Match Score как актуальный после изменения критериев.

---

# 18. Matching Orchestrator

Создать application service:

```text
runMatchingForConfirmedRequest(...)
```

который использует existing:

```text
Criteria Registry
Matching Engine
Data Confidence Engine
Pilot Dataset / normalized candidates
```

---

# 19. No Matching Logic Duplication

Orchestrator только соединяет modules.

Он не содержит:

```text
if price...
if first floor...
```

---

# 20. Matching Result Bundle

Рекомендуемый output:

```yaml
matching_bundle:
  user_request_id:
  user_request_version:
  generated_at:
  match_results:
  data_quality_results:
  algorithm_version:
  confidence_algorithm_version:
  dataset/source_snapshot_version:
```

---

# 21. Shortlist Integration

Shortlist должен получать:

```text
matching_bundle
```

а не читать raw Pilot Dataset напрямую.

---

# 22. Property Detail Integration

При открытии Property Detail сохранять выбранные:

```text
property_id
offer_id
purchase_scenario_id
```

из текущего MatchResult.

---

# 23. Comparison Integration

Comparison items должны ссылаться на MatchResult из **того же request version**.

---

# 24. Mixed Request Versions

Если comparison пытается использовать results разных UserRequest version:

```text
block / recompute
```

Не сравнивать silently.

---

# 25. Stable Comparison State

Сохранять минимум:

```text
comparison_id
user_request_id
user_request_version
property_ids
selected_offer_ids
purchase_scenario_ids
created_at
updated_at
```

---

# 26. Comparison → Expert Request

`choice_assistance` request должен использовать именно active comparison state.

Не rebuild finalists случайно по текущему shortlist.

---

# 27. Property Detail → Expert Request

Critical unknown CTA должен передавать:

```text
property_id
selected_offer_id
purchase_scenario_id
criterion_id
field
recommended_check
```

---

# 28. Expert Context Snapshot

При submit ExpertRequest сохранить snapshot refs/version:

```text
UserRequest version
MatchResult version
DataQuality version
Comparison version
Evidence refs
```

---

# 29. Expert Result Integration

После final ExpertResult:

```text
ExpertResult
→ Expert Evidence
→ Validation
→ Canonical update/conflict handling
→ affected entity detection
→ DataQuality recompute
→ Match recompute
```

---

# 30. Updated Decision

После recompute пользователь должен увидеть:

```text
что изменилось
```

Минимум:

- old Match Score;
- new Match Score;
- old confidence;
- new confidence;
- resolved unknowns;
- unresolved unknowns;
- new hard fail/pass if changed;
- updated comparison conclusion if relevant.

---

# 31. No Fake Before/After

Показывать old/new только если обе версии реально существуют.

---

# 32. Decision Update Contract

Рекомендуемый application contract:

```yaml
decision_update:
  update_id:
  trigger_type:
  trigger_ref:
  affected_property_ids:
  previous_match_refs:
  new_match_refs:
  previous_data_quality_refs:
  new_data_quality_refs:
  resolved_unknowns:
  new_conflicts:
  resolved_conflicts:
  created_at:
```

---

# 33. Trigger Types

Минимум:

```text
user_request_changed
expert_result
refresh_result
user_url_ingestion
source_update
```

---

# 34. User URL Journey Integration

Пользователь должен иметь возможность:

```text
Shortlist / Comparison
→ Add URL
→ User URL Ingestion
→ normalized candidate
→ matching
→ add to current comparison
```

---

# 35. Same Matching Pipeline

Imported URL candidate проходит тот же:

```text
Criteria Registry
Matching Engine
Data Confidence Engine
```

---

# 36. No Imported Candidate Bonus/Penalty

Source type `user_link` не должен сам менять Match Score.

Только Data Confidence может отражать качество evidence.

---

# 37. Refresh Integration

Если candidate/shortlist item имеет stale critical field:

application может создать `RefreshTask`.

---

# 38. Non-blocking Background Refresh

Default:

```text
show current result + freshness status
enqueue targeted refresh
```

Не блокировать весь journey массовым live crawl.

---

# 39. Refresh Result Update

После successful refresh:

```text
evidence update
→ recompute affected Match/DataQuality
→ mark current UI state update_available
```

---

# 40. No Global Recompute

Пересчитывать только affected candidates/request contexts.

---

# 41. Journey Transition Guards

Создать explicit guards.

Пример:

```text
request_entry → confirmation
```

только если parser result valid.

```text
confirmation → shortlist
```

только если UserRequest confirmed.

```text
comparison
```

только если selected properties >= 2.

---

# 42. Expert Result Guard

Нельзя перейти:

```text
expert_in_progress → updated_decision
```

пока final `ExpertResult` не сохранён и recompute outcome не определён/queued.

---

# 43. Direct Route Entry

Пользователь может открыть URL напрямую.

Каждый page должен корректно обрабатывать отсутствие required journey context.

---

# 44. Direct Shortlist Without Request

Показывать:

```text
Сначала опишите задачу.
```

---

# 45. Direct Comparison Without Selection

Показывать:

```text
Выберите минимум два варианта.
```

---

# 46. Direct Expert Result

Если result доступен и access context valid:

страница может открываться независимо от active journey stage.

---

# 47. Error Taxonomy

Поддержать минимум:

```text
MISSING_JOURNEY_CONTEXT
INVALID_TRANSITION
STALE_REQUEST_VERSION
MATCH_RECOMPUTE_FAILED
CONFIDENCE_RECOMPUTE_FAILED
EXPERT_CONTEXT_STALE
INGESTION_FAILED
REFRESH_PENDING
SOURCE_POLICY_BLOCKED
ENTITY_NOT_FOUND
```

---

# 48. Error UX

Не показывать raw error codes пользователю.

Создать user-facing mapping.

---

# 49. Recoverable Errors

Пример:

```text
MATCH_RECOMPUTE_FAILED
```

→ retry / return to confirmed request.

---

# 50. Non-recoverable in Current Context

Пример:

```text
ENTITY_NOT_FOUND
```

→ return to shortlist.

---

# 51. Partial System Availability

Если source refresh недоступен:

основной fixture/persisted journey всё равно должен работать.

---

# 52. No Hidden Production Claims

Pilot flow не должен писать:

```text
Мы проверили весь рынок
```

если используется Pilot Dataset.

---

# 53. Pilot Mode Label

Если application использует synthetic dataset:

developer/demo environment должен явно знать:

```text
dataset_type = synthetic_pilot
```

---

# 54. User-facing Demo Label

В production user UI synthetic fixtures не должны masquerade as real listings.

Для demo environment можно показать:

```text
Демонстрационные данные
```

если needed.

---

# 55. End-to-End Fixture Scenario A — Core Happy Path

User text:

```text
Найди 5 квартир до 5 млн.
Семейная ипотека обязательна.
Желательно без первоначального взноса.
Первый этаж не рассматриваю.
```

Expected journey:

```text
Parser
→ Confirmation
→ Matching
→ 5-ish shortlist items if fixtures allow
→ open detail
→ compare 2–3
→ expert verification on financing unknown
→ result
→ recompute
→ updated decision
```

---

# 56. Scenario A Acceptance

Проверить минимум:

- UserRequest confirmed;
- hard criteria preserved;
- Match Score deterministic;
- claimed financing visible as unknown;
- ExpertRequest context correct;
- ExpertResult evidence integrated;
- confidence changes appropriately;
- match changes only if factual criterion result changed.

---

# 57. End-to-End Fixture Scenario B — No Eligible Results

UserRequest strict:

```text
hard budget
hard location
hard timeline
```

Expected:

```text
no primary shortlist
```

без silent relaxation.

---

# 58. Scenario B Recovery

Пользователь:

```text
Изменить условия
```

→ Request Confirmation

После explicit edit:

→ recompute.

---

# 59. End-to-End Fixture Scenario C — Cross-type

```text
apartment OR house
>= 70 m²
commute <= 40 min
```

Expected:

- shortlist can contain both;
- Property Detail type-specific facts;
- Comparison common decision dimensions;
- no hidden type bonus.

---

# 60. End-to-End Fixture Scenario D — User URL

```text
active comparison with 2 properties
→ add fixture URL
→ normalize third candidate
→ match
→ add to comparison
```

---

# 61. End-to-End Fixture Scenario E — Refresh

```text
stale critical price
→ refresh queued
→ fixture adapter updates price
→ evidence changes
→ Match/DataQuality recompute
→ UI gets update
```

---

# 62. End-to-End Fixture Scenario F — Unresolved Expert Result

```text
critical conflict
→ ExpertRequest
→ unable to verify
→ ExpertResult saved
→ conflict remains
→ no fake canonical resolution
→ updated decision remains conditional/unknown
```

---

# 63. Journey State Persistence

В пределах одного browser/session flow переходы не должны терять:

```text
confirmed request
comparison selection
selected scenario
expert request context
```

---

# 64. Browser Refresh

Если persistence abstraction позволяет:

page reload не должен полностью ломать journey.

Минимум:

```text
journey_id
confirmed request
comparison refs
```

должны восстанавливаться.

---

# 65. No Requirement for Long-term Account Persistence

Если auth/DB отсутствуют:

session-scoped persistence достаточно для TASK-018.

---

# 66. URL State

Использовать URL для navigation IDs там, где это естественно:

```text
propertyId
comparisonId
expert request/result id
```

Не кодировать whole MatchResult в URL.

---

# 67. State Normalization

Не хранить multiple copies полного Property object.

Хранить refs/IDs и получать canonical state через repository/application service.

---

# 68. Repository Boundary

Если persistence layer отсутствует:

создать application repository interfaces для:

```text
BuyerJourney
ConfirmedRequest
MatchingBundle
ComparisonState
DecisionUpdate
```

---

# 69. In-memory / Fixture Repository

Допустим для Pilot.

Но interfaces должны позволять later PostgreSQL implementation.

---

# 70. Application Service Layer

Рекомендуемые services:

```text
startBuyerJourney
parseBuyerRequest
confirmBuyerRequest
runJourneyMatching
openJourneyProperty
createJourneyComparison
addJourneyComparisonItem
createJourneyExpertRequest
applyExpertResultToJourney
applyRefreshResultToJourney
recomputeJourneyDecision
```

Названия могут отличаться.

---

# 71. UI Must Use Application Services

React components не должны напрямую соединять domain modules в random порядке.

---

# 72. Version Metadata

Сохранять минимум:

```text
schema_version
parser_version
criteria_registry_version
matching_algorithm_version
confidence_algorithm_version
source_registry_version
policy_version
expert_context_version
expert_result_version
```

где relevant.

---

# 73. Traceability

Для debug одного journey должно быть возможно понять:

```text
какой request
какие data versions
какой MatchResult
какой expert result
какое evidence
```

привели к текущему состоянию.

---

# 74. Journey Audit Events

Минимум:

```text
journey_started
request_parsed
request_confirmed
matching_completed
shortlist_viewed
property_opened
comparison_created
comparison_updated
expert_request_created
expert_result_completed
refresh_requested
refresh_completed
decision_recomputed
```

---

# 75. No Sensitive Event Payloads

Не логировать:

- full free-form user request;
- personal finance details;
- document content;
- private URLs with tokens.

---

# 76. Metrics Hooks

Допустимо заложить:

```text
time_to_confirm_request
time_to_shortlist
shortlist_to_detail
detail_to_comparison
comparison_to_expert
expert_to_updated_decision
journey_completion_rate
```

Без analytics vendor.

---

# 77. E2E Test Technology

Использовать существующий test stack.

Если scaffold включает Playwright — можно использовать его.

Если нет — не добавлять тяжёлый tool без необходимости; допускаются integration tests на application services + component navigation tests.

---

# 78. E2E Tests Must Be Deterministic

Не использовать live web/API.

Все source/expert flows — fixture-driven.

---

# 79. Browser-level E2E Recommended

Минимум один browser-level smoke journey желателен:

```text
request
→ confirm
→ shortlist
→ detail
→ comparison
```

Expert result часть может быть service/integration-level, если internal expert UI auth boundary усложняет browser fixture.

---

# 80. Full E2E Golden Journey

Желательно иметь один test:

```text
golden-buyer-journey
```

который проходит все доступные stages.

---

# 81. Golden Journey Assertions

Проверить:

1. original raw text preserved;
2. confirmed request version created;
3. same version used in MatchResults;
4. shortlist cards use correct MatchResults;
5. selected scenario preserved;
6. comparison same request version;
7. ExpertContextPackage uses same entities;
8. ExpertResult creates new evidence;
9. recompute creates new Match/DataQuality versions;
10. user sees updated decision.

---

# 82. No Snapshot-only E2E

Не ограничиваться screenshots/snapshots.

Нужны semantic assertions.

---

# 83. Data Integrity Test

После full journey проверить referential integrity:

```text
all MatchResults reference existing Property
all selected Offers reference same Property
all PurchaseScenarios compatible
all ExpertRequests reference valid entities
all evidence refs valid
all decision updates reference old/new results
```

---

# 84. No Frankenstein Regression

Golden journey должен содержать assertion:

```text
selected price / financing terms belong to same compatible scenario
```

---

# 85. Unknown Regression

Проверить:

```text
unknown never converted to false
```

на всех stage boundaries.

---

# 86. Confidence Regression

Проверить:

```text
Match Score unchanged solely because confidence changed
```

если property facts did not change.

---

# 87. Expert Regression

Эксперт не может directly mutate:

```text
match_score
```

---

# 88. Refresh Regression

Refresh result без changed facts:

```text
confidence/freshness may improve
match_score should remain stable
```

если evaluator inputs equivalent.

---

# 89. Request Edit Regression

Если must budget изменён:

MatchResults должны recompute.

---

# 90. Comparison Staleness Regression

Old comparison conclusion должен стать stale/recompute-needed после request edit.

---

# 91. Source Policy Regression

User URL ingestion restricted source:

```text
no automatic fetch
manual fallback
```

Journey остаётся рабочим.

---

# 92. Performance Budget

Pilot E2E на 30–50 Property не должен ощущаться тяжёлым.

Рекомендуемая цель:

```text
matching + confidence calculation
```

локально/серверно выполняется быстро без external network.

Не вводить premature optimization.

---

# 93. Loading UX

Поддержать понятные states:

```text
Разбираем запрос
Подбираем варианты
Обновляем данные
Сохраняем проверку
Пересчитываем результат
```

Без fake counters.

---

# 94. No Dead Ends

Каждый recoverable state должен иметь следующий action.

Примеры:

```text
No shortlist → Изменить условия
One comparison item → Добавить ещё
Policy blocked URL → Добавить вручную
Expert unable to verify → Сохранить как неизвестное / другой check
```

---

# 95. Navigation Consistency

Пользователь должен всегда понимать:

- где он;
- какой request active;
- какие варианты выбраны;
- как вернуться назад.

---

# 96. No Long Wizard

Integration не должна превращать flow в rigid 10-step wizard.

Пользователь может:

- вернуться к условиям;
- открыть detail;
- вернуться к shortlist;
- менять comparison;
- добавить URL.

---

# 97. Recovery After Request Edit

Если пользователь изменил criteria:

сохранять selected Property IDs можно как navigation memory, но old MatchResults не использовать до recompute.

---

# 98. Error Boundary

Каждый major route должен иметь controlled error boundary/state.

---

# 99. Demo Seed Command

Создать удобный developer command, например:

```text
<package-manager> demo:seed
```

или equivalent, если repository architecture это позволяет.

Он должен загружать deterministic Pilot Dataset / journey fixtures.

---

# 100. Demo Reset

Допустим:

```text
demo:reset
```

для восстановления deterministic state.

Не обязателен, если in-memory state reset при restart.

---

# 101. Integration README

Создать:

```text
docs/08-roadmap/e2e-buyer-journey.md
```

или application README рядом с integration code.

Минимум:

- flow;
- state ownership;
- services;
- version rules;
- fixture scenario;
- how to run;
- known blocked live capabilities.

Если изменение docs/08-roadmap выходит за coding-agent scope текущего repo policy, создать локальный technical README и отметить limitation.

---

# 102. Pilot vs Live Capabilities

README должен явно различать:

```text
working on fixtures
working on approved PoC source
blocked pending source approval
not implemented
```

---

# 103. No False "End-to-End" Claim

TASK не считается полной, если путь работает только как:

```text
hardcoded links between static pages
```

Нужна реальная propagation state/contracts.

---

# 104. Acceptance Criteria

TASK-018 считается завершённой, если:

1. существует BuyerJourney application state;
2. raw request проходит parser;
3. request confirmation создаёт confirmed version;
4. matching запускается через existing engine;
5. DataQuality рассчитывается через existing engine;
6. shortlist получает real MatchResults;
7. Property Detail получает correct selected Offer/Scenario;
8. Comparison использует same UserRequest version;
9. comparison items stable across navigation;
10. ExpertRequest создаётся из active decision context;
11. ExpertContextPackage содержит correct refs/versions;
12. ExpertResult создаёт evidence через proper pipeline;
13. DataQuality recompute выполняется;
14. Match recompute выполняется;
15. updated decision отображается;
16. user URL fixture candidate можно добавить в journey;
17. refresh result может обновить journey;
18. old results marked stale after request edit;
19. no hidden Match/Confidence mixing;
20. no Frankenstein scenario regression;
21. unknown semantics preserved;
22. source policy gates preserved;
23. journey recoverable states имеют actions;
24. deterministic E2E fixtures существуют;
25. at least one full golden journey test проходит;
26. referential integrity test проходит;
27. typecheck/lint/test/build проходят.

---

# 105. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан browser E2E command:

```text
<package-manager> test:e2e
```

Если создан deterministic demo:

```text
<package-manager> demo:seed
```

---

# 106. Deliverable Report

После выполнения сообщить:

```text
Implemented:
BuyerJourney state:
Application services:
State ownership:
Request version behavior:
Matching integration:
Shortlist integration:
Property Detail integration:
Comparison integration:
User URL integration:
Refresh integration:
Expert integration:
Decision update behavior:
Golden journey:
E2E tests:
Typecheck:
Lint:
Build:
Working on fixtures:
Working on approved live sources:
Blocked capabilities:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 107. Do Not Continue Automatically

После TASK-018:

**не начинать следующую задачу самостоятельно.**

---

# 108. Likely Next Task

После успешной E2E integration следующая логичная задача:

```text
TASK-019 — Real Buyer Pilot Hardening
```

Она должна сфокусироваться уже не на новых функциях, а на:

- product telemetry;
- error recovery;
- fixture → real pilot data transition;
- privacy/security review;
- source coverage gaps;
- performance;
- pilot release gates;
- feedback capture.

---

# 109. Definition of Done

TASK-018 Done, когда один controlled buyer journey проходит весь основной decision loop:

```text
Описал задачу
→ подтвердил
→ получил shortlist
→ изучил объект
→ сравнил финалистов
→ передал конкретный вопрос эксперту
→ получил проверку
→ система обновила evidence
→ пересчитала Match/Confidence
→ пользователь увидел, что изменилось в решении
```

без ручной подмены state между этапами.

---

# 110. Главный принцип для coding-agent

До TASK-018 у проекта есть отдельные сильные компоненты.

TASK-018 должна доказать, что они действительно образуют **один продукт**.

Правильная модель:

```text
User intent
      ↓
Structured decision context
      ↓
Matching
      ↓
Comparison
      ↓
Verification
      ↓
Updated evidence
      ↓
Updated decision
```

Главное правило:

> **Интеграция считается успешной только тогда, когда изменение факта или пользовательского условия корректно проходит через всю цепочку и меняет ровно те части решения, которые действительно должны измениться.**
