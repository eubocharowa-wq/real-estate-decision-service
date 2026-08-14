# MVP Success Criteria

## Status

`approved_for_repository`

## Product

**Real Estate Decision Service**

---

# 1. Purpose

Этот документ фиксирует, **как понять, что MVP v1 действительно работает как продукт**, а не только как набор технически реализованных функций.

Success Criteria делятся на четыре уровня:

```text
1. Product outcome
2. User journey quality
3. Decision quality
4. Technical / operational readiness
```

MVP нельзя считать успешным только потому, что:

- приложение запускается;
- есть все экраны;
- тесты зелёные;
- matching что-то рассчитывает;
- пользователь может открыть карточку объекта.

Главный критерий — помогает ли система принять более понятное и обоснованное решение.

---

# 2. North Star Success Criterion

Основной qualitative outcome:

> **После работы с сервисом пользователю стало понятнее, что ему стоит покупать и почему.**

Рабочая пользовательская формулировка:

```text
Теперь мне понятнее, что мне стоит покупать.
```

Ответы:

```text
Да
Частично
Нет
```

Это основной продуктовый критерий пилота.

---

# 3. Core MVP Success Statement

MVP успешен, если пользователь может:

```text
описать свою задачу
→ подтвердить условия
→ получить небольшой релевантный shortlist
→ понять причины и компромиссы
→ сравнить финалистов
→ увидеть неизвестные и конфликтующие данные
→ при необходимости проверить критичный вопрос
→ увидеть обновлённый decision context
```

без необходимости самостоятельно собирать и структурировать весь рынок.

---

# 4. Success Dimension A — Request Understanding

## Цель

Система должна правильно понимать то, что пользователь считает важным.

## Success Signals

- пользователь узнаёт свою задачу в structured UserRequest;
- обязательные условия не теряются;
- preferred не превращаются в must;
- avoid/exclude сохраняются;
- financing conditions не приклеиваются к Property;
- contradictions видны;
- уточнений немного и они material.

---

# 5. Request Understanding Metric Hooks

Собирать:

```text
request_confirmation_rate
request_edit_rate
fields_corrected
priorities_changed
criteria_removed
clarifications_answered
```

---

# 6. Request Understanding User Feedback

Вопрос:

```text
Сервис правильно понял, что для вас важно?
```

Ответ:

```text
Да
Частично
Нет
```

---

# 7. Failure Signal — Request Understanding

Считать material problem, если:

- пользователи регулярно исправляют один и тот же field;
- must criteria часто теряются;
- parser придумывает отсутствующие ограничения;
- пользователю приходится заново формулировать всю задачу;
- confirmation screen воспринимается как новая длинная анкета.

---

# 8. Success Dimension B — Shortlist Relevance

## Цель

Shortlist должен содержать небольшое число реально рассматриваемых кандидатов.

Не:

```text
много результатов
```

а:

```text
несколько подходящих вариантов
```

---

# 9. Shortlist Success Signals

- primary shortlist содержит примерно 5–10 кандидатов, если dataset позволяет;
- hard-fail объекты исключены;
- high-match/low-confidence варианты не маскируются;
- пользователь открывает detail не случайно, а потому что вариант реально интересен;
- shortlist не ощущается как обычная поисковая выдача.

---

# 10. Shortlist User Feedback

Вопрос:

```text
Среди предложенных вариантов есть те, которые вы действительно готовы рассматривать?
```

Ответ:

```text
Да
Частично
Нет
```

---

# 11. Shortlist Failure Signals

- пользователь считает большинство вариантов нерелевантными;
- hard criteria нарушены;
- shortlist слишком большой;
- card не объясняет, почему объект оказался здесь;
- пользователь не понимает разницу между Match и Confidence.

---

# 12. Success Dimension C — Explanation Clarity

## Цель

Пользователь должен понимать:

```text
почему объект получил свой Match Score
```

---

# 13. Explanation Success Signals

Для каждого shortlist/detail кандидата видны:

- strengths;
- compromises;
- hard failures if any;
- critical unknowns;
- conflicts;
- selected purchase scenario.

---

# 14. Explanation User Feedback

Вопрос:

```text
Понятно ли, почему каждый вариант получил такой процент соответствия?
```

---

# 15. Explanation Failure Signals

- Match Score воспринимается как магическая цифра;
- explanation использует generic praise;
- причины не связаны с UserRequest;
- пользователь считает высокий score универсальным качеством объекта;
- compromises скрыты.

---

# 16. Success Dimension D — Match / Confidence Separation

## Цель

Пользователь должен понимать разницу между:

```text
насколько вариант подходит
```

и:

```text
насколько надёжны данные
```

---

# 17. Match / Confidence Success Signals

Пользователь корректно воспринимает:

```text
94% подходит
Confidence: low
```

как:

```text
вариант потенциально сильный,
но сначала нужно подтвердить данные
```

а не:

```text
вариант точно лучший
```

---

# 18. Match / Confidence Failure Signals

- Confidence визуально или логически смешана с Match;
- low confidence автоматически уменьшает Match без explicit business rule;
- пользователь не замечает critical unknown;
- UI пишет «подходит» без контекста uncertainty.

---

# 19. Success Dimension E — Unknown / Conflict Transparency

## Цель

Система должна честно показывать неопределённость.

---

# 20. Unknown Success Signals

Пользователь видит:

```text
не подтверждено
заявлено источником
данные устарели
есть расхождение
нет данных
```

и понимает, что это разные состояния.

---

# 21. Unknown User Feedback

Вопрос:

```text
Понятно ли, какие данные подтверждены, а какие ещё требуют проверки?
```

---

# 22. Unknown Failure Signals

- unknown превращается в false;
- stale показывается как current;
- claim показывается как confirmed;
- conflict скрывается;
- removed listing называется sold без evidence.

---

# 23. Success Dimension F — Comparison Usefulness

## Цель

Comparison должен уменьшать decision complexity.

---

# 24. Comparison Success Signals

После comparison пользователь:

- понимает, какой объект проходит must criteria лучше;
- видит trade-offs;
- понимает financing differences;
- различает confidence;
- сокращает число альтернатив;
- понимает, какие вопросы реально мешают выбрать.

---

# 25. Comparison User Feedback

Вопрос:

```text
После сравнения стало понятнее, какой вариант подходит вам больше?
```

Ответ:

```text
Да
Частично
Нет
```

---

# 26. Comparison Failure Signals

- comparison выглядит как generic specification table;
- cross-type варианты невозможно сравнить;
- too many irrelevant rows;
- not_applicable показывается как negative;
- интерфейс вынуждает пользователя самостоятельно выводить trade-offs;
- always forced winner.

---

# 27. Success Dimension G — Cross-type Decision Quality

## Цель

Сервис должен доказать, что может сравнивать разные типы недвижимости через общие последствия выбора.

---

# 28. Cross-type Success Signals

Например:

```text
new-build apartment
vs
secondary apartment
vs
house
```

сравниваются по:

- total cost;
- initial payment;
- monthly payment;
- move-in timing;
- usable area;
- commute;
- infrastructure;
- condition;
- unknowns;
- confidence.

---

# 29. Cross-type Failure Signals

- один тип получает скрытый bonus;
- type-specific отсутствующее поле считается disadvantage;
- сравнение сводится к одинаковым физическим specs;
- пользователь не понимает, почему разные типы вообще находятся вместе.

---

# 30. Success Dimension H — Financing Clarity

## Цель

Пользователь должен понимать конкретный PurchaseScenario.

---

# 31. Financing Success Signals

Показываются отдельно:

- object price;
- selected Offer;
- initial payment;
- monthly payment;
- term;
- rate periods;
- mandatory costs;
- validity;
- verification status.

---

# 32. Financing Failure Signals

- рекламная ставка воспринимается как guaranteed;
- zero-down claim становится confirmed;
- условия разных Offer смешиваются;
- стоимость по promo не отделена от базовой;
- monthly payment показан без assumptions.

---

# 33. Success Dimension I — User-supplied Candidate

## Цель

Пользователь может принести найденный самостоятельно объект и не начинать comparison заново вне продукта.

---

# 34. User URL Success Signals

Flow работает:

```text
URL
→ policy check
→ ingestion/manual fallback
→ normalization
→ matching
→ comparison
```

---

# 35. User URL Failure Signals

- restricted source обрабатывается в обход policy;
- imported object живёт в отдельной модели;
- claims становятся confirmed;
- candidate нельзя сравнить с shortlist;
- пользователю обещается поддержка «любого сайта».

---

# 36. Success Dimension J — Expert Verification Value

## Цель

Эксперт должен подключаться только там, где человеческая проверка может изменить решение.

---

# 37. Expert Success Signals

- ExpertRequest создаётся из конкретного unknown/conflict;
- эксперт получает готовый Context Package;
- пользователь не повторяет всю историю;
- result structured;
- new evidence возвращается в system;
- Match/DataQuality пересчитываются при необходимости.

---

# 38. Expert User Feedback

Вопрос:

```text
Экспертная проверка помогла понять, что делать дальше?
```

---

# 39. Expert Failure Signals

- expert CTA выглядит как generic lead form;
- эксперт вынужден заново проводить discovery;
- результат остаётся просто текстовым комментарием;
- expert manually sets Match Score;
- проверка ничего не меняет и не объясняет.

---

# 40. Success Dimension K — Updated Decision Loop

## Цель

Если факт изменился, продукт должен корректно изменить decision context.

---

# 41. Updated Decision Success Signals

После:

```text
expert result
refresh
user request edit
user URL ingestion
source update
```

система корректно:

- обновляет evidence;
- пересчитывает affected DataQuality;
- пересчитывает affected MatchResult;
- обновляет comparison conclusion if needed;
- показывает пользователю, что изменилось.

---

# 42. Updated Decision Failure Signals

- старый Match остаётся актуальным после изменения UserRequest;
- confidence update меняет Match без изменения facts;
- new evidence переписывает canonical silently;
- global recompute запускается без необходимости;
- before/after показывается без реальных versioned results.

---

# 43. Success Dimension L — No-results Honesty

## Цель

Если подходящих вариантов нет, продукт не должен нарушать hard criteria.

---

# 44. No-results Success Signals

Пользователь видит:

```text
По подтверждённым обязательным условиям подходящих вариантов не найдено.
```

и может:

```text
Изменить условия
```

---

# 45. Coverage-gap Success Signals

Если проблема в данных:

```text
по этому условию данных недостаточно
```

или:

```text
по подключённым источникам подходящих вариантов пока не найдено
```

---

# 46. No-results Failure Signals

- silent relaxation;
- «лучший из плохих» без explicit user choice;
- no-result интерпретируется как market-wide absence;
- coverage gap скрывается.

---

# 47. Success Dimension M — User Control

## Цель

Система помогает принимать решение, но не забирает его у пользователя.

---

# 48. User Control Success Signals

Пользователь может:

- изменить request;
- поменять priority;
- вернуться в shortlist;
- изменить comparison;
- добавить свой вариант;
- отказаться от expert check;
- оставить unknown unresolved;
- пересчитать decision после изменения условий.

---

# 49. User Control Failure Signals

- rigid wizard;
- невозможно вернуться назад;
- system silently fixes priorities;
- forced expert flow;
- forced winner;
- automatic criteria relaxation.

---

# 50. Success Dimension N — Technical Correctness

MVP технически успешен, если:

```text
typecheck passes
lint passes
tests pass
build passes
```

---

# 51. Required Regression Areas

Минимум:

```text
unknown != false
claimed != confirmed
Property != Offer
Match != Confidence
not_applicable != false
removed != sold
no Frankenstein scenario
hard fail cannot be compensated
source policy cannot be bypassed
expert cannot manually set Match Score
```

---

# 52. Golden Buyer Journey

Должен проходить deterministic E2E flow:

```text
request
→ confirmation
→ matching
→ shortlist
→ detail
→ comparison
→ expert request
→ expert result
→ recompute
→ updated decision
```

---

# 53. Golden Journey Success

Проверять минимум:

1. raw text preserved;
2. confirmed request version exists;
3. same request version used downstream;
4. shortlist uses real MatchResults;
5. selected Offer/Scenario preserved;
6. comparison uses same request version;
7. ExpertContextPackage references correct entities;
8. ExpertResult creates evidence;
9. recompute creates new result versions;
10. user sees updated decision.

---

# 54. Success Dimension O — Source/Data Reliability

MVP должен корректно работать даже при неполном source coverage.

---

# 55. Source/Data Success Signals

- policy gate mandatory;
- provenance present;
- freshness visible;
- conflicts retained;
- restricted source does not auto-collect;
- pilot/live/synthetic data separated.

---

# 56. Source/Data Failure Signals

- technical accessibility treated as permission;
- source link exists but provenance absent;
- no environment approval;
- synthetic data shown as live;
- stale pricing shown as current.

---

# 57. Success Dimension P — Security / Privacy

Минимально успешный MVP не содержит критичных security/privacy bypass.

---

# 58. Security Success Signals

- SSRF protections pass;
- no secrets in repo;
- safe redirects;
- response-size/timeouts;
- fail-closed source policy;
- expert access boundary;
- no sensitive analytics dump.

---

# 59. Security Hard Failure

Любой из следующих пунктов блокирует real buyer pilot:

- source-policy bypass;
- unsafe private-network fetch;
- secret leakage;
- unrelated expert request access;
- sensitive PII in generic telemetry.

---

# 60. Success Dimension Q — Performance

Для Pilot Dataset matching должен быть достаточно быстрым, чтобы пользователь не воспринимал core calculation как external crawling operation.

---

# 61. Performance Success

Фактические измерения фиксируются в TASK-019.

Не придумывать SLA заранее.

Главное:

```text
matching on pilot dataset is bounded and fast enough for interactive use
```

---

# 62. Performance Failure

- local matching path зависит от live network;
- comparison noticeable slow at 2–4 items;
- confidence recompute unnecessarily global;
- UI blocks while refreshing unrelated sources.

---

# 63. Success Dimension R — Pilot Observability

Перед real buyer pilot команда должна понимать, что происходит в journey.

---

# 64. Required Pilot Observability

Минимум:

```text
journey events
errors
feedback
coverage summary
source-policy blocks
expert requests/results
decision updates
```

---

# 65. Pilot Outcome Metrics

Собирать:

```text
request_confirmation_rate
request_edit_rate
shortlist_relevance_feedback
comparison_helpfulness_feedback
confidence_clarity_feedback
expert_helpfulness_feedback
decision_clarity_feedback
journey_completion
```

---

# 66. Metrics Are Signals, Not Automatic Decisions

Нельзя автоматически менять product logic по одной метрике.

Правильный flow:

```text
metric / feedback
→ issue
→ pattern
→ curator review
→ task
```

---

# 67. Pilot Success Is Not a Single Percentage

На раннем pilot этапе sample мал.

Нельзя объявлять:

```text
MVP successful because 80%
```

без product-approved threshold и достаточного sample.

Нужна комбинация:

- qualitative evidence;
- repeated patterns;
- critical defect absence;
- user outcome;
- technical stability.

---

# 68. Pilot Hard Blockers

MVP не готов к real buyer pilot, если есть:

- broken hard criteria semantics;
- Match/Confidence mixing;
- Property/Offer mixing;
- Frankenstein scenario;
- source-policy violation;
- synthetic/live mixing;
- unsafe URL ingestion;
- critical privacy/security issue;
- expert evidence bypass;
- golden journey failure.

---

# 69. Pilot Warnings

Не обязательно блокируют controlled pilot:

- limited source coverage;
- manual-only sources;
- one approved PoC adapter;
- expert turnaround not optimized;
- session-based persistence;
- limited geography;
- incomplete document automation.

Они должны быть явно documented.

---

# 70. MVP Product Success Checklist

MVP product-ready, если:

```text
[ ] UserRequest можно описать свободным текстом
[ ] Confirmation понятен
[ ] Must/Preferred различаются
[ ] Shortlist небольшой и релевантный
[ ] Match Score explainable
[ ] Confidence отдельно
[ ] Unknown/conflict visible
[ ] Detail помогает решить
[ ] Comparison помогает сократить alternatives
[ ] Cross-type работает
[ ] User URL входит в общий pipeline
[ ] Expert check contextual
[ ] Expert result возвращается как evidence
[ ] Decision update visible
[ ] No-results честный
[ ] Coverage gaps прозрачны
```

---

# 71. MVP Technical Success Checklist

```text
[ ] Core schemas valid
[ ] Deterministic fixtures stable
[ ] Matching regression green
[ ] Confidence regression green
[ ] Source policy tests green
[ ] User URL security tests green
[ ] Expert state machine green
[ ] Golden E2E green
[ ] Typecheck green
[ ] Lint green
[ ] Tests green
[ ] Build green
```

---

# 72. MVP Pilot-readiness Checklist

```text
[ ] Pilot mode explicit
[ ] Synthetic/live/manual data separated
[ ] Source readiness gate passes
[ ] Feature flags reviewed
[ ] Kill switches available
[ ] PII inventory reviewed
[ ] Security review completed
[ ] Known limitations documented
[ ] Rollback documented
[ ] Feedback capture enabled
[ ] Journey telemetry enabled
[ ] Pilot runbook ready
```

---

# 73. Product Failure Despite Technical Success

MVP считается продуктово неуспешным, даже если все тесты проходят, если реальные пользователи:

- не понимают request confirmation;
- считают shortlist нерелевантным;
- не понимают Match Score;
- не видят ценности comparison;
- путаются в unknown/confidence;
- не получают большей decision clarity.

Тогда проблема должна быть оформлена как pilot issue, а не маскироваться технической готовностью.

---

# 74. Technical Failure Despite Product Interest

Если пользователи видят ценность, но:

- source data ненадёжны;
- financing semantics ломаются;
- security gate не готов;
- provenance отсутствует;

MVP нельзя масштабировать до исправления.

---

# 75. Definition of MVP Success

MVP v1 считается успешным, когда одновременно выполняются три условия:

## A. Product

Пользователь получает более ясное решение.

## B. Decision Logic

Результат корректно следует из UserRequest, evidence и deterministic rules.

## C. Operational Trust

Система честно показывает ограничения данных, проходит security/source-policy gates и не создаёт ложную уверенность.

---

# 76. Final Success Statement

> **MVP успешен не тогда, когда сервис умеет показать недвижимость. Он успешен тогда, когда реальный покупатель может пройти путь от сложной жизненной задачи до небольшого числа понятных финалистов, увидеть причины, компромиссы и неопределённость, проверить критичные факты и в итоге лучше понять, что ему стоит покупать.**
