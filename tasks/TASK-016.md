# TASK-016 — Expert Request Workflow

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone E — Expert Loop`

---

# 1. Goal

Реализовать первый end-to-end workflow экспертной помощи, который связывает цифровой слой продукта с человеком-экспертом.

Пользователь должен иметь возможность создать **контекстный `ExpertRequest`** из конкретной ситуации:

- critical unknown;
- unresolved conflict;
- document question;
- comparison of finalists;
- financing uncertainty;
- property analysis;
- need for consultation;
- onsite check;
- transaction question.

Главный результат:

```text
UserRequest
+
Property / Offer / PurchaseScenario
+
MatchResult
+
DataQuality
+
Unknowns / Conflicts
+
User Question
      ↓
Expert Trigger
      ↓
ExpertRequest
      ↓
ExpertContextPackage
      ↓
Routing
      ↓
Expert Workflow Status
      ↓
Structured ExpertResult
      ↓
Evidence / Canonical Update Hook
      ↓
Match / Confidence Recalculation Hook
```

Главный принцип:

> **Экспертный слой включается там, где цифровая система уже собрала контекст, но для решения нужен человек. Пользователь не должен заново объяснять всю ситуацию эксперту с нуля.**

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-002.md
tasks/TASK-007.md
tasks/TASK-008.md
tasks/TASK-010.md
tasks/TASK-011.md
tasks/TASK-015.md

docs/04-data/user-request-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/04-data/source-model.md

docs/05-matching/matching-logic.md
docs/05-matching/confidence-status.md

docs/07-expert-services/expert-layer.md
docs/07-expert-services/document-review.md
docs/07-expert-services/choice-assistance.md
docs/07-expert-services/onsite-check.md

docs/08-roadmap/implementation-plan.md
docs/08-roadmap/backlog.md
```

---

# 3. Dependencies

TASK-016 предполагает наличие:

```text
ExpertRequest
ExpertResult
UserRequest
Property
Offer
PurchaseScenario
MatchResult
DataQuality
FieldEvidence
SourceConflict
```

Если `ExpertRequest` / `ExpertResult` не были полностью формализованы в TASK-002, допускается уточнить application contracts в рамках TASK-016, не ломая существующую domain model.

---

# 4. In Scope

Реализовать:

1. expert trigger model;
2. `ExpertRequest` creation service;
3. `ExpertContextPackage`;
4. request types;
5. specialist routing rules;
6. request status lifecycle;
7. user-facing request creation UI;
8. structured question capture;
9. context attachment;
10. request validation;
11. request priority;
12. expert assignment hook;
13. minimal expert work queue / repository abstraction;
14. structured `ExpertResult`;
15. result completion flow;
16. evidence integration hook;
17. canonical update hook;
18. Match/DataQuality recomputation hook;
19. audit trail;
20. privacy/data minimization;
21. component/unit/integration tests.

---

# 5. Out of Scope

Не реализовывать в TASK-016:

- marketplace экспертов;
- автоматическое распределение оплаты;
- billing;
- contracts with specialists;
- CRM;
- full legal case-management system;
- video calls;
- chat platform;
- document OCR;
- document legal analysis engine;
- onsite scheduling logistics;
- external expert marketplace integration;
- final bank approval;
- legal conclusion generation by AI.

---

# 6. Product Boundary

Экспертный слой — не замена цифрового продукта и не обычная агентская заявка.

Правильная модель:

```text
Digital analysis first
      ↓
Specific unresolved question
      ↓
Expert gets structured context
      ↓
Expert checks only what is needed
      ↓
Result returns into product
```

---

# 7. Expert Trigger Types

Поддержать минимум:

```text
critical_unknown
critical_conflict
user_requested
document_question
comparison_uncertainty
financing_uncertainty
property_analysis
onsite_needed
transaction_question
```

---

# 8. Trigger Sources

ExpertRequest может быть создан из:

```text
Property Detail
Comparison
Critical Unknown block
Recommended Check
Document flow placeholder
Onsite check CTA
```

---

# 9. No Forced Expert Upsell

Экспертный CTA не должен появляться везде.

Он нужен, когда:

- есть material uncertainty;
- пользователь явно просит помощи;
- digital layer не может безопасно сделать вывод;
- physical/document verification действительно может изменить решение.

---

# 10. Expert Request Types

Поддержать enum из core model минимум:

```text
information_verification
document_review
choice_assistance
property_analysis
consultation
onsite_check
transaction_question
```

---

# 11. Request Type Semantics

## `information_verification`

Проверить конкретный факт:

```text
актуальная цена
availability
promo condition
handover date
utility connection
```

## `document_review`

Разобрать документ / условия документа.

## `choice_assistance`

Помочь выбрать между 2–5 финалистами.

## `property_analysis`

Разобрать один объект глубже.

## `consultation`

Ответить на сложный общий вопрос по текущей покупке.

## `onsite_check`

Проверить физический объект / окружение на месте.

## `transaction_question`

Разобрать вопрос по сделке / процессу.

---

# 12. Specialist Types

Поддержать минимум:

```text
real_estate_expert
lawyer
mortgage_specialist
property_inspector
technical_specialist
```

---

# 13. Routing Rules

Создать deterministic routing layer:

```text
request_type
+
question category
+
context
→
required_specialist
```

---

# 14. Example Routing

```text
document_review
→ lawyer
```

```text
financing_uncertainty
→ mortgage_specialist
```

```text
choice_assistance
→ real_estate_expert
```

```text
structural / engineering onsite concern
→ technical_specialist
```

---

# 15. No LLM-only Routing

LLM может позже помогать классифицировать свободный вопрос, но final routing result должен валидироваться against allowed specialist mapping.

---

# 16. ExpertRequest Contract

Минимум:

```yaml
expert_request:
  request_id:
  request_type:
  trigger_type:
  user_request_id:
  property_ids:
  offer_ids:
  purchase_scenario_ids:
  comparison_id:
  question:
  structured_questions:
  priority:
  required_specialist:
  status:
  context_package_id:
  created_at:
  updated_at:
```

---

# 17. Optional User ID

Если authentication ещё не реализована:

не блокировать TASK-016.

Можно использовать:

```text
session_id / anonymous_request_owner_id
```

на application layer.

Не invent полноценную auth system.

---

# 18. ExpertContextPackage

Это ключевая часть TASK.

Минимум:

```yaml
expert_context_package:
  context_package_id:
  expert_request_id:
  user_request_summary:
  user_request_ref:
  properties:
  selected_offers:
  selected_purchase_scenarios:
  match_results:
  data_quality:
  critical_unknowns:
  conflicts:
  recommended_checks:
  source_evidence_refs:
  user_question:
  structured_questions:
  created_at:
  package_version:
```

---

# 19. Context Package Principle

Эксперту не нужно самостоятельно искать:

- что хотел пользователь;
- какие объекты он сравнивает;
- какой Match Score был рассчитан;
- какие поля unknown;
- где conflict;
- какой financing scenario рассматривается.

Это уже приходит в package.

---

# 20. Data Minimization

В Context Package включать только данные, относящиеся к конкретной expert task.

Не передавать весь пользовательский профиль без необходимости.

---

# 21. UserRequest Summary

Эксперт должен видеть:

- must;
- preferred;
- avoid/exclude;
- material timeline;
- financing constraints.

Не нужно передавать декоративные/irrelevant fields.

---

# 22. Property Context

Для каждого relevant Property:

```text
property_id
type
location
key facts
selected offer
selected scenario
match status
confidence status
critical unknowns/conflicts
```

---

# 23. Evidence Context

ExpertRequest должен ссылаться на evidence, а не копировать весь raw source content.

---

# 24. Critical Unknown Context

Пример:

```yaml
critical_unknown:
  field: financing.zero_initial_payment
  property_id: prop_123
  criterion_id: crit_456
  current_status: claimed
  reason_code: PROGRAM_APPLICABILITY_CLAIMED
```

---

# 25. Conflict Context

Пример:

```yaml
conflict:
  field: offer.price
  evidence_refs:
    - ev_1
    - ev_2
```

---

# 26. Recommended Checks Integration

Использовать `recommended_checks` из TASK-008 / TASK-015.

Пример:

```text
VERIFY_FINANCING_APPLICABILITY
VERIFY_AVAILABILITY
RESOLVE_SOURCE_CONFLICT
```

---

# 27. User Question

Пользователь должен иметь возможность написать собственный вопрос.

Пример:

```text
Правильно ли я понимаю, что квартиру можно купить без ПВ именно по этой цене?
```

---

# 28. Structured Questions

Дополнительно system-generated structured questions:

```yaml
structured_question:
  question_code:
  field:
  entity_id:
  reason:
  priority:
```

---

# 29. Do Not Replace User Question

System-generated questions дополняют, но не заменяют исходный вопрос пользователя.

---

# 30. Request Priority

Поддержать минимум:

```text
critical
high
normal
low
```

---

# 31. Priority Factors

Priority может зависеть от:

- pre-decision stage;
- must criterion;
- financial impact;
- unresolved conflict;
- transaction deadline;
- user explicit urgency.

---

# 32. No Commercial Priority

Не учитывать:

- commission;
- source partner;
- paid listing;
- developer relationship.

---

# 33. Request Status Lifecycle

Поддержать минимум:

```text
draft
submitted
queued
assigned
in_progress
waiting_for_user
waiting_for_external_info
completed
cancelled
unable_to_complete
```

---

# 34. Status Transitions

Создать explicit state machine.

Пример:

```text
draft
→ submitted
→ queued
→ assigned
→ in_progress
→ completed
```

---

# 35. Invalid Transitions

Не разрешать:

```text
draft → completed
```

без explicit administrative/test workflow.

---

# 36. Waiting for User

Использовать, если эксперт запросил:

- дополнительный документ;
- уточнение;
- missing fact from user.

---

# 37. Waiting for External Info

Использовать, если эксперт ждёт:

- ответ застройщика;
- банк;
- registry;
- managing company;
- seller.

---

# 38. Unable to Complete

Допустимый нормальный результат.

Пример:

```text
не удалось подтвердить факт
нет доступа к документу
не получен ответ источника
```

Не превращать это в fake conclusion.

---

# 39. User-facing Creation UI

Минимальный UI должен показывать:

```text
Что нужно проверить?
Почему это важно?
Какие объекты будут переданы эксперту?
Ваш вопрос
```

---

# 40. Context Preview

Перед submit пользователь должен видеть:

```text
Передадим эксперту:
— объект A
— объект B
— ваш запрос
— выявленные расхождения
```

---

# 41. No Technical Dump

Не показывать пользователю:

```text
FieldEvidence[]
CriterionEvaluationResult[]
```

в сыром виде.

---

# 42. Submit CTA

Пример:

```text
Передать на экспертную проверку
```

или:

```text
Попросить помочь с выбором
```

в зависимости от request type.

---

# 43. Choice Assistance Flow

Для `choice_assistance` Context Package должен включать:

```text
2–5 finalists
UserRequest
MatchResults
PurchaseScenarios
DataConfidence
unknowns
conflicts
decision drivers
```

---

# 44. Choice Assistance Scope

Эксперт не должен просто выбрать объект по личному вкусу.

Он должен работать по подтверждённому UserRequest и trade-offs.

---

# 45. Choice Assistance Result Status

Поддержать минимум:

```text
clear
conditional
near_tie
insufficient_data
no_valid_option
```

если ExpertResult subtype это предусматривает.

---

# 46. Document Review Hook

Для `document_review` TASK-016 реализует request/context boundary.

Полноценный upload/parsing документов — отдельная задача.

Допустимо передавать:

```text
document_refs
```

если documents уже существуют.

---

# 47. Document Review Boundary

AI/document analysis later:

```text
предварительный разбор
```

не:

```text
юридическое заключение
```

---

# 48. Onsite Check Hook

Для `onsite_check` Context Package минимум:

```text
property
user-specific questions
unknown physical facts
known risks
what should be checked
```

---

# 49. Onsite Scope

Не позиционировать onsite visual check как:

```text
technical inspection
```

если technical specialist не задействован.

---

# 50. Expert Assignment

Создать repository/service boundary:

```text
assignExpertRequest(...)
```

---

# 51. Assignment in MVP

Если real expert directory ещё не существует:

допустимо:

```text
required_specialist type
+
unassigned queue
```

Не нужно создавать fake experts.

---

# 52. Expert Queue Repository

Рекомендуемый abstraction:

```ts
interface ExpertRequestRepository {
  create(...)
  get(...)
  listQueued(...)
  updateStatus(...)
  assign(...)
  saveResult(...)
}
```

---

# 53. In-memory Implementation

Если DB layer отсутствует:

допустим deterministic in-memory/test implementation.

---

# 54. Expert Work View

Минимальный internal view model может показывать:

- request type;
- priority;
- user question;
- UserRequest summary;
- properties;
- unknowns;
- conflicts;
- evidence refs;
- recommended checks.

Полноценный admin panel не обязателен.

---

# 55. Structured ExpertResult

Минимум:

```yaml
expert_result:
  expert_result_id:
  request_id:
  status:
  checked_items:
  findings:
  confirmed:
  unconfirmed:
  conflicts:
  risks:
  recommendations:
  next_actions:
  evidence:
  specialist:
  completed_at:
  result_version:
```

---

# 56. Checked Item

Каждый checked item должен отражать:

```text
что проверялось
как проверялось
результат
evidence
```

---

# 57. Finding Contract

Рекомендуемый:

```yaml
finding:
  finding_id:
  category:
  severity:
  statement:
  related_entity_ids:
  related_field:
  evidence_refs:
  verification_effect:
```

---

# 58. Finding Severity

Минимум:

```text
info
attention
important
critical
```

---

# 59. Confirmed vs Unconfirmed

Эксперт обязан явно различать:

```text
confirmed
unconfirmed
unable_to_verify
conflicting
```

---

# 60. Expert Evidence

Если эксперт получил новый факт:

создаётся `FieldEvidence` с provenance:

```text
manual_expert
```

или соответствующим source/evidence type.

---

# 61. Expert Is Not Source by Magic

Экспертное подтверждение должно содержать:

- what was checked;
- method;
- timestamp;
- supporting evidence/reference where possible.

---

# 62. Canonical Update Hook

ExpertResult не должен напрямую mutating canonical entity внутри UI.

Правильно:

```text
ExpertResult
→ Expert Evidence
→ Validation
→ Conflict/Resolution
→ Canonical Update
```

---

# 63. Conflict Resolution

Если expert evidence разрешает conflict:

сохранить:

```text
resolution_reason
resolved_by
resolved_at
evidence refs
```

---

# 64. No Silent Conflict Override

Эксперт не должен просто переписать старое значение без audit trail.

---

# 65. Match Recalculation Hook

Если expert result изменил relevant field:

пометить связанные MatchResult:

```text
recompute_required
```

или вызвать существующий recomputation hook.

---

# 66. DataQuality Recalculation Hook

Новое expert evidence должно пересчитывать:

```text
DataConfidence
DataCompleteness
```

только для affected entities/request contexts.

---

# 67. Expert Result Does Not Directly Set Match %

Эксперт не может вручную написать:

```text
match_score = 95
```

Match Score должен пересчитаться deterministic engine.

---

# 68. Expert Recommendation vs Match

Эксперт может сказать:

```text
я бы выбрал A при условии X
```

но это хранится как `recommendation`, а не как ручная замена Matching Engine.

---

# 69. Legal Boundary

Для `document_review` / `transaction_question` UI и result contract должны позволять disclaimer:

```text
Экспертный разбор в сервисе не заменяет официальное юридическое заключение, если такое требуется.
```

Формулировка может быть адаптирована legal/product review позже.

---

# 70. Mortgage Boundary

Эксперт/сервис не должен писать:

```text
банк точно одобрит
```

без фактического решения банка.

---

# 71. Technical Boundary

Визуальная проверка объекта не равна:

```text
инженерно-техническому обследованию
```

---

# 72. Privacy

ExpertContextPackage может содержать чувствительные данные.

Минимизировать:

- household details;
- financing;
- documents;
- contact data.

Передавать только то, что нужно специалисту.

---

# 73. Document Privacy

Если в будущем document refs содержат personal documents:

- не логировать content;
- не хранить в analytics;
- доступ только request scope.

---

# 74. PII Logging

Не логировать:

- паспортные данные;
- phone/email без необходимости;
- document text;
- user free-form sensitive details.

---

# 75. Audit Trail

Сохранять минимум:

```text
request created
submitted
assigned
status changed
result saved
evidence created
canonical update requested
```

---

# 76. Audit Event Contract

Например:

```yaml
expert_audit_event:
  event_id:
  request_id:
  event_type:
  actor_type:
  actor_ref:
  created_at:
  metadata:
```

---

# 77. Actor Types

Минимум:

```text
user
system
expert
admin
```

---

# 78. No Raw Sensitive Metadata

Audit metadata должна быть минимальной и безопасной.

---

# 79. Cancellation

Пользователь может отменить request, если work ещё не завершена.

---

# 80. Completed Request Immutability

После `completed` результат не должен редактироваться silently.

Исправление:

```text
new result version
```

или audit amendment.

---

# 81. Result Versioning

Использовать:

```text
expert-result-v1
```

или per-result version.

---

# 82. Context Package Versioning

Использовать:

```text
expert-context-v1
```

---

# 83. Stale Context

Если UserRequest или Property data изменились после создания Context Package:

expert view должен видеть:

```text
context created_at
current data newer than context
```

---

# 84. Context Refresh

Допустимо обновить package до начала work.

Но не менять исходный submitted context silently после expert started.

---

# 85. Snapshot Principle

После `in_progress` ExpertRequest должен иметь auditable snapshot/context version.

---

# 86. Recommended Code Structure

Например:

```text
src/
  expert/
    requests/
      types.ts
      create.ts
      routing.ts
      state-machine.ts
      context-builder.ts
      repository.ts
    results/
      types.ts
      validate.ts
      evidence-integration.ts
      propagation.ts
    presentation/
      request-view.ts
      expert-work-view.ts
```

---

# 87. UI Components

Рекомендуемые:

```text
ExpertRequestDialog
ExpertRequestTypeSelector
ExpertContextPreview
ExpertQuestionInput
ExpertRequestStatus
ExpertResultSummary
```

---

# 88. Entry Point — Property Detail

Из critical unknown:

```text
Проверить этот вопрос
```

должен prefill:

- property;
- field;
- reason;
- recommended check;
- question.

---

# 89. Entry Point — Comparison

CTA:

```text
Помочь выбрать между этими вариантами
```

должен создать:

```text
choice_assistance
```

с selected finalists.

---

# 90. Entry Point — Financing

Если uncertainty по financing:

prefill:

```text
mortgage_specialist
```

если routing rules это подтверждают.

---

# 91. No Duplicate Requests

Если active ExpertRequest уже существует для:

```text
same user
same entity
same question code
same request type
```

показать existing request вместо бесконтрольного дубля.

---

# 92. Dedup Key

Рекомендуемый:

```text
owner/session
request_type
entity refs
question code / normalized question category
```

---

# 93. Different Question = New Request

Два разных вопроса по одному Property могут быть двумя requests.

Не объединять слишком агрессивно.

---

# 94. Request Validation

Перед submit проверить:

- request type valid;
- specialist route possible;
- question/context exists;
- referenced entities exist;
- user has access to referenced context;
- context package valid.

---

# 95. No Empty Expert Lead

Не создавать request:

```text
"Свяжитесь со мной"
```

без понятного вопроса/context в core workflow.

---

# 96. Result Validation

Перед completion:

- request exists;
- expert type compatible;
- checked items present;
- status valid;
- findings structured;
- evidence refs valid;
- no illegal direct Match Score mutation.

---

# 97. Test Fixtures

Использовать минимум:

1. price verification;
2. claimed family mortgage;
3. price conflict;
4. choice assistance between 3 finalists;
5. document review placeholder;
6. house gas onsite question;
7. technical inspection escalation;
8. unable-to-verify result.

---

# 98. Unit Tests — Routing

Минимум:

1. document review → lawyer;
2. financing → mortgage specialist;
3. choice assistance → real estate expert;
4. onsite physical → property inspector;
5. structural concern → technical specialist;
6. unsupported request type rejected.

---

# 99. Unit Tests — State Machine

Минимум:

1. draft → submitted;
2. submitted → queued;
3. queued → assigned;
4. assigned → in_progress;
5. in_progress → completed;
6. in_progress → waiting_for_user;
7. invalid transition rejected;
8. cancelled finality respected.

---

# 100. Unit Tests — Context

Минимум:

1. only relevant Property included;
2. MatchResult included;
3. DataQuality included;
4. unknown included;
5. conflict included;
6. evidence refs included;
7. irrelevant user fields omitted;
8. context version present.

---

# 101. Unit Tests — Result

Минимум:

1. structured finding valid;
2. confirmed vs unconfirmed separate;
3. evidence integration hook called;
4. Match recompute hook created;
5. DataQuality recompute hook created;
6. completed result immutable/audited.

---

# 102. Integration Test A — Critical Unknown

```text
Property Detail
→ family mortgage claimed
→ "Проверить"
→ ExpertRequest
→ mortgage specialist route
→ Context Package
→ ExpertResult confirms applicability
→ expert evidence
→ DataQuality recompute
→ Match recompute
```

---

# 103. Integration Test B — Price Conflict

```text
price conflict
→ information_verification
→ real_estate_expert
→ result with new evidence
→ conflict resolution hook
```

---

# 104. Integration Test C — Choice Assistance

```text
Comparison with 3 finalists
→ choice_assistance
→ Context Package with Match/DataQuality/decision drivers
→ ExpertResult = conditional
→ recommendation + unresolved question
```

---

# 105. Integration Test D — Unable to Verify

```text
critical field
→ ExpertRequest
→ expert cannot confirm
→ unable_to_complete / unconfirmed
→ no fake canonical update
→ unknown remains visible
```

---

# 106. Integration Test E — Duplicate Request

```text
same active verification request submitted twice
→ existing active request returned
```

---

# 107. No Network Requirement

TASK-016 tests должны работать offline.

---

# 108. No Real Expert Required in CI

Использовать deterministic test expert/repository fixtures.

---

# 109. Acceptance Criteria

TASK-016 считается завершённой, если:

1. ExpertRequest creation service существует;
2. trigger types formalized;
3. request types formalized;
4. specialist routing deterministic;
5. ExpertContextPackage создаётся;
6. UserRequest context передаётся;
7. Property/Offer/Scenario context передаётся;
8. MatchResult/DataQuality передаются;
9. critical unknowns/conflicts передаются;
10. user question сохраняется;
11. request state machine работает;
12. assignment hook существует;
13. duplicate active requests контролируются;
14. ExpertResult structured;
15. confirmed/unconfirmed/conflicting различаются;
16. expert evidence создаётся через proper hook;
17. canonical update не происходит напрямую;
18. Match/DataQuality recomputation hooks работают;
19. expert не задаёт Match Score вручную;
20. privacy/data minimization соблюдены;
21. audit trail существует;
22. component/unit/integration tests проходят;
23. typecheck/lint/test/build проходят.

---

# 110. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан отдельный command:

```text
<package-manager> test:expert
```

или эквивалент.

---

# 111. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Expert request types:
Trigger types:
Routing rules:
Context package version:
Request state machine:
Repository implementation:
Expert result version:
Evidence integration:
Canonical update hook:
Match/DataQuality propagation:
Privacy decisions:
Audit events:
UI entry points:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 112. Do Not Continue Automatically

После TASK-016:

**не начинать следующую задачу самостоятельно.**

---

# 113. Likely Next Task

Следующая логичная задача:

```text
TASK-017 — Expert Workbench & Result Review UI
```

Она должна дать специалисту рабочий экран для:

- просмотра Context Package;
- отметки checked/not checked;
- фиксации findings;
- добавления evidence;
- завершения ExpertResult;

а пользователю — структурированный результат проверки.

---

# 114. Definition of Done

TASK-016 Done, когда из конкретного места принятия решения пользователь может создать не generic lead, а контекстную экспертную задачу, которая:

- знает, что нужно проверить;
- знает, почему это важно;
- знает, какие объекты участвуют;
- содержит Match/Confidence/unknowns/conflicts;
- маршрутизируется к нужному типу специалиста;
- возвращает structured result;
- может обновить evidence и инициировать пересчёт решения.

---

# 115. Главный принцип для coding-agent

Экспертный слой не должен начинать анализ заново.

Правильная модель:

```text
Digital layer already knows
what user wants
what object says
what fits
what is unknown
what conflicts
      ↓
Expert receives exactly this context
      ↓
Checks only what can change the decision
      ↓
Returns evidence and structured result
```

Главное правило:

> **Эксперт подключается не вместо системы, а поверх уже собранного decision context — там, где человеческая проверка действительно может изменить решение пользователя.**
