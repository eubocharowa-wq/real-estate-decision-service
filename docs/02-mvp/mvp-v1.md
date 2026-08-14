# MVP v1

## Status

`approved_for_repository`

## Product

**Real Estate Decision Service**

---

# 1. MVP Goal

MVP v1 должен доказать основную ценность продукта:

> **Человек может описать свою задачу обычными словами и получить несколько реально подходящих вариантов недвижимости с объяснением, почему они ему подходят и чем отличаются друг от друга.**

MVP не должен доказывать полноту рынка, масштаб source coverage или готовность к массовому production launch.

Он должен доказать:

- понятность core buyer journey;
- корректность UserRequest interpretation;
- работоспособность deterministic matching;
- полезность shortlist;
- ценность cross-type comparison;
- прозрачность unknown/conflict;
- возможность добавить свой вариант;
- необходимость и полезность expert verification.

---

# 2. Core MVP Journey

Минимальный путь пользователя:

```text
Описать задачу
→ Проверить, правильно ли сервис понял условия
→ Получить shortlist
→ Открыть объект
→ Понять fit / strengths / compromises / unknowns
→ Сравнить 2–4 варианта
→ Добавить свой URL при необходимости
→ Передать конкретный вопрос на экспертную проверку
→ Получить обновлённый decision context
```

---

# 3. MVP Entry Point

Главный entry point:

```text
Свободное текстовое описание задачи
```

Пример:

```text
Найти пять квартир до 5 млн,
семейная ипотека обязательна,
желательно без первоначального взноса,
первый этаж не рассматриваю.
```

Сервис должен преобразовать текст в structured `UserRequest`.

---

# 4. UserRequest Confirmation

До matching пользователь должен увидеть:

```text
Проверьте, правильно ли мы вас поняли
```

Минимум:

- must criteria;
- preferred criteria;
- avoid/exclude;
- unknowns;
- contradictions;
- 1–3 material clarifications при необходимости.

Пользователь должен иметь возможность:

- изменить значение;
- изменить priority;
- удалить criterion;
- подтвердить request.

---

# 5. MVP Search Model

MVP не строится вокруг полного live crawl рынка.

Рабочая модель:

```text
Pilot Dataset / approved source data
→ normalization
→ matching
```

Дополнительно:

```text
User URL
→ policy gate
→ allowed ingestion / manual fallback
→ normalized candidate
→ same matching pipeline
```

---

# 6. Shortlist

После подтверждения UserRequest пользователь получает небольшой shortlist.

Цель:

```text
5–10 релевантных вариантов
```

Каждый card должен показывать минимум:

```text
property
price / price_from
Match Score
Data Confidence
2–3 strengths
1–2 compromises
critical unknown if any
availability / freshness summary
selected PurchaseScenario summary
```

---

# 7. Match Score

Match Score в MVP:

- персональный;
- deterministic;
- объяснимый;
- user-specific;
- independent from commercial influence.

Он не является:

```text
универсальным рейтингом объекта
```

---

# 8. Data Confidence

Отдельно показывается:

```text
Data Confidence
```

Чтобы пользователь видел:

```text
насколько подходит
```

и отдельно:

```text
насколько надёжны данные
```

---

# 9. Unknowns and Conflicts

MVP должен честно поддерживать:

```text
unknown
claimed
unconfirmed
conflicting
stale
confirmed
```

Особенно для:

- price;
- availability;
- financing;
- promotions;
- handover;
- utilities.

---

# 10. Property Detail

MVP Property Detail должен отвечать:

```text
Что это?
Почему подходит мне?
Где компромисс?
Какой сценарий покупки используется?
Что подтверждено?
Что неизвестно?
Что нужно проверить?
Откуда данные?
```

Это decision page, а не расширенная карточка объявления.

---

# 11. Comparison

MVP comparison:

```text
2–4 Property
```

Сравнение идёт по UserRequest first.

Показывать:

- must criteria;
- preferred;
- avoid;
- Match Score;
- Data Confidence;
- financing;
- timing;
- cross-type common dimensions;
- critical unknowns;
- conflicts;
- decision drivers;
- trade-offs.

---

# 12. Cross-type MVP

MVP должен позволять сравнивать минимум:

```text
new-build apartment
secondary apartment
house
```

если Pilot Dataset содержит такие варианты.

Не обязательно достигать полного feature parity по всем property types.

Главное — доказать архитектурную возможность сравнивать разные типы на общих decision dimensions.

---

# 13. Financing MVP

Financing является отдельным decision layer.

MVP должен различать:

```text
Property
Offer
PurchaseScenario
```

Минимум:

- listing price;
- initial payment;
- monthly payment;
- program;
- rate structure;
- term;
- promo/claim status;
- compatibility.

---

# 14. No Frankenstein Scenario

MVP не должен создавать artificial scenario из несовместимых данных разных Offer.

---

# 15. User URL Ingestion

Пользователь может:

```text
Добавить свой вариант
```

Flow:

```text
URL
→ validation
→ source identification
→ policy gate
→ allowed ingestion or manual fallback
→ normalization
→ matching
→ comparison
```

---

# 16. Source Policy MVP

MVP должен иметь централизованный Source Registry / Policy Engine.

Источник не считается usable только потому, что URL технически доступен.

---

# 17. OpenClaw MVP Role

OpenClaw допустим как:

```text
Collector / browser agent
```

для approved PoC source.

Он не является обязательной частью core MVP.

---

# 18. Expert Layer MVP

Экспертный слой нужен для material unknown/conflict.

MVP поддерживает минимум:

```text
information_verification
choice_assistance
consultation
onsite_check hook
document_review hook
```

Полный document/onsite workflow может быть partially manual, если contracts и context flow работают.

---

# 19. Expert Context

ExpertRequest должен передавать:

- UserRequest;
- Property;
- Offer;
- PurchaseScenario;
- MatchResult;
- DataQuality;
- unknowns;
- conflicts;
- evidence refs;
- user question.

---

# 20. Expert Result

ExpertResult должен быть structured:

- checked items;
- confirmed;
- unconfirmed;
- conflicts;
- findings;
- risks;
- recommendations;
- evidence;
- next actions.

Если expert evidence меняет факт:

```text
Evidence update
→ DataQuality recompute
→ Match recompute
```

---

# 21. MVP Data Model

Core entities:

```text
UserRequest
Property
Offer
FinancingProgram
FinancingOffer
Promotion
PropertyFinancingEligibility
PurchaseScenario
Source
SourceSnapshot
FieldEvidence
SourceConflict
MatchResult
Criterion
CriterionEvaluationResult
DataQuality
ExpertRequest
ExpertResult
```

---

# 22. MVP Matching Pipeline

```text
Confirmed UserRequest
→ Hard criteria
→ PurchaseScenario eligibility
→ Soft criteria
→ Match Score
→ Critical unknowns/conflicts
→ Data Confidence
→ Shortlist
```

---

# 23. Hard Criteria

MVP rule:

```text
confirmed hard fail
→ excluded from primary shortlist
```

Unknown hard criterion:

```text
critical unknown
```

Не silently pass и не silently fail.

---

# 24. Soft Criteria

Soft criteria дают comparative fit.

Unknown/not_applicable не должны искусственно ухудшать denominator без explicit semantics.

---

# 25. Explanation

MVP explanations:

- deterministic;
- code-based;
- reusable;
- user-facing;
- without LLM dependency.

LLM может быть подключён позже для wording enhancement.

---

# 26. MVP Source Data Strategy

MVP работает на:

```text
synthetic Pilot Dataset
+
manual curated records
+
approved PoC source
+
user-supplied candidates
```

если corresponding gates разрешены.

---

# 27. Pilot Dataset

Минимум ориентир:

```text
30–50 Property
40–70 Offer
```

С cross-type mix и edge cases:

- duplicate clusters;
- false-positive similar objects;
- price conflicts;
- stale data;
- claimed financing;
- multi-offer properties;
- house utility unknowns.

---

# 28. Geography

Pilot geography может быть ограничена внутренне.

Но:

```text
city != hardcoded product identity
```

Core architecture остаётся universal.

---

# 29. MVP User Types

Primary:

```text
private residential buyer
```

Поддерживаемые scenarios:

- first-time buyer;
- family buyer;
- financing-sensitive buyer;
- cross-type buyer;
- existing-options buyer;
- near-decision buyer.

---

# 30. MVP Does Not Need Full Account System

Если auth не нужна для core journey:

допустим:

```text
anonymous session
```

с session-scoped persistence.

---

# 31. MVP Persistence

Допустимо начать с repository abstractions / in-memory fixture implementation.

Production DB не является prerequisite для первых product tests, если contracts не зависят от temporary implementation.

---

# 32. MVP Tech Direction

Рабочее направление:

```text
Next.js
React
TypeScript
PostgreSQL / Supabase later or where needed
OpenAI API optional
OpenClaw optional collector
Vercel
```

---

# 33. MVP UI Screens

Минимум:

```text
1. Request Entry
2. Request Confirmation
3. Shortlist
4. Property Detail
5. Comparison
6. Add User URL
7. Expert Request
8. Expert Result
```

Internal:

```text
9. Expert Workbench
```

---

# 34. MVP Navigation Principle

Не жёсткий wizard.

Пользователь должен уметь:

- вернуться к условиям;
- открыть detail;
- вернуться в shortlist;
- менять comparison;
- добавить ссылку;
- не пользоваться expert layer.

---

# 35. MVP No-results State

Если ни один объект не проходит hard criteria:

не ослаблять условия автоматически.

Показывать:

```text
По подтверждённым обязательным условиям подходящих вариантов не найдено.
```

Дальше:

```text
Изменить условия
```

---

# 36. Coverage Gap State

Если причина — недостаток данных:

показывать это отдельно.

Не говорить:

```text
на рынке ничего нет
```

---

# 37. MVP Refresh

Refresh layer должен уметь:

- определить stale/critical field;
- поставить targeted refresh;
- пройти Source Policy;
- обновить evidence;
- инициировать recompute.

Full distributed scheduler не нужен.

---

# 38. MVP Security Minimum

Обязательно:

- SSRF protection для User URL;
- source policy gate;
- no secrets in repo;
- safe external links;
- expert access boundary;
- no sensitive telemetry dump;
- fail-closed source permissions.

---

# 39. MVP Privacy Minimum

Не собирать лишние PII.

Особенно:

- raw financing data;
- documents;
- household details;
- expert context.

Analytics — только safe structured metadata.

---

# 40. MVP Telemetry

Минимум events:

```text
request_submitted
request_confirmed
matching_completed
shortlist_viewed
property_opened
comparison_viewed
expert_request_created
expert_result_viewed
decision_recomputed
feedback_submitted
```

---

# 41. MVP Feedback

Ключевые вопросы:

```text
Сервис правильно понял, что для вас важно?
```

```text
Есть ли в shortlist варианты, которые вы реально готовы рассматривать?
```

```text
Стало ли понятнее после сравнения?
```

```text
Понятно ли, какие данные требуют проверки?
```

```text
Теперь мне понятнее, что мне стоит покупать.
```

---

# 42. MVP Success Criteria

MVP считается продуктово успешным, если пользователь:

1. описывает задачу без длинной анкеты;
2. корректирует interpretation при необходимости;
3. получает небольшой relevant shortlist;
4. понимает, почему объект подходит;
5. понимает compromises;
6. различает Match и Confidence;
7. видит unknown/conflict;
8. использует comparison для сокращения alternatives;
9. может добавить свой вариант;
10. может запросить экспертную проверку;
11. после journey сообщает, что решение стало понятнее.

---

# 43. MVP Technical Success

Минимум:

```text
typecheck passes
lint passes
tests pass
build passes
golden buyer journey passes
pilot regression passes
```

---

# 44. Out of Scope — Product

MVP не включает:

- mobile app;
- B2B;
- agency CRM;
- developer white-label;
- subscriptions;
- full transaction workflow;
- e-registration;
- marketplace of experts;
- own mortgage marketplace;
- automatic bank approval;
- nationwide complete coverage;
- all-source automation;
- AI-chat-only UX;
- universal district ranking;
- investment analytics;
- full document management;
- full onsite logistics.

---

# 45. Out of Scope — Data

MVP не обещает:

```text
all listings
all cities
all sources
live freshness everywhere
```

---

# 46. Out of Scope — Matching

MVP не должен включать:

- hidden ML ranking;
- behavioral personalization;
- collaborative filtering;
- commercial boosts;
- black-box recommendation;
- universal quality score.

---

# 47. Out of Scope — Financing

MVP не выдаёт:

```text
bank approval
guaranteed mortgage eligibility
```

---

# 48. Out of Scope — Legal

MVP не выдаёт автоматическое:

```text
legal opinion
```

---

# 49. Out of Scope — Technical Inspection

Visual onsite check не заменяет:

```text
technical inspection
```

---

# 50. MVP Release Gates

Перед real buyer pilot:

```text
build green
core regression green
golden journey green
source policies reviewed
pilot data validated
synthetic/live separated
security guards checked
privacy reviewed
feature flags reviewed
known limitations documented
rollback ready
```

---

# 51. MVP Product Invariants

Обязательные:

```text
UserRequest first
Property != Offer
Financing != Property
Unknown != false
Claimed != confirmed
Match != Confidence
No Frankenstein Scenario
No source action without policy
No expert result without provenance
No commercial bias
```

---

# 52. MVP Definition of Done

MVP v1 Done, когда controlled buyer journey реально проходит:

```text
Описал задачу
→ подтвердил условия
→ получил shortlist
→ понял fit/reasons/unknowns
→ сравнил финалистов
→ добавил свой вариант при необходимости
→ запросил конкретную expert check
→ получил structured result
→ увидел updated decision
```

и все ключевые product invariants сохраняются.

---

# 53. Final MVP Statement

> **MVP v1 — это не минимальный каталог недвижимости. Это минимально полноценный decision loop, который доказывает, что сервис способен превратить сложную пользовательскую задачу в несколько понятных вариантов, объяснить выбор, показать неопределённость и обновить решение после проверки.**
