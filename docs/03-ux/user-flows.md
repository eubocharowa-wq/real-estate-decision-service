# User Flows

## Status

`approved_for_repository`

## Product

**Real Estate Decision Service**

---

# 1. Purpose

Этот документ фиксирует основные пользовательские сценарии MVP и правила переходов между ними.

UX продукта должен поддерживать главную продуктовую последовательность:

> **Сначала человек → затем подбор и сравнение → затем проверка/разбор → потом решение.**

Основной принцип UX:

```text
Задача
→ Понимание
→ Подбор
→ Объяснение
→ Сравнение
→ Проверка при необходимости
→ Решение
```

UX не должен превращать продукт:

- в каталог объявлений;
- в длинную анкету;
- в AI-чат без структуры;
- в жёсткий пошаговый wizard;
- в generic lead form.

---

# 2. UX North Star

После прохождения основного сценария пользователь должен понимать:

- какие условия система считает обязательными;
- какие варианты реально подходят;
- почему они подходят;
- где есть компромиссы;
- какие данные подтверждены;
- какие данные требуют проверки;
- какие 2–4 варианта являются финалистами;
- что изменит дальнейшая проверка.

---

# 3. Main Entry Scenarios

MVP должен поддерживать четыре основных точки входа.

## Scenario A — Пользователь знает, что ищет

Пример:

```text
Нужна 2-комнатная квартира до 7 млн,
семейная ипотека обязательна,
первый этаж не рассматриваю,
въехать нужно до октября.
```

Flow:

```text
Home / Request Entry
→ Parse
→ Request Confirmation
→ Matching
→ Shortlist
→ Property Detail
→ Comparison
→ Decision / Verification
```

---

# 4. Scenario B — Пользователь описывает жизненную задачу

Пример:

```text
Хотим переехать с двумя детьми.
Не понимаем, лучше квартира или дом.
Платёж до 90 тыс.
Важно, чтобы школа была рядом.
```

Flow:

```text
Home / Request Entry
→ Parse
→ 1–3 material clarifications if needed
→ Request Confirmation
→ Cross-type Matching
→ Shortlist
→ Detail
→ Comparison
→ Decision
```

---

# 5. Scenario C — Пользователь уже нашёл варианты

Пример:

```text
Вот три ссылки.
Помогите понять, какой вариант лучше для нас.
```

Flow:

```text
Home / Add Existing Options
→ Add URL
→ Source Identification
→ Policy Gate
→ Automatic Ingestion or Manual Confirmation
→ Normalize
→ Confirm / create UserRequest if missing
→ Match each candidate
→ Comparison
→ Detail if needed
→ Decision / Expert Verification
```

---

# 6. Scenario D — Пользователь почти выбрал объект

Пример:

```text
Я уже выбрал квартиру.
Хочу понять, реальна ли цена,
подходит ли семейная ипотека
и есть ли ещё что-то важное.
```

Flow:

```text
Selected Property / User URL
→ Property Detail
→ Unknowns / Conflicts / Recommended Checks
→ Expert Request or Refresh
→ Expert Result / Updated Evidence
→ Recompute
→ Updated Decision
```

---

# 7. Primary Buyer Journey

Основной happy path:

```text
1. Request Entry
2. Request Parsing
3. Request Confirmation
4. Matching
5. Shortlist
6. Property Detail
7. Comparison
8. Expert Request if needed
9. Expert Result
10. Updated Decision
```

Пользователь не обязан проходить все этапы.

Например:

```text
Request
→ Shortlist
→ Detail
→ Decision
```

может быть достаточным.

---

# 8. Home / Request Entry Flow

Главная задача первого экрана:

> получить реальную задачу пользователя без длинного questionnaire-first UX.

Основной CTA:

```text
Опишите, какую недвижимость вы ищете и что для вас важно
```

Поддерживаемые примеры:

```text
Квартира до 5 млн, семейная ипотека обязательна.
```

```text
Хотим дом или квартиру для семьи с детьми, платёж до 80 тыс.
```

```text
У меня уже есть три варианта — хочу сравнить.
```

---

# 9. Request Entry Output

После submit:

```text
raw_request_text
```

сохраняется неизменным.

Далее:

```text
raw text
→ parser
→ structured draft
```

---

# 10. Parsing Flow

Parser должен:

- извлечь только явные условия;
- определить intent;
- распознать priorities;
- отметить contradictions;
- отметить unknowns;
- определить confidence;
- сформировать clarification candidates.

Parser не должен:

- придумывать критерии;
- автоматически расширять бюджет;
- предполагать ипотечную eligibility;
- превращать preferred в must.

---

# 11. Clarification Flow

Если есть material uncertainty:

```text
Parser
→ Clarification
→ Updated Draft
```

Количество:

```text
1–3
```

Не задавать уточнение, если оно не меняет decision outcome.

---

# 12. Request Confirmation Flow

Экран:

```text
Проверьте, правильно ли мы вас поняли
```

Показывает группы:

```text
Обязательно
Желательно
Лучше избежать
Неясно / требует уточнения
```

Пользователь может:

- редактировать value;
- менять priority;
- удалять criterion;
- отвечать на clarification;
- разрешать contradiction;
- подтверждать request.

---

# 13. Confirmation Guard

Переход:

```text
Request Confirmation
→ Matching
```

разрешён только если:

- blocking contradictions отсутствуют;
- request schema valid;
- пользователь подтвердил interpretation.

---

# 14. Edit Request Flow

Из:

```text
Shortlist
Property Detail
Comparison
```

пользователь может выбрать:

```text
Изменить условия
```

Flow:

```text
Current Journey
→ Request Confirmation
→ Edit
→ New UserRequest Version
→ Recompute
```

Старые MatchResults становятся stale.

---

# 15. Matching Flow

После confirmation:

```text
Confirmed UserRequest
→ Criteria Evaluation
→ Hard Criteria
→ PurchaseScenario Eligibility
→ Soft Criteria
→ MatchResult
→ DataQuality
→ Shortlist
```

UX не должен показывать technical calculations.

Допустимые progress labels:

```text
Подбираем варианты
Сравниваем с вашими условиями
Проверяем данные
```

Без fake counters.

---

# 16. Matching Failure Flow

Если calculation failed:

```text
Ошибка подбора
```

Пользователь не должен терять confirmed request.

CTA:

```text
Повторить
```

или:

```text
Изменить условия
```

---

# 17. Shortlist Flow

Shortlist — основной decision screen после matching.

Цель:

```text
5–10 meaningful candidates
```

Card показывает:

- объект;
- цену;
- Match Score;
- Data Confidence;
- strengths;
- compromises;
- critical unknown;
- selected PurchaseScenario;
- freshness/availability.

Основные действия:

```text
Открыть
Добавить к сравнению
```

---

# 18. Shortlist Ordering

Shortlist использует порядок, переданный matching/ranking layer.

UI не создаёт новый скрытый рейтинг.

---

# 19. Shortlist → Detail

Flow:

```text
Shortlist
→ Open Property
→ Property Detail
```

Контекст должен сохранить:

```text
user_request_id/version
property_id
selected_offer_id
purchase_scenario_id
match_result_id
```

---

# 20. Shortlist → Comparison

Пользователь выбирает:

```text
2–4 Property
```

Flow:

```text
Shortlist
→ Add to Comparison
→ Comparison Selection State
→ Comparison
```

При одном объекте:

```text
Добавьте ещё один вариант
```

---

# 21. No-results Flow

Если primary shortlist пуст:

```text
По подтверждённым обязательным условиям подходящих вариантов не найдено.
```

Дальше:

```text
Изменить условия
```

Если причина — coverage gap:

```text
По этому условию данных пока недостаточно.
```

Нельзя автоматически расслаблять must.

---

# 22. Property Detail Flow

Цель страницы:

> помочь понять один вариант как решение, а не как объявление.

Порядок:

```text
1. Decision Summary
2. Why It Fits
3. Compromises
4. Critical Unknowns / Conflicts
5. User Criteria
6. Selected PurchaseScenario
7. Alternative Offers
8. Property Facts
9. Sources / Freshness
10. Recommended Checks
11. Actions
```

---

# 23. Property Detail Actions

Основные:

```text
Вернуться к вариантам
Добавить к сравнению
Проверить конкретный вопрос
Изменить условия
```

Не делать generic:

```text
Оставьте телефон
```

основным действием.

---

# 24. Direct Property Entry

Если пользователь открыл Property Detail без active UserRequest:

можно показать property facts.

Но нельзя показывать персональный Match Score.

CTA:

```text
Описать свои условия
```

---

# 25. Critical Unknown Flow

Если detail содержит critical unknown:

```text
Critical Unknown
→ Recommended Check
```

Далее возможны:

```text
Refresh
Expert Request
Manual confirmation
```

в зависимости от type/policy.

---

# 26. Conflict Flow

Если source data конфликтуют:

```text
Property Detail
→ Conflict visible
→ Show evidence/source summary
→ Recommended Check
→ Refresh or Expert Request
```

Не выбирать значение silently.

---

# 27. Comparison Flow

Comparison создаётся для:

```text
2–4 Property
```

Структура:

```text
Request Summary
→ Match / Confidence
→ Must Criteria
→ Preferred / Avoid
→ Financing
→ Timing
→ Location / Infrastructure
→ Type-specific Facts
→ Unknowns / Conflicts
→ Decision Drivers
→ Trade-offs
→ Conclusion Status
```

---

# 28. Comparison Conclusion Flow

Допустимые outcomes:

```text
clear_leader
conditional_leader
near_tie
insufficient_data
no_valid_option
```

Пользователь не обязан получать winner.

---

# 29. Comparison → Detail

Из любого comparison item:

```text
Открыть объект
```

Flow:

```text
Comparison
→ Property Detail
→ Back to Comparison
```

Comparison selection сохраняется.

---

# 30. Comparison → Edit Conditions

Если пользователь понимает, что priorities изменились:

```text
Comparison
→ Изменить условия
→ Confirmation
→ New UserRequest Version
→ Recompute
→ Updated Shortlist / Comparison
```

Старая comparison conclusion становится stale.

---

# 31. Comparison → Expert Choice Assistance

Если 2–4 финалиста остаются близкими:

```text
Comparison
→ Помочь выбрать между этими вариантами
→ ExpertRequest(choice_assistance)
→ Context Preview
→ Submit
```

---

# 32. Add User URL Flow

Entry points:

```text
Shortlist
Comparison
```

CTA:

```text
Добавить свой вариант
```

---

# 33. URL Automatic Flow

```text
Paste URL
→ Validate
→ Identify Source
→ Resolve Source Policy
→ Allowed Adapter
→ Extract
→ Normalize
→ Preview
→ User Confirm
→ Match
→ Add to Comparison
```

---

# 34. URL Restricted Flow

Если automation запрещена:

```text
Paste URL
→ Source Policy Denied
→ Explain limitation
→ Manual Add
→ User enters key facts
→ Normalize
→ Match
→ Comparison
```

---

# 35. URL Invalid Flow

Если URL invalid/private/unsafe:

```text
Error
→ Не удалось использовать эту ссылку
→ Исправить ссылку
```

Не делать fetch.

---

# 36. URL Duplicate Flow

Если candidate похож на existing Property:

```text
Похоже, этот объект уже есть
```

Дальше:

```text
Use existing Property
+
preserve new Offer if different
```

---

# 37. Refresh Flow

Targeted refresh может запускаться из:

```text
stale field
critical unknown
conflict
user action
pre-comparison
pre-decision
```

UX flow:

```text
Current data shown
→ Refresh requested
→ Non-blocking status
→ Result received
→ Evidence updated
→ Recompute
→ UI update
```

---

# 38. Refresh Failure Flow

Если refresh failed:

```text
Текущие известные данные остаются
```

Показать:

```text
Не удалось проверить актуальность
```

Не скрывать значение и не считать его current.

---

# 39. Expert Request Flow

Entry:

```text
Critical Unknown
Conflict
Comparison
Property Detail
User explicit request
```

Flow:

```text
Trigger
→ Request Type
→ Context Preview
→ User Question
→ Submit
→ Queued / Assigned
→ In Progress
→ Result
```

---

# 40. Expert Context Preview

Перед submit пользователь видит:

```text
Что проверяем
Почему это важно
Какой объект / comparison
Какие данные уже известны
```

---

# 41. Expert Request Status Flow

Поддерживаемые statuses:

```text
submitted
queued
assigned
in_progress
waiting_for_user
waiting_for_external_info
completed
unable_to_complete
cancelled
```

---

# 42. Waiting for User Flow

Если эксперт запросил информацию:

```text
Expert Request
→ Waiting for User
→ User provides required input/reference
→ Resume
```

Full document upload может быть отдельной capability.

---

# 43. Expert Result Flow

После completion:

```text
Expert Result
→ Confirmed
→ Not Confirmed
→ Still Unknown
→ Conflicts
→ Recommendation
→ Decision Impact
```

---

# 44. Expert Result → Updated Decision

Если появились новые evidence:

```text
ExpertResult
→ Evidence
→ Canonical Update
→ DataQuality Recompute
→ Match Recompute
→ Updated Decision
```

---

# 45. Updated Decision Flow

Пользователь должен увидеть:

```text
Что изменилось после проверки
```

Пример:

```text
Было:
94% подходит
Confidence low

Стало:
91% подходит
Confidence high
```

только если фактические old/new results существуют.

---

# 46. Expert Unable to Verify Flow

Если факт не удалось подтвердить:

```text
ExpertResult
→ Unable to Verify
→ Unknown remains
→ Decision remains conditional
```

Это нормальный результат.

---

# 47. User Journey Without Expert

Expert layer optional.

Flow может закончиться:

```text
Comparison
→ User Decision
```

без ExpertRequest.

---

# 48. Cross-type Flow

Если UserRequest допускает несколько property types:

```text
Confirmed UserRequest
→ Matching across types
→ Mixed Shortlist
→ Detail with type-specific facts
→ Comparison via common decision dimensions
```

---

# 49. Cross-type Comparison Rules

Common dimensions:

```text
price
entry cost
monthly payment
move-in timing
usable area
commute
infrastructure
condition/readiness
confidence
unknowns
```

Type-specific rows показываются отдельно.

---

# 50. Financing-sensitive Flow

Если financing = material:

```text
Request
→ Financing criteria
→ Scenario eligibility
→ Shortlist with selected PurchaseScenario
→ Detail financing block
→ Comparison financing rows
→ Verification if claimed/unknown
```

---

# 51. Claim Verification Flow

Пример:

```text
"без первоначального взноса"
```

если status claimed:

```text
Shortlist/Detail
→ Mark as unconfirmed
→ Recommended Check
→ Refresh / Expert Verification
→ Result
```

---

# 52. User Changes Mind Flow

Пользователь может изменить preference после comparison.

Правильно:

```text
Change Request
→ New UserRequest Version
→ Recompute
```

Не:

```text
manual Match Score override
```

---

# 53. Journey State Recovery

После page reload/session recovery, если application state доступен, восстановить минимум:

```text
confirmed UserRequest
shortlist context
comparison selection
selected Property
expert request refs
```

---

# 54. Direct Route Guards

## `/shortlist`

Без confirmed UserRequest:

```text
Сначала опишите задачу
```

## `/comparison`

Меньше двух items:

```text
Добавьте минимум два варианта
```

## `/expert/result`

Проверить access и request/result existence.

---

# 55. Loading States

Допустимые:

```text
Разбираем запрос…
Подбираем варианты…
Загружаем данные объекта…
Готовим сравнение…
Отправляем на проверку…
Пересчитываем результат…
```

Не использовать fake progress percentages.

---

# 56. Partial States

Если section data отсутствует:

```text
Нет данных
Не подтверждено
Требует проверки
```

в зависимости от semantics.

Не оставлять empty UI без объяснения.

---

# 57. Error Recovery Principle

Каждый recoverable error должен иметь следующий action.

Примеры:

```text
Parser failed
→ Попробовать ещё раз
```

```text
No results
→ Изменить условия
```

```text
URL blocked
→ Добавить вручную
```

```text
Refresh failed
→ Использовать текущие данные / повторить позже
```

```text
Expert unable to verify
→ Сохранить как unknown / другой способ проверки
```

---

# 58. Navigation Principle

Пользователь должен всегда понимать:

- какой request сейчас active;
- где он находится;
- какие варианты выбраны;
- как вернуться назад;
- что изменится после редактирования условий.

---

# 59. No Rigid Wizard

Хотя flow имеет последовательность, пользователь может:

```text
Shortlist ↔ Detail
Shortlist ↔ Comparison
Comparison ↔ Detail
Comparison → Edit Request
Detail → Expert
```

Не блокировать навигацию искусственно.

---

# 60. UX State Consistency

Все personalized screens должны быть связаны с одним:

```text
UserRequest ID + version
```

Нельзя показывать:

```text
Shortlist from v1
+
Comparison from v2
```

как единый актуальный context.

---

# 61. Stale Context UX

Если request/data version changed:

показать:

```text
Условия изменились — результат нужно пересчитать
```

или:

```text
Есть более свежие данные
```

---

# 62. Shortlist Stale State

После request edit:

старый shortlist не должен выглядеть актуальным.

---

# 63. Comparison Stale State

После request edit:

comparison conclusion должен перейти в:

```text
recompute_required
```

---

# 64. Expert Context Stale State

Если relevant data изменились после ExpertRequest creation:

expert Workbench должен видеть:

```text
Контекст задачи создан раньше текущих данных
```

---

# 65. Mobile Flow

Все основные buyer flows должны работать на mobile browser.

Особенно:

- Request Entry;
- Confirmation;
- Shortlist;
- Detail;
- Comparison;
- Expert Result.

Comparison должен сохранять смысл сопоставления на малом экране.

---

# 66. Accessibility Flow

Пользователь должен проходить весь core flow:

- keyboard navigation;
- semantic controls;
- visible focus;
- status text not color-only;
- accessible error messages.

---

# 67. Trust UX Rules

На всех этапах:

```text
confirmed ≠ claimed
unknown ≠ no
stale ≠ current
conflict ≠ resolved
```

UX language должна сохранять эти различия.

---

# 68. No Generic Praise

Не использовать:

```text
Отличный вариант
Лучший район
Перспективный объект
```

без formal basis в UserRequest/domain logic.

---

# 69. No Commercial Bias in Flow

Никакие sponsored/commercial signals не должны менять:

```text
Match
Shortlist order
Comparison conclusion
```

---

# 70. Decision End States

Core buyer journey может закончиться несколькими корректными состояниями.

## A. Finalist selected

```text
Есть один основной вариант
```

## B. Conditional choice

```text
Есть лидер, если подтвердится условие
```

## C. Near tie

```text
Остались два примерно равных варианта
```

## D. More verification needed

```text
Решение зависит от неизвестных данных
```

## E. No valid option

```text
Ни один вариант не проходит must
```

Все состояния допустимы.

---

# 71. UX Success Criteria

Flow считается успешным, если пользователь:

1. описывает задачу без длинной формы;
2. понимает interpretation;
3. может исправить её;
4. получает небольшой shortlist;
5. понимает Match Score;
6. видит Data Confidence отдельно;
7. видит compromises;
8. понимает unknown/conflict;
9. может сравнить cross-type finalists;
10. может добавить свой URL;
11. может проверить material uncertainty;
12. понимает, что изменилось после проверки.

---

# 72. Primary Flow Diagram

```text
[Request Entry]
      ↓
[Parse]
      ↓
[Clarify if needed]
      ↓
[Request Confirmation]
      ↓
[Confirmed UserRequest]
      ↓
[Matching + DataQuality]
      ↓
[Shortlist]
   ↙      ↘
[Detail] [Comparison]
   ↘       ↙
 [Unknown / Conflict]
          ↓
 [Refresh / Expert]
          ↓
    [New Evidence]
          ↓
      [Recompute]
          ↓
 [Updated Decision]
```

---

# 73. Existing Links Flow Diagram

```text
[User has URL(s)]
      ↓
[Add URL]
      ↓
[Source Identification]
      ↓
[Policy Gate]
   ↙            ↘
[Allowed]      [Blocked]
   ↓              ↓
[Ingest]      [Manual Add]
   ↘              ↙
   [Normalize Candidate]
           ↓
       [Matching]
           ↓
      [Comparison]
```

---

# 74. Expert Flow Diagram

```text
[Critical Unknown / Conflict / Near Tie]
                ↓
         [Expert Request]
                ↓
        [Context Package]
                ↓
           [Workbench]
                ↓
         [Expert Result]
                ↓
           [Evidence]
                ↓
    [DataQuality + Match Recompute]
                ↓
        [Updated Decision]
```

---

# 75. Final UX Principle

> **Пользователь не должен проходить через продукт ради самого процесса. Каждый следующий экран должен уменьшать неопределённость и приближать человека к более ясному решению.**
