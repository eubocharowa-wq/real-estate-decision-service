# Ingestion Flow — MVP v1

## 1. Назначение документа

Этот документ описывает полный путь данных от внешнего источника до нормализованного объекта, который может участвовать в Matching Engine.

Он отвечает на вопрос:

> Что именно происходит после того, как OpenClaw, API, feed или пользовательская ссылка нашли объект?

Главный принцип:

> Ни один внешний источник не пишет напрямую в canonical database.

Все данные проходят одинаковый контролируемый pipeline.

---

# 2. Общий pipeline

```text
External Source
      ↓
Collection Task
      ↓
Source Adapter / OpenClaw / API
      ↓
Raw Result
      ↓
Staging
      ↓
Schema Validation
      ↓
Normalization
      ↓
Identity Resolution
      ↓
Field Evidence
      ↓
Deduplication
      ↓
Conflict Resolution
      ↓
Canonical Entities
      ↓
Derived Fields
      ↓
Matching Readiness
      ↓
Matching Engine
```

---

# 3. Основные входы

Ingestion Flow должен поддерживать:

- official API;
- partner feed;
- XML/JSON;
- HTTP pages;
- OpenClaw/browser agent;
- manual import;
- expert verification;
- user URL.

Все входы приводятся к одному `RawCollectionResult`.

---

# 4. Collection Task

Каждый ingestion начинается с задачи.

```yaml
collection_task:
  task_id:
  source_id:
  mode:
  urls:
  requested_fields:
  entity_hint:
  priority:
  created_at:
```

---

# 5. RawCollectionResult

Результат collection не должен сразу соответствовать PropertyModel.

Пример:

```yaml
raw_result:
  task_id:
  run_id:
  source_id:
  source_url:
  collected_at:
  payload:
  extracted_fields:
  warnings:
  errors:
  agent_version:
  parser_version:
```

---

# 6. Staging Layer

Raw result сохраняется в staging.

Назначение staging:

- повторная обработка без повторного crawling;
- аудит;
- debugging parser;
- anomaly analysis;
- rollback.

---

# 7. Staging Status

- `received`
- `invalid`
- `validated`
- `normalized`
- `rejected`
- `manual_review`

---

# 8. Schema Validation

Проверяется:

- обязательная metadata;
- source_id;
- timestamp;
- URL;
- типы данных;
- encoding;
- currency;
- range sanity;
- malformed JSON/XML.

---

# 9. Validation Examples

Невалидно:

```text
price = "abc"
```

Подозрительно:

```text
area = 4180 m²
rooms = 1
```

Второе не обязательно rejected — может получить anomaly flag.

---

# 10. Anomaly Flags

- `price_outlier`
- `area_outlier`
- `missing_identity`
- `invalid_currency`
- `invalid_date`
- `possible_template`
- `possible_ad_price`
- `unexpected_structure`
- `source_changed`

---

# 11. Normalization

Raw поля переводятся во внутренние canonical поля.

Пример:

```text
"4 890 000 руб."
→ 4890000 RUB
```

```text
"2Е"
→ layout_type = euro_two
```

```text
"предчистовая"
→ finishing_type = pre_finish
```

---

# 12. Raw Value сохраняется

После normalization не удаляется:

```yaml
raw_value:
normalized_value:
```

Это важно для аудита и повторной интерпретации.

---

# 13. Address Normalization

Адрес проходит:

- разбор страны;
- региона;
- города;
- улицы;
- дома;
- корпуса;
- квартиры;
- coordinate enrichment, если допустимо.

Исходная строка сохраняется.

---

# 14. Entity Type Detection

Система определяет:

- `property`
- `offer`
- `inventory_template`
- `development`
- `building`
- `financing_program`
- `financing_offer`
- `promotion`
- `document`
- `poi`

---

# 15. Concrete Unit vs Template

Если страница:

> «1-комнатные от 4,5 млн»

без конкретного unit:

это:

```text
inventory_template
```

а не:

```text
property
```

---

# 16. Identity Resolution

После normalization система пытается определить:

- существующий PhysicalProperty;
- существующий Offer;
- новый Property;
- новый Offer.

Используются правила `deduplication.md`.

---

# 17. Strong Identity

Примеры:

- developer unit ID;
- building + unit number;
- cadastral number;
- full address + apartment.

Если strong identity найден:

Offer привязывается к существующему Property.

---

# 18. Probable Identity

Если strong ID нет:

создаётся `DeduplicationDecision`.

При uncertain result:

```text
manual_review
```

---

# 19. Field Evidence Creation

Для каждого нормализованного поля создаётся provenance.

```yaml
field_evidence:
  entity_id:
  field:
  normalized_value:
  raw_value:
  source_id:
  source_url:
  snapshot_id:
  collected_at:
  extraction_confidence:
```

---

# 20. Verification Classification

Source Layer назначает:

- `confirmed`
- `claimed`
- `unconfirmed`
- `conflicting`
- `stale`
- `unknown`

OpenClaw не назначает этот статус финально.

---

# 21. Conflict Detection

Если новое evidence отличается от canonical:

система проверяет:

- source priority;
- freshness;
- field type;
- applicability;
- identity certainty.

---

# 22. Conflict Example

Old:

```text
price = 4.89m
source = developer
```

New:

```text
price = 5.05m
source = marketplace
```

Не перезаписывать автоматически.

Создать `SourceConflict`.

---

# 23. Canonical Entity Update

После validation и conflict analysis обновляются:

- PhysicalProperty;
- Offer;
- Building;
- Development;
- Financing entities.

---

# 24. Static vs Dynamic Fields

Static:

- area;
- floor;
- rooms;
- address.

Dynamic:

- price;
- availability;
- promotion;
- financing terms.

Dynamic values чаще остаются на уровне Offer / Scenario.

---

# 25. Offer Creation

Offer должен хранить:

- seller;
- source;
- price;
- availability;
- publication;
- terms.

Один PhysicalProperty может иметь несколько Offers.

---

# 26. Financing Link

Если найдено финансовое условие:

не записывать его сразу в Property.

Создать / связать:

```text
FinancingProgram
FinancingOffer
Promotion
PropertyFinancingEligibility
PurchaseScenario
```

---

# 27. Promotion Applicability

Если акция общая:

```text
eligible_property_ids = unknown
```

до проверки конкретного объекта.

---

# 28. Derived Fields

После canonical ingestion можно вычислять:

- price_per_m2;
- total_entry_cost;
- travel times;
- data completeness;
- freshness;
- duplicate probability.

Derived field хранит:

```text
calculation_version
inputs
calculated_at
```

---

# 29. Matching Readiness

Перед передачей объекта Matching Engine система проверяет:

```yaml
matching_readiness:
  identity_resolved:
  offer_active:
  minimum_fields_present:
  source_evidence_present:
  critical_anomalies:
```

---

# 30. Minimum Fields for Listing

Для основной выдачи минимум:

- property type;
- location;
- price или честный unknown status;
- area/rooms, где применимо;
- source;
- last checked;
- availability status.

---

# 31. Matching Ready Status

- `ready`
- `ready_with_unknowns`
- `not_ready`
- `manual_review`

---

# 32. Reject Conditions

Raw record не должен попадать в canonical, если:

- malformed identity;
- impossible values;
- unsupported entity type;
- source not approved;
- policy blocks ingestion;
- corrupt payload.

---

# 33. Quarantine

Подозрительные записи помещаются в:

```text
quarantine
```

а не удаляются.

---

# 34. Manual Review Queue

Причины:

- dedup uncertain;
- source conflict;
- impossible value;
- legal/policy flag;
- unclear finance;
- template vs unit ambiguity.

---

# 35. User URL Flow

```text
User pastes URL
↓
Source identification
↓
Access policy check
↓
Collection task
↓
Raw result
↓
Normalization
↓
Deduplication
↓
Existing Property?
   ├─ yes → attach new Offer/Evidence
   └─ no → create new Property
↓
Show parsed data to user
↓
User correction if needed
```

---

# 36. User Correction

Исправление пользователя сохраняется как отдельное evidence.

Не переписывать историю source data.

---

# 37. Manual Import Flow

Эксперт или администратор может загрузить:

- CSV;
- JSON;
- structured form.

Он проходит тот же normalization pipeline.

---

# 38. Partner Feed Flow

Для API/feed:

```text
poll / webhook
↓
raw payload
↓
staging
↓
normalization
```

В MVP webhook не обязателен.

---

# 39. Scheduled Crawl Flow

```text
scheduler
↓
discovery task
↓
list of external IDs
↓
difference detection
↓
collect/refresh tasks
↓
ingestion
```

---

# 40. Discovery vs Deep Collect

Discovery собирает:

- external ID;
- URL;
- basic identity.

Deep collect:

- full property details;
- price;
- finance;
- evidence.

---

# 41. Incremental Discovery

Если новый external ID появился:

создать collect task.

Если ID исчез:

не удалять property.

Создать:

```text
source_offer_missing
```

---

# 42. Missing Offer

Если Offer перестал появляться:

```text
offer_status = missing_from_source
```

После дополнительных проверок:

- inactive;
- removed;
- sold;
- unknown.

---

# 43. Reprocessing

Если обновился parser:

можно повторно прогнать старый staging payload через новую normalization version.

Это одна из причин не хранить только canonical result.

---

# 44. Versioning

Каждый ingestion должен хранить:

- source adapter version;
- parser version;
- normalization version;
- dedup version;
- schema version.

---

# 45. Idempotency

Один и тот же raw record при повторной обработке не должен создавать дубли.

Использовать:

- source_id;
- external_id;
- content hash;
- collected timestamp;
- dedup logic.

---

# 46. Transaction Boundary

Canonical update должен быть атомарным по логической операции.

Например:

```text
Offer + Evidence + ChangeEvent
```

не должны частично записываться.

---

# 47. Error Handling

Ошибка одного поля не должна обязательно отклонять весь объект.

Пример:

price parsed; floor malformed.

Результат:

```text
partial normalization
```

с warning.

---

# 48. Partial Ingestion

Допустим:

```text
property created
price known
area known
floor unknown
```

Если minimum fields соблюдены.

---

# 49. Source Policy Check

Перед collection и перед canonical write проверяется:

```text
source status
access status
storage right
display right
```

---

# 50. Policy Block

Если:

```text
access_status != approved
```

production ingestion adapter не должен активироваться.

---

# 51. Audit Log

Хранить события:

- task created;
- source called;
- payload received;
- normalized;
- dedup decision;
- canonical updated;
- conflict created;
- manual correction.

---

# 52. Observability

Метрики:

- ingestion success;
- validation failures;
- normalization failures;
- dedup manual review rate;
- conflict rate;
- records per source;
- latency;
- partial ingestion rate.

---

# 53. Data Lineage

Для любого user-visible значения должна восстанавливаться цепочка:

```text
UI
↓
MatchResult
↓
Canonical Field
↓
FieldEvidence
↓
Raw Result / Snapshot
↓
Source URL
```

---

# 54. Security

Raw payload не должен случайно содержать секреты.

Собираем только необходимые данные.

Не хранить:

- user credentials;
- bank passwords;
- session cookies;
- unnecessary personal data.

---

# 55. PII Handling

Если вторичное объявление содержит телефон/имя продавца:

для MVP хранить только если реально нужно.

Лучше:

- seller_type;
- source URL;
- source-specific contact reference.

---

# 56. Ingestion Data Contracts

Рекомендуется иметь schemas:

```text
data/schemas/
  collection-task.schema.json
  raw-collection-result.schema.json
  field-evidence.schema.json
  property.schema.json
  offer.schema.json
  financing-program.schema.json
  purchase-scenario.schema.json
```

---

# 57. Adapter Interface

Каждый adapter должен реализовывать единый интерфейс:

```text
discover()
collect()
refresh()
verify()
```

Не каждый source обязан поддерживать все методы.

---

# 58. Adapter Output

Adapter не пишет DB напрямую.

Он возвращает:

```text
RawCollectionResult
```

---

# 59. Pipeline Services

В будущем код можно разделить:

```text
src/
  ingestion/
    tasks/
    staging/
    validators/
    normalization/
    identity/
    evidence/
    conflicts/
    canonical/
    reprocessing/
```

---

# 60. MVP Acceptance Criteria

Ingestion Flow считается готовым, если система умеет:

1. принять raw result от OpenClaw;
2. принять API/feed result;
3. сохранить staging;
4. валидировать schema;
5. нормализовать price/area/address;
6. отличить template от concrete unit;
7. создать FieldEvidence;
8. найти существующий Property;
9. создать новый Offer для существующего Property;
10. создать новый Property;
11. обнаружить conflict;
12. не потерять raw value;
13. не создавать дубль при повторной обработке;
14. отправить ambiguous dedup в manual review;
15. обработать user URL;
16. обработать partial result;
17. заблокировать source без approved policy;
18. пересчитать derived fields;
19. присвоить matching readiness;
20. сохранить audit trail.

---

# 61. Тестовые сценарии

Минимум:

1. новая квартира от застройщика;
2. та же квартира с marketplace;
3. price conflict;
4. old offer reappears;
5. unit template;
6. user URL;
7. malformed area;
8. missing price;
9. house with utilities;
10. financing claim;
11. promotion without unit applicability;
12. partner API payload;
13. OpenClaw partial;
14. source_changed;
15. parser reprocessing.

---

# 62. Главный принцип для coding-agent

Нельзя строить:

```text
parser → UPDATE properties SET ...
```

Правильная архитектура:

```text
Source
↓
Raw Result
↓
Staging
↓
Validation
↓
Normalization
↓
Evidence
↓
Identity / Deduplication
↓
Canonical Entities
↓
Derived Data
↓
Matching Readiness
```

Главное правило:

> Raw data, normalized data, canonical data и user-facing match result — это разные уровни системы. Их нельзя смешивать в одной таблице или одном неявном объекте.
