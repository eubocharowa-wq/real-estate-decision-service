# TASK-005 — Pilot Property Dataset & Fixtures

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone C — Pilot Dataset`

---

# 1. Goal

Создать контролируемый пилотный набор данных недвижимости и связанных сущностей, на котором можно безопасно разрабатывать и тестировать:

- Matching Engine;
- Data Confidence;
- Deduplication;
- shortlist;
- comparison;
- financing scenarios;
- unknown/conflict handling;
- user URL ingestion в следующих задачах.

Главный результат:

> у проекта должен появиться небольшой, понятный, воспроизводимый dataset с намеренно разными типами объектов, качеством данных, источниками, конфликтами и финансовыми сценариями.

---

# 2. Почему dataset создаётся до полноценного live collection

На этом этапе продукт нельзя делать зависимым от:

- OpenClaw;
- scraping;
- доступности внешних сайтов;
- API площадок;
- случайного качества live-данных.

Pilot Dataset нужен как **контрольный benchmark**, на котором можно проверить бизнес-логику до подключения автоматического сбора.

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

docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/04-data/source-model.md
docs/04-data/deduplication.md

docs/05-matching/matching-logic.md
docs/05-matching/hard-soft-criteria.md
docs/05-matching/confidence-status.md

docs/06-data-collection/sources.md
docs/06-data-collection/ingestion-flow.md

docs/08-roadmap/implementation-plan.md
```

---

# 4. Dependencies

TASK-005 предполагает, что TASK-002 уже создала формальные схемы:

```text
Property
Offer
FinancingProgram
FinancingOffer
Promotion
PropertyFinancingEligibility
PurchaseScenario
Source
FieldEvidence
SourceConflict
```

Если schemas ещё не существуют в коде:

```text
TASK-005 is blocked
```

Не создавать отдельные ad-hoc структуры только ради fixtures.

---

# 5. Dataset Type

Pilot Dataset должен быть:

- reproducible;
- deterministic;
- schema-valid;
- пригодным для automated tests;
- безопасным с точки зрения прав на данные.

По умолчанию использовать:

```text
synthetic / manually curated fixtures
```

а не массовые копии коммерческих объявлений.

---

# 6. Не использовать dataset как утверждение о текущем рынке

Этот dataset — тестовая среда.

Даже если fixtures основаны на реалистичных параметрах, они не должны подаваться как:

> актуальный полный рынок.

Нужно явно пометить:

```yaml
dataset_type: synthetic_pilot
```

или эквивалентным metadata.

---

# 7. Pilot Geography

Для benchmark допустимо использовать одну компактную пилотную географию.

Однако:

- city остаётся обычным полем;
- никаких enum только для одного города;
- никакой логики `if city == pilot_city`;
- core contracts должны поддерживать другие регионы.

---

# 8. Target Size

Для первой версии TASK-005 достаточно:

```text
30–50 физических Property
```

связанных минимум с:

```text
40–70 Offer
```

Это меньше будущей цели 50–100 реальных объектов, но достаточно для первой инженерной итерации.

Если создание 50 schema-valid объектов автоматически не увеличивает сложность — допускается до 60.

Не генерировать сотни бессодержательных записей.

---

# 9. Required Property Mix

Dataset должен содержать минимум:

```text
12–18 new-build apartments
10–15 secondary apartments
6–10 houses / townhouses
2–5 land / special cases
```

Точное число может немного отличаться, если общий benchmark сохраняет разнообразие.

---

# 10. New-build Cases

Обязательно включить:

- concrete developer unit;
- несколько квартир в одном ЖК;
- одинаковую планировку в разных units;
- разные этажи;
- разные finishing types;
- готовый объект;
- строящийся объект;
- объект с handover deadline;
- exact price;
- price_from template;
- promotion;
- family mortgage claim;
- confirmed financing eligibility;
- claimed financing eligibility;
- unavailable/reserved unit.

---

# 11. Secondary Cases

Обязательно включить:

- owner offer;
- agency offer;
- одинаковый объект у двух продавцов/источников;
- разные prices;
- renovated;
- needs renovation;
- first floor;
- top floor;
- missing exact address detail;
- stale listing;
- listing removed;
- conflicting area or floor data;
- ready-to-move;
- seller move-out uncertainty.

---

# 12. House / Townhouse Cases

Обязательно включить:

- ready house;
- house under construction;
- house with gas connected;
- gas only available at boundary;
- unknown utility status;
- road/access issue;
- large land but longer commute;
- duplicate house offers;
- price conflict;
- incomplete document/evidence case.

---

# 13. Land / Special Cases

Минимум несколько записей для:

- land;
- template/non-concrete inventory;
- intentionally incomplete property;
- unsupported/edge comparison.

Цель — проверить, что модель не предполагает, будто каждый объект является квартирой.

---

# 14. Property ≠ Offer

Dataset обязан демонстрировать:

```text
один Property
→ несколько Offer
```

Минимум 5 физических объектов должны иметь 2+ Offer.

---

# 15. Duplicate Clusters

Создать минимум:

```text
5 duplicate clusters
```

Например:

### Cluster A

Одна квартира новостройки:

- developer Offer;
- agency Offer.

### Cluster B

Одна вторичная квартира:

- owner listing;
- agency listing.

### Cluster C

Один house:

- two portals.

---

# 16. Duplicate Ground Truth

Для benchmark создать отдельный ground-truth fixture.

Например:

```yaml
duplicate_ground_truth:
  - cluster_id:
    property_id:
    offer_ids:
    expected_relation: same_property
```

---

# 17. False-positive Trap

Минимум 3 пары должны выглядеть похожими, но быть разными объектами.

Пример:

```text
один ЖК
одинаковая площадь
одинаковая планировка
разные unit numbers
```

Expected:

```text
different_property
```

Это критично для Deduplication tests.

---

# 18. Offer Price Diversity

Dataset должен включать:

- exact current price;
- old price;
- discount price;
- price_from;
- different price by source;
- mandatory extra cost;
- price dependent on financing promotion.

---

# 19. Price Conflict Cases

Минимум 5 объектов с conflicting price evidence.

Пример:

```text
developer: 4 890 000
agency:    5 050 000
```

Не разрешать конфликт заранее в fixture, если цель case — протестировать unresolved conflict.

---

# 20. Availability Cases

Поддержать:

- available;
- reserved;
- sold;
- temporarily_unavailable;
- unknown;
- removed listing.

Не считать `removed` автоматически `sold`.

---

# 21. Freshness Cases

Dataset должен включать evidence:

- fresh;
- aging;
- stale;
- expired;
- unknown.

Минимум 5 объектов должны иметь stale critical fields.

---

# 22. Verification Cases

Нужно покрыть:

```text
confirmed
claimed
unconfirmed
conflicting
stale
unknown
```

для разных критичных полей.

---

# 23. Financing Coverage

Создать минимум:

```text
2–3 FinancingProgram
4–6 FinancingOffer
10–15 PropertyFinancingEligibility
10–20 PurchaseScenario
```

Программы и условия должны быть **synthetic / test-only**, если они не основаны на отдельно подтверждённых rule versions.

---

# 24. Не использовать реальные текущие ипотечные правила как fixture truth

Не hardcode в benchmark:

- актуальную государственную ставку;
- актуальный лимит;
- актуальный ПВ;

если цель fixture не состоит в тестировании конкретной подтверждённой rule version.

Лучше использовать:

```text
Test Family Program A
Test Standard Mortgage B
Test Installment C
```

с явно synthetic условиями.

---

# 25. Zero-down Cases

Минимум:

1. `zero_initial_payment = confirmed`;
2. `zero_initial_payment = claimed`;
3. `zero_initial_payment = false`;
4. promotion says zero-down but property applicability unknown;
5. price increases if zero-down scenario used.

---

# 26. Staged Rate Case

Добавить FinancingOffer:

```text
0.1% first 12 months
then 12%
```

или аналогичную synthetic схему.

Цель:

не позволить системе интерпретировать intro rate как rate на весь срок.

---

# 27. Installment Case

Минимум один PurchaseScenario:

- initial payment;
- monthly payment;
- balloon payment;
- no bank mortgage;
- limited duration.

---

# 28. PurchaseScenario Cases

Dataset должен позволять одному объекту иметь несколько сценариев:

```text
cash
mortgage
subsidized mortgage
installment
```

Не обязательно все четыре для каждого объекта.

---

# 29. Frankenstein Guardrail Fixture

Создать специальный case:

Offer A:

```text
низкая цена
нет zero-down
```

Offer B:

```text
выше цена
есть zero-down
```

Dataset должен явно запрещать построить scenario:

```text
цена A + zero-down B
```

Ground truth / fixture notes должны это фиксировать.

---

# 30. Source Dataset

Создать минимум:

```text
6–10 Source
```

категорий:

- developer_site;
- classified;
- agency_site;
- bank_site;
- government;
- user_link;
- manual_expert.

---

# 31. Synthetic Source Names

Если fixtures synthetic:

использовать нейтральные названия:

```text
Developer Alpha
Marketplace Beta
Bank Gamma
```

а не маскировать synthetic source под реально существующую компанию.

---

# 32. FieldEvidence

Для критичных fields каждого benchmark case создавать evidence.

Минимум:

- price;
- availability;
- financing eligibility;
- important timeline field.

Не обязательно создавать evidence для каждого декоративного поля.

---

# 33. Evidence Ground Truth

Для каждого intentionally problematic case должно быть понятно:

- какой field known;
- какой claimed;
- какой conflicting;
- какой stale;
- какой unknown.

---

# 34. Data Confidence Cases

Создать benchmark examples:

### Case A

```text
High Match potential
High Confidence
```

### Case B

```text
High Match potential
Low Confidence
```

### Case C

```text
Medium Match
High Confidence
```

### Case D

```text
Hard critical field unknown
```

TASK-005 не обязана считать Match Score, но dataset должен позволять это проверить позже.

---

# 35. Infrastructure Fixtures

Для части объектов создать normalized infrastructure data:

- school distance/time;
- kindergarten;
- park;
- transport;
- user destination travel time.

Не создавать маркетинговое поле:

```text
great infrastructure = true
```

---

# 36. Cross-type Comparison Set

Создать минимум 3 специально подобранных comparison groups.

## Group 1

```text
new-build apartment
vs
secondary apartment
```

## Group 2

```text
apartment
vs
house
```

## Group 3

```text
cheap but uncertain
vs
slightly more expensive but confirmed
```

---

# 37. Comparison Ground Truth

Ground truth не должен говорить:

```text
winner = object A
```

без UserRequest.

Он должен описывать:

```text
tradeoff dimensions
known differences
unknowns
```

Победитель появляется только после конкретного пользовательского запроса.

---

# 38. Recommended Directory Structure

```text
data/
  examples/
    pilot/
      metadata.json
      properties.json
      offers.json
      financing-programs.json
      financing-offers.json
      promotions.json
      property-financing-eligibility.json
      purchase-scenarios.json
      sources.json
      field-evidence.json
      source-conflicts.json

      ground-truth/
        duplicate-clusters.json
        false-duplicate-pairs.json
        comparison-groups.json
        confidence-cases.json
        financing-compatibility.json
```

Можно использовать `.jsonl`, если это удобнее для fixtures.

---

# 39. One Big JSON vs Entity Files

Не хранить весь dataset как один огромный opaque JSON, если это усложняет:

- diffs;
- tests;
- reuse;
- validation.

Предпочтительно разделить по entities.

---

# 40. Dataset Metadata

`metadata.json` минимум:

```yaml
dataset_id:
dataset_version:
dataset_type:
created_at:
schema_version:
geography:
property_count:
offer_count:
notes:
```

---

# 41. Stable IDs

Использовать стабильные deterministic IDs:

```text
prop_nb_001
offer_nb_001_dev
source_dev_alpha
```

Не генерировать UUID заново при каждом test run.

---

# 42. ID Naming

ID не должен кодировать бизнес-логику, которую потом сложно изменить.

Допустим semantic prefix для fixtures:

```text
prop_
offer_
src_
finprog_
scenario_
```

---

# 43. Reproducible Generation

Допустим два подхода:

### A. Static fixtures

JSON files committed to repo.

### B. Generator script

```text
scripts/generate-pilot-fixtures.ts
```

с фиксированным seed.

Если используется generator:

результат должен быть deterministic.

---

# 44. Не создавать random data без сценария

Плохо:

```text
random price
random floor
random city
```

Dataset должен быть scenario-driven.

Каждый edge case имеет цель.

---

# 45. Fixture Notes

Для важных объектов добавить developer/test note, например:

```yaml
fixture_tags:
  - duplicate_cluster
  - price_conflict
  - claimed_financing
```

Это internal metadata.

Не включать такие tags в production domain model, если они существуют только для tests.

---

# 46. Separate Fixture Metadata

Если `fixture_tags` не входят в schemas:

хранить их в отдельной test metadata map.

Не загрязнять production Property contract test-only полями.

---

# 47. Schema Validation

Все entity fixtures должны валидироваться schemas TASK-002.

Добавить script/test:

```text
validate:fixtures
```

или эквивалент.

---

# 48. Referential Integrity

Проверять:

- every Offer.property_id exists;
- every evidence.entity_id exists;
- every PurchaseScenario references valid entities;
- every SourceConflict evidence ID exists;
- every eligibility reference valid;
- no orphan Offer.

---

# 49. Semantic Integrity

Кроме JSON Schema, нужны dataset integrity tests.

Например:

```text
sold Offer cannot be marked currently available
price_from template is not concrete unit exact price
same Offer cannot reference two physical Property
```

Только правила, уже зафиксированные docs.

---

# 50. Duplicate Integrity Tests

Проверить:

- duplicate cluster offers all reference expected Property in canonical fixtures;
- false-positive pair remains separate;
- same unit external IDs consistent.

---

# 51. Financing Integrity Tests

Проверить:

- PurchaseScenario does not combine incompatible offers;
- expired Promotion not used as active scenario;
- property eligibility references concrete program/offer;
- claimed eligibility remains claimed.

---

# 52. Evidence Integrity Tests

Проверить:

- confirmed critical field has evidence;
- conflict has 2+ evidence records;
- stale has collected_at/freshness status;
- source reference exists.

---

# 53. Dataset Loader

Создать простой reusable loader для tests.

Пример:

```ts
loadPilotDataset()
```

который возвращает typed entities.

Loader должен:

- parse JSON;
- validate;
- return typed result;
- fail loudly on invalid fixture.

---

# 54. No Database Yet

TASK-005 не должна:

- создавать PostgreSQL migrations;
- импортировать fixtures в production DB;
- создавать seed production script.

Допустимо подготовить будущий seed-friendly format.

---

# 55. No Live Network Access

Tests dataset не должны зависеть от интернета.

---

# 56. No Real Scraped HTML

Не коммитить raw HTML коммерческих площадок в fixtures без подтверждённого права.

Для source adapter tests позже можно создавать minimal synthetic page fixtures.

---

# 57. Example User Requests for Dataset

Создать минимум 5 test UserRequest fixtures, которые будут позже использоваться Matching Engine.

Например:

### Request A

```text
квартира
до 5 млн
семейная ипотека must
zero-down preferred
не первый этаж must
```

### Request B

```text
переезд
платёж до 80 тыс.
въехать в течение года
школа preferred
```

### Request C

```text
apartment or house
>= 70 m²
commute <= 40 min
```

### Request D

```text
ready secondary
minimum renovation
```

### Request E

```text
house
gas connected must
land >= 6 sotka
```

---

# 58. UserRequest Fixtures Location

Например:

```text
data/examples/pilot/user-requests/
```

Они должны валидироваться UserRequest schema TASK-002.

---

# 59. Expected Dataset Behaviors

Dataset должен содержать случаи, где будущий Matching Engine получит:

- exact eligible;
- eligible with unknowns;
- possible match;
- hard fail;
- unavailable;
- insufficient data.

TASK-005 не рассчитывает эти статусы, но ground-truth notes должны позволять тестировать их позже.

---

# 60. Benchmark Manifest

Создать:

```text
benchmark-manifest.json
```

или аналог.

Он описывает:

```yaml
cases:
  - id:
    purpose:
    property_ids:
    offer_ids:
    relevant_user_request_ids:
    expected_invariants:
```

---

# 61. Не фиксировать будущий Match Score вручную

В TASK-005 нельзя писать:

```text
prop_001 = 92%
```

пока Matching Engine не реализован.

Можно писать:

```text
expected hard pass
expected hard fail
expected critical unknown
```

если это следует из fixture data и UserRequest.

---

# 62. Hard-fail Benchmark Cases

Минимум:

- price over strict budget;
- first floor excluded;
- move-in after strict deadline;
- required utility absent;
- confirmed financing program not eligible.

---

# 63. Critical Unknown Benchmark Cases

Минимум:

- family mortgage applicability unknown;
- exact price unknown (`price_from`);
- availability stale/unknown;
- gas status unknown.

---

# 64. Conflict Benchmark Cases

Минимум:

- price conflict;
- area conflict;
- handover date conflict;
- initial payment conflict.

---

# 65. Not-applicable Cases

Dataset должен позволять проверить `not_applicable`.

Пример:

```text
elevator criterion
```

для land/property where field does not apply.

Не использовать `false` там, где semantics = not applicable.

---

# 66. Data Completeness Cases

Создать:

- highly complete property;
- partially complete property;
- sparse property.

Completeness позже должна зависеть от UserRequest, а не быть фиксированным «качеством карточки».

---

# 67. Dataset Documentation

Создать короткий файл:

```text
data/examples/pilot/README.md
```

где указать:

- purpose;
- synthetic nature;
- structure;
- how to validate;
- how to add fixture;
- prohibited practices.

---

# 68. Adding New Fixtures Rule

Новый fixture должен:

1. иметь конкретную test purpose;
2. проходить schema validation;
3. не дублировать существующий case без причины;
4. обновлять benchmark manifest, если это benchmark case.

---

# 69. Test Data ≠ Product Defaults

Никакие values из Pilot Dataset не должны использоваться как product defaults.

Пример:

если большинство fixtures:

```text
2 rooms
```

это не означает default `rooms = 2`.

---

# 70. Tests Required

Минимум:

1. all fixtures schema-valid;
2. all references valid;
3. stable IDs unique;
4. Property/Offer separation;
5. minimum duplicate clusters exist;
6. false duplicate pairs exist;
7. minimum source types covered;
8. verification statuses covered;
9. freshness statuses covered;
10. price conflict exists;
11. financing claim case exists;
12. zero-down variants exist;
13. cross-type comparison groups exist;
14. user request fixtures valid;
15. benchmark manifest references valid IDs.

---

# 71. Dataset Coverage Test

Добавить automated assertion минимум по required coverage:

```text
new_build count >= required minimum
secondary count >= required minimum
house/townhouse count >= required minimum
```

Не обязательно hardcode exact 50.

---

# 72. Determinism Test

Если generator:

```text
same seed
→ same fixture hashes
```

Если static fixtures:

проверить loader produces deterministic sorted result.

---

# 73. Validation Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

и отдельную fixture validation command, если она создана.

---

# 74. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Dataset version:
Properties:
Offers:
Sources:
Financing programs/offers:
Purchase scenarios:
Duplicate clusters:
Conflict cases:
UserRequest fixtures:
Validation:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 75. Out of Scope

Не реализовывать в TASK-005:

- live source ingestion;
- OpenClaw;
- real crawling;
- database;
- Matching Engine;
- UI;
- production search;
- map APIs;
- expert workflow.

---

# 76. Do Not Continue Automatically

После TASK-005:

**не начинать следующую задачу самостоятельно.**

---

# 77. Likely Next Task

Следующей логично сделать:

```text
TASK-006 — Criteria Registry & Evaluators
```

Она начнёт формализовывать deterministic Matching Engine поверх:

- UserRequest;
- core schemas;
- Pilot Dataset.

---

# 78. Definition of Done

TASK-005 Done, когда repository содержит небольшой, schema-valid, scenario-driven benchmark недвижимости, который позволяет дальше разрабатывать Matching Engine без зависимости от live external data.

---

# 79. Главный принцип для coding-agent

Pilot Dataset нужен не для того, чтобы выглядеть как «реальный каталог».

Он нужен, чтобы намеренно содержать сложные случаи:

```text
дубли
конфликты
unknown
stale
разные Offer
разные PurchaseScenario
разные типы недвижимости
```

Главное правило:

> **Тестовый dataset должен проверять архитектуру на сложных случаях, а не создавать красивую витрину из идеальных объектов.**
