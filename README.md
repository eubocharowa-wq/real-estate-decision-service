# Real Estate Decision Service

Сервис для подбора и сравнения недвижимости **под конкретную жизненную задачу пользователя**, а не очередной каталог объявлений.

Рабочая продуктовая формула:

> **Мы не помогаем искать объявления. Мы помогаем выбрать недвижимость.**

---

## Product Idea

Пользователь описывает задачу обычным языком:

```text
«Найди пять квартир до 5 млн,
семейная ипотека обязательна,
желательно без первоначального взноса».
```

Сервис:

```text
понимает условия
→ структурирует требования
→ ищет по подключённым источникам
→ нормализует данные
→ убирает дубли
→ рассчитывает соответствие
→ объясняет почему
→ позволяет сравнить
→ предлагает проверку, если она действительно нужна
```

---

## Key Product Principles

- user task first;
- cross-source data;
- Property и Offer разделены;
- Match Score персональный и объяснимый;
- Data Confidence показывается отдельно;
- unknown не скрывается;
- реклама не считается автоматически подтверждённым фактом;
- AI не является источником factual data;
- expert layer подключается только при необходимости.

---

## MVP

MVP должен позволять:

1. описать задачу естественным языком;
2. подтвердить интерпретацию;
3. получить shortlist 5–10 вариантов;
4. увидеть процент соответствия;
5. понять причины и компромиссы;
6. увидеть неподтверждённые данные;
7. сравнить 2–4 объекта;
8. добавить собственную ссылку;
9. запросить экспертную проверку.

---

## Repository Structure

```text
real-estate-decision-service/
│
├── README.md
├── PROJECT.md
├── AGENTS.md
│
├── docs/
│   ├── 01-product/
│   ├── 02-mvp/
│   ├── 03-ux/
│   ├── 04-data/
│   ├── 05-matching/
│   ├── 06-data-collection/
│   ├── 07-expert-services/
│   └── 08-roadmap/
│
├── data/
│   ├── examples/
│   └── schemas/
│
├── prompts/
│   └── agent-context/
│
├── tasks/
│   ├── TASK-001.md
│   └── ...
│
└── app/
```

---

## Start Here

Перед разработкой читать:

1. [`PROJECT.md`](PROJECT.md)
2. [`AGENTS.md`](AGENTS.md)
3. текущую задачу из `tasks/`
4. связанные документы из `docs/`

### Documentation Map

- `docs/01-product/` — vision, USP, audience, product principles;
- `docs/02-mvp/` — MVP v1, scope, success criteria;
- `docs/03-ux/` — user flows, screens, edge cases;
- `docs/04-data/` — domain/data models;
- `docs/05-matching/` — criteria, matching, confidence;
- `docs/06-data-collection/` — source policy, collection and refresh;
- `docs/07-expert-services/` — expert layer and service boundaries;
- `docs/08-roadmap/` — implementation plan, backlog and repository audit.

`data/`, `prompts/` и application scaffold являются implementation directories и создаются соответствующими задачами (`TASK-001`, `TASK-002`, `TASK-005`) по мере реализации.

---

## Core Architecture

```text
UserRequest
      ↓
Search / Connected Sources
      ↓
Raw Data
      ↓
Normalization
      ↓
FieldEvidence / Provenance
      ↓
Deduplication
      ↓
Canonical Property + Offers
      ↓
Purchase Scenarios
      ↓
Matching Engine
      ↓
MatchScore + DataConfidence
      ↓
Explanation
      ↓
Comparison
      ↓
Expert Verification if needed
```

---

## Important Domain Separation

### Property

Физический объект недвижимости.

### Offer

Коммерческое предложение по объекту.

### Purchase Scenario

Конкретный способ купить Offer.

### Source / FieldEvidence

Откуда получен конкретный факт и насколько он подтверждён.

### MatchResult

Насколько объект подходит конкретному UserRequest.

---

## Matching

Нельзя рассчитывать соответствие через свободный LLM-ranking.

Правильно:

```text
Hard Criteria
→ Purchase Scenario Eligibility
→ Soft Criteria
→ Match Score
→ Data Confidence
→ Explanation
```

---

## Data Collection

OpenClaw используется как data collection/browser agent.

Он не:

- определяет лучший объект;
- назначает Match Score;
- подтверждает рекламные обещания;
- merge duplicates самостоятельно.

---

## Source Policy

Production source integration требует проверки:

- access;
- storage;
- display;
- refresh;
- attribution.

HTML scraping не считается допустимым только потому, что технически возможен.

---

## Expert Services

Экспертный слой:

- information verification;
- document review;
- choice assistance;
- onsite check.

ExpertResult должен возвращаться в общую evidence/confidence architecture.

---

## Roadmap

Основной implementation plan:

[`docs/08-roadmap/implementation-plan.md`](docs/08-roadmap/implementation-plan.md)

Product & engineering backlog:

[`docs/08-roadmap/backlog.md`](docs/08-roadmap/backlog.md)

---

## Development Workflow

```text
TASK-XXX.md
↓
Read PROJECT.md + AGENTS.md
↓
Implement
↓
Tests
↓
Build
↓
Review acceptance criteria
↓
Commit
```

---

## Technology Direction

Рабочее направление MVP:

- Next.js;
- React;
- TypeScript;
- PostgreSQL;
- Supabase optional;
- OpenAI API;
- Vercel;
- OpenClaw / source adapters.

Финальный выбор отдельных библиотек делается в implementation tasks.

---

## Current Status

Продуктовая, архитектурная, data, matching, source, expert и UX-документация подготовлена. Последовательность implementation tasks зафиксирована в `TASK-001`–`TASK-020`.

Application code ещё не реализован.

Следующая стадия:

> передать репозиторий coding-agent и выполнить только `TASK-001 — Repository Scaffold`, после чего провести curator review и переходить к следующей задаче отдельно.

---

## Main Product Test

Любое решение в проекте должно проходить простой вопрос:

> **Это помогает пользователю лучше выбрать недвижимость — или просто добавляет ещё один способ смотреть объявления?**

Если второе — решение требует пересмотра.
