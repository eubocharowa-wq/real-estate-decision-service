# Repository Consistency Audit

## Status

`passed_with_fixes_applied`

## Audit Date

`2026-08-13`

## Product

**Real Estate Decision Service**

---

# 1. Purpose

Этот документ фиксирует финальный consistency audit продуктовой и implementation-документации перед сборкой repository handoff package для coding-agent.

Audit проверяет:

- полноту структуры документации;
- последовательность implementation tasks;
- отсутствие конфликтов между roadmap и TASK-файлами;
- core domain invariants;
- MVP scope;
- pilot/release order;
- source-policy boundaries;
- внутренние ссылки;
- pilot geography isolation;
- ожидаемые, но ещё не созданные implementation artifacts.

---

# 2. Audit Result

## Overall

```text
PASS
```

После исправления найденных несогласованностей repository готов к следующему этапу:

```text
package / handoff
→ coding-agent
→ TASK-001 only
```

Критичных документальных конфликтов, которые должны блокировать передачу coding-agent, после remediation не осталось.

---

# 3. Repository Inventory

На момент audit:

```text
3 root markdown files
29 domain/product/roadmap docs before this audit report
20 TASK specifications
```

После добавления данного audit report:

```text
30 files under docs/
20 TASK specifications
3 root markdown files
```

Core root:

```text
README.md
PROJECT.md
AGENTS.md
```

---

# 4. Product Documentation Completeness

Проверены и физически существуют:

## `docs/01-product`

```text
vision.md
usp.md
audience.md
product-principles.md
```

Status:

```text
PASS
```

## `docs/02-mvp`

```text
mvp-v1.md
scope.md
success-criteria.md
```

Status:

```text
PASS
```

## `docs/03-ux`

```text
user-flows.md
screens.md
edge-cases.md
```

Status:

```text
PASS
```

---

# 5. Data Documentation Completeness

Проверены:

```text
docs/04-data/user-request-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/04-data/source-model.md
docs/04-data/deduplication.md
```

Status:

```text
PASS
```

---

# 6. Matching Documentation Completeness

Проверены:

```text
docs/05-matching/matching-logic.md
docs/05-matching/hard-soft-criteria.md
docs/05-matching/confidence-status.md
```

Status:

```text
PASS
```

---

# 7. Data Collection Documentation Completeness

Проверены:

```text
docs/06-data-collection/openclaw-role.md
docs/06-data-collection/sources.md
docs/06-data-collection/pilot-source-matrix.md
docs/06-data-collection/update-strategy.md
docs/06-data-collection/ingestion-flow.md
```

Status:

```text
PASS
```

---

# 8. Expert Layer Documentation Completeness

Проверены:

```text
docs/07-expert-services/expert-layer.md
docs/07-expert-services/document-review.md
docs/07-expert-services/choice-assistance.md
docs/07-expert-services/onsite-check.md
```

Status:

```text
PASS
```

---

# 9. Roadmap Documentation

Проверены:

```text
docs/08-roadmap/implementation-plan.md
docs/08-roadmap/backlog.md
```

Во время audit roadmap был синхронизирован с фактической последовательностью TASK-001–TASK-020.

Status after remediation:

```text
PASS
```

---

# 10. TASK Sequence

Физически существуют все задачи:

```text
TASK-001
TASK-002
TASK-003
TASK-004
TASK-005
TASK-006
TASK-007
TASK-008
TASK-009
TASK-010
TASK-011
TASK-012
TASK-013
TASK-014
TASK-015
TASK-016
TASK-017
TASK-018
TASK-019
TASK-020
```

Проверка:

```text
continuous numbering: PASS
duplicates: NONE
missing TASK numbers: NONE
```

---

# 11. Canonical TASK Sequence

Актуальная последовательность:

```text
TASK-001 — Repository Scaffold
TASK-002 — Core Schemas
TASK-003 — UserRequest Parser & Structured Confirmation Contract
TASK-004 — Request Confirmation Screen
TASK-005 — Pilot Property Dataset & Fixtures
TASK-006 — Criteria Registry & Evaluators
TASK-007 — Matching Engine v1
TASK-008 — Data Confidence & Completeness Engine
TASK-009 — Shortlist UI
TASK-010 — Property Detail
TASK-011 — Comparison
TASK-012 — User URL Ingestion
TASK-013 — Source Registry & Policy Engine
TASK-014 — First Approved Source Adapter PoC
TASK-015 — Refresh Queue & Update Orchestration
TASK-016 — Expert Request Workflow
TASK-017 — Expert Workbench & Result Review UI
TASK-018 — End-to-End Buyer Journey Integration
TASK-019 — Real Buyer Pilot Hardening
TASK-020 — Real Buyer Pilot Execution & Feedback Loop
```

`implementation-plan.md` теперь содержит именно эту последовательность.

---

# 12. Finding F-001 — Outdated Roadmap Task Numbering

## Before

`implementation-plan.md` содержал устаревший sequence, в котором:

```text
TASK-008 = Shortlist UI
TASK-009 = Property Detail
TASK-010 = Comparison
...
```

После появления Data Confidence task фактическая нумерация сдвинулась.

## Risk

Coding-agent мог открыть roadmap и получить sequence, конфликтующий с физическими TASK-файлами.

## Remediation

`implementation-plan.md` обновлён до полного актуального списка TASK-001–TASK-020.

## Result

```text
RESOLVED
```

---

# 13. Finding F-002 — Stale Alternative for TASK-009

## Before

`TASK-008.md` содержал две альтернативы следующей задачи:

```text
TASK-009 — Shortlist UI
```

или:

```text
TASK-009 — Matching Pipeline Integration
```

Но `TASK-009.md` уже физически зафиксирован как `Shortlist UI`.

## Remediation

Удалена stale alternative.

`TASK-008` теперь однозначно указывает:

```text
TASK-009 — Shortlist UI
```

и сохраняет правило:

```text
do not continue automatically
```

## Result

```text
RESOLVED
```

---

# 14. Finding F-003 — Pilot Dataset Size Mismatch

## Before

Разные документы использовали:

```text
50–100 объектов
```

и:

```text
30–50 Property
40–70 Offer
```

## Interpretation

`50–100 candidates` полезен как performance benchmark, но не должен означать требование создать 50–100 физических Property на первой инженерной итерации.

## Remediation

Синхронизированы:

```text
PROJECT.md
implementation-plan.md
```

Теперь:

```text
initial dataset:
30–50 physical Property
40–70 Offer

performance benchmark:
approximately 50–100 candidates
```

Это соответствует `TASK-005` и `docs/02-mvp`.

## Result

```text
RESOLVED
```

---

# 15. Finding F-004 — Source PoC Scope Mismatch

## Before

Roadmap требовал на этапе Data Collection PoC:

```text
2–3 разрешённых источника
```

При этом `TASK-014` корректно требует сначала доказать pipeline на:

```text
one policy-approved source
```

## Risk

Roadmap мог провоцировать преждевременное расширение source integration до доказательства policy/evidence pipeline.

## Remediation

Roadmap обновлён:

```text
Stage 9:
one approved source end-to-end PoC
```

Expansion to multiple adapters:

```text
only after first PoC + separate approval/task
```

## Result

```text
RESOLVED
```

---

# 16. Finding F-005 — Pilot Execution / Hardening Order

## Before

Roadmap имел:

```text
Stage 11 — Real Buyer Testing
Stage 12 — Hardening & Pilot Launch
```

Фактические TASK contracts требуют:

```text
TASK-019 — Hardening
→ release gate
→ TASK-020 — Real Buyer Pilot
```

## Risk

Real buyer testing мог быть интерпретирован как разрешённый до security/source/privacy/release readiness.

## Remediation

Roadmap перестроен:

```text
Stage 11 — Pilot Hardening & Release Readiness
Stage 12 — Real Buyer Pilot & Feedback Loop
```

Real buyer pilot теперь явно зависит от:

```text
pilot_release_gate.ready = true
```

или отдельно одобренного restricted internal/friendly pilot.

## Result

```text
RESOLVED
```

---

# 17. Finding F-006 — README Handoff Status

## Before

README сообщал, что следующая стадия — создание первых implementation tasks.

Фактически TASK-001–TASK-020 уже подготовлены.

## Remediation

README обновлён:

```text
documentation ready
TASK-001–TASK-020 ready
application code not implemented
next action = TASK-001 only
```

Также добавлена documentation map.

## Result

```text
RESOLVED
```

---

# 18. Finding F-007 — Planned Directories Not Yet Physical

README содержит planned implementation structure:

```text
data/
prompts/
app/
```

На момент audit эти каталоги физически отсутствуют.

## Assessment

Это **не blocker**.

Причина:

- `TASK-001` создаёт application scaffold;
- `TASK-002` создаёт formal schemas;
- `TASK-005` создаёт fixtures/examples;
- exact Next.js layout должен определяться implementation task, а не pre-created empty folder.

## Remediation

README теперь явно говорит, что эти directories создаются соответствующими implementation tasks.

## Result

```text
EXPECTED / NON-BLOCKING
```

---

# 19. Finding F-008 — Future Generated Roadmap Files

Static path audit нашёл два отсутствующих файла:

```text
docs/08-roadmap/e2e-buyer-journey.md
docs/08-roadmap/real-buyer-pilot-runbook.md
```

Они упоминаются в:

```text
TASK-018
TASK-020
```

## Assessment

Это не broken dependency.

Оба файла являются **Expected Output** соответствующих implementation tasks:

```text
TASK-018 creates e2e buyer journey integration documentation
TASK-020 creates pilot runbook
```

Создавать их сейчас было бы преждевременно, потому что они должны описывать фактически реализованный runtime/pilot process.

## Result

```text
EXPECTED / NON-BLOCKING
```

---

# 20. Backlog Reconciliation

В `backlog.md` синхронизирован Geo & Infrastructure scope.

До audit P0 мог читаться как обязательная live geocoding integration.

Теперь P0 соответствует текущему MVP:

```text
normalized pilot geo fields
coordinates where evidence exists
school / kindergarten / park / transport distances
deterministic evaluators
```

Live geocoding provider moved to P1 and remains policy-dependent.

Также wording:

```text
ranking confidence penalty
```

заменён на:

```text
ranking treatment of low-confidence candidates without modifying Match Score
```

чтобы не создавать впечатление, что Data Confidence может менять user-visible Match Score.

---

# 21. Core Invariant Audit

Проверены основные инварианты.

## User-first

```text
UserRequest / life task first
```

Status:

```text
PASS
```

## Property / Offer

```text
Property != Offer
```

Status:

```text
PASS
```

## Financing

```text
Financing != Property characteristic
```

Status:

```text
PASS
```

## Unknown

```text
unknown != false
unknown != true
```

Status:

```text
PASS
```

## Verification

```text
claimed != confirmed
stale != current
removed != sold
```

Status:

```text
PASS
```

## Match / Data Quality

```text
Match Score != Data Confidence
Data Confidence != Data Completeness
```

Status:

```text
PASS
```

## AI Boundary

```text
LLM does not set Match Score
AI is not factual source
```

Status:

```text
PASS
```

## Source Policy

```text
technical access != right to automate/store/display/refresh
```

Status:

```text
PASS
```

## OpenClaw

```text
collector, not product brain
```

Status:

```text
PASS
```

## Expert

```text
expert result returns through evidence
expert does not manually set Match Score
```

Status:

```text
PASS
```

## Commercial Bias

```text
no commercial factor in Match Score
```

Status:

```text
PASS
```

---

# 22. Cross-type Audit

Documentation consistently supports comparison between:

```text
new-build apartment
secondary apartment
house
```

with:

```text
not_applicable
```

as a separate state.

No requirement was found that would force one property type to receive a universal ranking bonus.

Status:

```text
PASS
```

---

# 23. Comparison Outcome Audit

Canonical comparison statuses remain:

```text
clear_leader
conditional_leader
near_tie
insufficient_data
no_valid_option
```

Buyer-facing UX may translate these to human-readable Russian labels.

Status:

```text
PASS
```

---

# 24. Expert Status Audit

Core workflow supports:

```text
draft
submitted
queued
assigned
in_progress
waiting_for_user
waiting_for_external_info
completed
unable_to_complete
cancelled
```

UX translates them to user-facing labels without changing domain meaning.

Status:

```text
PASS
```

---

# 25. Geography Audit

Public product architecture is not positioned as a Tula-only service.

Occurrences of `Тула/Tula` outside the pilot source matrix are limited to:

- examples;
- pilot/source names;
- explicit “do not hardcode Tula” guards;
- sample addresses/requests.

No city enum or product identity is defined as Tula-only.

Status:

```text
PASS
```

---

# 26. Internal Reference Audit

Actual Markdown hyperlinks:

```text
broken links: 0
```

Path-reference scan:

```text
2 missing paths
```

Both are expected future outputs from TASK-018 / TASK-020 and are documented above.

Status:

```text
PASS WITH EXPECTED FUTURE OUTPUTS
```

---

# 27. Scope Drift Audit

No requirement was found that makes the MVP dependent on:

- native mobile app;
- B2B CRM;
- full public catalog;
- infinite listings feed;
- nationwide completeness;
- all-site crawling;
- own mortgage marketplace;
- automatic bank approval;
- transaction execution;
- universal property rating;
- AI-chat-only experience.

Status:

```text
PASS
```

---

# 28. Source Integration Gate Audit

Repository does **not** assume that a live real-estate source is already production-approved.

`TASK-014` remains:

```text
ready_with_gate
```

and must not bypass source policy.

Status:

```text
PASS
```

---

# 29. Pilot Gate Audit

`TASK-020` must not start as an unrestricted real buyer pilot unless `TASK-019` release readiness passes.

Roadmap now matches this rule.

Status:

```text
PASS
```

---

# 30. Post-Pilot Roadmap Rule

There is no pre-created mandatory product:

```text
TASK-021
```

after TASK-020.

Examples of possible TASK-021 in TASK-020 are explicitly hypothetical and depend on pilot evidence.

Status:

```text
PASS
```

---

# 31. Files Modified During Audit

Consistency remediation modified:

```text
PROJECT.md
README.md
tasks/TASK-008.md
docs/08-roadmap/implementation-plan.md
docs/08-roadmap/backlog.md
```

No application code was created.

No domain implementation was performed.

---

# 32. Remaining Non-blocking Conditions

Before implementation:

```text
application scaffold absent
schemas absent
fixtures absent
runtime tests absent
```

Это ожидаемо и является scope первых implementation tasks.

Before real source integration:

```text
source approval still required
```

Before real buyer pilot:

```text
TASK-019 release gate required
```

---

# 33. Handoff Readiness

Documentation handoff status:

```text
READY
```

Coding-agent should start with:

```text
PROJECT.md
AGENTS.md
TASK-001.md
```

and related roadmap documents.

It should **not** start:

```text
TASK-002+
```

until TASK-001 has been implemented, tested and reviewed.

---

# 34. Next Repository Stage

После этого audit правильный следующий этап:

```text
1. Assemble final repository package
2. Verify archive contents
3. Hand repository to coding-agent
4. Execute TASK-001 only
5. Curator review
6. Continue one TASK at a time
```

---

# 35. Final Audit Statement

> **Repository documentation is internally consistent enough for coding-agent handoff. The remaining missing implementation directories and future task-generated runbooks are intentional, not specification defects. The next operation is packaging, not creation of another product task.**
