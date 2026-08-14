# TASK-004 — Request Confirmation Screen

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone A — Clickable Product`

---

# 1. Goal

Реализовать экран:

> **«Проверьте, правильно ли мы вас поняли»**

который получает `confirmation_view` из TASK-003 и позволяет пользователю:

- увидеть, как сервис интерпретировал запрос;
- понять, какие условия считаются обязательными;
- увидеть желательные условия;
- увидеть гибкие параметры;
- увидеть существенные неизвестные;
- исправить значение;
- изменить приоритет;
- удалить ошибочно распознанный критерий;
- ответить на 1–3 критичных уточнения;
- подтвердить запрос перед запуском поиска.

Главный принцип:

> Пользователь должен подтвердить бизнес-смысл запроса до того, как система начнёт искать и ранжировать недвижимость.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-002.md
tasks/TASK-003.md

docs/04-data/user-request-model.md
docs/05-matching/hard-soft-criteria.md
docs/03-ux/user-flows.md
docs/03-ux/screens.md
docs/03-ux/edge-cases.md
```

Если UX-файлы из списка ещё не существуют физически, не создавать их содержание по памяти и не считать отсутствующий файл спецификацией.

Основные требования этой TASK имеют приоритет.

---

# 3. Dependencies

TASK-004 предполагает, что TASK-003 предоставляет:

```text
UserRequestParserResult
ConfirmationViewModel
ClarificationCandidate
```

и TASK-002 предоставляет формальные domain contracts.

Если этих contracts ещё нет в коде:

```text
TASK-004 is blocked
```

Не создавать параллельные временные interfaces только ради UI.

---

# 4. In Scope

Реализовать:

1. страницу / route подтверждения запроса;
2. отображение structured criteria;
3. группировку criteria по priority;
4. редактирование значения;
5. изменение priority;
6. удаление criterion;
7. отображение contradictions;
8. отображение critical unknowns;
9. 1–3 clarification questions;
10. подтверждение запроса;
11. возврат к исходному тексту / редактированию;
12. client-side validation;
13. accessibility и базовые responsive states;
14. component tests.

---

# 5. Out of Scope

Не реализовывать:

- property search;
- shortlist;
- Matching Engine;
- OpenClaw;
- database persistence;
- mortgage calculations;
- map;
- property cards;
- expert request;
- authentication;
- final landing page design.

После подтверждения можно перейти только в placeholder next-state, если следующая TASK ещё не реализована.

---

# 6. User Flow

Минимальный flow:

```text
Natural-language input
        ↓
TASK-003 parser
        ↓
Confirmation Screen
        ↓
User edits if needed
        ↓
Clarifications
        ↓
Confirm
        ↓
Confirmed UserRequest
```

---

# 7. Screen Heading

Основной heading:

```text
Проверьте, правильно ли мы вас поняли
```

Поддерживающая фраза:

```text
Вы можете изменить любое условие перед подбором.
```

Не использовать формулировки:

```text
Мы оптимизировали ваш запрос
AI решил, что вам нужно
Лучшие параметры для вас
```

---

# 8. Main Screen Structure

Рекомендуемый порядок:

```text
1. Краткое понимание задачи
2. Обязательные условия
3. Желательные условия
4. Гибкие условия
5. Что ещё не определено
6. Противоречия, если есть
7. Уточняющие вопросы, если нужны
8. CTA подтверждения
```

---

# 9. Summary Block

Верхний блок кратко показывает интерпретацию.

Пример:

```text
Ищем до 5 квартир в Туле
до 5 млн ₽,
семейная ипотека обязательна,
без первоначального взноса — желательно.
```

Summary генерируется **из structured data**, а не повторным свободным LLM-вызовом.

---

# 10. Criteria Groups

Использовать пользовательские названия:

## Обязательно

Для:

```text
must
exclude
```

## Желательно

Для:

```text
preferred
avoid
```

## Можно гибко

Для:

```text
neutral
```

## Не определено

Только material unknowns.

Не показывать пользователю технический enum `must/preferred`.

---

# 11. Criterion Row

Каждый criterion отображает минимум:

```text
human label
normalized value
priority
edit action
remove action
```

Пример:

```text
Бюджет
до 5 000 000 ₽
Обязательно
[Изменить]
```

---

# 12. Human Labels

Не выводить raw domain paths:

```text
budget.price_max
financing.zero_initial_payment
```

Использовать:

```text
Максимальная цена
Без первоначального взноса
```

Human labels должны находиться в централизованном presentation registry, а не разбрасываться по компонентам.

---

# 13. Priority Editing

Пользователь может менять priority.

UI варианты:

```text
Обязательно
Желательно
Неважно
Не хочу, но могу рассмотреть
Исключить
```

Не обязательно показывать все варианты каждому типу criterion, если некоторые семантически неприменимы.

---

# 14. Mapping Priority to UI

```text
must      → Обязательно
preferred → Желательно
neutral   → Неважно / можно гибко
avoid     → Лучше не
exclude   → Исключить
unknown   → Не определено
```

---

# 15. Must → Preferred

Пользователь может изменить:

```text
строго до 5 млн
```

на:

```text
желательно до 5 млн
```

После изменения criteria model должна обновиться.

Не хранить изменение только в local display state.

---

# 16. Preferred → Must

Пользователь также может сделать условие обязательным.

Это явное действие пользователя и поэтому допустимо.

---

# 17. Criterion Removal

Если parser ошибочно извлёк criterion:

пользователь может удалить его.

Удаление означает:

```text
criterion no longer participates in confirmed request
```

Не переводить автоматически в `neutral`, если пользователь нажал именно «Удалить».

---

# 18. Editing Numeric Criteria

Для:

- price;
- monthly payment;
- initial payment;
- area;
- travel time;
- distance;
- floor;

использовать type-appropriate controls.

Не хранить форматированные строки как domain value.

---

# 19. Money Input

UI:

```text
5 000 000 ₽
```

Domain:

```text
5000000
currency = RUB
```

Не использовать floating point calculation в UI.

---

# 20. Range Criteria

Пример:

```text
Площадь от 60 до 80 м²
```

Редактор должен поддерживать:

- min;
- max;
- open boundary.

---

# 21. Categorical Criteria

Пример:

```text
Тип недвижимости:
Квартира
Дом
```

Для cross-type request должны быть выбраны оба.

Не заставлять пользователя выбрать один тип.

---

# 22. Location Editing

Поддержать минимум:

- city;
- district;
- excluded location;
- flexible location.

Не создавать полноценный map picker в этой TASK.

---

# 23. Unknown Location

Если город неизвестен:

показывать:

```text
Город пока не выбран
```

и не подставлять pilot city.

---

# 24. Contradictions

Если TASK-003 вернула contradiction:

экран должен показать его отдельно.

Пример:

```text
Нужно уточнить

Вы одновременно указали:
— только Центральный район;
— Центральный район не рассматриваю.
```

---

# 25. Contradiction Blocks Confirmation

Если contradiction влияет на hard criteria:

CTA подтверждения должен быть заблокирован до исправления.

Не разрешать отправить internally inconsistent request.

---

# 26. Non-critical Ambiguity

Если ambiguity относится к minor preferred criterion:

подтверждение можно разрешить с `unknown`.

Не блокировать пользователя ради идеальной completeness.

---

# 27. Clarification Questions

Показывать максимум:

```text
1–3
```

вопроса на шаг.

Использовать результат deterministic selector из TASK-003.

---

# 28. Clarification UI

Пример:

```text
Без первоначального взноса — это обязательное условие?

( ) Да, без этого не рассматриваю
( ) Желательно, но могу внести часть суммы
```

---

# 29. Clarification Must Update Domain

После ответа:

- обновляется criterion;
- пересчитывается confirmation view;
- clarification исчезает;
- contradiction/unknown status обновляется.

---

# 30. Do Not Ask Everything

Не создавать UI:

```text
20 обязательных полей формы
```

только потому, что schema их поддерживает.

Экран показывает:

- то, что пользователь сказал;
- то, что materially нужно уточнить.

---

# 31. Source Text

Для спорного parsed criterion можно показать:

```text
Вы написали: «желательно без первоначального взноса»
```

Это особенно полезно при низкой interpretation confidence.

---

# 32. Interpretation Confidence

Не обязательно показывать пользователю число:

```text
82%
```

В MVP лучше использовать confidence только для поведения UI.

Например:

- high → обычная строка;
- low → мягкая подсветка «проверьте это условие».

Не создавать лишний «AI confidence score» без доказанной UX-пользы.

---

# 33. Unknown Section

Показывать только material unknowns.

Пример:

```text
Не определено

— Район
— Тип отделки
```

Но если эти параметры не важны для запроса и не влияют на поиск, не превращать экран в checklist всех возможных характеристик.

---

# 34. Add Criterion

В MVP полезно предусмотреть:

```text
+ Добавить условие
```

Но implementation может быть ограничена безопасным набором criteria registry.

Не создавать arbitrary raw JSON editor.

---

# 35. Add Criterion Registry

Минимальные категории:

```text
Цена
Тип недвижимости
Комнаты
Площадь
Этаж
Район
Срок въезда
Ипотека
Первоначальный взнос
Ежемесячный платёж
Отделка
Школа
Транспорт
```

---

# 36. Duplicate Criterion Prevention

Если criterion уже существует:

не создавать второй независимый duplicate.

Открыть существующий editor или merge через domain-safe rule.

---

# 37. Confirmation Action

Основной CTA:

```text
Подтвердить и подобрать варианты
```

Если поиск ещё не реализован, action может сохранять confirmed state и вести на technical placeholder.

Не имитировать готовый search result.

---

# 38. Secondary Action

```text
Изменить исходный запрос
```

Возвращает к natural-language input с сохранением исходного текста.

---

# 39. Confirmed Request State

После подтверждения создать явно различимый state:

```yaml
request_status: confirmed
confirmed_at:
```

Если такого поля нет в TASK-002 schema, не добавлять его молча в core contract.

В таком случае использовать отдельный workflow state и зафиксировать implementation choice.

---

# 40. Original Text Preservation

После редактирования structured criteria сохранять:

```text
original_raw_text
```

и отдельно:

```text
confirmed structured request
```

Не перезаписывать исходную пользовательскую формулировку.

---

# 41. Change History

Для MVP достаточно optional client/session-level list:

```text
criterion changed
priority changed
criterion removed
clarification answered
```

Полный audit persistence — не в этой TASK.

---

# 42. Validation

Перед confirm:

- schema valid;
- no unresolved blocking contradictions;
- required criterion values structurally valid;
- min <= max;
- money >= 0;
- score/priority enums valid.

---

# 43. Validation Messages

Не показывать:

```text
ZodError: invalid_union
```

Показывать:

```text
Минимальная площадь не может быть больше максимальной.
```

---

# 44. Error States

Поддержать:

- parser result missing;
- invalid confirmation model;
- criterion edit validation error;
- failed state transition.

---

# 45. Missing Parser Result

Если пользователь открыл confirmation route напрямую без parsed request:

показывать controlled state:

```text
Сначала опишите, какую недвижимость вы ищете.
```

CTA:

```text
Вернуться к запросу
```

---

# 46. Responsive Design

Экран должен работать:

- desktop;
- tablet;
- mobile.

На mobile criteria cards могут идти вертикально.

Не использовать широкую таблицу как единственный layout.

---

# 47. Accessibility

Минимум:

- semantic headings;
- labels для inputs;
- keyboard navigation;
- visible focus;
- buttons не заменять click-only div;
- error messages связаны с полями.

---

# 48. Visual Priority

`Обязательно` должно быть заметнее, чем `Желательно`, но без агрессивных warning colors.

`Unknown`/`needs clarification` — заметно, но не как ошибка, если это не blocking contradiction.

---

# 49. No Marketing Noise

На экране не нужны:

- рекламные карточки;
- объекты;
- баннеры застройщиков;
- экспертные продажи.

Это decision setup screen.

---

# 50. Component Architecture

Рекомендуемые components:

```text
RequestConfirmationPage
RequestSummary
CriteriaGroup
CriterionRow
CriterionEditor
PrioritySelector
ClarificationCard
ContradictionAlert
UnknownsSection
ConfirmationActions
```

Имена могут отличаться.

---

# 51. Presentation Registry

Создать централизованный mapping:

```text
criterion type
→ label
→ formatting
→ editor type
→ allowed priority options
```

Не делать:

```text
if field === "budget.price_max"
```

в десятках React components.

---

# 52. Domain/UI Boundary

UI не должен самостоятельно решать:

- что является contradiction;
- какой clarification важнее;
- как изменять business priority semantics.

Эти правила приходят из domain layer.

UI отвечает за presentation и explicit user edits.

---

# 53. State Management

Не требуется тяжёлый global state library только ради этого экрана.

Использовать минимально достаточный подход scaffold.

Но edits должны существовать как один coherent structured request state.

---

# 54. No Hidden Mutation

Не менять original parser result in place так, чтобы потерять исходную интерпретацию.

Предпочтительно:

```text
initialParsedRequest
currentConfirmedDraft
```

---

# 55. Test Fixtures

Использовать fixtures из TASK-003.

Минимум:

### Clear Request

```text
до 5 млн must
семейная ипотека must
ПВ 0 preferred
```

### Contradiction

```text
Центральный район must + excluded
```

### Fuzzy School

```text
школа рядом preferred
threshold unknown
```

### Cross-type

```text
apartment + house
```

---

# 56. Required Component Tests

Минимум:

1. renders must criteria;
2. renders preferred criteria;
3. cross-type values visible;
4. unknown city not replaced;
5. edit numeric value;
6. change priority;
7. remove criterion;
8. answer clarification;
9. blocking contradiction disables confirm;
10. non-blocking unknown allows confirm;
11. invalid range shows human error;
12. confirmation emits valid updated UserRequest.

---

# 57. Integration Test

Минимальный flow:

```text
Parser fixture
→ confirmation screen
→ change zero-down from preferred to must
→ edit budget
→ confirm
→ emitted structured request validated against schema
```

---

# 58. No Search Integration Yet

Если next route отсутствует:

после confirm допустимо показать:

```text
Запрос подтверждён
```

и technical placeholder.

Не создавать fake loading:

```text
Проверяем 12 450 объектов...
```

без реализации соответствующего слоя.

---

# 59. Analytics Hooks

Можно заложить event interface:

```text
request_confirmation_viewed
criterion_edited
priority_changed
clarification_answered
request_confirmed
```

Но реальную analytics platform подключать не нужно.

---

# 60. Product Metrics Later

Полезно будет измерять:

- сколько criteria пользователь исправляет;
- какие parser errors частые;
- сколько clarification нужно;
- сколько пользователей подтверждает без изменений.

Но это не Acceptance Criteria данной TASK.

---

# 61. Do Not Introduce Wizard Hell

Не разбивать каждое criterion на отдельный экран.

Главная идея:

> пользователь быстро просматривает и исправляет понимание сервиса.

---

# 62. Do Not Hide Priorities

Пользователь должен понимать разницу между:

```text
обязательно
```

и:

```text
желательно
```

Это часть core value продукта.

---

# 63. Do Not Convert Unknown to Default

Если:

```text
район unknown
```

не показывать:

```text
Любой район
```

как будто пользователь это подтвердил.

Можно показать:

```text
Район не указан
```

---

# 64. Avoid vs Exclude

UI должен различать:

```text
Лучше не
```

и:

```text
Исключить
```

Пример:

> «Первый этаж не хочу, но можно»

не должен визуально превращаться в hard exclusion.

---

# 65. Confirmation Screen Output

Рекомендуемый result:

```yaml
request_confirmation_result:
  confirmed_request:
  unresolved_nonblocking_unknowns:
  answered_clarifications:
  user_changes:
  confirmed_at:
```

Если такой workflow contract не существует в TASK-002, создать его как UI/application contract, не смешивая с core `UserRequest`.

---

# 66. Acceptance Criteria

TASK-004 считается завершённой, если:

1. confirmation screen существует;
2. получает model из TASK-003;
3. must/preferred/neutral/avoid/exclude отображаются корректно;
4. пользователь может изменить criterion value;
5. пользователь может изменить priority;
6. пользователь может удалить criterion;
7. cross-type request не схлопывается;
8. unknown не превращается в default;
9. contradictions видны;
10. blocking contradiction запрещает confirm;
11. максимум 1–3 clarification questions;
12. ответы обновляют structured draft;
13. invalid input не подтверждается;
14. final output валиден по schema TASK-002;
15. original text сохранён;
16. UI responsive;
17. accessibility basics выполнены;
18. component tests проходят;
19. integration test проходит;
20. typecheck/lint/build проходят.

---

# 67. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

---

# 68. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Route:
Components:
Presentation registry:
State flow:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 69. Do Not Continue Automatically

После TASK-004:

**не начинать следующую задачу самостоятельно.**

---

# 70. Likely Next Task

Следующая задача:

```text
TASK-005 — Pilot Property Dataset & Fixtures
```

Её цель — создать контролируемый набор объектов, на котором будут разрабатываться Matching Engine и первые shortlist screens.

---

# 71. Definition of Done

TASK-004 Done, когда пользователь может посмотреть на машинную интерпретацию своего запроса, быстро исправить её и получить валидный подтверждённый `UserRequest`, не проходя длинную анкету.

---

# 72. Главный принцип для coding-agent

Экран подтверждения — не анкета и не форма фильтров.

Это слой контроля над интерпретацией естественного запроса:

```text
Пользователь сказал
      ↓
Сервис понял
      ↓
Пользователь увидел
      ↓
Исправил при необходимости
      ↓
Подтвердил
```

Главное правило:

> **Перед поиском пользователь должен понимать, какие условия система считает обязательными, какие желательными и какие всё ещё остаются неизвестными.**
