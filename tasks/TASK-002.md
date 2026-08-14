# TASK-002 — Core Schemas

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone B — Deterministic Core`

---

# 1. Goal

Перевести основные доменные модели проекта из архитектурной документации в **формальные, версионируемые и тестируемые схемы данных и TypeScript-контракты**.

Эта задача создаёт единый контракт между:

- UI;
- API;
- database layer;
- Matching Engine;
- Data Collection;
- Expert Layer;
- tests / fixtures.

Главный результат:

> одна и та же сущность не должна иметь разные определения в документации, TypeScript, API и тестовых данных.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

docs/04-data/user-request-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/04-data/source-model.md
docs/04-data/deduplication.md

docs/05-matching/matching-logic.md
docs/05-matching/hard-soft-criteria.md
docs/05-matching/confidence-status.md

docs/07-expert-services/expert-layer.md
docs/07-expert-services/document-review.md
docs/07-expert-services/choice-assistance.md
docs/07-expert-services/onsite-check.md

docs/08-roadmap/implementation-plan.md
```

Если между документами обнаружено противоречие, применить правила `SPEC CONFLICT` из `AGENTS.md`.

---

# 3. Scope

В рамках TASK-002 необходимо формализовать минимум следующие сущности:

1. `UserRequest`
2. `Property`
3. `Offer`
4. `FinancingProgram`
5. `FinancingOffer`
6. `Promotion`
7. `PropertyFinancingEligibility`
8. `PurchaseScenario`
9. `Source`
10. `SourceSnapshot`
11. `FieldEvidence`
12. `SourceConflict`
13. `MatchResult`
14. `Criterion`
15. `CriterionEvaluationResult`
16. `DataQuality`
17. `ExpertRequest`
18. `ExpertResult`

Допустимо разбить крупные сущности на вложенные reusable contracts.

---

# 4. Expected Repository Structure

Рекомендуемая структура:

```text
data/
  schemas/
    user-request.schema.json
    property.schema.json
    offer.schema.json
    financing-program.schema.json
    financing-offer.schema.json
    promotion.schema.json
    property-financing-eligibility.schema.json
    purchase-scenario.schema.json
    source.schema.json
    source-snapshot.schema.json
    field-evidence.schema.json
    source-conflict.schema.json
    criterion.schema.json
    match-result.schema.json
    data-quality.schema.json
    expert-request.schema.json
    expert-result.schema.json

  examples/
    user-request/
    property/
    financing/
    source/
    matching/
    expert/
```

TypeScript contracts рекомендуется разместить, например:

```text
src/domain/
  user-request/
  property/
  financing/
  source/
  matching/
  expert/
```

или в другом идиоматичном расположении, если scaffold TASK-001 использует иную структуру.

---

# 5. Schema Standard

Использовать один основной validation approach.

Предпочтительно:

```text
JSON Schema
```

как переносимый контракт.

TypeScript-типы могут:

- генерироваться из схем;
- либо поддерживаться рядом с ними через выбранную библиотеку.

Нельзя допустить две независимые вручную поддерживаемые модели, которые легко рассинхронизировать.

Если coding-agent предлагает альтернативу вроде Zod-first:

- это допустимо только если JSON Schema остаётся экспортируемым;
- выбор должен быть кратко зафиксирован в результате задачи.

---

# 6. Schema Versioning

Каждая top-level схема должна иметь version semantics.

Минимально:

```yaml
schema_version: "1.0"
```

или через `$id` / metadata.

Breaking changes в будущих задачах должны быть различимы.

---

# 7. Null / Unknown Semantics

Критическое правило проекта:

```text
unknown != false
unknown != true
```

Поэтому нельзя заменять отсутствие данных дефолтными значениями:

```text
false
0
""
[]
```

если бизнес-смысл означает «неизвестно».

Схемы должны явно поддерживать:

- `null`;
- semantic status;
- либо соответствующую optional-модель.

---

# 8. UserRequest Contract

Минимальные блоки:

```text
intent
goal
location
property
budget
financing
timeline
household
lifestyle
infrastructure
property_features
must_have
nice_to_have
avoid
unknowns
source_links
clarifications
confidence
result_limit
```

Не обязательно копировать markdown 1:1, если нормализация улучшает contract structure, но нельзя терять описанные смыслы.

---

# 9. UserRequest Priority Semantics

Поддержать:

```text
must
preferred
neutral
avoid
exclude
unknown
```

Не заменять это boolean `required`.

---

# 10. Criterion Contract

Минимум:

```yaml
criterion_id:
category:
field:
operator:
target:
unit:
priority:
weight:
tolerance:
fit_function:
criterion_group_id:
applicable_property_types:
source_requirement:
freshness_requirement:
critical_if_unknown:
user_expression:
```

---

# 11. Criterion Operators

Минимум:

```text
eq
neq
in
not_in
lte
gte
between
within_distance
within_time
exists
absent
before
after
one_of
boolean
custom
```

Naming может быть технически адаптирован, но semantics должны сохраниться.

---

# 12. Property Contract

`Property` представляет физический объект.

Минимум:

```text
identity
property_type
market_type
location
physical
building
condition
land
utilities
timeline
ownership
metadata
```

Не помещать source-specific commercial fields туда, где они относятся к `Offer`.

---

# 13. Property Types

Минимум:

```text
apartment
apartments
house
townhouse
land
```

Архитектура должна оставаться расширяемой.

---

# 14. Offer Contract

`Offer` — отдельная сущность.

Минимум:

```text
offer_id
property_id
seller
source_id
listing_price
currency
price_from
availability
publication timestamps
mandatory extras
commercial terms
linked financing / promotion references
```

Один Property может иметь несколько Offer.

---

# 15. Нельзя объединять Property и Offer

В TASK-002 запрещено формализовать модель:

```text
Property {
  url
  seller
  price
  promotion
}
```

если это превращает физический объект и предложение в одну сущность.

---

# 16. FinancingProgram Contract

Минимум:

```text
program_id
program_type
provider
rule_version
effective_from
effective_until
borrower_rules
property_rules
financial_rules
source references
verification status
```

Не hardcode текущие правила Семейной ипотеки в schema.

Schema описывает структуру правил, а не актуальное законодательство.

---

# 17. FinancingOffer Contract

Минимум:

```text
financing_offer_id
program_id
bank/developer/partner
rate structure
initial payment
loan amount
term
mandatory services
price impact
validity
source
verification
```

---

# 18. Rate Structure

Не хранить ставку только как:

```text
interest_rate: number
```

Нужно поддержать:

- nominal;
- advertised/from;
- period-specific;
- after introductory period;
- conditions.

---

# 19. Promotion Contract

Минимум:

```text
promotion_id
title
provider/developer
valid_from
valid_until
eligible_property_refs
price_impact
financing_impact
conditions
source
verification
```

---

# 20. PropertyFinancingEligibility

Это связь:

```text
Property / Offer
+
FinancingProgram / FinancingOffer
```

Минимум:

```text
eligibility_status
initial_payment
rate
monthly_payment
applicability evidence
checked_at
source
```

---

# 21. PurchaseScenario

Минимум:

```text
scenario_id
property_id
offer_id
financing_program_id
financing_offer_id
promotion_id
entry_cash
initial_payment
loan_amount
monthly_payment
total_payment
mandatory_costs
estimated_total_entry_cost
assumptions
verification
```

Не создавать scenario из несовместимых условий разных Offer.

---

# 22. Source Contract

Минимум:

```text
source_id
source_type
name
domain
base_url
coverage
collection method
trust level
status
policy metadata
```

---

# 23. Source Types

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

---

# 24. SourceSnapshot Contract

Минимум:

```text
snapshot_id
source_id
url
collected_at
content_hash
status
structured_payload_reference
raw_reference
```

Raw HTML необязательно хранить в самой schema как строку.

---

# 25. FieldEvidence Contract

Это одна из самых важных схем.

Минимум:

```text
evidence_id
entity_type
entity_id
field
value
raw_value
source_id
snapshot_id
source_url
collected_at
verification_status
freshness_status
extraction_confidence
evidence_text/reference
```

---

# 26. Verification Status

Общий enum:

```text
confirmed
claimed
unconfirmed
conflicting
stale
unknown
```

Если в экспертном слое требуется `user_confirmed` или `manual_confirmed`, это должно быть либо:

- отдельным evidence type;
- либо явно специфицированным расширением.

Не придумывать новый статус без необходимости.

---

# 27. Freshness Status

Минимум:

```text
fresh
aging
stale
expired
unknown
```

---

# 28. SourceConflict Contract

Минимум:

```text
conflict_id
entity_id
field
evidence_ids
severity
status
resolved_value
resolution_reason
resolved_by
resolved_at
```

---

# 29. MatchResult Contract

Минимум:

```text
match_result_id
user_request_id
property_id
purchase_scenario_id
eligibility_status
match_score
property_fit_score
financing_fit_score
data_confidence_score
data_completeness_score
ranking_score
criteria_results
hard_failures
compromises
strengths
unknown_critical
recommended_actions
algorithm_version
calculated_at
```

---

# 30. Eligibility Status

Минимум:

```text
eligible
eligible_with_unknowns
possible_match
hard_fail
insufficient_data
unavailable
```

---

# 31. CriterionEvaluationResult

Минимум:

```text
criterion_id
status
actual
target
fit
margin
verification_status
freshness_status
evidence_refs
unknown_reason
explanation_data
```

---

# 32. Criterion Evaluation Status

Минимум:

```text
matched
partially_matched
not_matched
unknown
conflicting
not_applicable
hard_failed
```

---

# 33. DataQuality Contract

Минимум:

```text
data_confidence_score
data_completeness_score
freshness_score
confidence_status
critical_unknown_count
critical_conflict_count
critical_override
fields
recommended_checks
algorithm_version
```

---

# 34. Confidence Status

Минимум:

```text
high
medium
low
critical
```

---

# 35. ExpertRequest Contract

Минимум:

```text
request_id
user_id
request_type
user_request_id
property_ids
comparison_id
questions
priority
status
required_specialist
created_at
```

---

# 36. Expert Request Types

Минимум:

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

# 37. Specialist Types

Минимум:

```text
real_estate_expert
lawyer
mortgage_specialist
property_inspector
technical_specialist
```

---

# 38. ExpertResult Contract

Минимум:

```text
request_id
status
checked_items
findings
confirmed
unconfirmed
conflicts
risks
recommendations
next_actions
evidence
specialist
completed_at
```

---

# 39. Reusable Primitives

Рекомендуется выделить общие типы:

```text
Money
DateRange
GeoPoint
Address
SourceReference
VerificationInfo
FieldValueWithEvidence
EntityReference
```

Но не создавать чрезмерно абстрактную framework-модель.

---

# 40. Money

Не использовать floating point для денежных сумм там, где это приведёт к ошибкам.

Минимально определить:

```yaml
amount:
currency:
```

В implementation допустимо хранить деньги в integer minor units или decimal-safe representation.

Выбор описать в коде/README domain layer.

---

# 41. Dates

Все timestamps:

```text
ISO-8601
```

Явно определить:

- date only;
- datetime;
- timezone semantics.

Не хранить пользовательские даты как произвольные strings после normalization.

---

# 42. Evidence References

Schema должна позволять одному normalized field ссылаться на несколько evidence.

Это требуется для:

- conflicts;
- confirmations;
- history.

---

# 43. Examples / Fixtures

Для каждой крупной схемы создать минимум один valid fixture.

Обязательные examples:

1. structured UserRequest;
2. new-build apartment Property;
3. secondary apartment Offer;
4. house Property;
5. financing program;
6. zero-down claimed financing offer;
7. confirmed source evidence;
8. conflicting price evidence;
9. MatchResult with critical unknown;
10. ExpertRequest.

---

# 44. Edge-case Fixtures

Добавить минимум несколько специальных fixtures:

```text
unknown must criterion
price_from instead of exact price
same property with two offers
claimed family mortgage
conflicting initial payment
expired promotion
```

---

# 45. Validation Tests

Для schemas нужны tests:

- valid fixture passes;
- missing required identity fails;
- invalid enum fails;
- invalid score range fails;
- invalid currency representation fails;
- Property/Offer references are structurally valid;
- unknown values не превращаются в false.

---

# 46. Score Ranges

Формализовать:

```text
match_score: 0..100
data_confidence_score: 0..100
data_completeness_score: 0..100
ranking_score: documented range
fit: 0..1
extraction_confidence: 0..1
```

Если `ranking_score` не имеет публичного fixed range, не придумывать его искусственно.

---

# 47. No Business Calculation in Schemas

Schema валидирует структуру.

Не зашивать в JSON Schema:

- реальные soft curves;
- ипотечные коэффициенты;
- source TTL;
- ranking formula.

Эти правила принадлежат registry/policy modules следующих задач.

---

# 48. No Current Mortgage Rules in Schema

Запрещено hardcode:

- текущую ставку;
- текущий лимит программы;
- текущий ПВ;
- текущие регионы программы.

Это временные данные, а не schema definition.

---

# 49. No Pilot City Hardcode

Не включать в enum:

```text
city = Tula
```

City — обычное поле.

Pilot fixtures могут использовать конкретный город.

---

# 50. Forward Compatibility

Schemas должны позволять в будущем добавить:

- commercial property;
- new countries;
- new financing types;
- advanced risk models;

без разрушения core separation.

Не нужно реализовывать эти функции сейчас.

---

# 51. TypeScript Contracts

TypeScript слой должен:

- соответствовать schema;
- экспортировать domain types;
- не использовать `any` для основных domain entities;
- поддерживать strict TypeScript.

---

# 52. Runtime Validation

Должен существовать способ проверить runtime payload.

Например:

```text
validateUserRequest(payload)
validateProperty(payload)
validateMatchResult(payload)
```

Конкретная библиотека выбирается агентом в рамках TASK.

---

# 53. Serialization Test

Минимум один test:

```text
fixture
→ runtime validation
→ serialize
→ parse
→ validate again
```

---

# 54. Naming Conventions

Использовать единый стиль.

Предпочтительно в JSON:

```text
snake_case
```

или:

```text
camelCase
```

Coding-agent должен выбрать один стиль для code contracts и не смешивать его хаотично.

Если документация использует snake_case, а TypeScript camelCase, mapping должен быть явным.

Предпочтительно избежать ненужного mapping layer на MVP.

---

# 55. No Database Implementation Yet

TASK-002 не должна создавать:

- PostgreSQL tables;
- ORM migrations;
- persistence repositories.

Это следующий слой.

Здесь только:

```text
contracts
schemas
runtime validation
fixtures
tests
```

---

# 56. No UI Yet

Не реализовывать:

- forms;
- property cards;
- matching screens;
- comparison UI.

---

# 57. No Matching Algorithm Yet

Не реализовывать scoring.

Только контракт, который будущий Matching Engine будет возвращать.

---

# 58. Expected Output

После TASK-002 repository должен иметь единый formal domain contract.

Минимально:

```text
data/schemas/
data/examples/
src/domain/
tests/domain/
```

---

# 59. Acceptance Criteria

TASK считается завершённой, если:

1. UserRequest имеет формальную schema;
2. Property и Offer разделены;
3. FinancingProgram и PurchaseScenario разделены;
4. Source и FieldEvidence формализованы;
5. MatchResult формализован;
6. ExpertRequest/Result формализованы;
7. enums согласованы с docs;
8. unknown semantics сохранены;
9. schemas versioned;
10. runtime validation работает;
11. TypeScript strict проходит;
12. valid fixtures проходят;
13. invalid fixtures отклоняются;
14. tests проходят;
15. build проходит;
16. документация не изменена молча ради удобства implementation.

---

# 60. Required Tests

Минимально проверить:

```text
UserRequest valid
UserRequest invalid priority

Property valid
Property without identity invalid

Offer valid
Offer references property

FieldEvidence valid
FieldEvidence invalid verification status

PurchaseScenario valid
PurchaseScenario incompatible malformed structure rejected structurally

MatchResult valid
MatchResult score >100 rejected

ExpertRequest valid
ExpertRequest invalid specialist rejected
```

---

# 61. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

Если build невозможен из-за незавершённого TASK-001 scaffold:

это должно быть явно указано, а не скрыто.

---

# 62. Deliverable Report

После выполнения:

```text
Implemented:
Schemas created:
TypeScript contracts:
Fixtures:
Tests:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 63. Do Not Continue Automatically

После TASK-002:

**не начинать TASK-003 без отдельного задания.**

---

# 64. Likely Next Task

Следующая задача предполагается:

```text
TASK-003 — UserRequest Parser & Structured Confirmation Contract
```

Но её scope будет задан отдельно.

---

# 65. Definition of Done

TASK-002 Done, когда у проекта существует единый формальный vocabulary для core domain entities, и дальнейшие UI, database, matching и ingestion задачи могут ссылаться на него без повторного изобретения структуры данных.

---

# 66. Главный принцип для coding-agent

Нельзя оптимизировать схемы под удобство одной страницы или одного источника.

Правильная зависимость:

```text
Product Domain
      ↓
Formal Schema
      ↓
TypeScript Contract
      ↓
API / DB / Matching / UI
```

а не:

```text
UI component
      ↓
случайный interface
      ↓
потом пытаемся приспособить domain
```

Главное правило:

> Формальные схемы должны сохранить продуктовые различия, которые уже зафиксированы в документации: Property ≠ Offer, факт ≠ claim, Match ≠ Confidence, unknown ≠ false, объект ≠ сценарий покупки.
