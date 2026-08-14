# MVP Scope

## Status

`approved_for_repository`

## Product

**Real Estate Decision Service**

---

# 1. Purpose

Этот документ фиксирует **границы MVP v1**.

Он отвечает на четыре вопроса:

1. Что обязательно входит в MVP?
2. Что допустимо упростить?
3. Что сознательно не входит в MVP?
4. Какие ограничения нельзя «временно» обходить ради скорости разработки?

Если функция не перечислена как обязательная или явно допустимая для MVP, coding-agent не должен добавлять её автоматически.

---

# 2. MVP Scope Formula

MVP должен доказать один законченный decision loop:

```text
Пользователь описал задачу
→ сервис понял и подтвердил условия
→ подобрал несколько вариантов
→ объяснил fit / compromises / unknowns
→ позволил сравнить финалистов
→ позволил добавить свой вариант
→ при необходимости подключил expert verification
→ обновил decision context после проверки
```

MVP не должен доказывать:

```text
масштаб
полноту рынка
национальное покрытие
автоматизацию всех источников
полный transaction lifecycle
```

---

# 3. Core User Scope

Основной пользователь:

```text
private residential buyer
```

MVP должен поддерживать минимум следующие сценарии:

```text
selection
comparison
financing-sensitive selection
cross-type selection
existing-links comparison
selected-property verification
```

---

# 4. User Request Scope

В MVP пользователь может описать задачу обычными словами.

Поддерживаемые категории условий:

```text
intent
goal
location
property type
budget
financing
timeline
household
lifestyle
infrastructure
property features
avoid/exclude conditions
```

---

# 5. Request Priority Scope

Поддерживаемые priorities:

```text
must
preferred
neutral
avoid
exclude
unknown
```

MVP обязан различать:

```text
обязательное условие
```

и:

```text
желательное условие
```

---

# 6. Clarification Scope

MVP допускает:

```text
1–3 material clarifications
```

если без них невозможно корректно интерпретировать high-impact condition.

Не входит:

```text
длинная многоэкранная анкета
```

---

# 7. Confirmation Scope

Пользователь должен иметь возможность:

- увидеть structured interpretation;
- исправить значение;
- изменить priority;
- удалить criterion;
- разрешить contradiction;
- подтвердить UserRequest.

До подтверждения request не считается основанием для final matching.

---

# 8. Property Types in MVP

Минимально поддерживаемые типы для проверки cross-type architecture:

```text
apartment_new_build
apartment_secondary
house
```

Допустимо включить fixtures:

```text
townhouse
land
```

если schemas уже поддерживают их.

Но полноценная UX/domain глубина для них не является обязательной MVP requirement.

---

# 9. Geography Scope

Pilot может использовать ограниченную географию.

Но MVP core не должен быть hardcoded под конкретный город.

География передаётся через:

```text
UserRequest
Source coverage
Pilot Dataset
```

---

# 10. Data Scope

MVP работает на комбинации:

```text
synthetic Pilot Dataset
manual curated data
approved PoC source data
user-supplied candidate data
expert-supplied evidence
```

в зависимости от environment и policy gates.

---

# 11. Pilot Dataset Scope

Целевой объём:

```text
30–50 Property
40–70 Offer
```

Dataset должен покрывать:

- new builds;
- secondary apartments;
- houses;
- multiple Offer per Property;
- duplicates;
- price conflicts;
- stale values;
- financing claims;
- unknown utilities;
- different confidence states.

---

# 12. Source Coverage Scope

MVP не обязан иметь полный рынок.

Он обязан:

- знать активные источники;
- знать их policy;
- понимать coverage;
- отличать no-result от coverage gap;
- показывать ограничения честно.

---

# 13. Source Registry Scope

MVP включает:

```text
Source Registry
Source Policy Engine
```

Минимальные policy dimensions:

```text
access
automation
storage
display
refresh
attribution
allowed collection methods
environment approval
```

---

# 14. Source Adapter Scope

Для MVP достаточно:

```text
one approved source adapter PoC
```

если source policy позволяет.

Если approval отсутствует:

adapter framework может быть готов,
а live execution остаётся blocked.

---

# 15. OpenClaw Scope

OpenClaw:

```text
optional collector implementation
```

Не входит в обязательный core runtime MVP.

Он может использоваться для approved targeted collection.

---

# 16. User URL Scope

Пользователь может вставить URL найденного объекта.

MVP должен:

```text
validate
identify source
check policy
automatically ingest if allowed
or use manual fallback
normalize
match
add to comparison
```

---

# 17. User URL Limitations

MVP не обещает:

```text
automatic parsing of any website
```

Restricted/unknown source может перейти в:

```text
manual confirmation
```

---

# 18. Domain Model Scope

Обязательные core entities:

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
Criterion
CriterionEvaluationResult
MatchResult
DataQuality
ExpertRequest
ExpertResult
```

---

# 19. Property / Offer Scope

MVP обязан сохранять разделение:

```text
Property != Offer
```

Physical object data и commercial offer data не могут храниться как один безразличный listing record.

---

# 20. Financing Scope

MVP включает:

- mortgage-related conditions;
- down payment;
- monthly payment;
- program;
- rate;
- term;
- promotions;
- eligibility claims;
- selected PurchaseScenario.

---

# 21. Financing Limitations

MVP не включает:

- банковское одобрение;
- полноценную pre-approval process;
- собственный mortgage marketplace;
- автоматическую заявку в банки;
- гарантии financing eligibility.

---

# 22. PurchaseScenario Scope

Для каждого сравниваемого объекта можно иметь конкретный compatible scenario.

Сценарий может включать:

```text
price
initial payment
loan amount
monthly payment
rate periods
term
mandatory costs
promotion
validity
assumptions
verification
```

---

# 23. No Frankenstein Scope Rule

Запрещено в MVP и после MVP:

```text
mix incompatible Offer/financing terms
```

Это core invariant, а не временное ограничение.

---

# 24. Matching Scope

MVP Matching Engine включает:

```text
hard criteria gate
scenario eligibility
soft criteria evaluation
Match Score
strengths
compromises
hard failures
critical unknowns
conflicts
```

---

# 25. Match Score Scope

Match Score:

```text
0–100
```

или эквивалентный normalized representation.

Он:

- user-specific;
- deterministic;
- explainable;
- versioned.

---

# 26. Matching Out of Scope

Не входят:

- ML ranking;
- behavioral personalization;
- collaborative filtering;
- paid boosts;
- universal property ranking;
- LLM-defined score.

---

# 27. Data Confidence Scope

MVP включает отдельный `DataQuality` / confidence layer.

Минимум:

```text
confidence
completeness
freshness
critical unknowns
conflicts
recommended checks
```

---

# 28. Confidence Scope Rule

Строго:

```text
Match Score != Data Confidence
```

Нельзя скрыто объединять эти значения.

---

# 29. Shortlist Scope

MVP shortlist:

```text
5–10 relevant candidates
```

Минимум card:

- identity;
- price;
- Match Score;
- Data Confidence;
- strengths;
- compromises;
- critical unknowns;
- selected purchase scenario;
- freshness/availability.

---

# 30. Shortlist Out of Scope

Не входят:

- infinite scroll;
- hundreds of results;
- advanced portal filters;
- paid placements;
- map-first browsing;
- generic sort by popularity.

---

# 31. Property Detail Scope

MVP detail page включает:

```text
decision summary
match
confidence
criteria results
property facts
selected offer
purchase scenario
unknowns
conflicts
recommended checks
provenance
freshness
alternative offers
```

---

# 32. Property Detail Out of Scope

Не обязательны:

- rich photo gallery;
- virtual tours;
- map exploration;
- seller chat;
- transaction CTA;
- full developer microsite.

---

# 33. Comparison Scope

MVP сравнивает:

```text
2–4 Property
```

По:

- must;
- preferred;
- avoid;
- finance;
- timing;
- location;
- property fit;
- confidence;
- unknowns;
- decision drivers;
- trade-offs.

---

# 34. Comparison Conclusion Scope

Допустимые statuses:

```text
clear_leader
conditional_leader
near_tie
insufficient_data
no_valid_option
```

MVP не обязан всегда выбирать winner.

---

# 35. Comparison Out of Scope

Не входят:

- 10+ объектов одновременно;
- complex spreadsheet-like editor;
- custom user columns;
- export to Excel/PDF as core functionality;
- public share links.

---

# 36. Expert Request Scope

MVP поддерживает contextual ExpertRequest.

Минимальные request types:

```text
information_verification
choice_assistance
consultation
document_review hook
onsite_check hook
transaction_question hook
```

---

# 37. Expert Workbench Scope

Internal expert UI должен позволять:

- видеть Context Package;
- видеть user question;
- отмечать checked/not checked;
- фиксировать findings;
- создавать ExpertResult;
- добавлять evidence refs;
- завершать request.

---

# 38. Expert Result Scope

Пользователь видит:

```text
что проверяли
что подтвердилось
что не подтвердилось
что осталось неизвестным
что изменилось в decision context
что делать дальше
```

---

# 39. Expert Workflow Limitations

Не входят:

- full CRM;
- expert marketplace;
- payments;
- chat;
- video;
- full appointment scheduling;
- external expert directory;
- complex role management.

---

# 40. Document Review Scope

MVP включает:

```text
request/context/result contract
```

Полноценный document ingestion/OCR/legal workflow не обязателен.

---

# 41. Onsite Scope

MVP включает:

```text
request hook
structured result contract
```

Full logistics/scheduling/photo pipeline не обязателен.

---

# 42. Refresh Scope

MVP включает:

```text
RefreshTask
priority
dedup
policy gate
targeted refresh
retry
source health
recompute hook
```

---

# 43. Refresh Out of Scope

Не входят:

- distributed queue;
- complex scheduler;
- Kafka/SQS requirement;
- aggressive crawling;
- multi-region workers.

---

# 44. Persistence Scope

Допустимо использовать:

```text
repository interfaces
in-memory implementation
fixture-backed implementation
```

до появления production persistence.

---

# 45. Production Database Scope

PostgreSQL/Supabase — рабочее направление, но полноценный production DB rollout не является prerequisite для первых integration tests, если contracts стабильны.

---

# 46. Authentication Scope

MVP может работать:

```text
anonymous/session-based
```

если это не мешает core journey.

Полный account system не обязателен.

---

# 47. Internal Access Scope

Expert/internal routes должны иметь хотя бы fail-closed access abstraction.

Полный RBAC не обязателен.

---

# 48. Analytics Scope

MVP включает vendor-neutral telemetry.

Минимум:

```text
journey events
errors
feedback
pilot outcomes
```

---

# 49. Analytics Out of Scope

Не обязательны:

- full BI;
- CDP;
- marketing attribution;
- ad tracking;
- behavioral personalization.

---

# 50. Feedback Scope

Минимум:

```text
request understanding
shortlist relevance
comparison helpfulness
confidence clarity
expert usefulness
decision clarity
```

---

# 51. Pilot Scope

MVP должен быть готов к controlled real buyer pilot.

Пилот:

```text
limited cohort
limited source coverage
controlled feature flags
known limitations
release gate
rollback
```

---

# 52. Real Buyer Pilot Scope

Первая волна может быть:

```text
3–5 real users
```

Дальнейшее расширение — только после review.

---

# 53. Pilot Out of Scope

Не:

```text
public unrestricted launch
mass acquisition
national rollout
```

---

# 54. Security Scope

Обязательный минимум:

```text
SSRF protection
source policy gate
secret hygiene
safe redirects
content type limits
response size limits
timeouts
safe external links
expert access boundary
sensitive telemetry minimization
```

---

# 55. Privacy Scope

MVP должен применять data minimization.

Не собирать PII без необходимости.

Особенно:

- financing;
- household;
- documents;
- expert free-text;
- user-provided URLs.

---

# 56. Accessibility Scope

Все core screens:

- semantic;
- keyboard-accessible;
- status not color-only;
- readable on mobile.

WCAG certification не является MVP requirement, но basic accessibility обязательна.

---

# 57. Mobile Scope

MVP — responsive web.

Не native app.

Core buyer journey должен работать на mobile browser.

---

# 58. Map Scope

Полноценная map-centric experience:

```text
out of scope MVP
```

Location summary/distance data могут использоваться в matching, если данные доступны.

---

# 59. Notifications Scope

Email/push/SMS notifications:

```text
out of scope
```

если только они не понадобятся для минимального pilot expert flow; в таком случае — отдельная TASK.

---

# 60. Transaction Scope

Не входят:

- reservation;
- deposits;
- payment;
- e-sign;
- registration;
- seller communication workflow;
- contract execution.

---

# 61. Commercial Model Scope

MVP не обязан реализовывать monetization.

Не нужно добавлять:

- subscriptions;
- lead fees;
- sponsored ranking;
- commissions.

---

# 62. B2B Scope

Не входят:

```text
agency CRM
developer cabinet
bank cabinet
white-label
partner portal
```

---

# 63. International Scope

Architecture может быть extensible.

Но:

```text
international localization
multi-currency
multi-jurisdiction rules
```

не входят в MVP.

---

# 64. Investment Scope

Advanced investment analytics:

```text
yield
IRR
rental forecast
exit liquidity
```

не входят.

---

# 65. AI Scope

AI допустим для:

- natural-language parsing;
- explanation wording;
- preliminary text structuring.

Но deterministic validation обязателен.

---

# 66. AI Out of Scope

AI не должен:

- set Match Score;
- confirm factual truth;
- infer legal cleanliness;
- grant mortgage eligibility;
- bypass source policy;
- resolve conflicts without evidence.

---

# 67. MVP Performance Scope

Pilot Dataset scale:

```text
50–100 candidates
```

должен обрабатываться быстро без external network dependency в matching path.

---

# 68. MVP Reliability Scope

Core journey должен иметь controlled:

- loading;
- empty;
- partial;
- error;
- stale;
- blocked;
- retry states.

---

# 69. No Dead Ends Scope Rule

Каждый recoverable state должен иметь действие:

```text
edit request
retry
add manually
return to shortlist
request verification
```

---

# 70. MVP Feature Priority

## P0

```text
UserRequest parsing
confirmation
core schemas
criteria registry
matching
confidence
pilot dataset
shortlist
detail
comparison
user URL
source policy
expert request
E2E journey
pilot hardening
```

## P1

```text
expert workbench UX refinement
better refresh orchestration
pilot reporting
source PoC expansion after approval
```

## P2+

```text
advanced maps
accounts
saved searches
notifications
B2B
monetization
investment tools
```

---

# 71. Scope Change Rule

Если в ходе реализации появляется новая функция:

coding-agent должен спросить:

```text
Она нужна для acceptance текущей TASK?
```

Если нет:

```text
out of scope
```

и вынести в backlog.

---

# 72. Scope Protection Against “Easy Additions”

Запрещён подход:

```text
«Раз уже делаем карточку, давайте сразу добавим чат, избранное и карту».
```

Даже маленькая функция создаёт:

- новые states;
- новые contracts;
- новые UX expectations;
- новые test obligations.

---

# 73. Scope Protection Against Portal Drift

Следующие функции особенно требуют отдельного product justification:

- catalog homepage;
- infinite listing feed;
- generic filters;
- saved favorites;
- ad placements;
- seller contact;
- popularity rankings.

Они легко превращают продукт в обычный портал.

---

# 74. MVP Completion Boundary

MVP считается функционально завершённым не когда:

```text
есть много экранов
```

а когда работает один полный decision loop.

---

# 75. Definition of MVP Scope Complete

Scope MVP закрыт, если:

1. UserRequest создан и подтверждён;
2. matching работает;
3. shortlist релевантен;
4. Detail объясняет решение;
5. Comparison сокращает alternatives;
6. unknown/conflict прозрачны;
7. User URL можно привести в общий pipeline;
8. expert question получает context;
9. ExpertResult возвращается как evidence;
10. decision пересчитывается;
11. core security/source policy gates работают;
12. product можно безопасно дать pilot users.

---

# 76. Final Scope Statement

> **MVP v1 — это минимально полноценная система принятия решения о недвижимости. В неё входит только то, что необходимо, чтобы пройти путь от сложной пользовательской задачи до объяснимого shortlist, сравнения, проверки спорных фактов и обновлённого решения. Всё, что не усиливает этот loop напрямую, остаётся за пределами MVP.**
