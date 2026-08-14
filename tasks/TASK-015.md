# TASK-015 — Refresh Queue & Update Orchestration

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone D — Live Source PoC`

---

# 1. Goal

Реализовать управляемый слой обновления данных, который определяет:

- **что** нужно перепроверить;
- **почему** это нужно перепроверить;
- **насколько срочно**;
- **каким источником**;
- **каким разрешённым методом**;
- **когда** обновление допустимо запускать;
- **что делать при ошибке**;
- **как не создавать дублирующие refresh-задачи**.

Главный результат:

```text
Freshness / Unknown / Conflict / User Action
        ↓
Refresh Reason
        ↓
Refresh Queue
        ↓
Priority
        ↓
Source Policy
        ↓
Collection Plan
        ↓
Approved Adapter / Collector
        ↓
Raw Result
        ↓
Validation / Normalization / Evidence
        ↓
Canonical Update
        ↓
Affected Match Results become refreshable/recomputable
```

Главный принцип:

> **Обновление данных должно быть управляемым, приоритетным и объяснимым. Нельзя превращать каждый пользовательский запрос в массовый live crawl.**

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
tasks/TASK-013.md
tasks/TASK-014.md

docs/04-data/source-model.md

docs/05-matching/confidence-status.md

docs/06-data-collection/openclaw-role.md
docs/06-data-collection/sources.md
docs/06-data-collection/pilot-source-matrix.md
docs/06-data-collection/update-strategy.md
docs/06-data-collection/ingestion-flow.md

docs/08-roadmap/implementation-plan.md
```

---

# 3. Dependencies

TASK-015 предполагает наличие:

```text
Source Registry
Source Policy Engine
Collection Plan
Source Adapter interface
At least one fixture/PoC adapter
FieldEvidence
SourceConflict
Data Confidence / Completeness Engine
MatchResult
```

Если TASK-013 отсутствует:

```text
TASK-015 is blocked
```

Если TASK-014 live adapter заблокирован policy gate:

refresh orchestration всё равно можно реализовать на fixture adapter, но live refresh должен быть явно отмечен как blocked.

---

# 4. In Scope

Реализовать:

1. `RefreshTask` contract;
2. `RefreshQueue`;
3. refresh reason taxonomy;
4. priority calculation;
5. task deduplication;
6. source/method resolution через Policy Engine;
7. execution eligibility;
8. concurrency/rate-limit hooks;
9. retry/backoff;
10. stale/expired handling;
11. user-triggered refresh flow;
12. targeted refresh;
13. scheduled refresh planning;
14. conflict-driven refresh;
15. refresh result contract;
16. affected-entity propagation;
17. matching/data-quality recomputation hook;
18. source-health integration;
19. observability;
20. unit/integration tests.

---

# 5. Out of Scope

Не реализовывать:

- full distributed queue infrastructure;
- Redis/Kafka/SQS requirement;
- production cron platform;
- multi-region scheduler;
- billing;
- push notifications;
- full admin dashboard;
- automatic source contract negotiation;
- CAPTCHA bypass;
- hidden background crawling beyond policy;
- final persistence architecture, если DB ещё не реализована.

Для MVP допустим in-memory / test repository abstraction, если application persistence ещё отсутствует.

---

# 6. Core Architecture

Правильная модель:

```text
Refresh Need
   ↓
RefreshTask
   ↓
Queue
   ↓
Priority + Dedup
   ↓
Policy Resolution
   ↓
Collection Plan
   ↓
Adapter Execution
   ↓
Ingestion Pipeline
   ↓
Evidence Update
   ↓
Canonical Update
   ↓
Recompute Hooks
```

---

# 7. RefreshTask Contract

Рекомендуемый contract:

```yaml
refresh_task:
  refresh_task_id:
  entity_type:
  entity_id:
  source_id:
  field_paths:
  reason:
  priority:
  requested_at:
  requested_by:
  not_before:
  deadline:
  status:
  attempt_count:
  max_attempts:
  dedup_key:
  policy_version:
  source_registry_version:
```

---

# 8. Entity Types

Минимум:

```text
property
offer
purchase_scenario
financing_program
financing_offer
promotion
source_snapshot
field_evidence
```

---

# 9. Refresh Reasons

Поддержать минимум:

```text
STALE_FIELD
EXPIRED_FIELD
CRITICAL_UNKNOWN
SOURCE_CONFLICT
USER_REQUESTED
PRE_SHORTLIST_CHECK
PRE_COMPARISON_CHECK
PRE_DECISION_CHECK
SCHEDULED_REFRESH
SOURCE_HEALTH_RECOVERY
INGESTION_RETRY
MANUAL_REVIEW_REQUEST
```

---

# 10. Reason Semantics

## `STALE_FIELD`

Поле вышло за freshness policy.

## `EXPIRED_FIELD`

`valid_until` прошёл.

## `CRITICAL_UNKNOWN`

Must/exclude criterion зависит от неизвестного поля.

## `SOURCE_CONFLICT`

Несколько evidence противоречат друг другу.

## `USER_REQUESTED`

Пользователь явно попросил проверить актуальность.

## `PRE_SHORTLIST_CHECK`

Нужно обновить критичные поля перед выдачей.

## `PRE_COMPARISON_CHECK`

Нужно обновить критичные поля финалистов.

## `PRE_DECISION_CHECK`

Высокоприоритетная перепроверка перед решением.

---

# 11. Refresh Priority

Поддержать минимум:

```text
critical
high
normal
low
```

---

# 12. Priority Factors

Priority должна вычисляться deterministic из:

- UserRequest priority;
- field criticality;
- freshness;
- conflict status;
- stage of user journey;
- source health;
- data volatility;
- explicit user action.

---

# 13. User Journey Stage

Поддержать минимум:

```text
discovery
shortlist
comparison
pre_decision
```

---

# 14. Stage Semantics

При одинаковом stale field:

```text
pre_decision
```

должен иметь выше priority, чем:

```text
discovery
```

если остальные условия одинаковы.

---

# 15. No Magic Priority

Не делать:

```ts
priority = 87
```

с scattered coefficients.

Priority policy должна быть centralized/config-driven.

---

# 16. Priority Score

Допустимо иметь внутренний numeric score для сортировки.

Но user-facing contract остаётся semantic:

```text
critical / high / normal / low
```

---

# 17. Field Volatility

Использовать field freshness metadata из Source Registry / Update Strategy.

Минимальные volatility classes:

```text
V1
V2
V3
V4
```

или эквивалент.

---

# 18. Dynamic Fields

Наиболее volatile:

```text
availability
price
reservation
promotion validity
financing rate
initial payment
program applicability
```

---

# 19. Static Fields

Низкая volatility:

```text
area
floor
rooms
building address
```

если нет source conflict.

---

# 20. `valid_until`

Если entity имеет explicit:

```text
valid_until
```

это должно иметь приоритет над generic TTL.

---

# 21. Expired Promotion

Если promotion expired:

не создавать endless refresh каждые несколько минут.

Refresh plan должен понимать:

```text
expired
→ deactivate / verify replacement
```

в зависимости от source capability.

---

# 22. Queue Semantics

Refresh Queue должна поддерживать:

- enqueue;
- peek next;
- claim task;
- complete;
- fail;
- retry;
- cancel;
- deduplicate.

---

# 23. Task Status

Минимум:

```text
queued
blocked
ready
running
succeeded
partial
failed
retry_scheduled
cancelled
superseded
```

---

# 24. Deduplication

Критическое правило:

> одинаковые refresh-задачи не должны множиться.

Пример:

```text
same entity
same source
same field set
same reason class
```

→ один active task.

---

# 25. Dedup Key

Рекомендуемый deterministic key:

```text
entity_type
entity_id
source_id
normalized_field_paths
operation
```

Reason может влиять на priority, но не всегда должен создавать новую task.

---

# 26. Priority Escalation

Если task уже queued как `normal`, а затем пользователь дошёл до `pre_decision`:

не создавать duplicate.

Повысить priority существующей task.

---

# 27. Superseding

Если новый refresh полностью покрывает старую task:

старая может стать:

```text
superseded
```

---

# 28. Partial Field Coverage

RefreshTask должна уметь запросить только нужные поля.

Например:

```text
price
availability
family_mortgage_applicability
```

а не весь объект.

---

# 29. Minimal Refresh Principle

Не запускать full-page/full-source collection, если можно обновить только нужное поле и adapter/source это поддерживает.

---

# 30. Policy Gate

Перед execution обязательно:

```text
resolveCollectionPlan(...)
```

из TASK-013.

---

# 31. Policy Recheck at Execution Time

Policy проверяется не только при enqueue, но и перед actual execution.

Причина:

source policy может измениться между постановкой и запуском.

---

# 32. Policy Denied After Enqueue

Expected:

```text
task.status = blocked
reason = POLICY_DENIED
```

Не запускать adapter.

---

# 33. Allowed Method

Refresh executor использует только method из Collection Plan.

---

# 34. No Browser Fallback Without Permission

Если API/HTTP не сработал:

не переходить на OpenClaw/browser без policy allow.

---

# 35. Source Health Integration

Если:

```text
source_health = degraded
```

queue может:

- снизить concurrency;
- отложить low-priority tasks;
- использовать approved fallback;
- сохранить critical tasks.

---

# 36. Source Blocked

Если source:

```text
blocked / paused
```

task не исполняется.

---

# 37. Rate Limits

Queue должна учитывать policy metadata:

```text
min_interval
max_concurrency
daily_budget
```

или equivalent hooks.

---

# 38. No Aggressive Polling

Нельзя refresh одного и того же field чаще, чем позволяет policy/freshness logic, кроме explicitly forced user/admin case если policy это разрешает.

---

# 39. User-triggered Refresh

CTA:

```text
Проверить актуальность
```

может создавать `USER_REQUESTED` task.

Но пользовательский click не отменяет source policy/rate limits.

---

# 40. User-triggered Feedback

Application layer должен уметь показать:

```text
Проверяем
Обновлено
Не удалось проверить
Источник временно недоступен
Автоматическая проверка недоступна
```

UI implementation itself не обязателен в TASK-015, но status contract должен это позволять.

---

# 41. Pre-shortlist Refresh

Перед shortlist разрешено обновлять только critical stale/missing fields, которые materially влияют на eligibility/ranking.

Не refresh всё подряд.

---

# 42. Pre-comparison Refresh

Для 2–4 финалистов можно повысить priority:

```text
price
availability
financing
critical unknowns
```

---

# 43. Pre-decision Refresh

Самый строгий режим перед финальным решением.

Но даже здесь:

```text
refresh
!=
legal/technical expert verification
```

---

# 44. Conflict-driven Refresh

Если `SourceConflict` по critical field:

создать targeted task для:

- strongest allowed source;
- alternate evidence source;
- manual review if automation unavailable.

---

# 45. Conflict Not Silently Resolved

Новый refresh может:

- подтвердить одно значение;
- добавить новое evidence;
- оставить conflict.

Не выбирать winner автоматически без resolution policy.

---

# 46. Retry Policy

Retryable cases:

```text
TIMEOUT
TEMPORARY_5XX
RATE_LIMITED
TRANSIENT_NETWORK_ERROR
SOURCE_HEALTH_DEGRADED
```

Non-retryable:

```text
POLICY_DENIED
SOURCE_CHANGED
INVALID_STRUCTURE
AUTH_REQUIRED without configured credentials
PERMISSION_REQUIRED
```

---

# 47. Retry Backoff

Использовать centralized exponential/configurable backoff.

Не бесконечный retry.

---

# 48. Max Attempts

Task должна иметь:

```text
max_attempts
```

из config/policy.

---

# 49. `not_before`

Retry не должен запускаться раньше:

```text
not_before
```

---

# 50. Deadline

Critical pre-decision refresh может иметь:

```text
deadline
```

Если deadline пропущен:

пользователь должен получить stale/unknown status, а не fake success.

---

# 51. Idempotency

Повторный execution одной task не должен создавать duplicate evidence records бесконтрольно.

Использовать:

```text
collection_run_id
snapshot_hash
source external version
```

или equivalent idempotency strategy.

---

# 52. CollectionRun Link

Каждый refresh execution должен создавать/обновлять `CollectionRun`.

Минимум:

```text
refresh_task_id
source_id
adapter_version
policy_version
started_at
finished_at
status
```

---

# 53. Refresh Result Contract

Рекомендуемый result:

```yaml
refresh_result:
  refresh_task_id:
  collection_run_id:
  status:
  changed_fields:
  unchanged_fields:
  new_conflicts:
  resolved_conflicts:
  missing_fields:
  source_health_effect:
  evidence_ids:
  affected_entity_ids:
  completed_at:
```

---

# 54. Changed vs Unchanged

Refresh должен различать:

```text
field changed
field unchanged
field missing
```

---

# 55. No Change Is Success

Если price тот же:

```text
status = succeeded
changed_fields = []
```

Это не ошибка.

---

# 56. Missing Previously Known Field

Если source больше не показывает field:

не удалять canonical value silently.

Создать:

```text
missing_on_refresh
```

или evidence/status согласно ingestion flow.

---

# 57. Listing Removed

Если listing исчез:

не считать автоматически:

```text
sold
```

Можно:

```text
offer status = removed / availability unknown
```

в соответствии с domain model.

---

# 58. Canonical Update

После successful ingestion:

```text
Evidence
→ Conflict Resolution Rules
→ Canonical Update
```

Не adapter → canonical напрямую.

---

# 59. Match Recalculation Hook

Если изменилось field, которое участвует в current UserRequest criteria:

нужно пометить связанные MatchResult как stale/recompute-needed.

---

# 60. Data Confidence Recalculation Hook

Новое evidence должно инициировать:

```text
DataQuality recomputation
```

для affected request/property pairs.

---

# 61. No Global Recompute

Не пересчитывать все MatchResult системы из-за одного обновлённого Offer.

Только affected entities/request contexts.

---

# 62. Affected Scope

Refresh result должен уметь вернуть:

```text
affected_property_ids
affected_offer_ids
affected_scenario_ids
affected_user_request_ids
```

если application layer знает связи.

---

# 63. Background-first Strategy

Основной refresh mode:

```text
scheduled / queued background work
```

а не:

```text
user request waits for 20 websites
```

---

# 64. User-facing Blocking Refresh

Допустим только для узких критичных checks, если:

- source fast;
- policy allows;
- timeout short;
- fallback exists.

Не должен быть default architecture.

---

# 65. Queue Repository

Создать abstraction:

```ts
interface RefreshQueueRepository
```

Минимум:

```text
enqueue
getNext
claim
update
findActiveDuplicate
complete
fail
```

---

# 66. In-memory Implementation

Если DB layer ещё отсутствует:

допустим:

```text
InMemoryRefreshQueueRepository
```

для tests/PoC.

---

# 67. Future Persistence

Contract не должен мешать позже заменить in-memory на:

- PostgreSQL;
- Supabase;
- queue service.

---

# 68. Worker Interface

Рекомендуемый:

```ts
processNextRefreshTask(...)
```

или:

```ts
executeRefreshTask(task)
```

---

# 69. No Hidden Scheduling

Worker не должен сам бесконтрольно создавать recurring loops.

Scheduler — отдельный application boundary.

---

# 70. Scheduled Planning

TASK-015 должна иметь pure planning function:

```text
planScheduledRefreshes(now, entities, policies)
```

которая возвращает задачи, но не запускает infinite scheduler.

---

# 71. Refresh Planner Inputs

Минимум:

```text
current time
field freshness
source policy
source health
entity relevance
existing active tasks
```

---

# 72. Scheduled Refresh Tests

Проверить:

```text
fresh field → no task
aging but low priority → maybe no task
stale critical field → task
expired promotion → task/deactivate decision
active duplicate → no new task
```

---

# 73. Pre-decision Planning Test

Объект-финалист:

```text
price stale
availability aging
family mortgage claimed
```

Expected:

- price refresh;
- availability refresh;
- financing verification task;
- high/critical priorities.

---

# 74. Conflict Planning Test

Critical price conflict:

Expected:

```text
refresh strongest allowed source
```

или manual review if no automatic source available.

---

# 75. Source Failure Test

Source degraded/failing:

Expected:

- no forbidden fallback;
- retry/backoff or alternate approved source;
- task not falsely succeeded.

---

# 76. Policy Change Test

Task queued when allowed.

Before execution:

```text
source policy → blocked
```

Expected:

```text
blocked
adapter not called
```

---

# 77. Dedup Test

10 triggers for same stale price:

Expected:

```text
1 active task
priority escalated if needed
```

---

# 78. Partial Refresh Test

Adapter returns:

```text
price updated
availability missing
```

Expected:

- task partial;
- price evidence updated;
- availability remains unknown/stale;
- appropriate follow-up/retry policy.

---

# 79. No Infinite Partial Retry

Partial result should retry only if:

- missing field is requested/critical;
- source capability says field should exist;
- retry policy permits.

---

# 80. Source Changed Test

Expected:

```text
task failed/nonretryable
source health degraded
SOURCE_CHANGED reason
```

---

# 81. Refresh Metrics

Заложить минимум:

```text
queue_depth
oldest_task_age
success_rate
partial_rate
retry_rate
policy_block_rate
source_changed_rate
average_duration
critical_refresh_latency
```

---

# 82. Structured Logs

Минимум:

```text
refresh_task_id
entity_id
source_id
reason
priority
status
attempt
adapter_version
policy_version
duration
changed_field_count
error_code
```

---

# 83. No PII Leakage

Не логировать:

- user free-form text;
- personal financing details;
- documents;
- auth tokens.

Если `user_request_id` нужен — логировать ID, а не содержимое.

---

# 84. Config

Рекомендуемая структура:

```text
src/data-collection/refresh/
  config/
    priorities.ts
    retries.ts
    scheduler.ts
```

или equivalent.

---

# 85. Versioning

Refresh policy должна иметь version:

```text
refresh-policy-v1
```

---

# 86. Determinism

Для planning layer:

```text
same input
+
same current_time
+
same config version
=
same planned refresh tasks
```

---

# 87. No LLM

Refresh planning полностью deterministic.

Не спрашивать LLM:

> надо ли обновить цену?

---

# 88. No Commercial Bias

Priority не зависит от:

- paid listing;
- partner status;
- commission;
- ad placement.

---

# 89. Source Cost Awareness

Допустимо учитывать:

```text
collection cost / rate budget
```

как operational constraint.

Но critical user safety/decision fields не должны скрываться ради дешёвой метрики без explicit policy.

---

# 90. Refresh Before Match

Matching Engine не должен сам ходить в сеть.

Он может вернуть:

```text
critical_unknowns / stale fields
```

которые Refresh Planner превращает в tasks.

---

# 91. Refresh Before Shortlist

Application layer может:

1. match existing data;
2. identify critical stale fields;
3. enqueue refresh;
4. показать cached results с статусом;
5. обновить после completion.

Не обязательно блокировать shortlist.

---

# 92. Refresh Before Comparison

Для comparison финалистов priority выше, но architecture та же.

---

# 93. Refresh Before Decision

Если critical check не выполнен:

UI должен later показывать:

```text
Не подтверждено
```

а не скрывать проблему.

---

# 94. Manual Review Fallback

Если automation denied/unavailable:

task может перейти:

```text
blocked → manual_review_required
```

если contract это поддерживает.

Не пытаться обходить source restriction.

---

# 95. Expert Layer Boundary

Refresh Queue отвечает за **данные источников**.

Expert Layer отвечает за:

- документальную проверку;
- сложную интерпретацию;
- onsite;
- профессиональное заключение.

Не смешивать.

---

# 96. Recommended Code Structure

Например:

```text
src/
  data-collection/
    refresh/
      types.ts
      queue.ts
      planner.ts
      priority.ts
      dedup.ts
      executor.ts
      retry.ts
      propagation.ts
      config/
      tests/
```

---

# 97. Unit Tests

Минимум:

1. enqueue task;
2. deduplicate same task;
3. priority escalation;
4. blocked source;
5. policy recheck;
6. retryable failure;
7. nonretryable failure;
8. stale field planning;
9. fresh field no planning;
10. expired promotion;
11. conflict-driven refresh;
12. user-triggered refresh;
13. pre-decision priority;
14. source degraded;
15. deterministic planner.

---

# 98. Integration Tests

Минимум:

### A. Stale Price

```text
stale price
→ refresh task
→ approved fixture adapter
→ new evidence
→ changed field
→ DataQuality recompute hook
```

### B. Critical Unknown

```text
family mortgage must
eligibility unknown
→ high/critical task
→ adapter partial
→ unknown remains
→ no fake confirmation
```

### C. Conflict

```text
price conflict
→ targeted refresh
→ new evidence
→ conflict remains/resolves according policy
```

### D. Policy Denied

```text
task queued
→ policy changed
→ execution blocked
```

### E. Duplicate Triggers

```text
shortlist + comparison + user click
→ one active task
→ highest priority retained
```

---

# 99. Offline Test Requirement

CI tests должны работать без интернета.

---

# 100. Optional Live Smoke

Если TASK-014 source разрешён:

допустим manually-triggered:

```text
smoke:refresh
```

Не запускать в CI.

---

# 101. Acceptance Criteria

TASK-015 считается завершённой, если:

1. `RefreshTask` formalized;
2. queue abstraction существует;
3. refresh reasons typed;
4. priority deterministic;
5. duplicate tasks объединяются;
6. priority escalation работает;
7. policy gate вызывается перед execution;
8. policy rechecked at execution;
9. forbidden fallback отсутствует;
10. source health учитывается;
11. rate-limit hooks есть;
12. retry/backoff controlled;
13. stale/expired planning работает;
14. conflict-driven refresh работает;
15. user-triggered refresh работает;
16. partial refresh поддерживается;
17. changed/unchanged fields различаются;
18. canonical update идёт через evidence pipeline;
19. Match/DataQuality recompute hooks формируются;
20. no global recompute;
21. logs/metrics structured;
22. offline tests проходят;
23. typecheck/lint/test/build проходят.

---

# 102. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан отдельный command:

```text
<package-manager> test:refresh
```

Optional manual-only:

```text
<package-manager> smoke:refresh
```

---

# 103. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Refresh policy version:
Queue implementation:
Refresh reasons:
Priority logic:
Dedup logic:
Retry logic:
Policy integration:
Source health behavior:
Planner:
Executor:
Propagation hooks:
Metrics/logging:
Fixture/live adapter usage:
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

# 104. Do Not Continue Automatically

После TASK-015:

**не начинать следующую задачу самостоятельно.**

---

# 105. Likely Next Task

Следующая логичная задача:

```text
TASK-016 — Expert Request Workflow
```

Она должна связать:

```text
critical unknowns
conflicts
comparison finalists
recommended checks
```

с `ExpertRequest` и структурированным `ExpertContextPackage`.

---

# 106. Definition of Done

TASK-015 Done, когда система умеет не просто знать, что данные устарели или неполны, а детерминированно решить:

- нужно ли обновление;
- что именно обновлять;
- с каким приоритетом;
- каким разрешённым source/method;
- когда повторить;
- когда остановиться;
- какие сущности пересчитать после обновления.

---

# 107. Главный принцип для coding-agent

Refresh Queue — это не crawler scheduler.

Правильная модель:

```text
Data problem
      ↓
Specific refresh reason
      ↓
Minimal targeted task
      ↓
Policy-approved source/method
      ↓
Evidence update
      ↓
Only affected decisions recomputed
```

Главное правило:

> **Обновлять не “всё и всегда”, а только то, что действительно влияет на текущее решение пользователя и разрешено source policy.**
