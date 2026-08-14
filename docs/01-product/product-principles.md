# Product Principles

## Status

`approved_for_repository`

## Product

**Real Estate Decision Service**

---

# 1. Purpose

Этот документ фиксирует продуктовые принципы, которые должны сохраняться при разработке, расширении функциональности, работе с данными, построении UX и интеграции AI/экспертного слоя.

Если новая функция противоречит этим принципам, её нельзя считать нейтральным расширением продукта.

Она должна быть либо:

- пересмотрена;
- вынесена в отдельный продуктовый сценарий;
- явно согласована как изменение product strategy.

---

# 2. Главный принцип

> **Сначала человек → затем подбор и сравнение → затем проверка/разбор → потом решение.**

Вся архитектура и UX должны следовать этой последовательности.

Не:

```text
Каталог
→ фильтры
→ карточки
→ контакт
```

А:

```text
Задача пользователя
→ понимание условий
→ поиск и нормализация
→ matching
→ shortlist
→ comparison
→ verification
→ decision
```

---

# 3. Principle 1 — Decision-first, not listing-first

Продукт создаётся для принятия решения, а не для просмотра объявлений.

Каждая функция должна отвечать на вопрос:

> **Помогает ли она пользователю лучше выбрать недвижимость?**

Если функция в первую очередь:

- увеличивает количество карточек;
- увеличивает глубину каталога;
- стимулирует browsing;
- продвигает конкретного продавца;

она не является core-функцией продукта без отдельного обоснования.

---

# 4. Principle 2 — UserRequest is the center of the product

`UserRequest` — главный контекст решения.

Все основные результаты должны быть связаны с ним:

```text
Shortlist
MatchResult
Comparison
PurchaseScenario
ExpertRequest
Decision Update
```

Нельзя показывать персональное соответствие без активного подтверждённого UserRequest.

---

# 5. Principle 3 — Confirm before optimize

Система должна сначала понять пользователя, а уже потом искать и ранжировать.

Нельзя:

```text
raw prompt
→ сразу matching
```

Правильно:

```text
raw prompt
→ parser
→ structured request
→ user confirmation
→ matching
```

Пользователь должен иметь возможность исправить interpretation до того, как система начнёт считать результат истинным.

---

# 6. Principle 4 — Clarify only what can change the decision

Продукт не должен превращать вход в длинную анкету.

Уточнения задаются только если:

- есть contradiction;
- неизвестное materially влияет на hard criterion;
- без ответа high-impact matching будет ненадёжным.

Рекомендуемый MVP limit:

```text
1–3 material clarifications
```

---

# 7. Principle 5 — Hard criteria are hard

Обязательные условия пользователя нельзя компенсировать soft-бонусами.

Если подтверждённый факт нарушает must/exclude:

```text
hard fail
```

Этот объект не должен попадать в primary shortlist как нормальный кандидат.

---

# 8. Principle 6 — Unknown is not failure

Строго:

```text
unknown != false
unknown != true
```

Если hard criterion зависит от неизвестного значения:

```text
не pass
не fail
```

а:

```text
critical unknown
```

Пользователь должен видеть, что решение пока зависит от проверки.

---

# 9. Principle 7 — Claimed is not confirmed

Маркетинговое заявление источника не становится фактом только потому, что parser его правильно прочитал.

Различать:

```text
confirmed
claimed
unconfirmed
conflicting
stale
unknown
```

Пример:

```text
"семейная ипотека"
```

на странице объекта не означает:

```text
подтверждённую применимость программы к конкретному unit и конкретному пользователю.
```

---

# 10. Principle 8 — Match and Confidence are separate

`Match Score` отвечает:

> насколько вариант подходит под UserRequest?

`Data Confidence` отвечает:

> насколько надёжны данные, на которых основан вывод?

Строго:

```text
Match Score != Data Confidence
```

Нельзя:

- умножать Match на Confidence без отдельной product decision;
- снижать Match только потому, что source слабый;
- повышать Match за счёт высокого confidence.

---

# 11. Principle 9 — No universal property ranking

У объекта нет универсального «качества» для всех пользователей.

Один и тот же Property может быть:

```text
сильным выбором для A
слабым для B
hard fail для C
```

Поэтому продукт не должен вводить скрытый:

```text
quality score
developer score
district score
liquidity bonus
new-build bonus
```

если это не является отдельным явно определённым критерием пользователя.

---

# 12. Principle 10 — Explain every important result

Пользователь должен понимать:

```text
почему вариант получил свой Match Score
```

Минимум:

- strengths;
- compromises;
- hard failures;
- critical unknowns;
- conflicts.

Нельзя использовать opaque ranking как основную decision logic.

---

# 13. Principle 11 — Fewer options, more meaning

Цель shortlist:

```text
5–10 релевантных вариантов
```

а не сотни объявлений.

Продукт должен уменьшать decision overload.

Если пользователь получает слишком много кандидатов, это сигнал, что matching/UX недостаточно помогает выбирать.

---

# 14. Principle 12 — Compare consequences, not only specifications

Comparison должен отвечать:

> как изменится жизнь и финансовый сценарий пользователя при выборе каждого варианта?

Поэтому сравниваются не только:

```text
метры
этаж
комнаты
```

но и:

```text
входные расходы
ежемесячный платёж
срок въезда
ремонт
дорога
инфраструктура
unknowns
confidence
```

---

# 15. Principle 13 — Cross-type by default

Архитектура не должна предполагать, что пользователь заранее выбрал один тип недвижимости.

Продукт должен быть способен сравнить:

```text
новостройку
вторичку
дом
таунхаус
```

если они решают одну пользовательскую задачу.

---

# 16. Principle 14 — Not applicable is not false

Для cross-type comparison:

```text
not_applicable
```

должно быть отдельным состоянием.

Пример:

```text
этаж
```

не относится к отдельно стоящему дому.

Нельзя показывать:

```text
Этаж: нет
```

или штрафовать объект за неприменимое поле.

---

# 17. Principle 15 — Property is not Offer

Физический объект:

```text
Property
```

и коммерческое предложение:

```text
Offer
```

разделены.

Один Property может иметь несколько Offer.

Это обязательный архитектурный инвариант.

---

# 18. Principle 16 — Financing is not a property characteristic

Ипотека, рассрочка, ПВ и акция — это условия покупки.

Они должны моделироваться через:

```text
FinancingProgram
FinancingOffer
Promotion
PropertyFinancingEligibility
PurchaseScenario
```

а не как boolean-поля Property.

---

# 19. Principle 17 — No Frankenstein scenarios

Система не имеет права собирать искусственно лучший коммерческий сценарий из несовместимых данных.

Нельзя:

```text
лучшая цена из A
+
нулевой ПВ из B
+
ставка из C
```

если эти условия не принадлежат одному совместимому PurchaseScenario.

---

# 20. Principle 18 — Every critical fact needs provenance

Для важных полей должна быть прослеживаемая цепочка:

```text
value
→ evidence
→ source snapshot
→ source
→ time checked
```

Особенно для:

- price;
- availability;
- financing;
- promotions;
- handover;
- utilities;
- legal/document-related facts.

---

# 21. Principle 19 — AI is not a source of facts

LLM может:

- интерпретировать запрос;
- структурировать текст;
- объяснять structured result;
- помогать с wording.

LLM не должен самостоятельно:

- назначать Match Score;
- подтверждать факт;
- определять eligibility;
- решать source conflict;
- объявлять объект юридически чистым;
- заменять deterministic business rules.

---

# 22. Principle 20 — Deterministic core, flexible explanation

Core decision logic должна быть воспроизводимой.

При одинаковом input:

```text
same UserRequest
same Property/Offer/Scenario
same evidence
same algorithm version
```

результат должен быть одинаковым.

AI может менять формулировку объяснения, но не сам факт прохождения критерия.

---

# 23. Principle 21 — Source access is a policy decision

Техническая возможность открыть страницу не означает разрешение:

- автоматизировать;
- хранить;
- показывать;
- обновлять;
- кэшировать.

Все source operations должны проходить через Source Policy Engine.

---

# 24. Principle 22 — Fail closed on source rights

Если permission неполная или неизвестная:

```text
automation denied
```

до явного разрешения.

Не:

```text
нет запрета → значит можно
```

---

# 25. Principle 23 — User URL does not bypass policy

То, что пользователь сам вставил ссылку, не отменяет source rules.

Правильный flow:

```text
User URL
→ source identification
→ policy gate
→ allowed ingestion method
→ normalization
```

---

# 26. Principle 24 — Background-first collection

Основной data strategy:

```text
collect in background
→ normalize
→ store evidence
→ match quickly
```

а не:

```text
user waits while system visits dozens of sites
```

Live collection — targeted fallback.

---

# 27. Principle 25 — Refresh only what matters

Обновлять нужно:

```text
critical
stale
conflicting
decision-relevant
```

данные.

Не весь объект и не весь источник без необходимости.

---

# 28. Principle 26 — Removed is not sold

Если listing исчез:

```text
removed
```

не равно:

```text
sold
```

Продукт не должен делать выводы, которых source не подтверждает.

---

# 29. Principle 27 — Stale is not false

Устаревшее значение может быть:

```text
последним известным
```

но не:

```text
актуальным
```

Показывать freshness явно.

---

# 30. Principle 28 — Conflict must remain visible until resolved

Если источники расходятся:

```text
conflicting
```

не должен silently превращаться в одно выбранное значение.

Нужен:

- resolution rule;
- stronger evidence;
- manual/expert verification;
- audit trail.

---

# 31. Principle 29 — No silent downgrade

Новое слабое evidence не должно молча затирать более сильное подтверждение.

Canonical update проходит через conflict/resolution layer.

---

# 32. Principle 30 — Expert after digital analysis

Эксперт нужен не как первый шаг, а когда digital layer дошёл до material uncertainty.

Правильно:

```text
analysis
→ unknown/conflict
→ expert
```

Не:

```text
любой пользователь
→ generic lead form
```

---

# 33. Principle 31 — Expert receives context, not a blank request

`ExpertContextPackage` должен содержать:

- UserRequest;
- Properties;
- Offers;
- PurchaseScenarios;
- MatchResults;
- DataQuality;
- unknowns;
- conflicts;
- evidence;
- конкретный вопрос.

Эксперт не должен начинать discovery заново.

---

# 34. Principle 32 — Expert result returns as evidence

ExpertResult не должен оставаться отдельным текстовым комментарием.

Если эксперт подтвердил новый факт:

```text
ExpertResult
→ FieldEvidence
→ Canonical update
→ DataQuality recompute
→ Match recompute
```

---

# 35. Principle 33 — Expert does not manually set Match Score

Эксперт может:

- проверить;
- объяснить;
- рекомендовать;
- указать risk;
- зафиксировать факт.

Но не должен вручную менять:

```text
match_score
```

---

# 36. Principle 34 — Legal, technical and bank boundaries must remain explicit

Продукт не должен выдавать:

```text
AI document review
=
legal opinion
```

```text
visual onsite check
=
technical inspection
```

```text
mortgage estimate
=
bank approval
```

Эти границы должны быть видимыми в UX и result contracts.

---

# 37. Principle 35 — User remains the decision owner

Продукт помогает:

```text
структурировать
объяснить
сравнить
проверить
```

но не должен изображать личные trade-offs как абсолютную объективность.

Пользователь может сознательно выбрать вариант с меньшим Match Score, если для него изменились приоритеты.

В таком случае корректный путь:

```text
edit UserRequest
→ recompute
```

а не скрытое ручное изменение результата.

---

# 38. Principle 36 — No commercial bias

Matching, shortlist и comparison не зависят от:

- commission;
- developer payment;
- advertising package;
- partner status;
- lead value.

Если коммерческое продвижение появится в будущем, оно должно быть отдельно маркировано и не смешиваться с персональным fit.

---

# 39. Principle 37 — Coverage transparency

Если продукт не видит весь рынок, он не должен говорить:

```text
подходящих объектов на рынке нет
```

Правильно:

```text
по подключённым источникам подходящих вариантов не найдено
```

или:

```text
по этому условию данных недостаточно
```

---

# 40. Principle 38 — Pilot geography is not core architecture

Нельзя hardcode пилотный город:

- в domain logic;
- matching;
- schema;
- product naming;
- source-independent interfaces.

География — параметр UserRequest и source coverage.

---

# 41. Principle 39 — Product copy must match system truth

UX-текст не должен обещать больше, чем реально умеет система.

Нельзя писать:

```text
проверено
```

если статус:

```text
claimed
```

Нельзя писать:

```text
в продаже
```

если:

```text
availability unknown
```

---

# 42. Principle 40 — Progressive disclosure

На каждом этапе показывать ровно тот объём информации, который помогает принять следующее решение.

## Shortlist

```text
fit
strengths
compromises
confidence
critical unknown
```

## Detail

```text
full facts
purchase scenario
provenance
checks
```

## Comparison

```text
meaningful differences
```

## Expert

```text
material unresolved questions
```

---

# 43. Principle 41 — No dead ends

Recoverable state должен иметь следующий шаг.

Примеры:

```text
No results
→ изменить условия
```

```text
Restricted URL
→ добавить вручную
```

```text
Critical unknown
→ refresh / expert check
```

```text
Comparison has 1 item
→ добавить ещё
```

---

# 44. Principle 42 — Version everything that can change decisions

Нужно сохранять versions для:

- UserRequest;
- schema;
- parser;
- criteria registry;
- matching algorithm;
- confidence algorithm;
- source registry;
- source policy;
- adapter;
- expert context/result.

Это позволяет воспроизвести, почему система когда-то показала конкретный результат.

---

# 45. Principle 43 — No stale decision context after user edits

Если пользователь изменил confirmed UserRequest:

старые:

```text
MatchResult
ComparisonConclusion
ExpertContextPackage
```

не должны silently считаться актуальными.

Нужен recompute/stale state.

---

# 46. Principle 44 — Recompute only affected decisions

При обновлении одного поля:

не нужно пересчитывать всю систему.

Нужно определить:

```text
affected Property
affected Offer
affected PurchaseScenario
affected UserRequest contexts
```

и пересчитать только их.

---

# 47. Principle 45 — Privacy by minimization

Собирать и передавать только те данные пользователя, которые нужны для конкретной задачи.

Особенно осторожно с:

- household;
- financing;
- documents;
- user URLs;
- expert requests;
- free-form text.

---

# 48. Principle 46 — Sensitive data does not belong in generic analytics

Не отправлять в telemetry:

- raw user request;
- документы;
- паспортные данные;
- full financing profile;
- expert sensitive free-text.

Telemetry должна работать на IDs, codes и безопасных aggregates.

---

# 49. Principle 47 — Security boundaries are product boundaries

SSRF, source-policy bypass, secret leakage, unsafe expert access — не просто технические bugs.

Они напрямую разрушают продуктовую надёжность.

Поэтому security gates входят в Definition of Done relevant tasks.

---

# 50. Principle 48 — Product success is decision clarity

Главный qualitative outcome:

> **Теперь мне понятнее, что мне стоит покупать.**

Дополнительные сигналы:

- shortlist релевантен;
- comparison сократил alternatives;
- пользователь понимает компромиссы;
- unknowns понятны;
- expert verification изменил или подтвердил решение.

---

# 51. Principle 49 — Do not optimize for engagement

Не использовать как главный success metric:

```text
time on site
number of listings viewed
number of clicks
```

Высокая вовлечённость может означать, что сервис не помогает принять решение.

---

# 52. Principle 50 — Pilot feedback does not change logic automatically

Реальные пользовательские feedback/events:

```text
evidence
```

но не автоматическая команда менять продукт.

Правильный flow:

```text
feedback
→ issue
→ pattern
→ curator review
→ separate TASK
→ versioned change
```

---

# 53. Principle 51 — One task at a time for coding agents

Coding-agent должен выполнять только текущую TASK.

Нельзя:

```text
«раз уж рядом — ещё добавил...»
```

Без отдельной спецификации не добавлять новые product flows.

---

# 54. Principle 52 — Documentation is part of architecture

Если меняется:

- domain meaning;
- source policy;
- matching semantics;
- expert boundary;
- product flow;

нужно обновлять соответствующую документацию.

Документы — не комментарии после кода, а часть source of truth.

---

# 55. Product Decision Checklist

Перед созданием новой функции спросить:

1. Какую decision problem она решает?
2. К какому UserRequest она привязана?
3. Как она влияет на shortlist/detail/comparison?
4. Какие данные ей нужны?
5. Какое provenance у этих данных?
6. Что происходит при unknown?
7. Что происходит при conflict?
8. Может ли source policy запретить действие?
9. Не смешивает ли функция Property и Offer?
10. Не создаёт ли Frankenstein Scenario?
11. Не смешивает ли Match и Confidence?
12. Не добавляет ли commercial bias?
13. Что увидит пользователь, если данные неполные?
14. Нужен ли здесь expert, или digital layer достаточно?
15. Как это измеряет decision clarity?

Если на эти вопросы нет ответа, функция недостаточно определена.

---

# 56. Anti-patterns

Следующие решения считаются продуктовым anti-pattern:

```text
Universal object rating
```

```text
Magic AI recommendation
```

```text
Unknown → false
```

```text
Claimed → confirmed
```

```text
Property + Offer merged
```

```text
Best terms from incompatible offers
```

```text
Source scraping without policy gate
```

```text
Expert lead form without context
```

```text
Silent relaxation of must criteria
```

```text
Hundreds of shortlist results
```

```text
Hardcoded pilot geography
```

```text
Paid placement affecting Match Score
```

---

# 57. Priority in case of conflict

Если разные product goals конфликтуют, приоритет такой:

```text
1. Correctness of user decision context
2. Safety / source policy / privacy
3. Transparency of uncertainty
4. Deterministic matching semantics
5. User clarity
6. Speed
7. Breadth of coverage
8. Engagement
9. Commercial optimization
```

То есть нельзя жертвовать correctness ради более полного каталога или более красивого UX.

---

# 58. Final Product Invariant

Главный вопрос для любой новой функции:

> **Она помогает человеку выбрать недвижимость — или делает из продукта ещё один портал объявлений?**

Если второе — функция противоречит product principles.

---

# 59. Final Formula

```text
User intent
+
Structured criteria
+
Normalized market data
+
Evidence
+
Deterministic matching
+
Transparent uncertainty
+
Cross-type comparison
+
Expert verification when necessary
=
Better real-estate decision
```

Финальный принцип:

> **Продукт должен давать пользователю не больше информации, а больше ясности.**
