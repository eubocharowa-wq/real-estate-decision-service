# TASK-020 — Real Buyer Pilot Execution & Feedback Loop

## Status

`ready_with_release_gate`

## Priority

`P0`

## Milestone

`Milestone F — Real Buyer Pilot`

---

# 1. Goal

Запустить ограниченный, контролируемый пилот с реальными покупателями и превратить обратную связь и наблюдаемые результаты в структурированный цикл улучшения продукта.

TASK-020 не должна механически добавлять новые функции.

Её задача:

- провести реальные buyer journeys;
- измерить, где продукт помогает принять решение;
- выявить места, где логика, данные или UX дают сбой;
- отделить product problem от data coverage problem;
- отделить parser/matching problem от source-confidence problem;
- фиксировать реальные decision outcomes;
- превращать подтверждённые проблемы в новые отдельные TASK.

Главный результат:

> команда получает не набор субъективных отзывов, а структурированный pilot evidence о том, насколько продукт помогает реальному покупателю понять, что ему стоит покупать и почему.

---

# 2. Critical Precondition

TASK-020 может стартовать только если `TASK-019 — Real Buyer Pilot Hardening` вернула:

```text
pilot_release_gate.ready = true
```

или есть явно утверждённый curator override для ограниченного internal/friendly pilot.

Если есть hard blocker:

```text
TASK-020 is blocked
```

Нельзя обходить release gate ради запуска пилота.

---

# 3. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-018.md
tasks/TASK-019.md

docs/07-expert-services/expert-layer.md
docs/08-roadmap/implementation-plan.md
docs/08-roadmap/backlog.md
```

Дополнительно coding-agent обязан прочитать фактический output/report TASK-019:

```text
Pilot blockers
Known limitations
Release gate
Feature flags
Source readiness
Coverage diagnostics
```

---

# 4. Pilot Objective

Пилот должен проверять не:

```text
нравится ли интерфейс
```

и не:

```text
сколько карточек открыл пользователь
```

а основной продуктовый вопрос:

> **Помог ли сервис пользователю яснее понять, какие варианты недвижимости ему подходят, почему, в чём компромиссы и что ещё нужно проверить перед решением?**

---

# 5. Core Pilot Hypotheses

Минимум проверить следующие гипотезы:

1. пользователь может описать задачу обычными словами;
2. parser правильно понимает ключевые условия;
3. confirmation screen позволяет быстро исправить ошибки;
4. shortlist воспринимается как действительно релевантный;
5. пользователь понимает `% соответствия`;
6. пользователь отличает Match Score от Data Confidence;
7. пользователь понимает компромиссы;
8. comparison реально упрощает выбор;
9. unknown/conflict повышают доверие, а не создают путаницу;
10. expert verification полезна именно в точках неопределённости;
11. после прохождения journey пользователь лучше понимает свой выбор.

---

# 6. Pilot Cohorts

Поддержать минимум:

```text
internal_test
friendly_pilot
real_buyer_pilot
```

Основной TASK-020 фокус:

```text
real_buyer_pilot
```

---

# 7. Pilot Size

Для первой волны достаточно ограниченной группы.

Рекомендуемый порядок:

```text
Wave 1: 3–5 пользователей
Wave 2: 5–10 пользователей
Wave 3: расширение только после review
```

Не масштабировать пилот автоматически.

---

# 8. Pilot Recruitment Data

Не создавать CRM.

Минимум application-level record:

```yaml
pilot_participant:
  participant_id:
  cohort:
  journey_id:
  consent_status:
  started_at:
  completed_at:
  outcome_status:
```

PII хранить отдельно и минимально, если вообще требуется.

---

# 9. Consent Boundary

Если сохраняется user feedback/session telemetry:

пилотный flow должен иметь понятное согласие на:

- использование данных для улучшения продукта;
- сохранение feedback;
- экспертную передачу context, если expert workflow используется.

Не создавать legal text самостоятельно, если финальная формулировка требует review.

---

# 10. Pilot Session Contract

Рекомендуемый:

```yaml
pilot_session:
  pilot_session_id:
  participant_id:
  journey_id:
  cohort:
  app_version:
  started_at:
  completed_at:
  final_stage:
  source_coverage_summary_ref:
  feedback_refs:
  issue_refs:
  outcome_ref:
```

---

# 11. Pilot Session Timeline

Для каждого пользователя должна быть восстановима последовательность:

```text
request entered
request parsed
request edited
request confirmed
shortlist viewed
property opened
comparison created
expert request created
expert result viewed
journey feedback submitted
```

---

# 12. Pilot Observation Layers

Каждая проблема должна быть классифицирована минимум по слоям:

```text
product
parser
confirmation
data coverage
source freshness
source policy
matching
confidence
shortlist
property detail
comparison
user URL ingestion
expert workflow
performance
security/privacy
other
```

---

# 13. Pilot Issue Contract

Создать structured record:

```yaml
pilot_issue:
  issue_id:
  pilot_session_id:
  layer:
  category:
  severity:
  title:
  description:
  evidence_refs:
  reproducible:
  affected_stage:
  user_impact:
  workaround:
  status:
  created_at:
```

---

# 14. Severity

Минимум:

```text
critical
high
medium
low
observation
```

---

# 15. Critical Issue Examples

```text
hard criterion silently violated
Match Score inconsistent with criteria
claimed financing shown as confirmed
source policy bypassed
private data leaked
wrong Property/Offer merged
expert result overwrites evidence without audit
```

Любой такой issue блокирует расширение pilot.

---

# 16. High Issue Examples

```text
parser repeatedly misreads budget
comparison unclear
unknown labels confusing
matching result technically correct but explanation misleading
```

---

# 17. Observation

Пример:

```text
пользователь не заметил кнопку изменения условий
```

Это не обязательно defect, пока не повторяется.

---

# 18. Evidence Before Backlog

Нельзя превращать каждое устное замечание в feature request.

Правильная последовательность:

```text
Observation
↓
Evidence
↓
Pattern
↓
Root Cause
↓
Curator Decision
↓
New TASK if needed
```

---

# 19. Pilot Feedback Categories

Минимум собирать feedback по:

```text
request understanding
shortlist relevance
explanation clarity
comparison usefulness
confidence/unknown clarity
expert usefulness
overall decision clarity
```

---

# 20. Request Understanding Feedback

После confirmation:

```text
Сервис правильно понял, что для вас важно?
```

Ответ:

```text
Да
Частично
Нет
```

---

# 21. Shortlist Relevance Feedback

```text
Среди предложенных вариантов есть те, которые вы действительно готовы рассматривать?
```

---

# 22. Explanation Clarity Feedback

```text
Понятно ли, почему каждый вариант получил такой процент соответствия?
```

---

# 23. Comparison Feedback

```text
После сравнения стало понятнее, какой вариант подходит вам больше?
```

---

# 24. Confidence Feedback

```text
Понятно ли, какие данные подтверждены, а какие ещё требуют проверки?
```

---

# 25. Expert Feedback

```text
Экспертная проверка помогла понять, что делать дальше?
```

---

# 26. Final Decision Clarity

Главный итоговый вопрос:

```text
Теперь мне понятнее, что мне стоит покупать.
```

Ответ:

```text
Да
Частично
Нет
```

---

# 27. Outcome Contract

Создать:

```yaml
pilot_outcome:
  outcome_id:
  pilot_session_id:
  decision_clarity:
  shortlist_relevance:
  comparison_helpfulness:
  expert_helpfulness:
  user_has_finalist:
  user_changed_initial_preference:
  critical_unknowns_remaining:
  user_next_action:
  created_at:
```

---

# 28. User Next Action

Минимум:

```text
continue_search
inspect_property
request_more_verification
contact_seller
contact_bank
consult_expert
pause_decision
selected_finalist
unknown
```

---

# 29. Outcome Is Not Purchase Conversion

Пилот не должен оцениваться только по факту покупки.

Пользователь может получить ценность, если понял:

```text
этот вариант не подходит
```

---

# 30. Changed Initial Preference

Отдельно полезно фиксировать:

```text
user_changed_initial_preference = true
```

если comparison/expert result реально изменили решение.

---

# 31. Parser Accuracy Review

Для каждого пилотного запроса сравнивать:

```text
raw request
parsed request
confirmed request
```

---

# 32. Parser Correction Metrics

Минимум:

```text
fields_added
fields_removed
priorities_changed
values_corrected
clarifications_answered
```

---

# 33. Parser Failure Signal

Если пользователи регулярно исправляют один и тот же field:

это кандидат на parser TASK.

---

# 34. Matching Review

Для каждого спорного MatchResult должна быть возможность проверить:

```text
criteria inputs
criterion evaluations
hard gate
soft aggregation
confidence
```

---

# 35. No Manual Score Tuning During Pilot

Не менять weights после одного пользователя.

Требуется:

```text
pattern
+
curator review
+
separate TASK
+
algorithm version change
```

---

# 36. Data Coverage Review

Для каждого journey сохранить:

```text
coverage summary
active source coverage
missing property types
missing fields
source failures
manual-only gaps
```

---

# 37. Coverage Problem ≠ Matching Problem

Пример:

```text
пользователь не увидел подходящий дом
```

нужно сначала определить:

```text
дом отсутствует в available data
```

или:

```text
дом был, но matching его ошибочно исключил
```

---

# 38. Source Coverage Issue Contract

Рекомендуемый:

```yaml
coverage_issue:
  issue_id:
  geography:
  property_type:
  field:
  source_gap:
  user_impact:
  affected_journeys:
  severity:
```

---

# 39. No Source Expansion by Reflex

Не добавлять новый источник только потому, что одному пользователю не хватило варианта.

Сначала:

- frequency;
- impact;
- policy feasibility;
- coverage value;
- implementation cost.

---

# 40. Source Expansion Candidate Score

Допустимо собрать metadata:

```text
affected users
affected criterion frequency
coverage gain
policy complexity
adapter complexity
refresh cost
```

Но решение принимает curator.

---

# 41. Expert Workflow Review

Для каждого ExpertRequest измерять:

```text
trigger source
request type
time to result
resolved unknowns
unresolved unknowns
decision impact
user helpfulness feedback
```

---

# 42. Expert Request Quality

Важно определить:

> получил ли эксперт достаточно context без повторного опроса пользователя?

---

# 43. Expert Context Failure Signal

Если эксперт постоянно вручную выясняет:

```text
что хотел пользователь
какой объект
какой сценарий покупки
что уже проверено
```

значит Context Package недостаточен.

---

# 44. Expert Result Failure Signal

Если пользователь не понимает:

```text
что именно изменилось после проверки
```

значит Result Review требует улучшения.

---

# 45. Performance Review

Для реальных pilot sessions собирать safe timings:

```text
parser
matching
shortlist
detail
comparison
expert context
recompute
```

---

# 46. Performance Severity

Performance issue считается high, если он реально ломает user flow, а не просто превышает arbitrary benchmark.

---

# 47. Pilot Session Review Report

После каждой session генерировать structured review.

Рекомендуемый format:

```yaml
pilot_session_review:
  session_id:
  completed_stages:
  drop_off_stage:
  parser_changes:
  shortlist_feedback:
  comparison_feedback:
  expert_feedback:
  coverage_gaps:
  errors:
  issues:
  outcome:
  curator_notes:
```

---

# 48. Drop-off Analysis

Если journey остановился:

фиксировать stage:

```text
request_entry
confirmation
shortlist
detail
comparison
expert_request
expert_result
```

---

# 49. Drop-off ≠ Failure Automatically

Пользователь мог получить достаточно информации раньше.

Нужен feedback/context.

---

# 50. Pilot Review Cadence

После каждой первой волны:

```text
review before expansion
```

Не запускать следующую cohort автоматически.

---

# 51. Wave Gate

Создать:

```yaml
pilot_wave_gate:
  wave:
  ready_to_expand:
  blockers:
  critical_issues:
  high_issues:
  decision_clarity_rate:
  shortlist_relevance_rate:
  comparison_helpfulness_rate:
  source_coverage_warnings:
  evaluated_at:
```

---

# 52. Expansion Hard Blockers

Минимум:

- unresolved critical issue;
- source-policy violation;
- PII/security incident;
- hard criterion semantic defect;
- Match/Confidence mixing;
- systematic wrong financing claim;
- broken expert evidence integration.

---

# 53. Expansion Warnings

Примеры:

- low sample size;
- limited source coverage;
- high manual intervention;
- long expert turnaround;
- comparison rarely used.

---

# 54. No Arbitrary Success Thresholds

Если numerical thresholds не определены product curator:

не придумывать:

```text
80% success required
```

Coding-agent должен собирать metrics, а curator принимает решение.

---

# 55. Pilot Dashboard

Полноценный BI dashboard не обязателен.

Достаточно developer/internal pilot report page или CLI report.

---

# 56. Pilot Summary Report

Минимум агрегировать:

```text
sessions started
sessions completed
confirmation edits
shortlist relevance feedback
comparison usage
expert usage
decision clarity feedback
common errors
common issues
coverage gaps
top critical unknowns
```

---

# 57. Internal Report Must Link to Evidence

Агрегированная проблема должна позволять открыть affected session/issue refs.

---

# 58. No Raw PII in Reports

Использовать participant/session IDs.

---

# 59. Feedback Loop Contract

Создать formal workflow:

```text
pilot issue
→ review
→ decision
→ action type
```

Action types:

```text
no_action
research
data_fix
source_review
ux_fix
parser_fix
matching_fix
confidence_fix
expert_flow_fix
security_fix
new_task
```

---

# 60. Curator Decision Record

Рекомендуемый:

```yaml
pilot_issue_decision:
  issue_id:
  decision:
  rationale:
  action_type:
  task_ref:
  decided_at:
```

---

# 61. Coding-agent Must Not Auto-create Product Features

Pilot telemetry не должна автоматически:

- менять weights;
- добавлять criteria;
- менять source policy;
- включать new source;
- менять expert routing.

---

# 62. New TASK Creation Rule

Новая TASK создаётся, если проблема:

- подтверждается evidence;
- имеет material user impact;
- не является единичным misunderstanding;
- требует code/data/policy change.

---

# 63. Task Traceability

Новая TASK должна ссылаться на:

```text
pilot issue IDs
affected journey IDs
evidence summary
```

без PII.

---

# 64. Pilot Data Export

Допустим secure internal export:

```text
JSON / CSV
```

только safe structured metrics/issues.

Не экспортировать sensitive free-text по умолчанию.

---

# 65. Retention

Если retention policy ещё не определена:

создать explicit technical TODO/blocker.

Не придумывать юридический срок хранения.

---

# 66. User Deletion Hook

Если user/session deletion workflow ещё не реализован:

создать interface/technical requirement для pilot data removal.

Не строить full privacy center в этой TASK.

---

# 67. Support / Incident Note

Для pilot-critical issue создать simple incident record.

Минимум:

```text
incident_id
severity
affected sessions
detected_at
mitigation
status
```

---

# 68. Kill Switch Integration

Если обнаружена проблема в:

```text
live source adapter
refresh
user URL ingestion
expert flow
```

TASK-019 feature flags должны позволять быстро отключить capability.

---

# 69. Pilot Rollback

При critical issue:

```text
disable risky capability
preserve evidence/audit
stop cohort expansion
review
```

---

# 70. No Silent Data Repair

Если pilot выявил неверные real data:

исправление должно проходить:

```text
new evidence
conflict/resolution
canonical update
audit
```

а не прямое редактирование без следа.

---

# 71. Manual Curated Data Changes

Если curator вручную исправляет pilot dataset:

создать manual evidence/source trail.

---

# 72. Real Buyer Scenario A — Clear Selection

Пользователь:

```text
чёткий бюджет
город
тип недвижимости
financing condition
```

Цель:

проверить основной happy path.

---

# 73. Real Buyer Scenario B — Vague Life Task

Пользователь:

```text
хочу переехать
не уверен в городе/типе объекта
```

Цель:

проверить parser/clarification without questionnaire overload.

---

# 74. Real Buyer Scenario C — Existing Links

Пользователь приходит с 2–3 ссылками.

Цель:

проверить User URL / manual fallback / comparison.

---

# 75. Real Buyer Scenario D — Financing-sensitive

Ключевое условие:

```text
ПВ
monthly payment
family mortgage
```

Цель:

проверить distinction claim/eligibility.

---

# 76. Real Buyer Scenario E — Cross-type

```text
new build vs secondary vs house
```

Цель:

проверить common decision framework.

---

# 77. Real Buyer Scenario F — Expert Verification

Пользователь доходит до unknown/conflict.

Цель:

проверить expert context/result impact.

---

# 78. Real Buyer Scenario G — No Good Options

Цель:

проверить no-results honesty и explicit criteria editing.

---

# 79. Real Buyer Scenario H — Coverage Gap

Цель:

проверить, понимает ли пользователь разницу между:

```text
нет подходящих вариантов
```

и:

```text
у сервиса пока недостаточно данных
```

---

# 80. Required Pilot Regression Suite

Перед каждой новой wave запускать:

```text
typecheck
lint
unit tests
integration tests
golden buyer journey
pilot regression
source policy checks
pilot data validation
```

---

# 81. No Live Network in CI

Как и ранее:

live smoke tests — только manually triggered и policy-approved.

---

# 82. Pilot Runbook

Создать:

```text
docs/08-roadmap/real-buyer-pilot-runbook.md
```

или equivalent technical README.

Минимум:

- prerequisites;
- feature flags;
- active sources;
- how to start session;
- how to review session;
- how to report issue;
- wave gate;
- kill switches;
- rollback;
- known limitations.

---

# 83. Pilot Session Review UI / CLI

Нужен internal инструмент минимум для:

```text
list sessions
open session timeline
see feedback
see issues
see errors
see outcome
```

Полноценный admin dashboard не обязателен.

---

# 84. Pilot Issue Review UI / CLI

Минимум:

```text
list issues
filter by layer/severity
link to sessions
record curator decision
```

---

# 85. No End-user Exposure of Internal Diagnostics

Pilot internal tools должны быть separated от public buyer routes.

---

# 86. Access Boundary

Если auth отсутствует:

internal pilot tooling хотя бы должно иметь environment-level protection/hook.

Не публиковать diagnostics на открытом route.

---

# 87. Acceptance Criteria

TASK-020 считается завершённой, если:

1. TASK-019 release gate проверяется;
2. pilot session contract существует;
3. real buyer sessions можно различать;
4. buyer journey telemetry собирается;
5. feedback по ключевым stages собирается;
6. final decision clarity фиксируется;
7. pilot issues structured;
8. issues классифицируются по layer;
9. severity работает;
10. parser corrections измеряются;
11. source coverage gaps фиксируются отдельно;
12. expert usefulness измеряется;
13. user outcome contract существует;
14. pilot session review существует;
15. aggregate pilot summary существует;
16. wave gate существует;
17. critical issues блокируют expansion;
18. kill switches используются;
19. pilot feedback не меняет product logic автоматически;
20. curator decision record существует;
21. issues могут быть promoted в отдельные TASK;
22. pilot runbook создан;
23. internal session/issue review tool существует;
24. PII не попадает в generic telemetry/report;
25. regression suite проходит;
26. typecheck/lint/test/build проходят.

---

# 88. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если существуют:

```text
<package-manager> test:pilot
<package-manager> test:e2e
```

Также допустим internal report command:

```text
<package-manager> pilot:report
```

---

# 89. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Release gate behavior:
Pilot session model:
Telemetry:
Feedback capture:
Outcome model:
Issue tracking:
Coverage issue tracking:
Expert pilot metrics:
Pilot session review:
Pilot summary:
Wave gate:
Curator decision workflow:
Internal pilot tooling:
Pilot runbook:
Security/privacy behavior:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Pilot blockers:
Spec conflicts:
Spec deviations:
```

---

# 90. Do Not Continue Automatically

После TASK-020:

**не начинать следующую задачу автоматически.**

Дальнейший roadmap должен строиться **по фактическим результатам реального пилота**, а не по заранее придуманной последовательности.

---

# 91. Next Step Rule

После первой пилотной волны возможны только два сценария:

## A. Есть material blocker

Создать отдельную TASK на конкретную проблему.

Например:

```text
TASK-021 — Fix Financing Eligibility Interpretation
```

или:

```text
TASK-021 — Improve Coverage Gap Messaging
```

## B. Critical blockers нет

Тогда curator решает, расширять ли:

- pilot cohort;
- real source coverage;
- expert capacity;
- geography;
- persistence/production infrastructure.

---

# 92. Definition of Done

TASK-020 Done, когда продукт использован ограниченной группой реальных покупателей и для каждого journey команда может ответить:

- что человек хотел купить;
- правильно ли сервис понял запрос;
- были ли shortlist варианты релевантны;
- помогло ли comparison;
- какие unknown/conflicts мешали;
- помог ли эксперт;
- были ли data coverage gaps;
- изменилось ли понимание выбора;
- что нужно исправить перед следующей волной;
- есть ли основания расширять pilot.

---

# 93. Главный принцип для coding-agent

Real Buyer Pilot — это не «запустить и собирать отзывы».

Правильная модель:

```text
Real user
      ↓
Observable journey
      ↓
Structured outcome
      ↓
Issue classification
      ↓
Evidence
      ↓
Curator decision
      ↓
Targeted next TASK
```

Главное правило:

> **После начала реального пилота roadmap должен определяться не предположениями команды, а подтверждёнными проблемами и результатами реальных buyer journeys.**
