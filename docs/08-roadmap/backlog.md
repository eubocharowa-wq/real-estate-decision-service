# Product & Engineering Backlog — MVP v1

## 1. Назначение документа

Этот документ содержит общий backlog продукта и разработки.

Backlog не является порядком выполнения.

Для последовательной реализации используются:

```text
docs/08-roadmap/implementation-plan.md
tasks/TASK-XXX.md
```

Этот файл нужен, чтобы:

- не потерять идеи;
- отделить MVP от будущих версий;
- видеть зависимости;
- не добавлять случайные функции в текущий scope.

---

# 2. Приоритеты

Используем:

- `P0` — блокирует MVP;
- `P1` — необходимо для качественного MVP;
- `P2` — важно после проверки core value;
- `P3` — будущее развитие.

---

# 3. Статусы

- `idea`
- `ready`
- `in_progress`
- `blocked`
- `done`
- `deferred`

---

# 4. EPIC A — Product Foundation

## P0

- создать `PROJECT.md`;
- создать `AGENTS.md`;
- создать `README.md`;
- зафиксировать MVP scope;
- зафиксировать product principles;
- зафиксировать primary user flows;
- создать repository conventions.

---

# 5. EPIC B — User Request

## P0

- natural-language request input;
- intent detection;
- extraction of city;
- extraction of budget;
- extraction of property type;
- extraction of finance;
- extraction of timeline;
- must/preferred detection;
- contradictions;
- unknowns;
- confirmation screen;
- edit criteria.

## P1

- material clarification questions;
- location unknown scenario;
- affordability intent;
- compare-links intent;
- expert-check intent.

## P2

- conversational request history;
- reusable saved preferences;
- behavior-suggested priority changes.

---

# 6. EPIC C — Property Data Model

## P0

- Property;
- Offer;
- Development;
- Building;
- Source;
- FieldEvidence;
- availability;
- price;
- location;
- area;
- rooms;
- floor;
- finishing;
- timeline.

## P1

- house/land fields;
- media;
- full entry cost;
- ownership basics;
- risk flags;
- data completeness.

## P2

- operating costs;
- advanced ownership details;
- deeper legal attributes.

---

# 7. EPIC D — Financing

## P0

- FinancingProgram;
- FinancingOffer;
- PurchaseScenario;
- initial payment;
- monthly payment;
- rate;
- term;
- program applicability;
- zero-down status;
- verification status.

## P1

- promotions;
- installments;
- staged rates;
- price markup;
- mandatory services;
- conflict detection.

## P2

- trade-in;
- combined financing;
- refinance;
- bank API integration.

---

# 8. EPIC E — Source & Provenance

## P0

- Source Registry;
- source IDs;
- URL provenance;
- collected_at;
- verification status;
- evidence per critical field.

## P1

- SourceSnapshot;
- conflicts;
- source trust;
- history;
- freshness policies;
- source health.

## P2

- source reputation metrics;
- upstream source graph;
- automated source quality scoring.

---

# 9. EPIC F — Deduplication

## P0

- Property vs Offer separation;
- new-build strong IDs;
- address normalization;
- duplicate candidate blocking;
- duplicate decision;
- merge without deleting Offer.

## P1

- secondary matching;
- house matching;
- manual review;
- split merge;
- audit trail.

## P2

- photo similarity;
- text embeddings;
- ML entity resolution.

---

# 10. EPIC G — Matching Engine

## P0

- hard criteria;
- soft criteria;
- Criteria Registry;
- MatchScore;
- unknown handling;
- conflict handling;
- deterministic calculation.

## P1

- DataConfidence;
- DataCompleteness;
- financial scenario matching;
- cross-type normalization;
- constraint pressure;
- relaxation suggestions.

## P2

- learning-to-rank;
- personalized utility models;
- behavior-assisted preferences.

---

# 11. EPIC H — Shortlist

## P0

Карточка:

- title;
- price;
- match%;
- top reasons;
- compromise;
- unknown;
- source freshness.

## P1

- sort;
- filters after matching;
- grouping;
- diversity;
- shortlist save.

---

# 12. EPIC I — Property Detail

## P0

- facts;
- why fits;
- compromises;
- unknowns;
- source;
- freshness;
- financing.

## P1

- evidence drill-down;
- price history;
- alternative offers;
- expert check CTA.

---

# 13. EPIC J — Comparison

## P0

- 2–4 properties;
- common comparison rows;
- match;
- price;
- payment;
- move-in;
- area;
- infrastructure;
- confidence.

## P1

- cross-type comparison;
- trade-off highlights;
- scenario-specific conclusion;
- add external URL.

## P2

- saved comparisons;
- shareable comparison.

---

# 14. EPIC K — No Results

## P0

- exact no-result state;
- hard constraint explanation;
- no silent relaxation.

## P1

- constraint pressure;
- relaxation scenarios;
- candidate count after relaxation;
- coverage gap.

---

# 15. EPIC L — User URL

## P0

- paste URL;
- source detection;
- extract minimum fields;
- manual correction;
- normalize;
- deduplicate;
- compare.

## P1

- finance extraction;
- images;
- unknown site adapter;
- confidence explanation.

## P2

- browser extension / share sheet.

---

# 16. EPIC M — Data Collection

## P0

- CollectionTask;
- RawCollectionResult;
- staging;
- validation;
- normalization handoff.

## P1

- OpenClaw adapter;
- scheduled refresh;
- targeted refresh;
- partial result;
- source_changed;
- retry;
- logs.

## P2

- distributed workers;
- self-healing parsers;
- advanced scheduling.

---

# 17. EPIC N — Pilot Sources

## P0

- access review;
- first approved developer source;
- official financing source;
- one bank source;
- geo provider decision.

## P1

- 3–5 developer sources;
- secondary partner/feed;
- house/land source.

## Blocked / Negotiation

- CIAN data access;
- Avito data access;
- Domclick data access;
- Yandex Realty partner/data channel.

---

# 18. EPIC O — Update Strategy

## P0

- freshness registry;
- stale statuses;
- refresh priority;
- change events.

## P1

- finalist refresh;
- source fallback;
- refresh queue;
- dedupe jobs;
- MatchResult recalculation.

## P2

- user notifications;
- smart refresh prediction.

---

# 19. EPIC P — Geo & Infrastructure

## P0

- normalized geo/infrastructure fields in Pilot Dataset;
- coordinates where evidence is available;
- school;
- kindergarten;
- park;
- transport basic distance;
- deterministic evaluators for supported UserRequest criteria.

## P1

- policy-approved geocoding provider;
- travel time;
- user destination;
- route mode;
- confidence/status for derived geo data.

## P2

- noise;
- ecology;
- walkability;
- advanced neighborhood scoring.

---

# 20. EPIC Q — Expert Layer

## P0

- ExpertRequest;
- property context;
- status;
- result;
- manual evidence.

## P1

- information verification;
- choice assistance;
- document review;
- onsite request.

## P2

- specialist routing automation;
- payments;
- expert marketplace;
- SLA.

---

# 21. EPIC R — Document Review

## P1

- upload;
- type detection;
- text extraction;
- clauses;
- amounts;
- dates;
- comparison with offer;
- lawyer handoff.

## P2

- clause templates;
- document version comparison;
- automatic legal workflow.

---

# 22. EPIC S — Choice Assistance

## P1

- 2–5 finalists;
- Decision Drivers;
- conditional preference;
- near tie;
- structured result.

## P2

- synchronous expert chat;
- shareable expert report.

---

# 23. EPIC T — Onsite Check

## P1

- request;
- scope;
- checklist;
- media;
- observations;
- evidence;
- result.

## P2

- scheduling;
- route planning;
- inspector network;
- payments.

---

# 24. EPIC U — Admin

## P0

- view requests;
- view properties;
- source status;
- match debugging.

## P1

- expert queue;
- manual review queue;
- dedup review;
- conflicts;
- refresh status.

## P2

- full operations dashboard;
- source analytics.

---

# 25. EPIC V — Testing

## P0

- schema tests;
- evaluator unit tests;
- hard-filter tests;
- matching determinism;
- fixtures.

## P1

- dedup benchmark;
- confidence benchmark;
- end-to-end path;
- user URL tests;
- source adapter contract tests.

## P2

- load;
- chaos source failure;
- continuous regression benchmark.

---

# 26. EPIC W — Analytics

## P1

Track:

- request completion;
- corrections;
- shortlist opened;
- comparisons;
- external URLs;
- expert requests;
- decision confidence feedback.

## P2

- cohort analysis;
- ranking experiments;
- retention;
- source contribution.

---

# 27. EPIC X — Security & Privacy

## P0

- secrets management;
- access control;
- document privacy;
- PII minimization.

## P1

- audit logs;
- expert permissions;
- retention policy;
- deletion workflow.

---

# 28. EPIC Y — Infrastructure

## P0

- PostgreSQL;
- migrations;
- application deployment;
- CI;
- logs.

## P1

- background jobs;
- queue;
- scheduled tasks;
- monitoring.

## P2

- distributed workers;
- multi-region architecture.

---

# 29. EPIC Z — Post-MVP

## P2

- personal account;
- saved searches;
- notifications;
- price change alerts;
- saved comparisons;
- repeat user profiles.

## P3

- mobile app;
- international markets;
- B2B;
- white label;
- CRM;
- transaction platform;
- full mortgage marketplace;
- investment terminal;
- behavioral recommender.

---

# 30. Explicitly Out of MVP

Не добавлять без отдельного решения:

- агентский CRM;
- автоматическое банковское одобрение;
- собственную ипотечную витрину банков;
- electronic registration;
- transaction escrow;
- nationwide full coverage;
- international property;
- social feed;
- community;
- recommendation based on hidden behavioral profiling;
- fully autonomous AI realtor;
- marketplace of agents.

---

# 31. Technical Debt Backlog

## P1

- schema version migration strategy;
- data retention;
- parser version audit;
- fixture management;
- source adapter abstraction.

## P2

- job queue scaling;
- caching policy;
- database partitioning;
- search indexing.

---

# 32. Research Backlog

## P1

- source access agreements;
- geo provider licensing;
- real buyer benchmark;
- financing source reliability;
- secondary market legal/data strategy.

## P2

- investment criteria;
- outcome feedback;
- liquidity models;
- total cost of ownership.

---

# 33. Product Research Backlog

- какие формулировки USP лучше понимаются;
- нужен ли MatchScore как число или диапазон;
- сколько объектов оптимально в shortlist;
- как лучше показывать unknown;
- какой экспертный CTA работает без ощущения агентства;
- как пользователи воспринимают cross-type comparison.

---

# 34. Data Research Backlog

- какие поля чаще всего отсутствуют;
- какие sources чаще конфликтуют;
- какие finance claims чаще оказываются неприменимыми;
- какой freshness реально нужен;
- false merge rate.

---

# 35. Matching Research Backlog

- веса criteria;
- soft curves;
- confidence bands;
- ranking treatment of low-confidence candidates without modifying Match Score;
- diversity rules.

Все изменения должны проверяться на benchmark.

---

# 36. Decision Log Needed

Для важных backlog decisions желательно вести:

```text
docs/decisions/
```

Пример:

```text
ADR-001-property-offer-separation.md
ADR-002-match-confidence-separation.md
ADR-003-source-access-policy.md
```

---

# 37. Task Promotion

Backlog item становится implementation task только если:

- понятна цель;
- есть зависимости;
- есть acceptance criteria;
- он входит в текущий milestone.

---

# 38. Backlog Hygiene

Раз в milestone:

- закрывать done;
- переносить deferred;
- удалять дубли;
- не превращать backlog в список фантазий без приоритетов.

---

# 39. MVP Definition of Done

MVP backlog считается закрытым, когда пользователь может:

1. описать задачу;
2. подтвердить критерии;
3. получить shortlist;
4. понять match;
5. увидеть unknowns;
6. сравнить;
7. добавить URL;
8. запросить проверку;
9. использовать данные с provenance;
10. пройти сценарий без участия разработчика.

---

# 40. Главный принцип для coding-agent

Backlog не является разрешением реализовать всё подряд.

Coding-agent работает только по конкретной `TASK-XXX.md`.

Если backlog содержит идею, но задача не создана:

```text
не реализовывать самостоятельно
```

Главное правило:

> Не добавлять функции «раз уж это легко». Каждая функция должна защищать основной пользовательский сценарий или быть явно включена в текущий milestone.
