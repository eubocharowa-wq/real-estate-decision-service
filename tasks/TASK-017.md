# TASK-017 — Expert Workbench & Result Review UI

## Status

`ready`

## Priority

`P1`

## Milestone

`Milestone E — Expert Loop`

---

# 1. Goal

Реализовать два связанных интерфейса поверх workflow из TASK-016:

1. **Expert Workbench** — рабочий экран специалиста для выполнения конкретного `ExpertRequest`;
2. **Expert Result Review UI** — пользовательский экран, где результат экспертной проверки показывается в контексте объекта, сравнения и исходного `UserRequest`.

Главный результат:

> эксперт должен быстро понять, что именно нужно проверить, какие данные уже есть и чего не хватает; пользователь должен получить не свободный комментарий, а структурированный результат, связанный с конкретными фактами, unknowns, conflicts и дальнейшими действиями.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-007.md
tasks/TASK-008.md
tasks/TASK-010.md
tasks/TASK-011.md
tasks/TASK-015.md
tasks/TASK-016.md

docs/04-data/source-model.md

docs/05-matching/matching-logic.md
docs/05-matching/confidence-status.md

docs/07-expert-services/expert-layer.md
docs/07-expert-services/document-review.md
docs/07-expert-services/choice-assistance.md
docs/07-expert-services/onsite-check.md

docs/08-roadmap/implementation-plan.md
```

---

# 3. Dependencies

TASK-017 предполагает наличие:

```text
ExpertRequest
ExpertContextPackage
ExpertResult
ExpertRequestRepository
ExpertRequest state machine
specialist routing
FieldEvidence integration hooks
Match/DataQuality recomputation hooks
```

из TASK-016.

Если TASK-016 не реализована:

```text
TASK-017 is blocked
```

Не создавать локальную копию expert workflow внутри UI.

---

# 4. In Scope

Реализовать:

1. route списка экспертных задач;
2. Expert Workbench route;
3. Context Package presentation;
4. checked / not checked workflow;
5. findings editor;
6. confirmed / unconfirmed / conflicting result capture;
7. evidence reference capture;
8. specialist notes;
9. recommendation / next-actions capture;
10. request status actions;
11. completion validation;
12. user-facing Expert Result page;
13. result summary;
14. verified changes presentation;
15. unresolved questions presentation;
16. decision impact block;
17. audit/activity presentation;
18. responsive layout;
19. accessibility;
20. component/integration tests.

---

# 5. Out of Scope

Не реализовывать:

- full CRM;
- chat;
- video calls;
- billing;
- payment processing;
- expert marketplace;
- document OCR;
- automatic legal opinion;
- file storage system;
- photo upload pipeline;
- onsite route planning;
- push notifications;
- external specialist accounts/SSO;
- complex role/permission administration;
- source crawling from Workbench.

---

# 6. Product Principle

Expert Workbench не должен быть generic admin form.

Правильная структура:

```text
Что пользователь решает
↓
Что уже известно
↓
Что мешает принять решение
↓
Что именно поручено проверить
↓
Что эксперт проверил
↓
На чём основан вывод
↓
Что изменилось после проверки
```

---

# 7. User Result Principle

Пользовательский результат не должен быть длинным экспертным эссе.

Правильно:

```text
Что проверяли
Что подтвердилось
Что не подтвердилось
Что осталось неизвестным
Что изменилось в выборе
Что делать дальше
```

---

# 8. Expert Queue Route

Рекомендуемый route:

```text
/expert/requests
```

или equivalent.

---

# 9. Queue Scope

Показывать минимум:

```text
queued
assigned
in_progress
waiting_for_user
waiting_for_external_info
```

Completed requests могут быть доступны через history/filter.

---

# 10. Expert Queue Item

Каждый item минимум:

```text
request_id
request_type
priority
required_specialist
short question
property/comparison context
created_at
status
assigned expert if any
```

---

# 11. Queue Ordering

Рекомендуемый deterministic порядок:

```text
critical first
then high
then normal
then low
```

внутри priority:

```text
oldest submitted first
```

Если assignment policy отличается — использовать существующий contract.

---

# 12. No Commercial Ordering

Queue ordering не зависит от:

- developer;
- partner;
- commission;
- source relationship.

---

# 13. Expert Workbench Route

Рекомендуемый route:

```text
/expert/requests/[requestId]
```

---

# 14. Workbench Input

Экран должен получить:

```yaml
expert_workbench_input:
  expert_request:
  context_package:
  current_result_draft:
  audit_events:
```

Не собирать context заново в React.

---

# 15. Workbench Header

Показывать:

```text
Request type
Priority
Status
Required specialist
Created at
User question
```

---

# 16. User Question Must Be Prominent

Исходный вопрос пользователя нельзя прятать внизу.

Эксперт должен сразу понимать:

> что именно пользователь хочет решить.

---

# 17. UserRequest Summary

Показывать компактно:

```text
must
preferred
exclude/avoid
financing constraints
timeline
```

---

# 18. No Full User Profile Dump

Не показывать irrelevant user data.

Следовать data minimization из TASK-016.

---

# 19. Property Context

Для relevant Property показать:

```text
property type
location
selected offer
selected scenario
match score
confidence status
key strengths
compromises
critical unknowns
conflicts
```

---

# 20. Comparison Context

Для `choice_assistance` показать 2–5 finalists.

Минимум:

```text
Match Score
Data Confidence
key must outcomes
main trade-offs
decision drivers
selected PurchaseScenario
```

---

# 21. No Recalculation in Workbench

Workbench не пересчитывает:

- Match Score;
- Data Confidence;
- decision drivers.

Он показывает сохранённый context snapshot.

---

# 22. Context Snapshot Notice

Если current data newer than Context Package:

показать:

```text
После создания экспертной задачи данные по объекту изменились.
```

и действия согласно TASK-016 policy.

---

# 23. Start Work Action

Для `assigned` request:

```text
Начать проверку
```

переводит:

```text
assigned → in_progress
```

через state machine.

---

# 24. No UI-only Status Mutation

Все status transitions должны проходить через expert workflow service.

---

# 25. Check Plan Section

Показать:

```text
Что нужно проверить
```

на основе:

- structured questions;
- recommended checks;
- critical unknowns;
- conflicts;
- request type.

---

# 26. Checked Item Model

Для каждого пункта эксперт должен выбрать статус:

```text
checked_confirmed
checked_not_confirmed
checked_conflicting
unable_to_check
not_required
```

или существующие formal equivalents.

---

# 27. Checked / Not Checked Is Explicit

Нельзя завершить request так, чтобы непонятно:

- что проверили;
- что не проверили.

---

# 28. Verification Method

Для checked item сохранять method, например:

```text
source_review
document_review
bank_confirmation
developer_confirmation
seller_confirmation
registry_check
visual_onsite
measurement
expert_analysis
other
```

Если enum отсутствует — оформить как application contract, не менять source verification status молча.

---

# 29. Evidence Reference

Checked item может ссылаться на:

```text
existing FieldEvidence
new expert evidence
document ref
source URL/reference
photo/measurement ref later
```

---

# 30. No Unsupported Evidence Upload

Если file/photo upload ещё не реализован:

не создавать fake attachment control.

Использовать reference field only where data already exists.

---

# 31. Findings Editor

Эксперт может создавать structured `finding`.

Минимум:

```text
category
severity
statement
related entity
related field
evidence refs
verification effect
```

---

# 32. Finding Categories

Поддержать минимум:

```text
fact
financing
document
property_condition
infrastructure
transaction
risk
conflict
other
```

---

# 33. Finding Severity

Использовать:

```text
info
attention
important
critical
```

---

# 34. Statement Requirements

Finding statement должен быть:

- конкретным;
- проверяемым;
- связанным с request context.

Не:

```text
В целом хороший вариант.
```

---

# 35. Confirmed Section

Эксперт отдельно фиксирует:

```text
Что подтвердилось
```

---

# 36. Unconfirmed Section

Отдельно:

```text
Что не удалось подтвердить
```

---

# 37. Conflicts Section

Отдельно:

```text
Какие расхождения остались
```

---

# 38. Risks Section

Отдельно:

```text
Что может повлиять на решение
```

Risk не должен автоматически менять Match Score.

---

# 39. Recommendation Section

Эксперт может сформулировать рекомендацию.

Она должна быть связана с текущей задачей.

Пример:

```text
Если ПВ 0 подтвердится на выбранный unit, вариант остаётся сильным.
Если нет — вариант B лучше проходит ваш финансовый must.
```

---

# 40. No Manual Match Score

UI не должен содержать control:

```text
Match Score = ...
```

Эксперт не редактирует Match Score вручную.

---

# 41. Next Actions

Поддержать structured:

```text
verify_again
request_document
request_bank_confirmation
request_developer_confirmation
technical_inspection
onsite_check
compare_again
recalculate_match
no_action
```

или formal equivalents.

---

# 42. Request More Information

Action:

```text
Запросить данные у пользователя
```

переводит:

```text
in_progress → waiting_for_user
```

---

# 43. Waiting for External Info

Action:

```text
Ожидаем ответ источника
```

переводит:

```text
in_progress → waiting_for_external_info
```

---

# 44. Unable to Complete

Если проверить невозможно:

эксперт должен иметь action:

```text
Не удалось завершить проверку
```

с обязательной причиной.

---

# 45. Completion Validation

Перед `completed` проверить минимум:

- checked items recorded;
- findings valid;
- unresolved items explicit;
- evidence refs valid where claimed;
- recommendation optional but structured if present;
- no illegal manual Match Score;
- result schema valid.

---

# 46. Completion Action

```text
Завершить проверку
```

создаёт immutable/versioned `ExpertResult`.

---

# 47. Result Versioning

После completion result не должен silently изменяться.

Amendment:

```text
new result version
```

или explicit correction event.

---

# 48. Evidence Integration Preview

Перед completion Workbench может показать:

```text
После завершения будут добавлены новые evidence:
— цена
— availability
— financing applicability
```

если result создаёт такие updates.

---

# 49. No Direct Canonical Write from UI

UI вызывает service:

```text
completeExpertRequest(...)
```

а не mutating Property/Offer напрямую.

---

# 50. Post-completion Hooks

После completion:

```text
Expert Evidence
→ Validation
→ Canonical update/conflict hook
→ DataQuality recomputation
→ Match recomputation
```

---

# 51. Recalculation Result

Если hooks синхронные/available:

user result page может показать:

```text
После проверки соответствие изменилось:
87% → 91%
```

только если реально пересчитано.

---

# 52. No Fake Change

Если recalculation ещё не выполнен:

показать:

```text
Данные обновлены. Соответствие будет пересчитано.
```

если workflow это поддерживает.

---

# 53. User-facing Result Route

Рекомендуемый route:

```text
/expert/results/[requestId]
```

или result ID.

---

# 54. Result Page Header

Показывать:

```text
Экспертная проверка завершена
```

и request type/context.

---

# 55. User Result Summary

Верхний summary должен отвечать:

```text
Что проверяли?
К какому объекту/сравнению относится?
Какой главный результат?
```

---

# 56. Result Status Presentation

Поддержать:

```text
completed
unable_to_complete
```

и subtype conclusion where applicable.

---

# 57. Confirmed Facts

Блок:

```text
Подтверждено
```

Пример:

```text
✓ Цена 4 890 000 ₽ актуальна на момент проверки.
```

---

# 58. Not Confirmed

Блок:

```text
Не подтвердилось
```

Пример:

```text
Первоначальный взнос 0 ₽ не применяется к выбранной квартире.
```

---

# 59. Still Unknown

Блок:

```text
Осталось неясным
```

---

# 60. Conflict Result

Если conflict не разрешён:

показать его как unresolved.

Не выбирать одно значение ради красивого результата.

---

# 61. Decision Impact

Создать отдельный block:

```text
Что это меняет в вашем выборе
```

---

# 62. Decision Impact Input

Этот block строится из:

- old MatchResult;
- new MatchResult if available;
- old/new DataQuality;
- ExpertResult recommendation;
- resolved/unresolved critical fields.

---

# 63. Decision Impact Is Not Generic Advice

Пример:

```text
После подтверждения цены вариант остаётся в вашем бюджете.
```

или:

```text
После проверки выяснилось, что условие ПВ 0 не выполняется — объект больше не проходит обязательное финансовое условие.
```

---

# 64. No LLM Requirement

Decision impact v1 можно строить deterministic templates.

LLM optional later.

---

# 65. Choice Assistance Result UI

Для `choice_assistance` показать:

```text
Экспертный вывод
```

с status:

```text
clear
conditional
near_tie
insufficient_data
no_valid_option
```

---

# 66. Clear Result

Если expert result = `clear`:

показывать leading option и reasons.

Но не скрывать relevant compromises.

---

# 67. Conditional Result

Показывать:

```text
Вариант A сильнее, если подтвердится X.
```

---

# 68. Near Tie

Показывать:

```text
Явного победителя нет.
```

и основные decision drivers.

---

# 69. Insufficient Data

Показывать:

```text
Для уверенного выбора пока не хватает данных.
```

и список required checks.

---

# 70. No Valid Option

Показывать:

```text
Ни один из сравниваемых вариантов не проходит обязательные условия.
```

если именно это отражает result.

---

# 71. Document Review Result UI

Если `document_review`:

показывать:

- checked document refs;
- clauses/issues;
- confirmed facts;
- unresolved risks;
- recommendation;
- disclaimer boundary.

---

# 72. Legal Boundary UI

Не писать:

```text
Документы юридически чистые
```

без соответствующего формального заключения.

---

# 73. Onsite Result UI

Для `onsite_check`:

- checked items;
- observations;
- unable-to-check;
- requires technical specialist;
- evidence refs if available.

---

# 74. Observation ≠ Interpretation

UI должен различать:

```text
Наблюдение
```

и:

```text
Вывод эксперта
```

если result contract позволяет.

---

# 75. Technical Escalation

Если finding:

```text
requires technical specialist
```

показывать CTA на новую ExpertRequest соответствующего типа, если workflow поддерживает.

---

# 76. Source / Evidence Presentation

Пользователь должен иметь возможность понять:

```text
на чём основана проверка
```

без raw technical dump.

---

# 77. Evidence User Labels

Показывать, например:

```text
Официальный источник
Документ
Ответ банка
Проверка эксперта
Источник продавца
```

если provenance это подтверждает.

---

# 78. No Fake Authority

Не писать:

```text
Официально подтверждено
```

если evidence type этого не подтверждает.

---

# 79. Audit / Activity View

Для expert/internal UI показать краткую timeline:

```text
Создано
Назначено
Начата проверка
Запрошены данные
Получен ответ
Завершено
```

---

# 80. User Audit View

Пользователю достаточно:

```text
Когда запрос создан
Когда проверка завершена
```

и meaningful intermediate status if waiting.

Не показывать internal operational logs.

---

# 81. Workbench Permissions Boundary

Если auth/roles ещё не реализованы:

создать interface/hook:

```text
canViewExpertRequest
canEditExpertRequest
canCompleteExpertRequest
```

Не строить full RBAC.

---

# 82. Fail Closed on Permission

Unknown actor permission:

```text
deny
```

---

# 83. No Expert Cross-access

Один специалист не должен случайно видеть unrelated expert requests.

Даже если current MVP uses fixture identity, code boundary должна быть готова.

---

# 84. Sensitive Data Masking

Workbench не показывает unnecessary PII.

---

# 85. Result Sharing

TASK-017 не реализует public share links.

---

# 86. Workbench Autosave

Допустимо autosave draft result.

Но autosave не должен менять request status на completed.

---

# 87. Draft Result

До completion использовать:

```text
ExpertResultDraft
```

как application state, если formal contract это поддерживает.

Не сохранять incomplete result как final `ExpertResult`.

---

# 88. Draft Validation

Draft может быть incomplete.

Final result — только schema-valid.

---

# 89. Unsaved Changes

UI должен предупреждать при уходе с существенными unsaved changes, если autosave отсутствует.

---

# 90. Responsive Workbench

Desktop:

- context;
- check plan;
- result editor.

Mobile/tablet:

- single-column or tabbed layout.

Не делать mobile inaccessible wide admin table.

---

# 91. Responsive User Result

User Result page — mobile-first readable.

---

# 92. Accessibility

Минимум:

- semantic headings;
- form labels;
- radio/select labels;
- keyboard navigation;
- visible focus;
- error summary;
- severity/status not color-only;
- proper table semantics where tables used.

---

# 93. No Color-only Findings

`critical` / `important` должны иметь text label.

---

# 94. Presentation Registries

Создать centralized mapping:

```text
request type → label
specialist type → label
finding severity → label
check status → label
result status → label
next action → label
```

---

# 95. No Duplicated Text Mapping

Не держать разные labels для same enum в Workbench и User Result без explicit reason.

---

# 96. Explanation Registry Reuse

Где возможно, переиспользовать explanation registry из matching UI.

---

# 97. Expert-specific Explanation Registry

Для expert reason codes создать отдельный registry, если needed.

---

# 98. User-facing Language

Избегать:

```text
FieldEvidence
SourceConflict
critical_override
```

Пользователь должен видеть business language.

---

# 99. Test Fixtures

Минимум:

1. financing verification completed;
2. price conflict resolved;
3. price conflict unresolved;
4. choice assistance clear;
5. choice assistance conditional;
6. choice assistance near_tie;
7. document review with important finding;
8. onsite unable-to-check;
9. technical escalation;
10. waiting_for_user request.

---

# 100. Component Tests — Expert Queue

Минимум:

1. renders priorities;
2. renders statuses;
3. orders deterministically;
4. opens request;
5. completed not mixed into active default view.

---

# 101. Component Tests — Workbench

Минимум:

1. user question visible;
2. context package visible;
3. must criteria visible;
4. critical unknown visible;
5. check item status editable;
6. finding can be added;
7. evidence refs captured;
8. waiting_for_user transition works;
9. invalid transition rejected;
10. completion blocked when required fields missing.

---

# 102. Component Tests — Result Review

Минимум:

1. confirmed facts shown;
2. unconfirmed facts shown;
3. unresolved conflict shown;
4. decision impact shown;
5. Match and Confidence changes separated;
6. conditional choice result shown correctly;
7. near_tie does not force winner;
8. unable_to_complete shown honestly;
9. legal boundary text shown for document review;
10. onsite visual result not labeled technical inspection.

---

# 103. Integration Test A — Financing Verification

```text
Property Detail
→ ExpertRequest
→ Expert Workbench
→ confirmed financing evidence
→ complete result
→ DataQuality recompute
→ Match recompute
→ User Result Review
```

---

# 104. Integration Test B — Unresolved Conflict

```text
price conflict
→ expert checks
→ cannot resolve
→ completed result with conflict
→ no canonical overwrite
→ user still sees unresolved conflict
```

---

# 105. Integration Test C — Choice Assistance

```text
Comparison
→ choice_assistance request
→ Workbench with 3 finalists
→ result = conditional
→ user sees condition and unresolved check
```

---

# 106. Integration Test D — Waiting for User

```text
in_progress
→ request additional document/info
→ waiting_for_user
→ user-facing status shown
→ resume in_progress after input hook
```

Full upload not required.

---

# 107. Integration Test E — Technical Escalation

```text
onsite finding
→ requires technical specialist
→ result page CTA
→ new ExpertRequest prefilled
```

---

# 108. No Real Expert Required in Tests

Использовать fixture actor/expert identities.

---

# 109. No Network Requirement

CI tests должны работать offline.

---

# 110. Performance

Workbench должен рендерить из prepared Context Package.

Не запускать live crawling автоматически при открытии экрана.

---

# 111. Refresh Hook

Если эксперт хочет свежие source data:

можно использовать TASK-015 refresh request hook.

Но Workbench сам не запускает forbidden collection.

---

# 112. No Hidden Refresh

Открытие Expert Workbench не должно автоматически refresh все sources.

---

# 113. Audit Hooks

Минимум events:

```text
expert_workbench_opened
check_item_updated
finding_added
status_changed
result_completed
result_viewed_by_user
```

Не подключать analytics vendor.

---

# 114. No Sensitive Analytics Payload

Events содержат IDs/types/statuses, не full question/document content.

---

# 115. Error States

Поддержать:

- request not found;
- context unavailable;
- stale context;
- invalid result draft;
- permission denied;
- failed completion;
- recomputation pending/failed.

---

# 116. Recompute Failure

Если ExpertResult saved, но Match/DataQuality recomputation failed:

результат проверки всё равно существует.

Показать controlled status:

```text
Проверка завершена, пересчёт данных ещё не выполнен.
```

Не откатывать ExpertResult silently.

---

# 117. Immutable Evidence Principle

После completion evidence/result audit refs не должны silently исчезать.

---

# 118. Acceptance Criteria

TASK-017 считается завершённой, если:

1. active Expert Request queue существует;
2. Workbench route существует;
3. Context Package показывается;
4. исходный вопрос пользователя виден;
5. checked/not checked workflow работает;
6. verification method фиксируется;
7. findings structured;
8. confirmed/unconfirmed/conflicting разделены;
9. evidence refs сохраняются;
10. waiting statuses работают через state machine;
11. completion validation работает;
12. final ExpertResult versioned;
13. UI не пишет canonical data напрямую;
14. recomputation hooks вызываются через workflow;
15. user-facing Result Review существует;
16. decision impact показывается;
17. choice assistance statuses отображаются корректно;
18. near_tie не превращается в forced winner;
19. unresolved conflict остаётся видимым;
20. legal/technical boundaries соблюдены;
21. permissions boundary fail-closed;
22. responsive layout работает;
23. accessibility basics выполнены;
24. component/integration tests проходят;
25. typecheck/lint/test/build проходят.

---

# 119. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если создан отдельный command:

```text
<package-manager> test:expert-ui
```

или эквивалент.

---

# 120. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Routes:
Expert queue:
Workbench components:
Context presentation:
Check workflow:
Finding editor:
Result completion flow:
User Result Review:
Decision impact:
Recompute integration:
Permission boundary:
Audit events:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 121. Do Not Continue Automatically

После TASK-017:

**не начинать следующую задачу самостоятельно.**

---

# 122. Likely Next Task

Следующая логичная задача:

```text
TASK-018 — End-to-End Buyer Journey Integration
```

Она должна связать один полный путь:

```text
Natural-language request
→ Confirmation
→ Matching
→ Shortlist
→ Property Detail
→ Comparison
→ Expert Request
→ Expert Result
→ Updated Decision
```

на Pilot Dataset и fixture expert/source flows.

---

# 123. Definition of Done

TASK-017 Done, когда эксперт может открыть конкретную задачу и без дополнительного ручного сбора контекста:

- увидеть, что пользователь пытается решить;
- понять, что уже известно;
- увидеть unknowns/conflicts;
- отметить, что проверено;
- зафиксировать evidence и findings;
- завершить structured ExpertResult;

а пользователь может увидеть результат в понятной форме и понять, **что именно изменилось в его решении после экспертной проверки**.

---

# 124. Главный принцип для coding-agent

Expert Workbench — это не CRM-карточка клиента.

Правильная модель:

```text
Decision context
      ↓
Specific expert task
      ↓
Structured check
      ↓
Evidence
      ↓
ExpertResult
      ↓
Updated decision context
```

Главное правило:

> **Эксперт должен работать с уже собранной логикой выбора, а результат его работы должен возвращаться в продукт как проверяемые факты, выводы и изменения в decision context — а не оставаться отдельным текстовым комментарием.**
