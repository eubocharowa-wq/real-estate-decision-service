# UX Edge Cases

## Status

`approved_for_repository`

## Product

**Real Estate Decision Service**

---

# 1. Purpose

Этот документ фиксирует основные edge cases MVP, которые должны быть обработаны явно на уровне UX и application state.

Цель:

- не скрывать неопределённость;
- не создавать ложную уверенность;
- не ломать buyer journey при неполных данных;
- не смешивать разные смысловые состояния;
- давать пользователю понятный следующий шаг.

Главный принцип:

> **Edge case — это не исключение, которое можно “спрятать”. В недвижимости неполные, конфликтующие, устаревшие и неоднородные данные являются нормальной частью продукта.**

---

# 2. Edge Case Categories

Основные группы:

```text
1. User Request
2. Matching
3. Data Quality
4. Shortlist
5. Property Detail
6. Comparison
7. Financing
8. User URL
9. Source Policy
10. Refresh
11. Expert Workflow
12. Navigation / State
13. Cross-type
14. Security / Privacy
15. Pilot / Coverage
```

---

# 3. User Request — Too Vague

Пример:

```text
Хочу хорошую квартиру.
```

Нельзя:

```text
придумать budget
придумать location
придумать property type
```

Правильно:

```text
Спросить 1–3 material clarifications.
```

Пример:

```text
В каком городе или районе ищете?
Какой бюджет вы рассматриваете?
```

---

# 4. User Request — Contradictory Budget

Пример:

```text
Бюджет до 5 млн
```

и одновременно:

```text
Не дешевле 5,5 млн
```

UX:

```text
Нужно уточнить условия
```

Пока contradiction не разрешён:

```text
Confirm disabled
```

---

# 5. User Request — Must vs Preferred Ambiguity

Пример:

```text
Желательно до 5 млн, но можно чуть дороже.
```

Parser не должен автоматически делать:

```text
budget <= 5m must
```

UX:

```text
До 5 млн — желательно
```

с возможностью исправить priority.

---

# 6. User Request — Avoid vs Exclude

Пример:

```text
Не хочу первый этаж
```

может быть:

```text
exclude
```

А:

```text
Лучше не первый этаж
```

может быть:

```text
avoid
```

Если wording ambiguous:

clarify only if materially impacts result.

---

# 7. User Request — Unknown Location

Пользователь может сказать:

```text
Не знаю район.
```

Это валидное состояние.

Не заставлять выбрать район искусственно.

Location может быть:

```text
city known
district unknown
```

---

# 8. User Request — Unknown Property Type

Пользователь может сказать:

```text
Квартира или дом — не знаю.
```

Это должно активировать cross-type flow.

Не выбирать type автоматически.

---

# 9. User Request — Financing Not Decided

Пример:

```text
Пока не знаю, ипотека или наличные.
```

Не создавать mortgage assumptions.

Financing status:

```text
unknown / flexible
```

---

# 10. User Request — User Edits After Confirmation

Если пользователь изменил request после matching:

```text
new UserRequest version
```

Старые:

```text
MatchResult
ComparisonConclusion
ExpertContextPackage
```

становятся stale/recompute-required.

---

# 11. User Request — Parser Missed Important Criterion

Confirmation screen должен позволять:

```text
Добавить условие
```

или эквивалентный edit flow.

Нельзя заставлять возвращаться к raw prompt целиком, если можно исправить structured request.

---

# 12. User Request — Unsupported Criterion

Если пользователь просит criterion, для которого engine пока не имеет evaluator:

пример:

```text
чтобы соседи были тихие
```

UX не должен притворяться, что criterion оценён.

Показать:

```text
Это условие пока нельзя проверить автоматически.
```

Возможные действия:

```text
оставить как заметку
добавить в expert check
```

---

# 13. User Request — Too Many Criteria

Если пользователь задаёт десятки условий:

не скрывать их.

Но shortlist UI должен progressive-disclose.

Core:

```text
must / high-impact preferred first
```

Остальные — ниже.

---

# 14. Matching — No Eligible Results

Если все candidates hard fail:

показывать:

```text
По обязательным условиям подходящих вариантов не найдено.
```

Нельзя:

```text
автоматически ослабить must
```

---

# 15. Matching — All Results Have Critical Unknowns

Если нет confirmed eligible candidates, но есть potential matches:

показать отдельный section:

```text
Возможные варианты — нужны проверки
```

Не смешивать их с fully eligible без warning.

---

# 16. Matching — High Match / Low Confidence

Пример:

```text
94% подходит
Confidence low
```

UX:

```text
Потенциально сильный вариант, но критичные данные требуют проверки.
```

Не маркировать как однозначно лучший.

---

# 17. Matching — Low Match / High Confidence

Пример:

```text
62% подходит
Confidence high
```

UX должен показывать:

```text
Данные надёжные, но объект плохо соответствует вашим условиям.
```

---

# 18. Matching — Hard Fail Opened Directly

Если hard-fail объект открыт по прямой ссылке:

показывать:

```text
Не проходит обязательное условие
```

с конкретной причиной.

Не скрывать Match status.

---

# 19. Matching — Insufficient Data

Если evaluators не могут оценить слишком много material criteria:

status:

```text
insufficient_data
```

UX:

```text
Недостаточно данных, чтобы уверенно оценить вариант.
```

---

# 20. Matching — Equal Scores

Если два объекта имеют одинаковый Match Score:

не вводить artificial tie-break UX как “лучший”.

Использовать:

```text
decision drivers
confidence
trade-offs
```

---

# 21. Matching — Score Changes Slightly After Refresh

Если:

```text
91% → 90%
```

из-за minor factual update:

не делать alarming visual treatment.

Показывать:

```text
Результат обновлён
```

и что именно изменилось.

---

# 22. Data — Unknown Value

Если field unknown:

показывать:

```text
Нет данных
```

или:

```text
Не подтверждено
```

по semantics.

Не:

```text
Нет
0
—
```

если это может быть интерпретировано как factual negative.

---

# 23. Data — Claimed Value

Если source утверждает:

```text
ПВ 0
```

но verification = claimed:

показывать:

```text
Заявлено источником
```

и при materiality:

```text
Нужно подтвердить применимость.
```

---

# 24. Data — Stale Value

Если price stale:

```text
4 900 000 ₽
Данные могли измениться
```

Не скрывать последнее известное значение, если policy позволяет показывать, но не выдавать как current.

---

# 25. Data — Conflicting Values

Если:

```text
Source A: 4.9m
Source B: 5.1m
```

показывать conflict explicitly.

Не выбирать одно без resolution.

---

# 26. Data — Evidence Missing

Если canonical value существует, но provenance отсутствует:

это quality issue.

UX:

```text
Источник значения не подтверждён
```

или скрыть value из critical decision UI до исправления, согласно domain rules.

---

# 27. Data — Multiple Evidence Agree

Если два независимых evidence согласуются:

можно показать:

```text
Подтверждается несколькими источниками
```

только если source/evidence policy это действительно позволяет.

---

# 28. Data — Same Source Repeated

Два snapshots одного и того же source не должны визуально считаться:

```text
2 независимых источника
```

---

# 29. Data — Field Not Applicable

Пример:

```text
floor для detached house
```

Показывать:

```text
Не относится к этому типу объекта
```

Не:

```text
Нет
```

---

# 30. Shortlist — No Image

Card должна работать без media.

Использовать:

```text
type icon / neutral placeholder
```

если предусмотрено design system.

Не скрывать object.

---

# 31. Shortlist — Missing Price

Если price unknown:

показывать:

```text
Цена не указана
```

или:

```text
Цена требует уточнения
```

Не исключать автоматически, если budget hard и неизвестность должна дать critical unknown.

---

# 32. Shortlist — Price From

Показывать:

```text
от 4 900 000 ₽
```

Не:

```text
4 900 000 ₽
```

---

# 33. Shortlist — Unavailable Item

Если availability = unavailable:

primary shortlist не должен показывать как активный candidate.

Если state изменился после shortlist generation:

показать:

```text
Вариант больше недоступен
```

и предложить заменить.

---

# 34. Shortlist — Removed Listing

Если offer removed:

не писать:

```text
Продано
```

Показывать:

```text
Объявление снято
```

---

# 35. Shortlist — Only 1 Candidate

Если hard criteria очень строгие:

может быть один candidate.

Показывать его честно.

Не добавлять weaker results только для визуальной полноты.

---

# 36. Shortlist — More Than 10 Strong Candidates

Если matching возвращает много eligible:

показывать top configured shortlist.

Не превращать screen в infinite feed.

Дополнительный exploration flow — вне MVP.

---

# 37. Property Detail — Missing PurchaseScenario

Если financing не применимо или scenario не рассчитан:

показывать:

```text
Сценарий покупки не рассчитан
```

или:

```text
Покупка без ипотечного сценария
```

в зависимости от UserRequest.

Не создавать fake monthly payment.

---

# 38. Property Detail — Multiple Offers

Если Property имеет несколько Offer:

показывать:

```text
Выбранное предложение
```

и:

```text
Другие предложения
```

Не смешивать цены/условия.

---

# 39. Property Detail — Selected Offer Became Unavailable

Если выбранный Offer unavailable:

показать warning.

Если есть alternative Offer:

предложить:

```text
Посмотреть другое предложение по этому объекту
```

Не переключать silently.

---

# 40. Property Detail — Source Link Missing

Если source attribution разрешена, но direct URL отсутствует:

показывать source label без fake link.

---

# 41. Property Detail — No Active UserRequest

Не показывать personalized reasons.

Показать facts + CTA:

```text
Описать свои условия
```

---

# 42. Property Detail — Critical Unknown Count High

Если unknowns много:

не перегружать page одинаковыми warning cards.

Группировать:

```text
Критично для решения
Остальные данные требуют уточнения
```

---

# 43. Comparison — Only One Item

Показывать:

```text
Добавьте ещё один вариант для сравнения.
```

---

# 44. Comparison — Five Items Attempt

Limit:

```text
4
```

Показать:

```text
В сравнении уже 4 варианта.
Удалите один, чтобы добавить новый.
```

---

# 45. Comparison — Same Property Twice

Если user пытается добавить тот же physical Property через другой Offer:

не создавать duplicate column.

Показать:

```text
Этот объект уже участвует в сравнении.
```

Alternative Offer выбирается внутри Property context.

---

# 46. Comparison — Mixed UserRequest Versions

Если selected MatchResults относятся к разным request versions:

block.

Показать:

```text
Условия изменились — пересчитайте сравнение.
```

---

# 47. Comparison — Different Property Types

Если row не применима к одному type:

`not_applicable`.

Не штрафовать.

---

# 48. Comparison — One Item Hard Fail

Если direct-added item hard fail:

оставить его visible в comparison, но clearly mark:

```text
Не проходит обязательное условие
```

---

# 49. Comparison — All Hard Fail

Conclusion:

```text
Ни один вариант не проходит обязательные условия.
```

Не выбирать «лучший».

---

# 50. Comparison — Near Tie

Показывать:

```text
Явного лидера нет.
```

и 2–3 decision drivers.

---

# 51. Comparison — Insufficient Data

Если decision depends on critical unknown:

показывать:

```text
Для уверенного выбора не хватает данных.
```

---

# 52. Comparison — Mobile Overflow

Не скрывать columns beyond viewport без indication.

Использовать:

- sticky labels;
- horizontal scroll;
- clear selected item headers.

---

# 53. Financing — Initial Payment Unknown

Если monthly payment зависит от unknown down payment:

не показывать definitive monthly.

Показывать:

```text
Расчёт требует уточнения первоначального взноса.
```

---

# 54. Financing — Program Claimed but Eligibility Unknown

Показывать:

```text
Программа заявлена
```

и:

```text
Применимость к этому объекту не подтверждена
```

---

# 55. Financing — User Eligibility Unknown

Даже если object eligible:

пользовательская eligibility может быть unknown.

Не писать:

```text
Вам одобрено
```

---

# 56. Financing — Staged Rate

Если:

```text
0.1% first year
12% afterwards
```

показывать periods.

Не headline only.

---

# 57. Financing — Promo Expired

Если `valid_until` прошёл:

показывать:

```text
Акция закончилась
```

или:

```text
Условия требуют обновления
```

Не использовать expired promo в active scenario без explicit status.

---

# 58. Financing — Higher Price Under Promo

Если financing program повышает price:

показывать impact explicitly.

---

# 59. User URL — Invalid Scheme

Block:

```text
file://
ftp://
javascript:
```

Разрешать только supported schemes.

---

# 60. User URL — Private Network

Block SSRF-sensitive URLs.

User-facing:

```text
Эту ссылку нельзя обработать.
```

Не раскрывать internal security details.

---

# 61. User URL — Redirect to Private Network

Повторно validate destination.

Не follow blindly.

---

# 62. User URL — Unknown Source

Automation default:

```text
denied
```

Manual fallback allowed if product policy permits.

---

# 63. User URL — Restricted Source

Показывать:

```text
Этот источник нельзя обработать автоматически.
```

CTA:

```text
Добавить основные параметры вручную
```

---

# 64. User URL — Page Unavailable

Показывать:

```text
Не удалось открыть страницу.
```

Actions:

```text
Повторить
Добавить вручную
```

если source policy позволяет.

---

# 65. User URL — Partial Extraction

Если extracted только:

```text
price
area
```

показать confirmation form с missing required fields.

---

# 66. User URL — Duplicate Existing Property

Показать existing Property.

Если offer differs:

```text
Добавим новое предложение к существующему объекту.
```

---

# 67. User URL — Comparison Already Full

После successful ingestion:

не терять candidate.

Показать:

```text
Объект добавлен, но в сравнении уже 4 варианта.
```

Предложить выбрать, кого заменить.

---

# 68. Source Policy — Policy Changed After Enqueue

Если refresh task queued, но source later blocked:

task:

```text
blocked
```

UX:

```text
Автоматическая проверка этого источника сейчас недоступна.
```

---

# 69. Source Policy — Source Degraded

Не путать:

```text
source degraded
```

с:

```text
data false
```

Показывать current evidence + freshness.

---

# 70. Source Policy — Attribution Not Allowed

Если source facts можно использовать, но direct evidence snippet нельзя показывать:

показывать только allowed attribution layer.

---

# 71. Refresh — Duplicate Requests

Несколько user/system triggers:

```text
one active refresh task
```

UX не должен показывать 5 параллельных refresh operations.

---

# 72. Refresh — Already Fresh

Если user нажал refresh, но data fresh и policy не требует update:

показать:

```text
Данные актуальны на момент последней проверки.
```

---

# 73. Refresh — Partial Success

Пример:

```text
price updated
availability still unknown
```

Показывать field-level result.

Не:

```text
Всё обновлено
```

---

# 74. Refresh — No Change

Это success.

Показывать:

```text
Данные проверены — изменений нет.
```

---

# 75. Refresh — Source Changed

UX:

```text
Не удалось корректно проверить источник.
```

Не показывать old data как newly verified.

---

# 76. Refresh — Rate Limited

Показывать:

```text
Проверку можно повторить позже.
```

Не infinite spinner.

---

# 77. Refresh — User Leaves Page

Refresh task может продолжаться background.

UI после return должен восстановить state.

---

# 78. Expert — Duplicate Active Request

Если same active request exists:

показать:

```text
Этот вопрос уже передан на проверку.
```

Открыть existing request.

---

# 79. Expert — No Specialist Available

Request может остаться:

```text
queued
```

Не назначать fake expert.

---

# 80. Expert — Waiting for User

Показывать конкретно:

```text
Нужно уточнить X
```

Не generic:

```text
Нужна дополнительная информация
```

если structured question есть.

---

# 81. Expert — Waiting for External Info

Показывать:

```text
Ожидаем подтверждение от внешнего источника.
```

---

# 82. Expert — Unable to Verify

Это нормальный final/terminal outcome.

Показывать:

```text
Подтвердить факт не удалось.
```

Unknown остаётся.

---

# 83. Expert — Result Conflicts With Existing Evidence

Не overwrite silently.

Показывать conflict until resolution policy resolves.

---

# 84. Expert — Result Changes Hard Criterion

Если expert evidence превращает unknown в confirmed hard fail:

updated decision должен clearly show:

```text
Объект больше не проходит обязательное условие.
```

---

# 85. Expert — Result Improves Confidence Only

Если facts same:

```text
Match unchanged
Confidence improved
```

UX должен это объяснить.

---

# 86. Expert — Context Became Stale

Workbench показывает:

```text
После создания задачи данные изменились.
```

До start work можно refresh context.

После in_progress — snapshot remains auditable.

---

# 87. Expert — Invalid State Transition

UI action недоступен / service rejects.

Не mutate state locally.

---

# 88. Navigation — Browser Back

Browser back должен:

- сохранять request context;
- не сбрасывать comparison;
- не создавать duplicate expert request.

---

# 89. Navigation — Page Reload

При session persistence:

восстанавливать:

```text
journey_id
confirmed request
comparison refs
selected property
```

---

# 90. Navigation — Deep Link Without Context

Показывать controlled contextual state.

Не crash.

---

# 91. Navigation — Entity Deleted / Missing

Если URL ведёт на missing Property:

```text
Объект не найден
```

CTA:

```text
Вернуться к вариантам
```

---

# 92. Navigation — Comparison Item Missing

Не ломать весь comparison.

Показать unavailable column:

```text
Этот вариант больше недоступен.
```

---

# 93. Cross-type — Missing Common Dimension

Если commute data есть у apartment, но нет у house:

row:

```text
Apartment: 32 мин
House: Нет данных
```

Не считать house хуже автоматически.

---

# 94. Cross-type — Type-specific Criterion

Пример:

```text
этаж не первый
```

для house:

```text
not_applicable
```

не matched и не failed.

---

# 95. Cross-type — Shared Criterion with Different Semantics

Пример:

```text
площадь
```

Apartment area и house area могут быть comparable, но land area — отдельная dimension.

Не объединять без explicit mapping.

---

# 96. Cross-type — Move-in Readiness

New build:

```text
handover date
```

Secondary:

```text
available now / renovation
```

House:

```text
physical readiness / utilities
```

Comparison должен привести это к common user consequence:

```text
когда реально можно въехать
```

не путать raw fields.

---

# 97. Security — Sensitive User Text

Raw request может содержать:

- phone;
- income;
- family details;
- other PII.

Не отправлять full text в generic telemetry.

---

# 98. Security — User URL Contains Token

Не логировать full query string, если он может содержать token.

Use sanitized URL metadata.

---

# 99. Security — Unsafe External Link

Use safe external navigation.

Не embed unknown source HTML.

---

# 100. Security — Expert Access

Если permission cannot be determined:

deny.

Не показывать unrelated request.

---

# 101. Privacy — User Cancels Expert Request

Request state changes to cancelled.

Do not delete audit/evidence silently.

---

# 102. Privacy — User Data Deletion Requested

Если full deletion workflow ещё не implemented:

must have application hook / tracked blocker.

Не игнорировать request.

---

# 103. Pilot — Synthetic and Live Data Mixed

Каждая record должна иметь origin.

UI/demo tooling должен не выдавать synthetic data за live.

---

# 104. Pilot — No Approved Live Source

Product can run on fixtures/manual data.

Но live-source capability:

```text
disabled / blocked
```

не fake-enabled.

---

# 105. Pilot — Coverage Too Low

Если request выходит за pilot coverage:

показать:

```text
По этому запросу у сервиса пока недостаточно данных.
```

---

# 106. Pilot — Real User Requests Unsupported Property Type

Если core schema поддерживает type, но data coverage нет:

coverage gap.

Если schema/UX не поддерживает type:

explicit unsupported case.

Не подменять другим type.

---

# 107. Pilot — Real User Wants Commercial Property

Если MVP residential only:

показать:

```text
Этот тип задачи пока не поддерживается в пилоте.
```

Не делать bad partial match.

---

# 108. Pilot — User Wants Investment Analytics

Если user intent investment:

можно сохранить goal.

Но advanced yield/IRR не pretend calculated.

Показать current scope limitation.

---

# 109. Pilot — User Wants Nationwide Search

Если coverage limited:

показать current available geography/coverage.

Не обещать nationwide completeness.

---

# 110. Pilot — User Finds Better External Option

Это не failure.

User URL flow должен позволить добавить candidate и проверить, как он сравнивается.

---

# 111. Pilot — User Rejects Top Match

Это не автоматически matching defect.

Сначала определить:

- criterion missing?
- priority wrong?
- explanation unclear?
- personal preference not captured?

Правильный recovery:

```text
edit UserRequest
→ recompute
```

---

# 112. Pilot — User Rejects All Shortlist

Collect feedback.

Не auto-relax.

Classify:

```text
parser problem
matching problem
coverage problem
data problem
unmodeled preference
```

---

# 113. Pilot — User Does Not Need Expert

Это нормальный outcome.

Не считать low expert conversion product failure.

---

# 114. Pilot — Journey Ends at Comparison

Может быть success, если user reports decision clarity.

Journey completion не обязательно требует ExpertResult.

---

# 115. Global Edge Case — Empty String vs Unknown

Domain/UI must not use:

```text
""
```

как hidden unknown state.

Use explicit status.

---

# 116. Global Edge Case — Zero vs Missing

Especially finance:

```text
initial_payment = 0
```

не равно:

```text
initial_payment unknown
```

---

# 117. Global Edge Case — False vs Not Applicable

Example:

```text
elevator = false
```

≠

```text
elevator not_applicable
```

---

# 118. Global Edge Case — Old Price vs Current Price

Если source показывает:

```text
old price
discounted price
```

do not collapse into one ambiguous field.

---

# 119. Global Edge Case — Template vs Concrete Unit

Typical layout / marketing apartment type:

```text
not the same as concrete unit
```

Не использовать template facts как confirmed unit facts без identity.

---

# 120. Global Edge Case — Same Address, Different Unit

Strong dedup rule:

не merge Property только по address/building.

Unit identity matters.

---

# 121. Global Edge Case — Same Property, Multiple Sellers

Это:

```text
one Property
multiple Offers
```

---

# 122. Global Edge Case — Same Seller, Different Price Over Time

Это может быть:

```text
same Offer updated
```

с history/evidence.

Не создавать duplicate Offer бесконтрольно.

---

# 123. Global Edge Case — Promotion Applies Only to Some Units

Не переносить promo eligibility с development на все Property.

---

# 124. Global Edge Case — Bank Program Changed

Program rules versioned.

Old PurchaseScenario may become stale.

---

# 125. Global Edge Case — Handover Quarter Only

Если source says:

```text
Q4 2027
```

не показывать exact date.

---

# 126. Global Edge Case — Gas at Boundary

```text
Газ по границе
```

не равно:

```text
газ подключён
```

UX must preserve exact status.

---

# 127. Global Edge Case — School Distance vs Travel Time

Не заменять:

```text
distance
```

на:

```text
travel time
```

если evaluator/source semantics differ.

---

# 128. Global Edge Case — No Result Due to Source Failure

Если source temporarily failed:

не сообщать market no-result.

Coverage/source health must affect message.

---

# 129. Global Edge Case — Result Generated Before Data Refresh

Если newer evidence arrived:

mark:

```text
update available / recompute required
```

---

# 130. Global Edge Case — Result Generated Before Algorithm Version Change

Old MatchResult remains reproducible historical result.

Do not silently reinterpret it under new algorithm.

---

# 131. Global Edge Case — User Changes Priority Only

Even if values same:

new UserRequest version.

Recompute required.

---

# 132. Global Edge Case — Confidence Improves Without Fact Change

Expected:

```text
Match stable
Confidence improves
```

---

# 133. Global Edge Case — Fact Changes Without Confidence Improving

Possible.

Example:

new source gives different price but still conflicting.

Match may change; Confidence may remain low.

---

# 134. Global Edge Case — One Source Dominates Many Fields

Source priority is field-specific.

Do not create universal:

```text
source A always wins
```

---

# 135. Global Edge Case — Manual User Correction vs Source Fact

User correction should be stored as:

```text
user-supplied evidence
```

not silently overwrite source evidence.

---

# 136. Global Edge Case — Expert Opinion vs Verified Fact

Expert recommendation:

```text
recommendation
```

не равно:

```text
confirmed field value
```

Only structured verified finding with evidence may affect canonical facts.

---

# 137. Global Edge Case — No Recommendation Possible

Valid result:

```text
insufficient_data
```

или:

```text
near_tie
```

Do not force conclusion.

---

# 138. Global Edge Case — User Explicitly Accepts a Compromise

Если пользователь говорит:

```text
теперь готов рассматривать первый этаж
```

это change UserRequest.

Не manual override one Property.

---

# 139. Global Edge Case — Data Is Complete but Low Confidence

Completeness:

```text
high
```

может сочетаться с:

```text
confidence low
```

если значения mostly claimed/stale.

UX must not equate complete with reliable.

---

# 140. Global Edge Case — Data Is Sparse but High Confidence

Можно иметь несколько strongly confirmed fields, но низкую completeness.

Показывать separately.

---

# 141. Global Edge Case — Critical Override

Если overall confidence medium, но one critical must field unknown:

UI должен highlight critical unknown.

Не прятать за average score.

---

# 142. Global Edge Case — User Does Not Understand Percentage

Provide short explanation on demand:

```text
Это соответствие вашим условиям, а не общий рейтинг объекта.
```

---

# 143. Global Edge Case — User Questions Why Result Is Low

Detail/Comparison should expose criterion-level reasons.

Не отвечать generic AI explanation disconnected from evaluations.

---

# 144. Global Edge Case — User Questions Why Result Is High Despite Unknowns

Explain:

```text
Match reflects fit of known/evaluable criteria.
Confidence separately reflects reliability and missing critical data.
```

---

# 145. Global Edge Case — User Wants “Best Overall”

System should clarify:

```text
лучший под ваши подтверждённые условия
```

not universal best.

---

# 146. UX Error Message Principles

Error message should contain:

```text
what happened
what remains safe/preserved
what user can do next
```

Пример:

```text
Не удалось обновить цену.
Последнее известное значение сохранено.
Попробуйте позже или запросите проверку.
```

---

# 147. UX Warning Hierarchy

## Critical

Material to hard criterion / decision.

## Important

Can materially change comparison.

## Informational

Useful but not decision-blocking.

Не использовать одинаково тревожный UI для всех missing fields.

---

# 148. Edge Case Testing Requirement

Каждый major screen должен иметь tests минимум для:

```text
normal
empty
partial
unknown
conflict
stale
error
direct-entry
```

где applicable.

---

# 149. Cross-module Regression Set

Обязательные regression cases:

```text
unknown != false
claimed != confirmed
stale != current
removed != sold
not_applicable != false
Property != Offer
Offer != PurchaseScenario
Match != Confidence
Completeness != Confidence
no Frankenstein scenario
no silent hard-criteria relaxation
no source-policy bypass
no expert manual Match mutation
```

---

# 150. Final Edge-case Principle

> **Если система не знает ответ, правильный UX — показать границу знания и следующий способ её уменьшить, а не угадывать.**

Финальная формула:

```text
Неясность
→ явный статус
→ объяснение
→ meaningful next action
```

а не:

```text
Неясность
→ скрытая догадка
→ ложная уверенность
```
