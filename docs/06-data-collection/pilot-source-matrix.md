# Pilot Source Matrix — initial assessment

**Дата первичной проверки:** 2026-08-12  
**Статус документа:** рабочая матрица для технического PoC и последующей юридической/партнёрской проверки.

## 1. Назначение

Этот документ фиксирует **конкретные реальные источники**, которые имеет смысл проверить для первого пилота data-collection слоя.

Цель матрицы — не решить вопрос «откуда взять максимум объявлений», а определить для каждого источника:

- какую часть рынка он покрывает;
- какие поля реально можно извлечь;
- есть ли конкретные карточки объектов;
- есть ли API / feed / иной структурированный канал;
- допустим ли автоматизированный сбор по опубликованным условиям;
- где требуется отдельное письменное разрешение / партнёрство;
- где OpenClaw может использоваться технически;
- где OpenClaw **не должен** использоваться до разрешения вопроса доступа;
- какие источники стоит включить в первый PoC.

> Важно: эта матрица не является юридическим заключением.  
> `legal/access status` означает только предварительную классификацию по публично найденным условиям на дату проверки. Перед production-сбором коммерческого источника требуется отдельная финальная проверка условий использования и, где необходимо, согласование с правообладателем.

---

# 2. Легенда статусов

## Technical status

- `READY_FOR_POC` — публичные страницы технически содержат нужные структурируемые данные.
- `PARTIAL` — данные есть, но не хватает unit-level структуры или отдельных ключевых полей.
- `API_AVAILABLE` — найден официальный API / feed.
- `PARTNER_CHANNEL` — структурированный канал существует, но требует аккаунта / договора / ключа.
- `UNKNOWN` — техническая схема ещё не подтверждена.

## Legal / access status

- `PUBLIC_OFFICIAL_SOURCE` — официальный публичный источник, пригодный как первичный reference для соответствующего типа данных; правила хранения/повторного использования всё равно проверяются отдельно.
- `REVIEW_REQUIRED` — явного разрешения на наш сценарий автоматизированного сбора не найдено.
- `PERMISSION_REQUIRED` — опубликованные правила содержат ограничение, из-за которого автоматизированный сбор нельзя считать разрешённым без согласования.
- `PARTNER_API_ONLY` — публичные условия указывают на необходимость специального доступа / API / отдельного соглашения.
- `DO_NOT_AUTOCOLLECT` — не использовать OpenClaw для массового автоматизированного извлечения до изменения статуса.

---

# 3. Итоговая матрица

| ID | Источник | Тип | Что даёт пилоту | Технический канал | Legal / access status | Решение для MVP |
|---|---|---|---|---|---|---|
| DEV-01 | Консоль Девелопмент — `tula.konsole.ru` | Застройщик | Конкретные квартиры, № квартиры, корпус, секция, этаж, площадь, отделка, цена, срок заселения | HTML / browser, unit pages | `PERMISSION_REQUIRED` | **P1 технический PoC только после согласования доступа** |
| DEV-02 | ВНЕШСТРОЙ — `vneshstroi.ru` | Застройщик | Конкретные квартиры, номер, дом, подъезд, этаж, площадь, цена, предварительный ПВ/платёж | HTML / browser, unit pages | `REVIEW_REQUIRED` | **P1 кандидат**; до production запросить разрешение/условия |
| DEV-03 | ОСТ — `ost71.ru` | Застройщик | Большой каталог квартир, unit pages, дома, цены, акции, ипотечные claims | HTML / browser | `REVIEW_REQUIRED` | **P1 кандидат**, хороший тест для квартиры + дом + финансовые claims |
| DEV-04 | Стройкомплект — `новостройки-тула.рф` | Застройщик | Конкретные квартиры, проекты, цены, акции, способы покупки | HTML / browser | `REVIEW_REQUIRED` | **P1/P2 кандидат** после проверки условий доступа |
| DEV-05 | Новая Тула — `novayatula.ru` | Застройщик / проект | Квартиры, цены, планировки, ипотечные предложения, акции | HTML / browser | `REVIEW_REQUIRED` | **P2**, полезен для finance/promo extraction |
| DEV-06 | ЖК «Фамилия» — `familia71.ru` | Застройщик / проект | Проектные сведения и контактные данные | HTML | `PERMISSION_REQUIRED`, опубликован запрет на копирование/иное использование без согласия | **Не автособирать. Только письменное разрешение / manual source** |
| MKT-01 | ЦИАН — `cian.ru` | Классифайд | Новостройки, вторичка, дома, широкое покрытие | Public API существует для профессиональных аккаунтов, но обнаруженные методы относятся главным образом к собственным объявлениям/ЖК аккаунта | `PARTNER_API_ONLY` / `DO_NOT_AUTOCOLLECT` | **Не скрейпить. Запросить отдельный коммерческий доступ / партнёрство** |
| MKT-02 | Яндекс Недвижимость — `realty.yandex.ru` | Классифайд | Новостройки, вторичка, дома, акции, агрегированное покрытие | XML/YRL feed официально документирован **для передачи объявлений в Яндекс**, не как публичный API получения всей базы | `REVIEW_REQUIRED` | Использовать YRL как **schema reference**, а ingestion — только после согласования отдельного канала |
| MKT-03 | Домклик — `domclick.ru` | Классифайд / финансы | Вторичка, новостройки, дома, ипотека | Найден официальный API статистики для объявлений собственной компании | `PARTNER_API_ONLY` для системного доступа к своим данным; публичный search API всей базы не найден | **Не считать источником общего ingestion без отдельного партнёрского канала** |
| MKT-04 | Авито — `avito.ru` | Классифайд | Вторичка, дома, участки, широкий рынок | Business API существует; доступ account-based. Публичный search API всей базы в проверенных материалах не подтверждён | `REVIEW_REQUIRED` / `PARTNER_API_ONLY` | **Не проектировать scraping как основу. Сначала официальный API/партнёрский запрос** |
| FIN-01 | ДОМ.РФ — `дом.рф` / `спроси.дом.рф` / `наш.дом.рф` | Официальный источник | Правила семейной ипотеки, перечни, госпрограммы, данные по новостройкам/документам | Public web + downloadable official materials | `PUBLIC_OFFICIAL_SOURCE` | **P1 обязательный reference для правил программы** |
| FIN-02 | ВТБ — `vtb.ru` | Банк | Конкретные банковские условия семейной ипотеки, ПВ, ставка, ограничения, требования | Public web | `REVIEW_REQUIRED` для автоматизированного системного хранения | **P1 финансовый reference**, targeted collection после проверки условий |
| GEO-01 | API Яндекс Карт | Карты / POI / маршруты | Геокодинг, маршруты, время, POI | Official API with key | `PARTNER_CHANNEL`; free mode has material restrictions on storage/use | **P1 технически, но для нашей модели вероятно нужен коммерческий тариф/лицензия либо другой провайдер** |

---

# 4. DEV-01 — Консоль Девелопмент

**URL:** `https://tula.konsole.ru/`

## Что подтверждено технически

На сайте есть конкретные unit pages.

Пример проверенной страницы:

`https://tula.konsole.ru/zhk-torhovskiy/kvartiry/flat-dvuhkomnatnaya-30283/`

На странице были доступны:

- ЖК;
- квартира №136;
- корпус 2;
- секция 1;
- этаж 13/25;
- площадь 56.67 м²;
- чистовая отделка;
- цена;
- старая цена;
- скидка;
- дата сдачи;
- дата заселения;
- отметка времени актуальности цены.

Это почти идеальный тестовый источник для `PropertyModel + SourceEvidence + Freshness`.

## Юридический / access вывод

В опубликованном пользовательском соглашении указано, что:

- сайт предоставляется для функционального использования;
- пользователь должен использовать сайт через web browser;
- использование способами, не предусмотренными соглашением или функциональностью сайта, не допускается.

Поэтому массовый automated ingestion нельзя считать разрешённым по умолчанию.

### Статус

```text
Technical: READY_FOR_POC
Legal/access: PERMISSION_REQUIRED
```

### Следующее действие

Связаться с компанией и запросить:

1. XML/JSON/feed/API, если существует;
2. разрешение на регулярное получение публичного inventory;
3. условия отображения цены/остатков;
4. требования к атрибуции;
5. допустимую частоту обновления.

---

# 5. DEV-02 — ВНЕШСТРОЙ

**URL:** `https://vneshstroi.ru/`

Проверенные unit pages:

- `https://vneshstroi.ru/kvartiry/30434/`
- `https://vneshstroi.ru/kvartiry/32441/`

Страница квартиры содержит:

- тип;
- площадь;
- цену;
- ЖК;
- этаж;
- подъезд;
- дом;
- номер квартиры;
- ипотечный расчёт;
- предварительный первоначальный взнос.

Сайт отдельно предупреждает, что ипотечный расчёт предварительный, а окончательные параметры определяет банк.

Это полезный источник для тестирования:

```text
physical facts
vs
advertised/estimated finance
```

### Статус

```text
Technical: READY_FOR_POC
Legal/access: REVIEW_REQUIRED
```

В найденных публичных материалах не обнаружено явного разрешения на систематическое автоматизированное извлечение и повторное использование каталога.

### Решение

P1 по технической ценности, но production adapter включать только после проверки условий / согласования.

---

# 6. DEV-03 — ОСТ

**URL:** `https://www.ost71.ru/`

Проверены:

- общий каталог квартир: `https://www.ost71.ru/flats/`
- конкретная квартира: `https://www.ost71.ru/flats/prime_sovetskaya/kvartira-135-1-5-1-24/`
- каталог домов: `https://www.ost71.ru/house-select/`

Источник особенно полезен для пилота, потому что одновременно даёт:

- квартиры;
- дома;
- разные проекты;
- цены;
- скидки;
- дополнительные опции;
- рекламные ипотечные условия;
- «квартиры без ПВ» как отдельную маркетинговую подборку.

Это хороший источник для проверки правила:

> `claim` не должен автоматически становиться `confirmed`.

### Статус

```text
Technical: READY_FOR_POC
Legal/access: REVIEW_REQUIRED
```

### Риск

Часть поисковых снимков источника была проиндексирована несколько месяцев назад. Это отдельно подтверждает необходимость собственной freshness policy и targeted refresh.

---

# 7. DEV-04 — Стройкомплект

**URL:** `https://новостройки-тула.рф/`

Проверена конкретная карточка квартиры:

`https://новостройки-тула.рф/flats/14292110/`

На сайте явно указано, что:

- цены;
- планировки;
- специальные предложения

носят ознакомительный характер и не являются публичной офертой.

### Статус

```text
Technical: READY_FOR_POC / PARTIAL
Legal/access: REVIEW_REQUIRED
```

### Следующий PoC

Проверить:

- discovery всех квартир;
- наличие стабильного unit ID;
- доступность корпуса/секции/этажа;
- наличие скрытого JSON endpoint;
- price history possibility;
- promotions linkage.

---

# 8. DEV-05 — Новая Тула

**URL:** `https://novayatula.ru/`

На публичной странице доступны:

- список квартир;
- площадь;
- цена;
- количество вариантов;
- ипотечные предложения;
- банк;
- заявленная ставка;
- заявленный первоначальный взнос;
- перечень избранных лотов;
- ход строительства.

Источник особенно полезен как finance/promotion test case.

Например, на странице одновременно встречаются:

- банковская ставка;
- субсидирование застройщиком;
- ставка на весь срок / первый год;
- ПВ от 20%;
- условие «на избранные квартиры».

То есть этот источник хорошо проверяет `FinancingProgram → Promotion → PropertyEligibility`.

### Статус

```text
Technical: READY_FOR_POC / PARTIAL unit identity
Legal/access: REVIEW_REQUIRED
```

---

# 9. DEV-06 — ЖК «Фамилия»

**URL:** `https://familia71.ru/`

На сайте опубликовано прямое ограничение: материалы сайта являются объектами авторского права; запрещается копирование, распространение и иное использование информации без предварительного согласия правообладателя.

### Статус

```text
Technical: accessible
Legal/access: PERMISSION_REQUIRED
Production automation: DO_NOT_AUTOCOLLECT
```

### Решение

Использовать этот источник только:

- после письменного согласия;
- как manually verified source;
- либо как пользовательскую ссылку с ручным заполнением полей до получения разрешения на автоматический ingestion.

---

# 10. MKT-01 — ЦИАН

**URL:** `https://www.cian.ru/`

## Что подтверждено

У ЦИАН есть официальный Public API:

`https://public-api.cian.ru/`

Есть отдельная документация для застройщиков и рекламных агентств.

Доступ требует:

- профессионального аккаунта;
- отдельного ACCESS KEY;
- обращения к ЦИАН.

Найденные API-методы позволяют работать, в частности, с:

- собственными объявлениями агентства;
- статистикой;
- ЖК застройщика;
- импортом;
- чатами и звонками.

## Критическое ограничение

В опубликованных правилах ЦИАН прямо запрещено без специального разрешения:

- использовать автоматизированные скрипты для сбора информации;
- использовать неразрешённые автоматические программы;
- извлекать, копировать и иным способом использовать материалы базы ЦИАН без согласования.

### Вывод

```text
Technical marketplace pages: rich
Official API: yes
General marketplace ingestion API: not established in checked docs
Legal/access: PARTNER_API_ONLY
Scraping: DO_NOT_AUTOCOLLECT
```

### Решение для MVP

Не строить ingestion на HTML scraping ЦИАН.

Вместо этого:

1. запросить B2B/partner access для нашего use case;
2. выяснить, существует ли data/search licensing;
3. до согласования использовать CIAN только как external user link/manual comparison source.

---

# 11. MKT-02 — Яндекс Недвижимость

**URL:** `https://realty.yandex.ru/`

Яндекс документирует формат YRL/XML для:

- вторичной жилой недвижимости;
- домов;
- участков;
- новостроек;
- коммерческой недвижимости.

При этом найденная официальная документация относится к **передаче собственного фида в Яндекс Недвижимость**.

Она не подтверждает право или технический API для скачивания всей базы Яндекс Недвижимости.

### Почему источник всё равно важен

YRL полезен как reference schema:

- `internal-id`;
- category;
- cadastral number;
- address;
- latitude/longitude;
- apartment number;
- deal data;
- property characteristics.

То есть его можно использовать как внешний ориентир при проектировании наших adapters.

### Статус

```text
Feed standard: API_AVAILABLE for publishing TO Yandex
Marketplace ingestion: not confirmed
Legal/access: REVIEW_REQUIRED
```

### Решение

Не считать Yandex Realty XML механизмом получения чужих объявлений.

Для ingestion — отдельно обсуждать партнёрский канал.

---

# 12. MKT-03 — Домклик

**URL:** `https://domclick.ru/`

Найден официальный API:

`https://public-api.domclick.ru/stats/swagger`

Он предоставляет информацию и статистику по объявлениям **конкретной авторизованной компании**.

Для доступа нужен token из кабинета компании.

### Вывод

Это полезный integration channel для собственных/партнёрских данных, но найденная документация не подтверждает public search API всей базы Домклик.

```text
Technical API: PARTNER_CHANNEL
General marketplace ingestion: not confirmed
Legal/access: PARTNER_API_ONLY
```

### Решение

Запросить у Домклик партнёрский data access отдельно.

Не проектировать массовый HTML scraping как базовый источник.

---

# 13. MKT-04 — Авито

**URL:** `https://www.avito.ru/`

У Avito существует Business API / developer catalog.

В найденных материалах подтверждается account-based API с авторизацией и методами для профессиональных инструментов.

При этом в текущей проверке **не найдено подтверждение открытого API, позволяющего нашему сервису системно получать всю публичную выдачу недвижимости как marketplace dataset**.

Прямая официальная страница условий API в текущем web-инструменте не открылась, поэтому юридический вывод о конкретных пунктах ToS здесь намеренно не делается.

### Статус

```text
Business API: exists
Public market search ingestion: not established
Legal/access: REVIEW_REQUIRED / PARTNER_API_ONLY
```

### Решение

До отдельного согласования:

- не использовать Avito scraping как основу продукта;
- запросить официальный B2B/data use case;
- пользовательскую ссылку обрабатывать вручную либо только способом, разрешённым договором/API.

---

# 14. FIN-01 — ДОМ.РФ

Основные источники:

- `https://дом.рф/mortgage/family-mortgage/`
- `https://спроси.дом.рф/`
- `https://наш.дом.рф/`

ДОМ.РФ является оператором государственной программы и должен использоваться как первичный reference для правил Семейной ипотеки.

На проверенной странице присутствуют:

- максимальная ставка;
- минимальный ПВ;
- максимальная сумма кредита;
- типы допустимого жилья;
- отдельные правила вторичного рынка;
- срок действия;
- downloadable списки.

### Статус

```text
Technical: READY_FOR_POC
Role: authoritative rules source
Legal/access: PUBLIC_OFFICIAL_SOURCE, storage/reuse policy still to be documented
```

### Решение

P1 обязательный источник `FinancingProgram.rule_version`.

---

# 15. FIN-02 — ВТБ

**URL:** `https://www.vtb.ru/personal/ipoteka/dlya-semej-s-detmi/`

Страница содержит:

- текущую ставку;
- ПВ;
- срок;
- сумму;
- требования к заемщику;
- допустимые объекты;
- комбо-ипотеку;
- требования к продавцу;
- банковские особенности.

Это хороший источник для проверки различия:

```text
государственная программа
vs
конкретная банковская реализация программы
```

### Статус

```text
Technical: READY_FOR_POC
Legal/access: REVIEW_REQUIRED
```

### Решение

Использовать как `BankFinancingOffer` после отдельной проверки условий системного использования публичных страниц.

---

# 16. GEO-01 — API Яндекс Карт

Потенциально нужны:

- Geocoder;
- POI;
- travel time;
- distance matrix / router.

Официальные условия Яндекс Карт требуют API key.

Критическое для нашей архитектуры:

в бесплатных режимах есть ограничения на хранение/изменение полученных данных; отдельные коммерческие лицензии разрешают более широкий сценарий использования.

Так как наш продукт планирует:

- сохранять нормализованные координаты;
- рассчитывать и повторно использовать travel times;
- сравнивать объекты;

нельзя автоматически считать бесплатный API подходящим.

### Статус

```text
Technical: API_AVAILABLE
Legal/access: PARTNER_CHANNEL / commercial terms likely required
```

### Решение

До реализации выбрать один из вариантов:

1. коммерческая лицензия Яндекс Карт с совместимыми правами хранения;
2. другой geo provider с подходящими storage/reuse terms;
3. собственные открытые геоданные для части функций.

---

# 17. Рекомендуемая первая волна PoC

## Wave 1 — источники первичного рынка

Технически тестировать в первую очередь:

```text
DEV-01 Консоль
DEV-02 ВНЕШСТРОЙ
DEV-03 ОСТ
DEV-04 Стройкомплект
```

Почему:

- есть unit-level pages;
- есть реальная цена;
- есть физические характеристики;
- есть разные схемы сайтов;
- есть данные для deduplication;
- есть финансовые claims;
- часть источников содержит дома, а не только квартиры.

**Но:** production collection не включается автоматически. Для коммерческих сайтов сначала нужен access review / permission.

---

# 18. Wave 2 — finance

```text
FIN-01 ДОМ.РФ
FIN-02 ВТБ
Developer promo pages
```

Задача:

```text
Family Mortgage Rule
        ↓
Bank Offer
        ↓
Developer Promotion
        ↓
Specific Property Eligibility
```

---

# 19. Wave 3 — secondary / houses marketplace

Главный риск MVP сейчас именно здесь.

Крупные площадки дают нужное покрытие, но нельзя заранее считать их базы свободным сырьём для crawling.

Порядок:

```text
1. ЦИАН — запрос B2B/data access
2. Домклик — запрос partner/data access
3. Avito — запрос API/data partnership
4. Яндекс Недвижимость — выяснить отдельный inbound/data channel
```

Пока эти вопросы не закрыты, MVP может использовать:

- manually curated secondary dataset;
- partner agency feeds;
- собственные разрешённые feeds;
- user URL + ручное подтверждение;
- источники, где получено письменное разрешение.

---

# 20. Что написать площадкам

Для одинаковой проверки всех источников нужен короткий B2B request.

Нужно выяснить:

1. Есть ли API / XML / JSON feed для **получения** актуального inventory?
2. Можно ли хранить данные в собственной нормализованной базе?
3. Можно ли показывать пользователю цену, площадь и основные характеристики?
4. Можно ли хранить history price / availability?
5. Какие требования к ссылке на первоисточник?
6. Разрешён ли automated refresh?
7. Какие rate limits?
8. Разрешено ли deduplication с другими источниками?
9. Можно ли использовать данные для персонального matching/ranking?
10. Можно ли показывать данные в сравнительной таблице рядом с объектами других площадок?
11. Есть ли коммерческая data license?
12. Можно ли использовать OpenClaw/browser automation, если API не покрывает нужные поля?

---

# 21. Source Access Decision

Для production каждый источник должен пройти gate:

```text
TECHNICALLY POSSIBLE
        ↓
ACCESS TERMS CHECKED
        ↓
RIGHT TO STORE CONFIRMED
        ↓
RIGHT TO DISPLAY CONFIRMED
        ↓
RIGHT TO REFRESH CONFIRMED
        ↓
ATTRIBUTION DEFINED
        ↓
PRODUCTION_APPROVED
```

Если любой критический пункт не закрыт:

```text
status != production_active
```

---

# 22. Важный вывод для архитектуры

Первичный технический ресёрч подтверждает правильность уже выбранной архитектуры:

> Нельзя строить продукт как один большой scraper Avito/Cian/Yandex.

Практическая модель должна быть:

```text
official/partner feeds
+ direct developer integrations
+ approved APIs
+ OpenClaw for permitted browser-only sources
+ user-added objects
+ manual/expert fallback
```

И все они приводятся к одному `PropertyModel`.

---

# 23. Pilot priority

## P1

- Консоль — после разрешения;
- ВНЕШСТРОЙ — после access review;
- ОСТ — после access review;
- Стройкомплект — после access review;
- ДОМ.РФ;
- один банк;
- geo API с совместимой лицензией.

## P2

- Новая Тула;
- дополнительные застройщики;
- партнёрский secondary feed;
- партнёрский house/land feed.

## Negotiation track

- ЦИАН;
- Домклик;
- Avito;
- Яндекс Недвижимость.

## Do not automate without permission

- `familia71.ru`;
- любой источник с аналогичным явным запретом;
- любой marketplace, где массовый automated extraction не согласован.

---

# 24. Следующие задачи

После этой матрицы нужны два разных действия.

## Product / repository

Продолжаем по плану:

```text
docs/06-data-collection/update-strategy.md
docs/06-data-collection/ingestion-flow.md
```

## Data-source PoC

Создать отдельные задачи:

```text
TASK-SOURCE-001 — Konsole access + adapter PoC
TASK-SOURCE-002 — Vneshstroi access + adapter PoC
TASK-SOURCE-003 — OST access + adapter PoC
TASK-SOURCE-004 — Stroikomplekt access + adapter PoC
TASK-SOURCE-005 — DOM.RF financing rules
TASK-SOURCE-006 — Marketplace partnership requests
TASK-SOURCE-007 — Geo provider license comparison
```

---

# 25. Research references

Проверенные страницы на 2026-08-12:

### Developer sources

- https://tula.konsole.ru/
- https://konsole.ru/sogl/
- https://tula.konsole.ru/zhk-torhovskiy/kvartiry/flat-dvuhkomnatnaya-30283/
- https://www.vneshstroi.ru/
- https://vneshstroi.ru/kvartiry/30434/
- https://www.ost71.ru/
- https://www.ost71.ru/flats/
- https://www.ost71.ru/house-select/
- https://новостройки-тула.рф/flats/14292110/
- https://novayatula.ru/
- https://familia71.ru/

### Marketplaces / partner APIs

- https://www.cian.ru/legal-documents/pravila_polzovaniya_sajtom_cian_624
- https://public-api.cian.ru/builders/docs/latest
- https://public-api.cian.ru/docs/latest
- https://yandex.ru/support/realty/ru/feed/
- https://yandex.ru/support/realty/ru/feed/requirements-sale-housing
- https://yandex.ru/support/realty/ru/feed/requirements-sale-new
- https://public-api.domclick.ru/stats/swagger
- https://developers.avito.ru/api-catalog
- https://www.avito.ru/legal/pro_tools/public-api

### Finance

- https://дом.рф/mortgage/family-mortgage/
- https://спроси.дом.рф/news/semeynaya-ipoteka-aktualnye-usloviya-na-may-2026/
- https://www.vtb.ru/personal/ipoteka/dlya-semej-s-detmi/

### Geo

- https://yandex.ru/legal/maps_api/ru/
- https://yandex.ru/dev/commercial/doc/ru/
- https://yandex.ru/maps-api/products/geocoder-api
- https://yandex.ru/dev/commercial/doc/ru/concepts/distance_matrix

---

# 26. Главный принцип для coding-agent

Наличие URL в `pilot-source-matrix.md` **не означает разрешение на crawling**.

Adapter можно переводить в production только после того, как source registry содержит:

```yaml
access_status: approved
storage_rights: approved
display_rights: approved
refresh_rights: approved
attribution_policy: defined
```

До этого допустимы только:

- mock adapter;
- synthetic fixture;
- ручной PoC;
- ограниченный тест с явным разрешением;
- официально разрешённый API/feed.

Главное правило:

> Сначала право и способ доступа, затем автоматизация. Не наоборот.
