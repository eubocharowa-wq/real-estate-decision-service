# Sources Registry — MVP v1

## 1. Назначение документа

Этот документ описывает реестр внешних источников данных, правила их подключения, приоритеты, покрытие, частоту обновления и состав пилотного набора источников для MVP.

Он используется совместно с:

```text
docs/04-data/source-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/04-data/deduplication.md
docs/05-matching/confidence-status.md
docs/06-data-collection/openclaw-role.md
```

Главный принцип:

> Источник подключается не потому, что он известный или крупный, а потому, что даёт нужные данные приемлемого качества, с понятным способом получения, обновления и проверки.

Сервис не должен зависеть от одного портала и не должен строить УТП на обещании технически недостижимого «поиска вообще по всему интернету».

Публичная логика продукта:

> Поиск ведётся по подключённым источникам, а пользователь может добавить собственный найденный вариант по ссылке.

---

# 2. Задачи Source Registry

Реестр должен позволять системе ответить:

1. Какие источники подключены?
2. Какие типы недвижимости они покрывают?
3. Какие города / регионы покрывают?
4. Какие поля можно из них получать?
5. Как именно получать данные?
6. Как часто их нужно обновлять?
7. Какие данные этого источника считаются первичными?
8. Какие поля требуют дополнительной проверки?
9. Насколько стабильно работает сбор?
10. Какие ограничения существуют?
11. Когда источник временно отключён?
12. Какой альтернативный источник использовать?

---

# 3. Source Registry — базовая структура

Каждый источник должен иметь запись:

```yaml
source:
  source_id:
  name:
  source_type:
  domain:
  base_url:
  status:

  coverage:
    countries:
    regions:
    cities:
    property_types:
    market_types:

  capabilities:
    discovery:
    concrete_units:
    price:
    availability:
    financing:
    promotions:
    documents:
    infrastructure:

  collection:
    preferred_method:
    fallback_methods:
    requires_browser:
    requires_auth:
    update_frequency:
    parser_id:

  quality:
    trust_level:
    expected_fields:
    weak_fields:
    freshness_policy:
    manual_review_fields:

  policy:
    access_status:
    legal_review_status:
    notes:

  operations:
    last_success:
    last_failure:
    success_rate:
    active:
```

---

# 4. Source Types

Для MVP используются следующие категории.

## 4.1. Developer Site

Официальный сайт застройщика.

Может давать:

- ЖК;
- корпуса;
- конкретные квартиры;
- планировки;
- цены;
- наличие;
- сроки;
- отделку;
- акции;
- ипотечные рекламные условия.

Сильные стороны:

- первичный коммерческий источник по собственному объекту;
- конкретные unit ID;
- актуальные цены и наличие при хорошем сайте.

Ограничения:

- реклама не равна подтверждённым финансовым условиям;
- данные могут быть динамическими;
- часть квартир может скрываться;
- структура сайтов различается.

---

# 5. Project / Residential Complex Site

Отдельный сайт проекта или ЖК.

Может содержать:

- описание проекта;
- генплан;
- корпуса;
- сроки;
- инфраструктуру;
- планировки;
- акции;
- документацию.

Он не всегда содержит конкретный inventory.

Нельзя считать цену «от» ценой конкретной квартиры.

---

# 6. Classified / Listing Portal

Классифайд или крупная площадка объявлений.

Полезен для:

- вторичного рынка;
- домов;
- участков;
- агентских предложений;
- дополнительного покрытия новостроек.

Сильные стороны:

- широкий рынок;
- много частных и агентских объявлений.

Риски:

- дубли;
- неполные адреса;
- устаревшие объявления;
- рекламные цены;
- закрытые номера квартир;
- технические ограничения;
- правила доступа.

Такие источники особенно требуют deduplication и freshness control.

---

# 7. Agency Site

Сайт агентства недвижимости.

Может быть полезен как дополнительный источник:

- объектов;
- фотографий;
- описаний;
- уникальных предложений.

Но по умолчанию:

```text
trust_level = secondary
```

если агентство не является первичным продавцом.

---

# 8. Bank Site

Используется для:

- ипотечных программ;
- ставок;
- ПВ;
- максимальных сумм;
- сроков;
- требований;
- специальных предложений.

Важно:

> банковская страница подтверждает правила банка, но не всегда применимость предложения к конкретной квартире.

Связь:

```text
Bank Program
   ↓
Financing Offer
   ↓
Property Eligibility
```

---

# 9. Government / Official Program Source

Используется для:

- официальных правил программ;
- нормативных условий;
- ограничений;
- дат вступления изменений.

Для правил государственной программы это обычно наиболее авторитетный тип источника.

Но даже официальный источник программы не подтверждает банковское одобрение конкретного пользователя.

---

# 10. Registry / Official Documents

Сюда относятся официальные:

- реестры;
- проектные документы;
- разрешения;
- декларации;
- документы по объекту;
- кадастровые и иные официальные сведения, если законно и технически доступны.

На MVP их можно подключать постепенно.

---

# 11. Map / POI Sources

Используются для:

- координат;
- школ;
- детских садов;
- клиник;
- остановок;
- парков;
- магазинов;
- travel distance;
- travel time.

Нужно различать:

```text
географический факт
```

и:

```text
оценочное утверждение
```

Например:

> школа в 850 м

может быть фактом.

> школа хорошая

требует отдельной методики.

---

# 12. User-provided URL

Любая ссылка, которую добавил пользователь.

Используется для:

- объекта, которого нет в базе;
- альтернативного источника существующего объекта;
- ручного сравнения.

После загрузки:

```text
URL
↓
collection
↓
normalization
↓
deduplication
↓
source evidence
↓
comparison
```

---

# 13. Manual Expert Source

Источник, полученный через:

- звонок;
- письмо;
- менеджера застройщика;
- ручную проверку;
- документ;
- экспертный осмотр.

Он должен сохранять:

- кто проверил;
- когда;
- что именно;
- на основании чего;
- срок актуальности.

---

# 14. Partner Feed / API

Если существует официальный API / feed / партнёрский канал, его следует предпочитать браузерному сбору, если он:

- предоставляет нужные поля;
- достаточно свежий;
- разрешён для использования;
- стабилен.

Приоритет методов:

```text
официальный API / feed
        ↓
structured HTTP source
        ↓
browser agent / OpenClaw
        ↓
manual collection
```

Это не абсолютное правило, но базовая стратегия.

---

# 15. Coverage Model

У источника должно быть явно описано покрытие.

```yaml
coverage:
  countries:
    - RU

  regions:
    - ...

  cities:
    - ...

  property_types:
    - apartment
    - house
    - land

  market_types:
    - new_build
    - secondary
```

Нельзя считать источник общероссийским только потому, что сайт формально доступен по всей стране.

Покрытие должно определяться фактически доступными данными.

---

# 16. Field Coverage

Отдельно описывается, какие поля источник реально способен дать.

Пример:

```yaml
field_coverage:
  identity: high
  price: high
  availability: high
  financing: medium
  legal: low
  infrastructure: none
```

Это позволит Data Collection Layer не отправлять агенту бессмысленные запросы.

---

# 17. Source Capability Matrix

Рекомендуемый формат:

| Тип источника | Объекты | Цена | Наличие | Финансы | Акции | Документы | Инфраструктура |
|---|---:|---:|---:|---:|---:|---:|---:|
| Developer site | Да | Высоко | Высоко | Средне | Высоко | Средне | Низко |
| Classified | Да | Высоко | Средне | Низко | Низко | Низко | Низко |
| Bank | Нет | Нет | Нет | Высоко | Средне | Средне | Нет |
| Official program | Нет | Нет | Нет | Высоко | Нет | Высоко | Нет |
| Map / POI | Нет | Нет | Нет | Нет | Нет | Нет | Высоко |
| User URL | Зависит | Зависит | Зависит | Зависит | Зависит | Зависит | Зависит |

Это концептуальная матрица. Для реальных источников значения задаются индивидуально.

---

# 18. Source Priority не универсален

Нельзя присвоить один рейтинг источника на все поля.

Пример:

Сайт застройщика:

```text
Цена конкретной квартиры → сильный источник.
```

Но:

```text
«Самый экологичный район» → маркетинговое утверждение.
```

Банк:

```text
ставка банка → сильный источник.
```

Но:

```text
фактическое наличие квартиры → не источник.
```

Поэтому priority задаётся:

```text
source × field category
```

---

# 19. Field Source Priority Registry

Пример:

```yaml
field_priorities:

  listing_price:
    - developer_unit_page
    - official_feed
    - classified
    - agency

  availability:
    - developer_inventory
    - official_feed
    - classified

  government_program_rules:
    - government
    - bank
    - developer

  financing_offer:
    - bank
    - developer_official_offer
    - partner

  infrastructure_coordinates:
    - official_geo
    - map_provider
```

---

# 20. Collection Method Registry

У каждого источника:

```yaml
preferred_method:
fallback_methods:
```

Возможные методы:

- `api`
- `partner_feed`
- `http_fetch`
- `browser_agent`
- `openclaw`
- `manual`
- `user_submission`

Пример:

```yaml
preferred_method: api
fallback_methods:
  - http_fetch
  - openclaw
```

---

# 21. Правило выбора метода

Выбираем метод в порядке:

1. разрешённость / допустимость;
2. структурированность;
3. стабильность;
4. полнота;
5. актуальность;
6. стоимость;
7. скорость.

Не следует использовать браузерный агент, если официальный feed даёт те же данные качественнее.

---

# 22. Update Frequency

Частота обновления определяется типом данных и источником.

Примерные категории:

## Near-real-time / frequent

- availability;
- reservation;
- price;
- urgent promotions.

## Several times per day

- основной inventory;
- акции;
- ПВ;
- финансовые предложения.

## Daily

- менее динамичные карточки;
- часть вторичных объявлений.

## Weekly / on change

- проектные характеристики;
- инфраструктурные сведения;
- документы.

## Static / rare

- этаж конкретной квартиры;
- площадь;
- адрес готового дома.

---

# 23. Частота задаётся не только источнику, но и полю

Пример:

На одном сайте:

```text
цена → каждые 6 часов
наличие → каждые 3 часа
площадь → один раз + контроль изменений
акция → каждые 12 часов
```

Поэтому архитектура должна позволять field-specific refresh.

---

# 24. Source Status

Допустимые статусы:

- `candidate`
- `testing`
- `active`
- `degraded`
- `paused`
- `blocked`
- `deprecated`
- `manual_only`

## candidate

Источник найден, но ещё не проверен.

## testing

Идёт PoC.

## active

Разрешён для production collection.

## degraded

Часть функций работает нестабильно.

## paused

Временно отключён.

## blocked

Автоматический доступ сейчас невозможен.

## deprecated

Больше не используется.

## manual_only

Только ручная проверка.

---

# 25. Source Onboarding Process

Новый источник проходит этапы:

```text
1. Discovery
2. Business relevance
3. Coverage analysis
4. Field analysis
5. Access / legal review
6. Method selection
7. PoC
8. Parser / adapter
9. Validation
10. Deduplication test
11. Freshness test
12. Monitoring
13. Active
```

---

# 26. Business Relevance Check

До разработки парсера нужно понять:

- даёт ли источник уникальное покрытие;
- какие объекты добавляет;
- какие данные улучшает;
- не дублирует ли полностью уже существующий источник;
- насколько важен для пользовательских сценариев.

Не нужно подключать источник ради количества логотипов.

---

# 27. Access / Legal Review

Для каждого источника до массового автоматизированного сбора фиксируется:

```yaml
access_status:
legal_review_status:
terms_notes:
api_available:
partner_option:
automation_allowed_status:
display_requirements:
attribution_requirements:
```

Статусы:

- `not_reviewed`
- `review_required`
- `approved`
- `restricted`
- `not_allowed`
- `unknown`

До проверки нельзя считать техническую доступность достаточным основанием для массового сбора.

---

# 28. Не строить бизнес на обходе ограничений

Если крупная площадка:

- блокирует ботов;
- требует CAPTCHA;
- запрещает определённый тип автоматического доступа;
- предлагает API / партнёрский канал;

архитектура должна искать допустимый способ подключения.

OpenClaw не является механизмом обхода правил площадки.

---

# 29. Attribution

Если источник требует указания происхождения данных, система должна хранить:

- display name;
- URL;
- attribution text;
- attribution requirements.

UI должен иметь возможность показывать:

> Источник: ...

---

# 30. Source Reliability Metrics

Для operational monitoring:

- `success_rate`
- `partial_rate`
- `blocked_rate`
- `source_changed_rate`
- `average_duration`
- `average_fields_found`
- `critical_field_coverage`
- `freshness_compliance`
- `conflict_rate`

На MVP достаточно базовых метрик.

---

# 31. Source Health

Рекомендуемый статус:

- `healthy`
- `warning`
- `degraded`
- `down`

Пример:

```text
healthy:
>95% collection success

warning:
часть полей пропадает

degraded:
critical field extraction broken

down:
источник недоступен
```

Точные thresholds настраиваются после пилота.

---

# 32. Source Failure не должен ломать весь поиск

Если один источник недоступен:

- остальные продолжают обновляться;
- объект не исчезает автоматически;
- значения получают freshness status;
- система сообщает, что часть данных требует обновления.

---

# 33. Alternative Source Strategy

Для критичных данных желательно иметь резерв.

Пример:

Цена новостройки:

```text
official developer
↓ fallback
partner feed / secondary source
```

Финансовая программа:

```text
official program source
↓
bank
↓
developer
```

Fallback не должен автоматически получать тот же verification status.

---

# 34. Пилотная стратегия MVP

Цель пилота — не максимальное количество источников.

Цель:

> проверить полный pipeline на разных типах данных и страниц.

Нужен набор, который покрывает:

- конкретные квартиры новостройки;
- вторичные квартиры;
- дома;
- финансовые программы;
- акции;
- пользовательские ссылки.

---

# 35. Пилотная география

Архитектура продукта остаётся универсальной.

Для первой технической проверки допустимо использовать один компактный рынок как pilot dataset, чтобы:

- быстрее собрать benchmark;
- вручную проверить результаты;
- протестировать deduplication;
- протестировать financing;
- сравнить вывод алгоритма с экспертной оценкой.

География пилота не должна быть зашита в публичный бренд, URL-архитектуру или модель данных.

---

# 36. Пилотный набор источников — категория A

## 3–5 официальных сайтов застройщиков

Выбирать разные по технической структуре:

- простой HTML;
- JavaScript inventory;
- отдельный сайт ЖК;
- сайт с карточками конкретных квартир;
- сайт с акциями / ипотекой.

Цель:

- unit extraction;
- prices;
- availability;
- project linkage;
- promotions;
- financing claims.

---

# 37. Пилотный набор — категория B

## 1–2 источника вторичного рынка

Подключать только после проверки технического и правового способа использования.

Цель:

- скрытые номера квартир;
- неполные адреса;
- фотографии;
- агентские дубли;
- price conflicts;
- secondary deduplication.

Если массовый автоматический доступ к выбранной площадке недопустим или технически нестабилен, для MVP можно использовать:

- разрешённый feed;
- партнёрский канал;
- другой источник;
- небольшой manually curated dataset;
- user URL ingestion.

---

# 38. Пилотный набор — категория C

## 1 источник домов / загородной недвижимости

Цель:

- дом;
- участок;
- коммуникации;
- travel time;
- готовность;
- дубли.

Можно использовать тот же классифайд, если источник поддерживает этот сегмент и способ доступа допустим.

---

# 39. Пилотный набор — категория D

## Финансовые источники

Минимум:

- официальный источник правил выбранной программы;
- 1–2 банковских источника;
- страницы акций пилотных застройщиков.

Цель:

```text
Program
↓
Bank Offer
↓
Developer Promotion
↓
Property Eligibility
```

---

# 40. Пилотный набор — категория E

## Карты / инфраструктура

Один выбранный механизм для:

- координат;
- школ;
- детских садов;
- парков;
- остановок;
- travel time / distance.

В MVP важно обеспечить стабильную нормализацию, а не подключать несколько карт одновременно.

---

# 41. Пилотный набор — категория F

## User URL

Обязательный универсальный источник.

Проверить минимум:

- ссылка застройщика;
- ссылка вторички;
- ссылка дома;
- неизвестный сайт;
- уже существующий в базе дубль;
- нераспознаваемая страница.

---

# 42. Почему конкретные коммерческие источники не фиксируются навсегда в этом файле

Конкретные сайты могут менять:

- API;
- правила доступа;
- структуру;
- условия использования;
- техническую доступность.

Поэтому этот документ задаёт **source architecture и критерии выбора**.

А фактический список подключаемых источников должен храниться отдельно в машиночитаемом registry, например:

```text
config/sources/
```

или в базе администрирования.

---

# 43. Source Inventory File

В будущем repository должен содержать конфигурацию:

```text
config/
  sources/
    developers.yaml
    listings.yaml
    finance.yaml
    maps.yaml
```

Либо единый:

```text
config/sources.yaml
```

Секреты и credentials в Git не хранятся.

---

# 44. Пример source config

```yaml
source_id: developer_example

name: "Developer Example"

source_type: developer_site

status: testing

coverage:
  countries:
    - RU

  cities:
    - pilot_city

  property_types:
    - apartment

  market_types:
    - new_build

capabilities:
  discovery: true
  concrete_units: true
  price: true
  availability: true
  financing: true
  promotions: true

collection:
  preferred_method: http_fetch
  fallback_methods:
    - openclaw

  update_frequency:
    price: 6h
    availability: 3h
    financing: 12h

quality:
  trust_level: primary

  weak_fields:
    - advertised_rate
    - zero_initial_payment

policy:
  access_status: review_required
  legal_review_status: not_reviewed

operations:
  active: false
```

---

# 45. Не хранить credentials в Source Registry

В репозитории нельзя хранить:

- API keys;
- пароли;
- cookies;
- токены;
- логины.

В конфиге:

```yaml
credential_ref: MAP_PROVIDER_API_KEY
```

Реальное значение хранится в environment / secret manager.

---

# 46. Environment-specific Source Config

Можно разделять:

```text
development
staging
production
```

Например:

Development:

- mock sources;
- маленький dataset;
- sandbox.

Production:

- реальные approved connectors.

---

# 47. Mock Sources

Для разработки Matching Engine нужны mock data adapters.

Это позволит работать над приложением, даже если OpenClaw ещё не подключён.

Пример:

```text
MockSourceAdapter
→ canonical test fixtures
```

Очень важно не блокировать разработку интерфейса зависимостью от реального crawling.

---

# 48. Source Fixtures

В репозитории желательно иметь:

```text
data/
  fixtures/
    source-pages/
    normalized-properties/
    financing/
```

Но не хранить защищённый или запрещённый контент сторонних площадок без соответствующего права.

Fixtures могут быть:

- synthetic;
- manually created;
- legally reusable.

---

# 49. Source Coverage Dashboard

Позже в admin UI:

```text
Источник        Город      Объекты     Цена     Наличие    Последнее обновление
Developer A     ...        120         ✓        ✓          2 ч назад
Developer B     ...         80         ✓        !          8 ч назад
Source C        ...        450         ✓        ?          1 день
```

На MVP это может быть простой internal report.

---

# 50. Coverage Gap

Система должна уметь понимать:

> По запросу пользователя у нас недостаточно источников.

Например:

```yaml
coverage_gap:
  geography: city_x
  property_type: house
  reason: no_active_source
```

Это лучше, чем выдавать пустой результат как доказательство отсутствия объектов на рынке.

---

# 51. Coverage vs No Results

Критически важно различать:

## Market no-result

Мы достаточно покрываем рынок, но совпадений не нашли.

## Coverage no-result

Подключённых данных недостаточно.

Пользователю:

> По подключённым источникам точных вариантов не найдено.

Если coverage слабое:

> Покрытие по этому сегменту пока неполное. Можно добавить найденные вами ссылки или запросить дополнительный поиск.

---

# 52. Source Contribution

Для каждого shortlist можно хранить:

- какие источники дали кандидатов;
- какие дали подтверждение;
- какие дали альтернативные цены;
- какие обновили finance.

Это поможет оценивать полезность источников.

---

# 53. Source Selection для пользовательского fallback search

Если нужен targeted fallback:

1. выбрать источники по географии;
2. выбрать по property type;
3. выбрать активные;
4. учитывать policy;
5. учитывать health;
6. учитывать field coverage;
7. запускать минимальное число релевантных источников.

Не отправлять OpenClaw «во весь интернет».

---

# 54. Приоритет поиска

Пример:

```text
1. Primary structured sources
2. Active official sources
3. Approved secondary sources
4. User-provided URL
5. Manual / expert fallback
```

Конкретная последовательность зависит от задачи.

---

# 55. Source Discovery для новых городов

При расширении:

```text
город
↓
основные застройщики
↓
официальные проекты
↓
secondary coverage
↓
дом / земля
↓
финансовые источники
↓
карты / POI
```

Для каждого нового города не требуется менять ядро продукта.

Меняется registry и coverage.

---

# 56. Source Expansion Score

Для определения, какой источник подключать следующим, можно использовать внутренний приоритет:

- market coverage gain;
- unique objects;
- user demand;
- missing field coverage;
- collection feasibility;
- data quality;
- legal/access feasibility;
- maintenance cost.

Не просто «самая известная площадка первой».

---

# 57. Maintenance Cost

Каждый источник создаёт постоянную стоимость:

- parser maintenance;
- monitoring;
- source changes;
- CAPTCHA;
- legal review;
- data conflicts;
- storage;
- compute.

Поэтому source count — не KPI сам по себе.

---

# 58. Source KPI

Полезные KPI:

- доля пользовательских запросов с достаточным coverage;
- доля shortlist с fresh price;
- доля shortlist с confirmed availability;
- доля critical financial fields, которые можно проверить;
- unique candidate contribution;
- duplicate rate;
- collection success rate.

---

# 59. MVP Acceptance Criteria для Sources Layer

Слой считается готовым, если:

1. существует единый Source Registry;
2. каждый источник имеет coverage;
3. каждый имеет capabilities;
4. каждый имеет collection method;
5. каждый имеет status;
6. каждый имеет policy status;
7. определена frequency;
8. source может быть включён/выключен без изменения Matching Engine;
9. fallback search выбирает релевантные источники;
10. Data Collection понимает requested fields;
11. Source Evidence сохраняется;
12. health отслеживается;
13. source failure не ломает всю систему;
14. user URL работает как отдельный источник;
15. coverage gap отличается от market no-result;
16. credentials не находятся в Git;
17. добавление нового города не требует переписывать модель;
18. пилотный набор покрывает новостройку, вторичку, дом, finance и user URL.

---

# 60. Что входит в MVP v1

Обязательно:

- Source Registry;
- source types;
- coverage;
- capabilities;
- field coverage;
- preferred/fallback collection methods;
- statuses;
- freshness policy;
- source health;
- source policy metadata;
- pilot source categories;
- user URL;
- mock source;
- coverage gap;
- environment separation;
- credentials references.

---

# 61. Что можно отложить

На потом:

- автоматическая закупка данных;
- self-service partner onboarding;
- сотни источников;
- сложный source reputation score;
- ML source selection;
- автоматический legal compliance engine;
- multi-provider route optimization;
- полноценный source marketplace;
- international source rules;
- автоматическое обнаружение любого сайта.

---

# 62. Следующий технический артефакт

После утверждения этого документа отдельно создаётся **реальный pilot source matrix**.

Например:

```text
docs/06-data-collection/pilot-source-matrix.md
```

В нём уже фиксируются конкретные сайты:

- название;
- URL;
- тип;
- какие поля;
- способ доступа;
- статус проверки;
- технические риски;
- правовой статус;
- PoC result.

Этот список нельзя заполнять предположениями: конкретные источники нужно проверять отдельно перед подключением.

---

# 63. Главный принцип для coding-agent

Нельзя кодировать интеграции так:

```text
if source == "siteA":
...
if source == "siteB":
...
```

по всему приложению.

Правильная архитектура:

```text
Source Registry
       ↓
Source Adapter
       ↓
Collection Task
       ↓
Structured Raw Result
       ↓
Normalization
```

Matching Engine не должен знать, с какого сайта пришла квартира, кроме данных provenance/confidence.

Главное правило:

> Источники могут добавляться, исчезать и меняться. Ядро продукта — пользовательский запрос, нормализованные данные и Matching Engine — должно продолжать работать независимо от конкретного набора площадок.
