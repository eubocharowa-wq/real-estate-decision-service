# AGENTS.md

# Instructions for Coding Agents

## 1. Назначение

Этот файл содержит обязательные правила для Codex, Claude Code и других coding agents, работающих с репозиторием.

Перед любой задачей агент обязан прочитать:

```text
PROJECT.md
AGENTS.md
tasks/<CURRENT_TASK>.md
```

и связанные документы из `docs/`.

---

# 2. Источник истины

Приоритет спецификаций:

```text
1. Текущая TASK-XXX.md
2. PROJECT.md
3. Связанные docs/
4. AGENTS.md
5. Существующий код
```

Если код противоречит актуальной спецификации, не считать код автоматически правильным.

---

# 3. Не переизобретать продукт

Запрещено без отдельного решения:

- менять смысл продукта;
- добавлять новый основной user flow;
- превращать продукт в каталог;
- менять hard/soft semantics;
- менять meaning Match Score;
- объединять Match Score и Data Confidence;
- менять Property/Offer separation;
- менять source verification model.

---

# 4. Не добавлять функции вне задачи

Если feature отсутствует в текущей `TASK-XXX.md`:

```text
не реализовывать "заодно"
```

Даже если это легко.

Допустимо:

- минимальное техническое изменение, необходимое для выполнения задачи;
- явно описать его в итоговом отчёте.

---

# 5. Ask/Flag Rule

Если найдено противоречие в спецификации:

не выбирать продуктовый вариант молча.

Нужно зафиксировать:

```text
SPEC CONFLICT
- document A:
- document B:
- impact:
- proposed options:
```

Если можно безопасно продолжить без изменения продукта — продолжить.

---

# 6. Core Product Guardrails

Никогда не реализовывать product logic, где:

```text
LLM → самостоятельно ставит Match %
```

Правильно:

```text
deterministic evaluators
→ structured result
→ LLM explanation
```

---

# 7. Property != Offer

Обязательное правило.

```text
Property = физический объект
Offer = коммерческое предложение
```

Один Property может иметь несколько Offer.

Не объединять их в одну таблицу/сущность, если это уничтожает различия.

---

# 8. Не создавать Frankenstein Offer

Запрещено:

```text
lowest price из Offer A
+
zero-down из Offer B
+
availability из Offer C
=
новый "лучший" Offer
```

Если условия не подтверждены как совместимые.

---

# 9. Source Provenance

Каждое critical user-facing field должно поддерживать:

```text
source
timestamp
verification status
evidence
```

Не создавать поля без provenance, если по data model provenance обязательна.

---

# 10. AI не источник фактов

LLM может:

- parse user intent;
- classify;
- explain;
- summarize;
- propose clarification.

LLM не может:

- выдумывать цену;
- подтверждать ипотечную программу;
- определять availability;
- исправлять source conflict своей догадкой.

---

# 11. Unknown Semantics

Строго:

```text
unknown != false
unknown != true
```

Не заменять `null/unknown` значениями по умолчанию ради удобства UI.

---

# 12. Verification Status

Поддерживать:

```text
confirmed
claimed
unconfirmed
conflicting
stale
unknown
```

Не сокращать их до одного boolean `verified`.

---

# 13. Match Score

Match Score:

- персональный;
- детерминированный;
- воспроизводимый;
- explainable.

Не использовать hidden universal property rating.

---

# 14. Hard Criteria

`must` и `exclude` — gates.

Нарушение must нельзя компенсировать другими преимуществами.

---

# 15. Unknown Hard Criterion

Если hard criterion unknown:

не ставить `pass`.

Не ставить `hard_fail`, если нет доказательства нарушения.

Использовать соответствующий uncertainty status.

---

# 16. Data Confidence

Хранить отдельно:

```text
match_score
data_confidence_score
data_completeness_score
```

Не умножать их в user-facing Match Score без отдельной спецификации.

---

# 17. Cross-type

Не hardcode assumptions:

```text
new_build > secondary
apartment > house
higher floor > lower
```

Если пользователь этого не задавал.

---

# 18. Pilot Geography

Нельзя hardcode конкретный город в core:

- schema;
- routes;
- DB logic;
- matching.

Pilot data может быть локальным.

Core architecture — universal.

---

# 19. Source Collection

Не включать production adapter, если source policy не разрешает использование.

Наличие parser не равно разрешению на crawling.

---

# 20. OpenClaw

OpenClaw output всегда проходит:

```text
staging
validation
normalization
evidence
deduplication
canonical update
```

Никогда:

```text
OpenClaw → direct DB canonical write
```

---

# 21. Database Rules

Предпочитать:

- explicit relations;
- foreign keys;
- migration history;
- immutable audit/evidence records where appropriate.

Не хранить несколько логически разных сущностей в одном JSON blob без необходимости.

---

# 22. Schema Versioning

Data contracts должны иметь версии.

Изменение breaking schema:

- migration;
- fixture update;
- tests.

---

# 23. Testing Requirements

Каждая TASK должна иметь тесты, если логика тестируема.

Минимум:

- unit tests;
- integration tests для boundary;
- build.

---

# 24. Matching Tests

Особенно обязательно тестировать:

- hard fail;
- unknown hard criterion;
- conflicting data;
- soft curve;
- deterministic score;
- financial scenario;
- cross-type not_applicable.

---

# 25. Dedup Tests

Обязательно:

- same unit different sources;
- same layout different unit;
- same property different price;
- split false merge;
- external URL duplicate.

---

# 26. Source Adapter Tests

Использовать fixtures.

Не делать real network access обязательным для unit tests.

---

# 27. Fixtures

Fixtures должны быть:

- synthetic;
- legally reusable;
- deterministic.

Не коммитить произвольные scraped pages с ограниченными правами.

---

# 28. Secrets

Никогда не коммитить:

- API keys;
- passwords;
- tokens;
- cookies;
- user credentials.

Использовать:

```text
.env.example
environment variables
secret manager
```

---

# 29. PII

Хранить минимум персональных данных.

Не логировать:

- документы;
- телефоны;
- персональные банковские данные;

без явной необходимости.

---

# 30. User Documents

Document upload требует:

- private storage;
- scoped access;
- no public URLs by default;
- audit access where feasible.

---

# 31. Error Handling

Не скрывать ошибки пустыми значениями.

Пример:

```text
source changed
```

должно быть диагностируемым состоянием.

---

# 32. UI Rules

Основной UX:

```text
Задача
→ Понимание
→ Подбор
→ Объяснение
→ Сравнение
→ Решение
```

Не превращать home в сетку из сотен карточек.

---

# 33. Shortlist

Основная выдача:

```text
5–10 вариантов
```

не бесконечная лента.

---

# 34. Card Requirements

Карточка shortlist должна иметь:

- fit;
- reasons;
- compromise;
- unknown;
- source/freshness.

Не показывать только фото + цену + метры.

---

# 35. Comparison

Comparison должен работать через user-specific criteria.

Не через универсальный маркетинговый набор характеристик.

---

# 36. Expert Layer

ExpertRequest должен иметь context.

Не реализовывать как:

```text
оставьте телефон
```

без property/request/comparison context.

---

# 37. Expert Results

Manual verification должна попадать в provenance/evidence layer.

Не создавать отдельную непрозрачную «заметку менеджера».

---

# 38. Legal Boundary

AI/expert UX не должен называть:

- обычный разбор документа → юридическим заключением;
- визуальный выезд → техническим обследованием;
- mortgage estimate → банковским одобрением.

---

# 39. Code Quality

Предпочитать:

- TypeScript strict;
- small modules;
- explicit domain names;
- no hidden magic numbers;
- centralized criteria registry;
- centralized source policies.

---

# 40. Magic Numbers

Weights, TTL, thresholds:

не разбрасывать по компонентам.

Хранить в:

```text
config
registry
policy module
```

с versioning.

---

# 41. Feature Flags

Для незавершённых real-source integrations использовать feature flag или source status.

Не оставлять полуработающий adapter активным по умолчанию.

---

# 42. Migration Safety

Перед destructive migration:

- backup strategy;
- data migration;
- rollback consideration.

---

# 43. Agent Output After Task

После выполнения задачи агент должен сообщить:

```text
Implemented
Files changed
Tests run
Build status
Known limitations
Spec deviations
Next task dependency
```

---

# 44. No False Completion

Не писать `done`, если:

- tests не запускались;
- build падает;
- часть acceptance criteria не выполнена.

Отдельно указать, что осталось.

---

# 45. Current Task Boundary

Агент всегда работает только по одной основной TASK.

Если обнаружена следующая необходимая задача:

зафиксировать её, но не реализовывать без явного задания.

---

# 46. Final Guardrail

Перед завершением любой продуктовой задачи проверить:

```text
Does this still help the user choose,
or are we accidentally building another listings portal?
```

Если второе — остановиться и свериться с `PROJECT.md`.
