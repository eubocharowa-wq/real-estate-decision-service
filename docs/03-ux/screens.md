# Screens

## Status

`approved_for_repository`

## Product

**Real Estate Decision Service**

---

# 1. Purpose

Этот документ фиксирует структуру экранов MVP v1, их продуктовую роль, обязательные блоки, основные состояния и ключевые действия пользователя.

Он не является visual design spec в пиксельном смысле.

Он отвечает на вопросы:

- какие экраны нужны;
- зачем нужен каждый экран;
- какие данные он показывает;
- какие действия доступны;
- что считается обязательным;
- какие состояния нельзя скрывать;
- какие UX-ошибки недопустимы.

Главный принцип:

> **Каждый экран должен уменьшать неопределённость и приближать пользователя к более ясному решению.**

---

# 2. Screen Map

MVP buyer-facing screens:

```text
1. Home / Request Entry
2. Request Confirmation
3. Matching / Search Progress
4. Shortlist
5. Property Detail
6. Comparison
7. Add User URL
8. Expert Request
9. Expert Request Status
10. Expert Result Review
11. Updated Decision
```

Internal:

```text
12. Expert Request Queue
13. Expert Workbench
```

Supporting states:

```text
No Results
Coverage Gap
Error
Stale Context
Permission / Policy Block
```

---

# 3. Global UX Rules

На всех buyer-facing экранах должны сохраняться:

- active UserRequest context;
- понятная навигация назад;
- различие Match и Confidence;
- различие confirmed / claimed / unknown / conflicting / stale;
- отсутствие generic property praise;
- отсутствие commercial influence;
- отсутствие source-policy overpromise.

---

# 4. Screen 1 — Home / Request Entry

## Goal

Получить реальную задачу пользователя без длинной анкеты.

## Primary message

```text
Опишите, какую недвижимость вы ищете и что для вас важно
```

## Supporting copy

Пример:

```text
Бюджет, способ покупки, сроки, район, инфраструктура,
тип недвижимости и любые другие условия.
```

## Main control

Большое text input / textarea.

## Primary CTA

```text
Подобрать варианты
```

---

# 5. Home — Example Prompts

Допустимо показать 3–4 examples:

```text
Квартира до 5 млн, семейная ипотека обязательна.
```

```text
Хотим дом или квартиру для семьи с детьми, платёж до 80 тыс.
```

```text
У меня уже есть три варианта — хочу сравнить.
```

```text
Я почти выбрал объект и хочу проверить важные условия.
```

Examples должны помогать начать, а не превращаться в шаблоны, которые пользователь обязан копировать.

---

# 6. Home — Secondary Entry Points

Допустимые secondary actions:

```text
У меня уже есть варианты
```

```text
Добавить ссылку
```

Не делать на первом экране большой каталог недвижимости.

---

# 7. Home — States

## Empty

Поле пустое.

CTA disabled или validation after submit.

## Invalid / too vague

Не придумывать request.

Показать:

```text
Опишите хотя бы, что вы хотите найти или решить.
```

## Parser failure

Сохранить raw input.

Показать:

```text
Не удалось разобрать запрос.
Попробуйте уточнить формулировку.
```

---

# 8. Screen 2 — Request Confirmation

## Goal

Дать пользователю проверить:

> правильно ли система поняла условия?

## Header

```text
Проверьте, правильно ли мы вас поняли
```

---

# 9. Confirmation — Main Sections

Рекомендуемый порядок:

```text
1. Краткое резюме задачи
2. Обязательно
3. Желательно
4. Лучше избежать
5. Неясно / требует уточнения
6. Clarifications
7. Confirm CTA
```

---

# 10. Confirmation — Criterion Item

Каждый criterion показывает:

```text
label
value
priority
edit action
remove action
```

Пример:

```text
Бюджет
До 5 000 000 ₽
Обязательно
```

---

# 11. Confirmation — Priority Editing

Поддержать:

```text
Обязательно
Желательно
Нейтрально
Лучше избежать
Исключить
```

Не заставлять пользователя понимать internal enum names.

---

# 12. Confirmation — Unknown

Если значение неизвестно:

```text
Не указано
```

Не подставлять default.

---

# 13. Confirmation — Contradiction

Показывать заметно:

```text
Нужно уточнить
```

Пример:

```text
Вы указали бюджет до 5 млн,
но также хотите вариант не дешевле 5,5 млн.
```

Blocking contradiction не позволяет подтвердить request.

---

# 14. Confirmation — Clarifications

Показывать максимум 1–3 material questions.

Каждый вопрос должен объяснять, почему он нужен.

Не:

```text
Заполните ещё 12 параметров
```

---

# 15. Confirmation — Primary CTA

```text
Всё верно — подобрать варианты
```

Secondary:

```text
Вернуться к описанию
```

---

# 16. Screen 3 — Matching / Search Progress

## Goal

Дать понятный переход между confirmed request и shortlist.

## Allowed messaging

```text
Подбираем варианты под ваши условия
```

Допустимые stages:

```text
Сравниваем с обязательными условиями
Проверяем подходящие сценарии покупки
Оцениваем качество данных
```

---

# 17. Matching Progress — Forbidden UX

Не показывать fake:

```text
73% рынка просмотрено
```

```text
Проверяем 127 сайтов
```

если этого реально нет.

---

# 18. Matching Progress — Error

Если matching failed:

```text
Не удалось завершить подбор.
Ваши условия сохранены.
```

Actions:

```text
Повторить
Изменить условия
```

---

# 19. Screen 4 — Shortlist

## Goal

Показать небольшой набор meaningful candidates.

## Header

```text
Подходящие варианты
```

Subheader:

краткое summary подтверждённого UserRequest.

Пример:

```text
До 5 млн ₽ · семейная ипотека обязательна · не первый этаж
```

Action:

```text
Изменить условия
```

---

# 20. Shortlist — Card Structure

Каждая card показывает:

```text
Property identity
Location / type summary
Price
Match Score
Data Confidence
2–3 strengths
1–2 compromises
Critical unknown if any
Availability / freshness
Selected PurchaseScenario summary
```

---

# 21. Shortlist — Match Presentation

Пример:

```text
92% подходит именно вам
```

Не:

```text
Рейтинг 92%
```

---

# 22. Shortlist — Confidence Presentation

Отдельный label:

```text
Данные: высокая уверенность
```

или:

```text
Данные требуют проверки
```

Не соединять визуально так, чтобы пользователь воспринимал confidence как часть Match Score.

---

# 23. Shortlist — Strengths

Примеры:

```text
✓ проходит обязательный бюджет
✓ подходит по сроку въезда
✓ школа в нужной доступности
```

Только user-specific reasons.

---

# 24. Shortlist — Compromises

Пример:

```text
Площадь меньше желаемой на 7 м².
```

Не скрывать compromises за collapsed details.

---

# 25. Shortlist — Critical Unknown

Если есть material unknown:

```text
Нужно подтвердить применимость семейной ипотеки.
```

Это должно быть заметно прямо в card.

---

# 26. Shortlist — Card Actions

Primary:

```text
Подробнее
```

Secondary:

```text
Добавить к сравнению
```

---

# 27. Shortlist — Comparison Selection

После выбора 1 объекта:

```text
1 вариант выбран
```

После 2+:

```text
Сравнить выбранные
```

Максимум:

```text
4
```

---

# 28. Shortlist — No Results

Если hard criteria исключили всех:

```text
По вашим обязательным условиям подходящих вариантов не найдено.
```

Action:

```text
Изменить условия
```

---

# 29. Shortlist — Coverage Gap

Если проблема в coverage:

```text
По этому запросу данных пока недостаточно.
```

Показать:

- что покрыто;
- чего не хватает;
- можно ли добавить свой вариант.

CTA:

```text
Добавить ссылку
```

---

# 30. Screen 5 — Property Detail

## Goal

Объяснить один вариант как решение.

## Header

Минимум:

```text
Property title
type
location
price
availability
Match Score
Data Confidence
```

---

# 31. Property Detail — Section Order

Рекомендуемый:

```text
1. Почему подходит вам
2. Компромиссы
3. Что нужно подтвердить
4. Ваши условия
5. Как купить
6. Другие Offer
7. Об объекте
8. Источники и актуальность
9. Что проверить дальше
10. Actions
```

---

# 32. Property Detail — Why It Fits

Показывать 3–5 ключевых strengths.

Не generic marketing.

---

# 33. Property Detail — Compromises

Отдельный блок.

Если нет significant compromises:

не invent generic positive message.

---

# 34. Property Detail — Critical Unknowns

Заметный блок:

```text
Что ещё нужно подтвердить
```

Каждый item:

```text
field
why important
current status
recommended action
```

---

# 35. Property Detail — Conflict

Пример:

```text
Цена расходится между источниками:
4 890 000 ₽
5 050 000 ₽
```

Если доступны:

```text
source
checked at
```

---

# 36. Property Detail — Criteria Results

Группы:

```text
Обязательные
Желательные
Лучше избежать
```

Для каждого:

```text
target
actual
status
verification
freshness
```

---

# 37. Property Detail — Purchase Scenario

Header:

```text
Как купить
```

Показывать:

```text
selected Offer
price
initial payment
monthly payment
program
rate periods
term
mandatory costs
assumptions
verification
validity
```

---

# 38. Property Detail — Financing Claim

Если condition claimed:

```text
Условие заявлено источником, но ещё не подтверждено для этого объекта.
```

---

# 39. Property Detail — Alternative Offers

Header:

```text
Другие предложения по этому же объекту
```

Каждый Offer отдельно.

Не смешивать terms.

---

# 40. Property Detail — Property Facts

Type-specific facts.

Apartment:

```text
rooms
area
floor
finish
building
handover/readiness
```

House:

```text
house area
land area
utilities
road access
readiness
```

---

# 41. Property Detail — Provenance

Header:

```text
Источники и актуальность
```

Минимум:

```text
Source
What it supports
Checked at
Verification
Freshness
```

---

# 42. Property Detail — Recommended Checks

Header:

```text
Что стоит проверить перед решением
```

Примеры:

```text
Уточнить актуальную цену
Подтвердить availability
Проверить applicability financing
Проверить срок передачи
```

---

# 43. Property Detail — Actions

```text
Вернуться к вариантам
Добавить к сравнению
Проверить этот вопрос
Изменить условия
```

---

# 44. Property Detail — No Active UserRequest

Если страница открыта напрямую:

можно показать facts.

Но вместо personalized block:

```text
Соответствие вашим условиям ещё не рассчитано.
```

CTA:

```text
Описать свои условия
```

---

# 45. Screen 6 — Comparison

## Goal

Помочь увидеть trade-offs между 2–4 finalists.

## Header

```text
Сравнение вариантов
```

Subheader:

active UserRequest summary.

---

# 46. Comparison — Top Summary

Для каждого Property:

```text
title
price
Match Score
Data Confidence
selected PurchaseScenario
```

---

# 47. Comparison — Sections

```text
1. Обязательные условия
2. Желательные условия
3. Лучше избежать
4. Финансирование
5. Сроки
6. Location / infrastructure
7. Property fit
8. Type-specific facts
9. Unknowns / conflicts
10. Decision drivers
11. Trade-offs
12. Conclusion
```

---

# 48. Comparison — Criterion Row

Каждая row:

```text
criterion
user target
importance
Property A result
Property B result
Property C result
verification/freshness
```

---

# 49. Comparison — Not Applicable

Показывать:

```text
Не относится к этому типу объекта
```

Не:

```text
Нет
```

---

# 50. Comparison — Decision Drivers

Header:

```text
Что сильнее всего отличает эти варианты
```

Только high-impact differences.

---

# 51. Comparison — Trade-offs

Пример:

```text
A дешевле на входе, но дальше от школы.
B дороже, но можно въехать сразу.
```

---

# 52. Comparison — Conclusion

Поддерживать:

```text
Явный лидер
Лидер при условии
Почти равные варианты
Недостаточно данных
Ни один не проходит обязательные условия
```

---

# 53. Comparison — Actions

```text
Открыть объект
Удалить из сравнения
Добавить ещё вариант
Изменить условия
Попросить помочь выбрать
```

---

# 54. Comparison — Mobile

Не превращать в длинный unrelated card stack.

Допустимо:

- horizontal comparison;
- criterion-by-criterion grouped cards;
- fixed property header.

Главное — пользователь должен видеть различия рядом.

---

# 55. Screen 7 — Add User URL

## Goal

Добавить найденный пользователем объект в общий decision context.

## Header

```text
Добавить свой вариант
```

## Input

```text
Вставьте ссылку на объект
```

---

# 56. Add URL — Supporting Copy

```text
Если источник можно обработать автоматически, мы извлечём данные.
Если нет — предложим добавить ключевые параметры вручную.
```

---

# 57. Add URL — States

```text
Checking URL
Source identified
Automatic extraction
Needs confirmation
Manual fallback
Duplicate suspected
Ready
Error
```

---

# 58. Add URL — Policy Block

Показывать:

```text
Не можем автоматически извлечь данные с этого источника.
Вы можете добавить основные параметры вручную.
```

---

# 59. Add URL — Preview

После extraction:

```text
Проверьте, правильно ли мы поняли объект
```

Editable minimum:

```text
type
location
price
rooms
area
floor
seller/source
```

---

# 60. Add URL — Duplicate Notice

```text
Похоже, этот объект уже есть в сервисе.
```

Показать существующий Property и новый Offer context.

---

# 61. Add URL — Success

CTA:

```text
Добавить в сравнение
```

Если comparison full:

```text
В сравнении уже 4 варианта.
```

---

# 62. Screen 8 — Expert Request

## Goal

Создать конкретную expert task, а не generic lead.

## Header

Зависит от context:

```text
Проверить этот вопрос
```

или:

```text
Помочь выбрать между вариантами
```

---

# 63. Expert Request — Context Preview

Показывать:

```text
Что проверяем
Почему это важно
Какой объект / comparison
Какие данные уже есть
Какие вопросы остаются
```

---

# 64. Expert Request — User Question

Editable text:

```text
Ваш вопрос эксперту
```

Предзаполненный system question допустим.

---

# 65. Expert Request — Specialist

Можно показать:

```text
Нужен специалист:
Ипотечный специалист
```

если routing deterministic.

Не заставлять пользователя выбирать specialist вручную без необходимости.

---

# 66. Expert Request — Submit

CTA:

```text
Передать на экспертную проверку
```

или context-specific equivalent.

---

# 67. Screen 9 — Expert Request Status

## Goal

Показать текущее состояние экспертной задачи.

Statuses user-facing:

```text
Заявка отправлена
Ожидает специалиста
Проверяем
Нужна информация от вас
Ждём внешний ответ
Проверка завершена
Не удалось проверить
```

---

# 68. Expert Status — Waiting for User

Показать:

```text
Чтобы продолжить, нужна дополнительная информация.
```

с конкретным requested item.

---

# 69. Screen 10 — Expert Result Review

## Goal

Показать structured outcome проверки.

## Header

```text
Результат экспертной проверки
```

---

# 70. Expert Result — Main Sections

```text
1. Что проверяли
2. Что подтвердилось
3. Что не подтвердилось
4. Что осталось неизвестным
5. Какие conflicts остались
6. Что это меняет в вашем выборе
7. Что делать дальше
8. Evidence / source summary
```

---

# 71. Expert Result — Decision Impact

Header:

```text
Что это меняет в вашем выборе
```

Примеры:

```text
После подтверждения цены вариант остаётся в бюджете.
```

```text
Условие ПВ 0 не подтвердилось — объект больше не проходит обязательное финансовое условие.
```

---

# 72. Expert Result — Choice Assistance

Для comparison:

```text
Экспертный вывод
```

Statuses:

```text
Есть явный лидер
Лидер при условии
Варианты близки
Недостаточно данных
Ни один не подходит
```

---

# 73. Expert Result — Boundary Copy

Для document/technical/financing cases сохранять:

```text
Не является банковским одобрением
```

```text
Не заменяет юридическое заключение
```

```text
Визуальная проверка не равна техническому обследованию
```

где relevant.

---

# 74. Screen 11 — Updated Decision

## Goal

Показать, что изменилось после new evidence, refresh или expert verification.

## Header

```text
Результат обновлён
```

---

# 75. Updated Decision — Before / After

Если есть versioned data:

```text
Было
→ Стало
```

Показывать отдельно:

```text
Match Score
Data Confidence
critical unknowns
conflicts
eligibility/status
```

---

# 76. Updated Decision — No Match Change

Если confidence улучшился, а facts не изменились:

показывать:

```text
Соответствие осталось прежним.
Данные стали надёжнее.
```

Это важный trust pattern.

---

# 77. Updated Decision — Actions

```text
Вернуться к объекту
Вернуться к сравнению
Продолжить поиск
Изменить условия
```

---

# 78. Screen 12 — Expert Request Queue (Internal)

## Goal

Дать специалисту список active requests.

## Default sections / filters

```text
Queued
Assigned
In Progress
Waiting
```

---

# 79. Expert Queue — Row/Card

Минимум:

```text
Request type
Priority
Question summary
Property/comparison
Required specialist
Status
Created at
```

---

# 80. Expert Queue — Ordering

```text
critical
high
normal
low
```

Внутри:

```text
oldest first
```

---

# 81. Screen 13 — Expert Workbench

## Goal

Дать специалисту весь relevant context и structured workflow проверки.

## Main Sections

```text
1. User question
2. UserRequest summary
3. Property / Comparison context
4. Unknowns / Conflicts
5. Check Plan
6. Checked Items
7. Findings
8. Evidence refs
9. Recommendation
10. Next actions
11. Completion
```

---

# 82. Workbench — Checked Item

Эксперт выбирает:

```text
Подтверждено
Не подтвердилось
Есть расхождение
Не удалось проверить
Не требуется
```

и method.

---

# 83. Workbench — Finding

Fields:

```text
category
severity
statement
related entity
related field
evidence refs
```

---

# 84. Workbench — Completion Guard

Нельзя завершить request, если:

- check plan не закрыт;
- unresolved items не обозначены;
- result invalid;
- claimed confirmation не имеет evidence;
- state transition invalid.

---

# 85. Global State — Loading

Использовать короткие честные labels.

Не fake progress.

---

# 86. Global State — Empty

Каждый empty state должен объяснять:

```text
почему пусто
что можно сделать
```

---

# 87. Global State — Partial

Partial data не скрывать.

Показывать:

```text
Нет данных
Не подтверждено
Данные устарели
```

по semantics.

---

# 88. Global State — Error

Error screen/component должен содержать:

```text
human-readable message
recoverability
next action
```

---

# 89. Global State — Stale Context

Если UserRequest/data changed:

```text
Есть более свежий контекст.
Результат нужно пересчитать.
```

---

# 90. Global State — Policy Block

Если source operation запрещена:

не показывать technical legal jargon.

Показывать:

```text
Этот источник нельзя обработать автоматически.
```

и manual/alternative action.

---

# 91. Global Component — Match Badge

Показывает только:

```text
personal fit
```

Не содержит Confidence.

---

# 92. Global Component — Confidence Badge

Показывает:

```text
high
medium
low
critical
```

через user-facing labels.

---

# 93. Global Component — Verification Badge

Mapping:

```text
confirmed → Подтверждено
claimed → Заявлено источником
unconfirmed → Не подтверждено
conflicting → Есть расхождение
stale → Данные устарели
unknown → Нет данных
```

---

# 94. Global Component — Freshness

Examples:

```text
Проверено сегодня
Проверено 2 дня назад
Данные могли измениться
```

---

# 95. Global Component — Price

Различать:

```text
4 900 000 ₽
```

и:

```text
от 4 900 000 ₽
```

---

# 96. Global Component — Availability

Различать:

```text
В продаже
Забронирован
Продан
Объявление снято
Статус уточняется
```

---

# 97. Global Component — Purchase Scenario Summary

Минимум:

```text
initial payment
monthly payment
program
verification
```

Не показывать headline rate без context.

---

# 98. Global Component — Source Summary

Показывать business-friendly:

```text
Официальный сайт застройщика
Банк
Государственный источник
Источник продавца
Экспертная проверка
```

только если source type это подтверждает.

---

# 99. Global Component — Unknown Callout

Не использовать alarming visual treatment для любого missing field.

High emphasis только для:

```text
critical unknown
```

---

# 100. Global Component — Conflict Callout

Conflict должен быть визуально distinct от unknown.

---

# 101. Global Component — Request Summary

Compact representation active UserRequest:

```text
До 5 млн ₽ · семейная ипотека обязательно · не первый этаж · въехать до октября
```

Используется:

- shortlist;
- comparison;
- expert context.

---

# 102. Responsive Principles

## Desktop

Использовать пространство для:

- comparison columns;
- detail + sticky summary;
- expert context + editor.

## Mobile

Single-column first.

Comparison может использовать horizontal comparison, но не терять side-by-side meaning.

---

# 103. Accessibility Principles

Все core screens должны иметь:

- semantic headings;
- proper labels;
- keyboard navigation;
- visible focus;
- status text not color-only;
- accessible errors;
- meaningful button names.

---

# 104. Copy Principles

Текст должен быть:

- коротким;
- конкретным;
- без marketing exaggeration;
- без unexplained technical jargon.

---

# 105. Forbidden Copy Patterns

Не:

```text
Идеальный вариант
Лучший объект
Точно подходит
Гарантированная ипотека
Юридически чисто
Всё проверено
```

если formal data этого не подтверждают.

---

# 106. Primary CTA Hierarchy

CTA зависит от decision stage.

## Entry

```text
Подобрать варианты
```

## Confirmation

```text
Подтвердить и подобрать
```

## Shortlist

```text
Подробнее
```

## Detail

```text
Добавить к сравнению
```

## Comparison

```text
Помочь выбрать
```

## Unknown

```text
Проверить этот вопрос
```

## Expert Result

```text
Вернуться к решению
```

---

# 107. No Generic Lead CTA

Не делать основным:

```text
Оставить заявку
Получить консультацию
Связаться с менеджером
```

без контекста.

---

# 108. Screen Success Test

Каждый экран должен проходить проверку:

1. Пользователь понимает, где он?
2. Понимает, какой UserRequest active?
3. Понимает, что система знает?
4. Понимает, что неизвестно?
5. Видит следующий meaningful action?
6. Не получает ложной уверенности?
7. Не превращается ли экран в generic real-estate portal UI?

---

# 109. MVP Screen Definition of Done

Screen layer готов, если все buyer-facing core screens:

```text
Request Entry
Request Confirmation
Shortlist
Property Detail
Comparison
User URL
Expert Request
Expert Result
Updated Decision
```

имеют:

- defined purpose;
- required data;
- primary actions;
- loading/empty/error states;
- uncertainty presentation;
- mobile behavior;
- accessibility baseline.

---

# 110. Final UX Principle

> **Экран существует не потому, что “так принято в сервисах недвижимости”, а потому, что на этом этапе пользователю нужно принять конкретное промежуточное решение.**

Финальная проверка:

```text
Этот экран помогает выбрать
или
просто показывает больше информации?
```

Если второе — экран требует пересмотра.
