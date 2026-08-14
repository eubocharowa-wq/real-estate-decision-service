# Implementation Plan — MVP v1

## 1. Назначение документа

Этот документ переводит продуктовую и техническую архитектуру проекта в последовательный план реализации.

Цель — не «начать писать код», а построить MVP по этапам так, чтобы каждый следующий слой опирался на уже проверенный предыдущий.

Главный принцип:

> Сначала фиксируем продуктовую логику и контракты данных, затем создаём тестируемое ядро, затем подключаем реальные источники, и только после этого наращиваем автоматизацию и масштаб.

---

# 2. Что считаем MVP

MVP должен позволять пользователю пройти полный путь:

```text
Описать задачу обычными словами
        ↓
Проверить, правильно ли сервис её понял
        ↓
Получить 5–10 подходящих вариантов
        ↓
Увидеть % соответствия и причины
        ↓
Увидеть компромиссы и неизвестные данные
        ↓
Сравнить 2–4 варианта
        ↓
Добавить собственную ссылку
        ↓
При необходимости запросить экспертную проверку
```

---

# 3. Главный критерий MVP

MVP считается состоявшимся, если пользователь после работы с сервисом может сказать:

> «Теперь я лучше понимаю, что мне стоит покупать и почему».

Не требуется:

- покрыть весь рынок;
- автоматически собирать все сайты;
- реализовать все типы недвижимости;
- получить банковское одобрение;
- проводить сделку внутри сервиса.

---

# 4. Реализация разбивается на 12 этапов

```text
1. Repository foundation
2. Product contracts
3. UX prototype
4. Core data models
5. Matching Engine
6. Test dataset
7. Search & comparison UI
8. User URL ingestion
9. Data collection PoC
10. Expert layer
11. Pilot hardening & release readiness
12. Real buyer pilot & feedback loop
```

---

# 5. Этап 1 — Repository Foundation

## Цель

Создать рабочий репозиторий, который можно открыть в VS Code и передать coding-agent.

## Результат

```text
README.md
PROJECT.md
AGENTS.md
docs/
data/
prompts/
tasks/
app/
```

## Задачи

- выбрать runtime / framework;
- создать приложение;
- подключить linting;
- подключить formatting;
- подключить test runner;
- настроить `.env.example`;
- настроить Git;
- создать CI;
- зафиксировать conventions.

## Рекомендуемое техническое направление

Для MVP:

```text
Frontend / full-stack: Next.js + React + TypeScript
Database: PostgreSQL
Optional managed DB/Auth: Supabase
AI: OpenAI API
Deployment: Vercel + managed PostgreSQL/Supabase
```

Конкретные технические решения coding-agent не должен менять без необходимости, если они уже зафиксированы в `PROJECT.md`.

---

# 6. Acceptance Criteria этапа 1

- проект запускается локально;
- есть одна тестовая страница;
- тесты запускаются одной командой;
- lint проходит;
- build проходит;
- secrets не находятся в Git;
- coding-agent видит `AGENTS.md`.

---

# 7. Этап 2 — Product Contracts

## Цель

Перевести markdown-модели в формальные TypeScript/JSON contracts.

Основные сущности:

- UserRequest;
- Property;
- Offer;
- FinancingProgram;
- FinancingOffer;
- PurchaseScenario;
- Source;
- FieldEvidence;
- MatchResult;
- ExpertRequest.

---

# 8. Schema Layer

Создать:

```text
data/schemas/
```

Минимум:

```text
user-request.schema.json
property.schema.json
offer.schema.json
financing-program.schema.json
purchase-scenario.schema.json
source.schema.json
field-evidence.schema.json
match-result.schema.json
expert-request.schema.json
```

---

# 9. Type Safety

Из схем должны быть доступны типы TypeScript.

Не допускать ситуации:

```text
UI имеет одно поле
DB другое
Matching Engine третье
```

---

# 10. Acceptance Criteria этапа 2

- схемы проходят validation;
- существуют example fixtures;
- нет критичных полей, придуманных только в UI;
- версии schema зафиксированы;
- unknown/null semantics единообразны.

---

# 11. Этап 3 — UX Prototype

## Цель

Создать интерфейс основного пользовательского пути без реального data collection.

Экран 1:

```text
Опишите задачу
```

Экран 2:

```text
Проверьте, правильно ли мы вас поняли
```

Экран 3:

```text
Уточняющие вопросы
```

Экран 4:

```text
Ищем подходящие варианты
```

Экран 5:

```text
Shortlist
```

Экран 6:

```text
Property Detail
```

Экран 7:

```text
Comparison
```

Экран 8:

```text
Expert Request
```

---

# 12. Mock-first UI

На этом этапе реальные источники не нужны.

Использовать:

```text
data/examples/
```

с synthetic fixtures.

Это позволяет проверить продуктовую логику независимо от OpenClaw.

---

# 13. Acceptance Criteria этапа 3

Пользователь может пройти:

```text
home
→ request
→ confirmation
→ shortlist
→ property
→ comparison
```

на тестовых данных.

---

# 14. Этап 4 — Core Data Models

## Цель

Реализовать persistence и relations.

Минимальные таблицы / коллекции:

```text
user_requests
properties
offers
financing_programs
financing_offers
purchase_scenarios
sources
field_evidence
deduplication_decisions
match_results
expert_requests
```

---

# 15. Property / Offer Separation

Обязательное архитектурное правило:

```text
Physical Property != Offer
```

Один объект может иметь несколько предложений.

---

# 16. Evidence-first Storage

Для critical fields:

```text
value
+
source
+
timestamp
+
verification status
```

---

# 17. Acceptance Criteria этапа 4

Можно сохранить:

- один Property;
- три Offer;
- две цены;
- один conflict;
- одну ипотечную программу;
- два PurchaseScenario;
- evidence для каждого.

---

# 18. Этап 5 — Matching Engine

## Цель

Реализовать детерминированный Matching Engine.

Pipeline:

```text
UserRequest
↓
Hard Criteria
↓
Financial Scenario Eligibility
↓
Soft Criteria
↓
Match Score
↓
Data Confidence
↓
Explanation Structure
```

---

# 19. MVP Criteria

Обязательно:

### Finance

- price;
- initial payment;
- monthly payment;
- financing program.

### Property

- type;
- rooms;
- area;
- floor;
- finishing.

### Timeline

- readiness;
- move-in deadline.

### Location

- city;
- district;
- travel time if available.

### Infrastructure

- school;
- kindergarten;
- park / transport.

---

# 20. Matching Tests

Каждый evaluator должен иметь unit tests.

Нельзя принимать Matching Engine без benchmark.

---

# 21. Acceptance Criteria этапа 5

- hard fail невозможно компенсировать soft criteria;
- unknown != false;
- claimed != confirmed;
- одинаковые input дают одинаковый score;
- объяснение соответствует calculation;
- MatchScore и DataConfidence разделены.

---

# 22. Этап 6 — Pilot Test Dataset

## Цель

Создать небольшой вручную проверенный рынок.

Рабочий объём первой инженерной итерации:

```text
30–50 физических Property
40–70 Offer
```

Смешанный набор:

- новостройки;
- вторичные квартиры;
- дома;
- несколько Offer для одного Property;
- duplicate/conflict/unknown cases.

Отдельно Matching/DataQuality должны быть проверены на benchmark порядка `50–100 candidates`.

---

# 23. Почему вручную проверенный dataset нужен раньше автоматизации

Он позволяет проверить:

- matching;
- UX;
- cross-type comparison;
- data model;
- explanations;

до того, как crawling станет источником новых ошибок.

---

# 24. Dataset Requirements

Каждый объект должен иметь:

- source;
- date checked;
- price;
- identity;
- minimum compare fields;
- manual verification note.

Для части объектов:

- financing;
- conflicts;
- unknowns;
- duplicates.

---

# 25. Acceptance Criteria этапа 6

Система может корректно обработать:

- 5 подтверждённых дублей;
- 5 conflicting objects;
- 5 low-confidence objects;
- 10 financing scenarios;
- несколько house vs apartment comparisons.

---

# 26. Этап 7 — Search & Comparison UI

## Цель

Связать реальные contracts и Matching Engine с пользовательским интерфейсом.

---

# 27. Shortlist Card

Должна показывать:

- объект;
- цена;
- MatchScore;
- почему подходит;
- компромисс;
- critical unknown;
- freshness/confidence.

---

# 28. Property Detail

Разделы:

```text
Факты
Почему подходит
Компромиссы
Финансирование
Что не подтверждено
Источники
```

---

# 29. Comparison

Сравниваются 2–4 объекта.

Строки:

- match;
- price;
- entry cost;
- monthly payment;
- move-in;
- area;
- school;
- commute;
- condition;
- unknowns;
- confidence.

---

# 30. Acceptance Criteria этапа 7

Пользователь способен объяснить:

- почему A выше B;
- что неизвестно;
- какой компромисс у каждого варианта.

---

# 31. Этап 8 — User URL Ingestion

## Цель

Реализовать ключевой механизм снижения зависимости от собственного inventory.

Пользователь вставляет URL:

```text
→ extract
→ normalize
→ deduplicate
→ compare
```

---

# 32. MVP User URL Scope

Достаточно сначала поддержать:

- один developer source;
- один secondary source;
- unknown source fallback.

---

# 33. Fallback

Если автоматическое извлечение не удалось:

показать минимальную форму:

- цена;
- площадь;
- комнаты;
- адрес;
- комментарий.

---

# 34. Acceptance Criteria этапа 8

- новая ссылка создаёт object/offer;
- дубль не создаёт новый Property;
- пользователь может исправить parsed fields;
- source provenance сохраняется.

---

# 35. Этап 9 — Data Collection PoC

## Цель

Подключить реальные источники после access/policy review.

Первые adapters выбираются по `pilot-source-matrix.md`.

---

# 36. Реализация OpenClaw Layer

Нужно реализовать:

```text
CollectionTask
RawCollectionResult
Staging
Validation
Normalization
Refresh
```

---

# 37. Не включать production crawling до approval

Каждый source adapter должен иметь:

```yaml
access_status:
storage_rights:
display_rights:
refresh_rights:
```

---

# 38. Acceptance Criteria этапа 9

Для **одного источника, прошедшего соответствующий policy gate**, доказать полный PoC:

- discovery / collection plan;
- collect;
- price;
- availability;
- evidence;
- refresh hook;
- source_changed;
- partial result.

Расширение до нескольких реальных adapters выполняется только после того, как первый approved source корректно прошёл end-to-end pipeline и есть отдельное разрешение/задача.

---

# 39. Этап 10 — Expert Layer

## Цель

Подключить ручную проверку там, где автоматизации недостаточно.

MVP:

- information verification;
- choice assistance;
- document review request;
- onsite request.

---

# 40. Expert Admin

Минимальный internal UI:

```text
new
in progress
waiting
completed
```

---

# 41. Acceptance Criteria этапа 10

ExpertResult способен:

- создать manual evidence;
- изменить confidence;
- изменить MatchResult;
- исключить объект при подтверждённом hard fail.

---

# 42. Этап 11 — Pilot Hardening & Release Readiness

## Цель

Подготовить продукт к безопасному controlled real buyer pilot **до** расширения на реальных покупателей.

Этот этап соответствует `TASK-019 — Real Buyer Pilot Hardening`.

---

# 43. Hardening Scope

Минимум:

- telemetry / observability;
- feedback capture;
- source coverage/readiness diagnostics;
- synthetic/live/manual data separation;
- privacy / PII inventory;
- User URL security regression;
- performance benchmark;
- feature flags;
- kill switches;
- known limitations;
- rollback plan.

---

# 44. Pilot Release Gate

До real buyer pilot должен существовать явный результат:

```text
pilot_release_gate.ready = true
```

или curator-approved restricted internal/friendly pilot с документированными ограничениями.

Hard blockers включают:

- broken hard-criteria semantics;
- Match / Confidence mixing;
- Property / Offer merge defect;
- Frankenstein PurchaseScenario;
- source-policy bypass;
- critical privacy/security issue;
- synthetic/live mixing;
- golden E2E failure.

---

# 45. Acceptance Criteria этапа 11

- core tests/build green;
- pilot data validated;
- source readiness documented;
- security/privacy checks completed;
- feature flags / kill switches usable;
- known limitations documented;
- rollback available;
- real buyer pilot may be started without обхода release gate.

---

# 46. Этап 12 — Real Buyer Pilot & Feedback Loop

## Цель

Проверить core decision loop на ограниченной группе реальных покупателей и получить структурированное evidence о product problems.

Этот этап соответствует `TASK-020 — Real Buyer Pilot Execution & Feedback Loop`.

---

# 47. Preconditions

Real buyer pilot стартует только после успешного Stage 11 release gate.

Не использовать pilot для обхода незакрытых safety/source blockers.

---

# 48. Pilot Cohorts

Допустимая последовательность:

```text
internal / friendly
→ 3–5 real buyer sessions
→ review
→ 5–10 sessions if wave gate allows
```

Расширение cohort не автоматическое.

---

# 49. Что измеряем

- правильно ли сервис понял request;
- какие parser corrections потребовались;
- релевантен ли shortlist;
- понятен ли Match Score;
- различает ли пользователь Match и Confidence;
- понятны ли compromises;
- понятны ли unknown/conflict;
- помогает ли comparison сократить alternatives;
- полезна ли expert verification;
- стало ли решение понятнее.

---

# 50. Ключевой Outcome

Финальный вопрос:

> **Теперь мне понятнее, что мне стоит покупать.**

Ответ:

```text
Да
Частично
Нет
```

---

# 51. Pilot Issue Classification

Проблемы должны разделяться минимум на:

```text
request/parser
matching
data coverage
data quality
financing
UX
source policy
expert workflow
security/privacy
```

Не смешивать coverage problem с matching problem.

---

# 52. Feedback Loop

Правильная последовательность:

```text
observation
→ evidence
→ repeated pattern
→ root cause
→ curator decision
→ new TASK if needed
→ versioned change
```

Один комментарий пользователя не должен автоматически менять веса, eligibility или product rules.

---

# 53. After Pilot

После `TASK-020` нет заранее обязательной product `TASK-021`.

Следующий шаг определяется фактическими pilot issues.

Если material blocker найден — создаётся конкретная fix task.

Если blocker не найден — curator отдельно решает, расширять ли:

- cohort;
- source coverage;
- geography;
- expert capabilities;
- persistence / operational layer.

---

# 54. Pilot Boundary

Pilot может оставаться ограниченным:

- небольшой географией;
- подключёнными/разрешёнными источниками;
- ограниченным количеством типов недвижимости;
- manual fallback там, где automation policy не подтверждена.

Публичная архитектура и позиционирование при этом остаются универсальными.

---

# 55. Parallel Workstreams

После Foundation часть задач может выполняться параллельно.

```text
Product/UX
Data Models
Matching
Source Research
Expert Workflow
```

Но core contracts должны быть согласованы заранее.

---

# 56. Dependency Graph

```text
Product docs
   ↓
Schemas
   ↓
Mock data
   ↓
Matching
   ↓
UI
```

Параллельно:

```text
Source registry
   ↓
Source approvals
   ↓
Adapters/OpenClaw
```

И позже:

```text
Canonical Data + Matching
   ↓
Expert Layer
```

---

# 57. Что нельзя делать слишком рано

Не начинать первым:

- full crawling;
- mobile app;
- CRM;
- nationwide scale;
- all-source integration;
- behavioral recommender;
- bank application integration.

Это создаст техническую сложность до проверки core value.

---

# 58. Definition of Done для задач

Каждая implementation task должна содержать:

```text
Goal
Context
In Scope
Out of Scope
Inputs
Expected Output
Acceptance Criteria
Tests
Dependencies
```

---

# 59. Coding-agent Workflow

Рекомендуемый процесс:

```text
TASK-NNN.md
↓
coding-agent читает PROJECT.md + AGENTS.md
↓
реализация
↓
tests
↓
build
↓
diff/review
↓
acceptance check
```

---

# 60. Curator Review

После каждой крупной задачи проверять:

- не превратился ли продукт в каталог;
- не смешаны ли Property и Offer;
- не потеряны ли unknowns;
- не появились ли скрытые score;
- не стал ли LLM источником фактов;
- не зашита ли пилотная география в ядро.

---

# 61. Зафиксированная последовательность implementation tasks

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

Эта последовательность является актуальной для текущего repository handoff. После `TASK-020` следующая product task определяется только по фактическим pilot evidence.

---

# 62. MVP Milestones

## Milestone A — Clickable Product

Работает полный UI на mock data.

## Milestone B — Deterministic Core

Matching и DataConfidence работают на fixtures.

## Milestone C — Pilot Dataset

30–50 физических Property и 40–70 Offer с deterministic edge cases; matching benchmark — порядка 50–100 candidates.

## Milestone D — Live Source PoC

Один policy-approved real source проходит полный adapter/collection/evidence pipeline. Расширение source coverage — отдельное решение после PoC.

## Milestone E — Expert Loop

ExpertResult меняет canonical data / confidence.

## Milestone F — Real Buyer Pilot

Первые реальные пользовательские сессии.

---

# 63. Главный принцип для coding-agent

Не оптимизировать архитектуру под демонстрационный happy path.

Нужно сохранять ключевые свойства продукта:

```text
natural-language request
→ explicit structured criteria
→ normalized cross-source data
→ deterministic matching
→ provenance/confidence
→ comparison
→ expert verification where needed
```

Главное правило:

> Сначала доказать качество решения для пользователя на небольшом контролируемом наборе данных. Масштабировать сбор рынка только после этого.
