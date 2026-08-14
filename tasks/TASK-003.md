# TASK-003 — UserRequest Parser & Structured Confirmation Contract

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone B — Deterministic Core`

---

# 1. Goal

Реализовать первый прикладной слой поверх `UserRequest` contract:

> преобразование естественного пользовательского текста в структурированный черновик запроса, который затем можно показать пользователю на экране подтверждения.

Результат этой задачи — **не поиск недвижимости и не Matching Engine**.

Результат:

```text
Natural Language
      ↓
UserRequest Parser
      ↓
Structured Draft
      ↓
Interpretation Confidence
      ↓
Contradictions / Unknowns
      ↓
Clarification Candidates
      ↓
Confirmation View Model
```

Главный принцип:

> Parser извлекает то, что пользователь действительно сказал, отмечает неопределённость и не додумывает критичные условия за пользователя.

---

# 2. Required Reading

Перед выполнением coding-agent обязан прочитать:

```text
PROJECT.md
AGENTS.md
README.md

tasks/TASK-002.md

docs/04-data/user-request-model.md
docs/05-matching/hard-soft-criteria.md
docs/05-matching/matching-logic.md

docs/03-ux/user-flows.md
docs/03-ux/screens.md
docs/03-ux/edge-cases.md
```

Если каких-либо UX-файлов ещё физически нет в repository, не придумывать их содержание. Использовать только существующие спецификации и требования текущей TASK.

---

# 3. Dependency

TASK-003 предполагает, что TASK-002 уже создала:

- `UserRequest` schema;
- `Criterion` contract;
- enums priority / operators;
- runtime validation.

Если TASK-002 ещё не выполнена в коде:

```text
TASK-003 is blocked
```

Не создавать дублирующие временные domain interfaces вместо контрактов TASK-002.

---

# 4. In Scope

Нужно реализовать:

1. parser interface;
2. structured parser result;
3. normalization нескольких базовых полей;
4. priority interpretation;
5. explicit unknowns;
6. contradiction detection;
7. interpretation confidence;
8. clarification candidates;
9. confirmation view model;
10. deterministic fixtures/tests вокруг parser contract.

---

# 5. Out of Scope

Не реализовывать:

- поиск объектов;
- database search;
- Matching Engine;
- scoring недвижимости;
- OpenClaw;
- source collection;
- real mortgage eligibility;
- bank approval;
- recommendation of city;
- full conversational assistant;
- autonomous clarification chat loop;
- production prompt tuning.

---

# 6. Parser Input

Базовый contract:

```yaml
user_request_parser_input:
  raw_text:
  locale:
  context:
```

Минимум:

```text
raw_text
locale
```

`context` может быть optional и в MVP использоваться только для явного продолжения уже существующего запроса.

---

# 7. Parser Output

Parser должен возвращать structured result.

Рекомендуемый contract:

```yaml
user_request_parser_result:
  raw_text:
  parsed_request:
  interpretation_confidence:
  extracted_facts:
  inferred_candidates:
  unknowns:
  contradictions:
  clarification_candidates:
  warnings:
  parser_version:
```

---

# 8. Parsed Request

`parsed_request` должен соответствовать `UserRequest` schema из TASK-002.

Parser не имеет права создавать «упрощённый UserRequest», который существует только для parser.

---

# 9. Extracted Facts

Для аудита полезно хранить, что именно было извлечено.

Пример:

```yaml
extracted_facts:
  - field: budget.price_max
    value: 5000000
    source_text: "до пяти миллионов"
    confidence: 0.99
```

---

# 10. Inferred Candidates

Иногда parser может предложить гипотезу, но не должен записывать её как факт.

Пример:

Пользователь:

> «Двое детей, школа важна».

Допустимо:

```yaml
inferred_candidates:
  - proposed_criterion: school_access
    reason: "user explicitly said school is important"
```

Недопустимо:

```text
children = 2
→ automatically set district with best schools
```

---

# 11. Explicit Facts First

Parser в первую очередь извлекает:

- прямо сказанное пользователем;
- числовые ограничения;
- отрицания;
- приоритетные формулировки;
- допустимые альтернативы.

Он не должен автоматически оптимизировать запрос.

---

# 12. Intent Detection

Поддержать минимум:

```text
find
compare
affordability
location_discovery
check
decision_help
mixed
```

Примеры:

> «Найди пять квартир...»
→ `find`

> «Вот три ссылки, сравни»
→ `compare`

> «Что я могу позволить с ПВ 2 млн и платежом 80 тыс.?»
→ `affordability`

> «Не знаю, в каком городе лучше жить»
→ `location_discovery`

---

# 13. Goal Detection

Поддержать значения из `user-request-model.md`.

Например:

- own living;
- relocation;
- investment;
- second home;
- parents;
- child/family;
- unknown.

Не делать goal mandatory, если пользователь его не указал.

---

# 14. Location Parsing

Минимум:

- country;
- region;
- city;
- district;
- microdistrict;
- excluded locations;
- location flexible.

Пример:

> «Только Тула, область не рассматриваю».

Parser:

```text
city = Тула
location_flexible = false
exclude = Тульская область outside city
```

Не hardcode конкретный город в parser logic.

---

# 15. Unknown Location

Пример:

> «Хотим переехать на юг, город пока не знаем».

Parser:

```text
city = unknown
intent may include location_discovery
```

Не выбирать город автоматически.

---

# 16. Property Type Parsing

Поддержать минимум:

```text
apartment
apartments
house
townhouse
land
any
```

А также market type:

```text
new_build
secondary
unknown
```

---

# 17. Cross-type Request

Пример:

> «Квартира или дом, пока не решил».

Нельзя превращать в:

```text
property_type = apartment
```

Нужно сохранить допустимый set.

---

# 18. Budget Parsing

Минимум:

- price min;
- price max;
- own funds;
- renovation budget;
- reserve;
- total available cash;
- flexibility.

Пример:

> «До 5 млн строго».

```text
price_max = 5_000_000
priority = must
```

---

# 19. Object Price vs Total Budget

Parser должен различать, насколько позволяет текст:

> «Квартира до 5 млн»
→ likely object price.

> «На всё есть 5 млн, включая ремонт»
→ total budget / entry cost context.

Если смысл неясен и это существенно:

создать clarification candidate.

---

# 20. Financing Parsing

Минимум:

- cash / mortgage / installment;
- financing program;
- own funds;
- initial payment;
- zero initial payment;
- monthly payment max;
- preferred banks if explicit.

---

# 21. No Real Eligibility Inference

Фраза:

> «У нас двое детей»

не означает автоматически:

```text
eligible_for_family_mortgage = true
```

Parser может создать:

```text
possible_program = family_mortgage
```

только если пользователь сам упомянул программу либо это оформлено как clarification candidate.

---

# 22. Zero Down Payment

Пример:

> «Без первоначального взноса обязательно».

```text
criterion = zero_initial_payment
priority = must
```

Пример:

> «Желательно без ПВ».

```text
priority = preferred
```

---

# 23. Monthly Payment

Пример:

> «Платёж не больше 80 тысяч».

```text
monthly_payment_max = 80000
priority = must
```

Если:

> «Хотелось бы около 70».

→ preferred / soft.

---

# 24. Timeline Parsing

Минимум:

- purchase deadline;
- move-in deadline;
- completion/handover deadline;
- ready now;
- willing to wait.

---

# 25. Move-in vs Construction Completion

Пример:

> «Въехать максимум через год».

Parser должен сохранить именно `move_in_deadline`.

Не заменять это `construction_completion_deadline`, если пользователь этого не сказал.

---

# 26. Household Parsing

Минимум:

- adults;
- children;
- child ages;
- elderly;
- pets;
- accessibility needs.

Эти данные не создают автоматически property filters.

---

# 27. Lifestyle Parsing

Минимум:

- remote work;
- office commute;
- cars;
- public transport;
- quiet;
- green area;
- walkability.

Только явно сказанные факты.

---

# 28. Infrastructure Parsing

Минимум:

- school;
- kindergarten;
- park;
- clinic;
- transport.

Каждый criterion должен по возможности иметь:

- target;
- distance/time;
- mode;
- priority.

---

# 29. Fuzzy Language

Фразы:

```text
рядом
недалеко
просторная
повыше
хорошая транспортная доступность
```

не должны автоматически превращаться в жёсткие пороги.

Варианты:

1. оставить fuzzy preferred criterion;
2. создать clarification candidate;
3. применить только если в product policy позже появится подтверждённая default interpretation.

В TASK-003 не придумывать arbitrary thresholds.

---

# 30. Property Features

Минимум:

- rooms;
- area;
- floor;
- first/last floor;
- finishing;
- balcony;
- elevator;
- parking;
- house land area;
- utilities.

---

# 31. Priority Language Mapping

Parser должен распознавать лингвистические маркеры.

## Likely must / exclude

```text
только
строго
обязательно
принципиально
не больше
не меньше
не рассматриваю
ни в коем случае
```

## Preferred

```text
желательно
хотелось бы
лучше
по возможности
будет плюсом
```

## Neutral / flexible

```text
неважно
не принципиально
можно любой
готов рассмотреть
```

## Avoid

```text
не хочу, но можно
лучше не
предпочёл бы избежать
```

---

# 32. Mapping Confidence

Лингвистическая классификация priority должна иметь confidence.

Пример:

```yaml
priority:
  value: preferred
  confidence: 0.92
  source_text: "желательно"
```

Если confidence низкая и criterion material:

создать clarification candidate.

---

# 33. Do Not Escalate Soft to Hard

Parser не имеет права делать:

```text
"хотелось бы"
→ must
```

---

# 34. Do Not Relax Hard

Parser не имеет права делать:

```text
"строго до 5 млн"
→ preferred with 5% tolerance
```

---

# 35. Contradiction Detection

Создать отдельный module/service:

```text
detectUserRequestContradictions()
```

Минимальные случаи:

- mutually exclusive location constraints;
- contradictory property type inclusion/exclusion;
- incompatible min/max values;
- same criterion must + exclude in conflicting way;
- deadline ranges impossible internally.

---

# 36. What Is NOT a Contradiction

Пример:

```text
до 5 млн must
80 м² preferred
```

Это не contradiction.

Это просто трудный рынок.

Не создавать clarification только потому, что запрос может быть редким.

---

# 37. Another Non-contradiction

```text
без ПВ обязательно
own funds = 1 млн
```

Это не обязательно contradiction.

Деньги могут быть резервом / ремонтом.

Не интерпретировать их автоматически как ПВ.

---

# 38. Unknowns

Parser должен формировать explicit `unknowns`.

Пример:

```yaml
unknowns:
  - field: financing.initial_payment
    reason: "not specified"
```

Но не нужно перечислять все сотни полей модели.

Только relevant unknowns.

---

# 39. Critical Unknown

Если без значения невозможно выполнить запрос:

оно становится кандидатом на clarification.

Пример:

> «Найдите квартиру с ипотекой».

Если неясно:

- какой максимум платежа;
- есть ли ограничение по бюджету;

не всегда нужно сразу спрашивать всё.

Выбирать только material unknowns.

---

# 40. Clarification Candidate Contract

Рекомендуемый contract:

```yaml
clarification_candidate:
  clarification_id:
  field:
  reason:
  impact:
  proposed_question:
  options:
  priority:
```

---

# 41. Clarification Priority

- `critical`
- `high`
- `medium`
- `low`

Parser может создать много candidates, но UI должен задавать максимум 1–3 наиболее material вопроса за шаг.

---

# 42. Clarification Selection

Создать deterministic selector:

```text
selectTopClarifications()
```

Основа:

- hard ambiguity;
- contradiction;
- high search impact;
- finance impact;
- deadline impact.

---

# 43. Do Not Over-question

Нельзя превращать natural-language entry в длинную анкету.

Если условие можно безопасно оставить unknown:

не задавать вопрос только ради completeness.

---

# 44. Interpretation Confidence

Отдельный показатель:

```text
request_interpretation_confidence
```

Он не связан с DataConfidence объекта.

Диапазон:

```text
0..100
```

или семантический статус + score.

---

# 45. Confidence Calculation

На MVP достаточно прозрачной heuristic model.

Например учитываются:

- explicit fields extracted;
- ambiguous terms;
- conflicting statements;
- unresolved material fields;
- priority classification confidence.

Не использовать скрытый LLM self-score без структуры.

---

# 46. Confidence Bands

Можно использовать:

```text
high
medium
low
```

с threshold config.

Не hardcode thresholds в UI component.

---

# 47. Structured Confirmation View Model

После parser формируется отдельный view model.

Пример:

```yaml
confirmation_view:
  summary:
  groups:
    required:
    preferred:
    flexible:
    unknown:
  contradictions:
  clarification_questions:
  source_text:
```

---

# 48. Confirmation UX Semantics

Пользователь должен увидеть:

> Проверьте, правильно ли мы вас поняли.

Не:

> Ваш запрос успешно оптимизирован.

---

# 49. Confirmation Groups

Минимум:

### Обязательно

criteria `must` / `exclude`.

### Желательно

criteria `preferred` / `avoid`.

### Можно гибко

criteria `neutral`.

### Не определено

только material unknowns.

---

# 50. Editability

Confirmation view model должен позволять UI в следующей задаче:

- изменить значение;
- сменить priority;
- удалить criterion;
- добавить criterion.

TASK-003 не обязана реализовывать сам UI.

---

# 51. Source Text Trace

Для каждого важного parsed field желательно сохранять ссылку на исходную фразу.

Пример:

```yaml
source_span:
  text: "не выше 10 этажа"
  start:
  end:
```

Offsets optional, но исходный текст обязателен хотя бы на уровне evidence object.

---

# 52. LLM Boundary

Допустимая архитектура:

```text
LLM structured extraction
↓
schema validation
↓
normalization
↓
deterministic contradiction rules
↓
clarification selection
↓
confirmation view model
```

Не:

```text
LLM returns final UserRequest
→ trust without validation
```

---

# 53. Runtime Validation

Любой LLM output должен пройти schema validation.

Если invalid:

- repair/retry;
- либо controlled parser error.

Не записывать invalid payload в core domain.

---

# 54. Parser Error Contract

Поддержать:

```yaml
parser_error:
  type:
  message:
  recoverable:
  raw_output_reference:
```

Типы минимум:

- `invalid_structure`
- `unsupported_language`
- `empty_request`
- `parser_unavailable`

---

# 55. Empty Request

Пустой текст должен возвращать controlled validation error.

Не создавать blank UserRequest и не отправлять его дальше.

---

# 56. Parser Versioning

Каждый result:

```text
parser_version
prompt_version
normalization_version
```

если LLM используется.

---

# 57. Determinism Boundary

Полное natural-language parsing может быть probabilistic.

Но после structured extraction:

- normalization;
- contradiction detection;
- clarification ranking;
- confirmation grouping

должны быть deterministic для одинакового structured input.

---

# 58. Fixtures

Создать fixtures минимум для следующих запросов.

## A. Clear apartment request

```text
Найди 5 квартир в Туле до 5 млн,
семейная ипотека обязательно,
желательно без первоначального взноса.
```

Ожидается:

- intent find;
- city;
- price max must;
- family mortgage must;
- zero down preferred;
- result_limit = 5.

---

# 59. Fixture B — Relocation

```text
Мы живём в Мурманске, хотим переехать на юг.
Двое детей.
Есть 5 млн своих.
Платёж максимум 80 тысяч.
Въехать нужно максимум через год.
Город пока не выбрали.
```

Ожидается:

- relocation;
- location discovery;
- city unknown;
- own funds;
- monthly payment must;
- move-in deadline;
- household;
- no automatic property type.

---

# 60. Fixture C — Cross-type

```text
Рассматриваю квартиру или дом.
До работы не больше 40 минут.
Минимум 70 метров.
```

Ожидается:

- multi property type;
- commute criterion must/likely must based phrase;
- area min;
- destination unknown → clarification candidate if material.

---

# 61. Fixture D — Soft floor

```text
Первый этаж не хочу, но если вариант очень хороший, покажите.
```

Ожидается:

```text
floor first → avoid
```

а не exclude.

---

# 62. Fixture E — Hard floor

```text
Первый этаж вообще не рассматриваю.
```

Ожидается:

```text
floor first → exclude
```

---

# 63. Fixture F — Fuzzy school

```text
Важно, чтобы школа была рядом.
```

Ожидается:

- school preferred/high importance;
- no invented 15-minute threshold;
- clarification candidate optional/material.

---

# 64. Fixture G — Total budget ambiguity

```text
У меня всего 6 миллионов, ещё нужен ремонт.
```

Parser должен обнаружить, что смысл бюджета может относиться к total entry cost.

Не записывать автоматически:

```text
property_price_max = 6m
renovation_budget = unlimited
```

---

# 65. Fixture H — Compare links

```text
У меня есть три варианта, хочу понять, какой лучше.
```

Ожидается:

```text
intent = compare / decision_help
```

и ожидание `source_links`, если links поступят отдельно.

---

# 66. Fixture I — Contradiction

```text
Только Центральный район.
Но Центральный район не рассматриваю.
```

Ожидается explicit contradiction.

---

# 67. Fixture J — Neutral floor

```text
Этаж вообще не важен.
```

Ожидается priority `neutral`.

---

# 68. Required Tests

Минимум:

1. clear field extraction;
2. must marker;
3. preferred marker;
4. avoid marker;
5. exclude marker;
6. neutral marker;
7. unknown stays unknown;
8. cross-type preserved;
9. location unknown preserved;
10. contradiction detected;
11. non-contradiction not flagged;
12. fuzzy language gets no arbitrary threshold;
13. empty request rejected;
14. parser output schema validated;
15. clarification selection max 3;
16. same structured input → same confirmation grouping.

---

# 69. No External Facts

Parser не должен обращаться к web или внешним базам, чтобы «улучшить» запрос.

Пример:

> «Семейная ипотека»

Parser извлекает название программы.

Он не должен внутри TASK-003 проверять её актуальные правила.

---

# 70. No Search Yet

После parser:

```text
parsed_request
```

не должен автоматически запускать property search в рамках TASK-003.

---

# 71. No Silent Defaults

Не добавлять скрытые default criteria:

```text
not first floor
good district
new build
parking
school
```

если пользователь этого не просил.

---

# 72. Allowed Technical Defaults

Допустимы только технические defaults без продуктового смысла.

Например:

```text
locale = ru-RU
```

если приложение в текущем MVP явно русскоязычное.

Но это должно быть осознанное project-level решение, а не скрытая domain assumption.

---

# 73. Result Limit

Если пользователь сказал:

> «Покажи 5»

→ `result_limit = 5`.

Если не сказал:

может применяться application default `5–10`, но лучше хранить distinction:

```text
user_requested_limit = null
system_default_limit = configured
```

Не выдавать system default как извлечённый пользовательский факт.

---

# 74. Parser Service Interface

Рекомендуемый API:

```ts
parseUserRequest(input): Promise<UserRequestParserResult>
```

или аналогичный.

Дополнительно:

```ts
normalizeParsedRequest(...)
detectContradictions(...)
selectTopClarifications(...)
buildConfirmationView(...)
```

Не обязательно буквально такие имена, но separation of concerns обязателен.

---

# 75. Mock Parser

Если production LLM integration не должна входить в эту задачу, допустимо создать:

```text
MockUserRequestParser
```

и formal adapter interface.

Но TASK должна явно указать, что parser contract готов, а production LLM adapter остаётся следующей подзадачей.

Если OpenAI API уже предусмотрен scaffold и задача включает integration — она должна быть изолирована за adapter.

---

# 76. Prompt Location

Если создаётся LLM prompt:

```text
prompts/
  agent-context/
```

или отдельная domain-папка.

Не держать критичный prompt как длинную строку внутри React component.

---

# 77. Prompt Requirements

Prompt должен прямо запрещать:

- inventing facts;
- implicit eligibility;
- automatic priority escalation;
- silent conflict resolution;
- hidden defaults.

---

# 78. Structured Output

Если LLM adapter используется:

предпочитать structured output/schema constrained generation.

Не парсить свободный prose регулярками, если модель может вернуть schema-constrained object.

---

# 79. Acceptance Criteria

TASK-003 считается завершённой, если:

1. существует parser interface;
2. parser result соответствует formal schema;
3. explicit facts извлекаются;
4. priority semantics сохраняются;
5. cross-type сохраняется;
6. unknown не превращается в false/default;
7. contradictions детектируются;
8. fuzzy language не получает arbitrary thresholds;
9. material clarification candidates создаются;
10. максимум 1–3 top clarifications выбираются deterministic layer;
11. interpretation confidence отделён от property DataConfidence;
12. confirmation view model формируется;
13. source text trace сохраняется;
14. fixtures покрывают основные сценарии;
15. runtime validation работает;
16. tests проходят;
17. typecheck проходит;
18. lint проходит;
19. build проходит.

---

# 80. Verification Commands

Coding-agent обязан выполнить:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

---

# 81. Deliverable Report

После выполнения сообщить:

```text
Implemented:
Parser architecture:
Files changed:
Fixtures:
Tests:
Typecheck:
Lint:
Build:
Known limitations:
Spec conflicts:
Spec deviations:
```

---

# 82. Do Not Continue Automatically

После TASK-003:

**не начинать следующую задачу самостоятельно.**

---

# 83. Likely Next Task

Следующей логично станет:

```text
TASK-004 — Request Confirmation Screen
```

где `confirmation_view` будет превращён в пользовательский экран редактирования и подтверждения.

---

# 84. Definition of Done

TASK-003 Done, когда natural-language user request можно безопасно превратить в валидный structured draft с:

- явными фактами;
- приоритетами;
- неизвестными;
- конфликтами;
- confidence;
- ограниченным числом существенных уточнений;

и этот draft готов к пользовательскому подтверждению до запуска поиска.

---

# 85. Главный принцип для coding-agent

Parser не должен быть «умным риелтором», который решает за пользователя, что тот имел в виду.

Правильная модель:

```text
Пользователь сказал
      ↓
Parser извлёк
      ↓
Неясное пометил
      ↓
Противоречие показал
      ↓
Критичное уточнил
      ↓
Пользователь подтвердил
```

Главное правило:

> **Сначала извлечь явное. Затем отметить неопределённое. Уточнить только существенное. Никогда не превращать догадку в пользовательское требование.**
