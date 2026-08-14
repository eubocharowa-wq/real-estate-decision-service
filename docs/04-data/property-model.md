# Property Model — MVP v1

## 1. Назначение документа

Этот документ описывает единую модель объекта недвижимости для MVP.

Цель модели — привести к сопоставимому виду данные о разных типах недвижимости:

- квартира в новостройке;
- квартира на вторичном рынке;
- апартаменты;
- дом;
- таунхаус;
- участок;
- позже — другие типы недвижимости.

Модель используется одновременно для:

1. хранения данных;
2. поиска и фильтрации;
3. расчёта соответствия запросу пользователя;
4. сравнения объектов разных типов;
5. объяснения «почему подходит»;
6. фиксации неизвестных и неподтверждённых данных;
7. дедупликации;
8. работы агентов сбора данных, включая OpenClaw;
9. подключения внешних источников;
10. экспертной проверки объекта.

Главный принцип:

> Мы сравниваем не объявления, а реальные варианты покупки, приведённые к единой структуре.

---

# 2. Базовая сущность

Основная сущность MVP:

`PropertyCandidate`

Это конкретный вариант, который пользователь может рассматривать для покупки.

Важно различать:

- **объект недвижимости** — физический объект;
- **предложение** — конкретное объявление / оффер / продажа;
- **источник** — площадка, сайт застройщика или иной ресурс;
- **финансовая программа** — отдельное условие покупки;
- **проект / дом / ЖК** — объект верхнего уровня.

Одна квартира может иметь несколько предложений и несколько источников.

Поэтому нельзя использовать URL объявления как идентификатор самой недвижимости.

---

# 3. Иерархия сущностей

Рекомендуемая логика:

```text
Development / Building / House
        ↓
Property
        ↓
Offer
        ↓
Source
```

Дополнительно:

```text
Offer
  ↘ FinancingProgram
  ↘ Promotion
```

Пример:

ЖК «Пример»
→ корпус 2
→ квартира №145
→ предложение застройщика
→ предложение агентства
→ объявление на площадке

Физически квартира одна.

---

# 4. Верхнеуровневая структура PropertyCandidate

```yaml
property:
  identity:
  type:
  location:
  physical:
  building:
  condition:
  land:
  utilities:
  price:
  ownership:
  financing:
  availability:
  timeline:
  infrastructure:
  mobility:
  media:
  sources:
  verification:
  risks:
  calculated:
  metadata:
```

---

# 5. Identity — идентификация объекта

Поля:

- `property_id`
- `canonical_name`
- `property_type`
- `market_type`
- `external_ids`
- `cadastre_number`
- `developer_property_id`
- `building_id`
- `development_id`
- `unit_number`
- `deduplication_key`
- `identity_confidence`

## property_type

Допустимые значения MVP:

- `apartment`
- `apartments`
- `house`
- `townhouse`
- `land`

## market_type

- `new_build`
- `secondary`
- `suburban`
- `unknown`

Пример:

```yaml
property_type: apartment
market_type: new_build
```

---

# 6. Location — местоположение

Поля:

- `country`
- `region`
- `city`
- `district`
- `microdistrict`
- `settlement`
- `street`
- `house_number`
- `building_number`
- `full_address`
- `latitude`
- `longitude`
- `address_confidence`

Дополнительно:

- `residential_complex`
- `development_name`
- `building_name`
- `landmark`

## Правило

Нельзя считать рекламное название района официальным адресом.

Например:

> «10 минут от центра»

не является географическим полем и должно храниться отдельно как заявленная характеристика.

---

# 7. Physical — физические характеристики

Общие поля:

- `total_area_m2`
- `living_area_m2`
- `kitchen_area_m2`
- `rooms`
- `bedrooms`
- `bathrooms`
- `floor`
- `floors_total`
- `ceiling_height_m`
- `balcony`
- `loggia`
- `terrace`
- `windows_count`
- `window_orientation`
- `layout_type`
- `is_studio`
- `is_euro_layout`
- `entrances`
- `elevator`
- `freight_elevator`
- `storage_room`
- `parking`

Не все поля обязательны.

Отсутствующее значение хранится как `null`, а не заменяется предположением.

---

# 8. Специфика квартиры

Для квартир дополнительно:

- `apartment_number`
- `section`
- `entrance_number`
- `floor`
- `rooms`
- `layout_code`
- `unit_position`
- `view`
- `corner_unit`
- `windows_to_courtyard`
- `windows_to_street`

Если конкретная квартира неизвестна, а источник показывает только типовую планировку:

```yaml
unit_specific: false
```

Такой вариант нельзя выдавать как подтверждённо доступную конкретную квартиру.

---

# 9. Building — дом / корпус / ЖК

Поля:

- `development_name`
- `building_name`
- `building_type`
- `construction_material`
- `construction_status`
- `build_year`
- `commissioning_date`
- `planned_commissioning_date`
- `handover_date`
- `developer`
- `floors_total`
- `entrances`
- `elevators`
- `parking_type`
- `courtyard_type`
- `security`
- `commercial_ground_floor`
- `management_company`
- `energy_class`

## construction_status

- `planned`
- `under_construction`
- `commissioned`
- `completed`
- `unknown`

---

# 10. Developer — застройщик

Поля:

- `developer_name`
- `developer_legal_name`
- `developer_group`
- `developer_site`
- `developer_project_page`
- `developer_verified`

Для MVP не требуется строить полноценный рейтинг застройщика.

Но модель должна позволять позже добавить:

- историю проектов;
- задержки;
- судебные риски;
- финансовые показатели;
- отзывы;
- экспертную оценку.

---

# 11. Condition — состояние и отделка

Поля:

- `condition`
- `renovation_type`
- `finishing_type`
- `furniture`
- `kitchen_installed`
- `bathroom_ready`
- `requires_renovation`
- `estimated_renovation_cost`
- `estimated_renovation_time`

## condition

- `shell`
- `pre_finish`
- `finished`
- `renovated`
- `needs_renovation`
- `good`
- `unknown`

## Важно

Фразы продавца «заезжай и живи», «дизайнерский ремонт», «качественная отделка» не должны автоматически превращаться в объективные значения.

Они сохраняются как заявленные описания либо требуют экспертной оценки.

---

# 12. House / Land — поля для дома и участка

Для дома:

- `house_area_m2`
- `land_area_sotka`
- `floors`
- `bedrooms`
- `bathrooms`
- `house_material`
- `foundation`
- `roof`
- `year_built`
- `condition`
- `garage`
- `outbuildings`

Для участка:

- `land_area_sotka`
- `land_category`
- `permitted_use`
- `shape`
- `access_road`
- `fence`
- `terrain`

---

# 13. Utilities — коммуникации

Особенно важно для домов.

Поля:

- `electricity`
- `electricity_capacity_kw`
- `gas`
- `water`
- `sewerage`
- `heating`
- `internet`
- `well`
- `septic`
- `central_utilities`

Для каждого:

```yaml
status: connected | available | planned | absent | unknown
verification_status: confirmed | claimed | unconfirmed
```

---

# 14. Price — цена

Поля:

- `listing_price`
- `currency`
- `price_per_m2`
- `base_price`
- `discount_price`
- `old_price`
- `discount_amount`
- `discount_percent`
- `price_valid_until`
- `price_from`
- `price_specific_to_unit`
- `mandatory_extra_costs`
- `estimated_total_entry_cost`
- `estimated_total_cost`

## Критически важно

Фраза:

> «от 4,5 млн»

не должна сохраняться как цена конкретной квартиры.

Нужно:

```yaml
price_from: 4500000
price_specific_to_unit: false
```

Конкретный объект должен иметь конкретную подтверждаемую цену либо пометку о неопределённости.

---

# 15. Полная стоимость входа

Для сравнения разных типов недвижимости желательно считать не только цену объявления.

Поля:

- цена объекта;
- первоначальный взнос;
- обязательные доплаты;
- ремонт;
- мебель;
- страховка;
- регистрационные расходы;
- комиссия;
- подключение коммуникаций;
- парковка;
- кладовая;
- другие обязательные платежи.

Результат:

`estimated_total_entry_cost`

Пример:

```text
Цена квартиры            5 000 000
Ремонт                      700 000
Дополнительные расходы       80 000
Итого для въезда          5 780 000
```

В MVP часть этих значений может быть неизвестна.

Неизвестность должна быть видна пользователю.

---

# 16. Ownership — правовой статус / собственность

Базовые поля:

- `ownership_type`
- `seller_type`
- `seller_name`
- `owners_count`
- `ownership_since`
- `encumbrances_known`
- `mortgage_encumbrance`
- `children_owners`
- `registered_people`
- `legal_review_status`

## seller_type

- `developer`
- `owner`
- `agency`
- `individual_entrepreneur`
- `unknown`

Для MVP эти данные могут быть заполнены частично.

Юридически значимая проверка не должна имитироваться алгоритмом, если данных недостаточно.

---

# 17. Financing — финансирование объекта

На уровне объекта/предложения хранится только применимость программ.

Поля:

- `mortgage_available`
- `family_mortgage_available`
- `other_programs`
- `installment_available`
- `zero_initial_payment_claimed`
- `min_initial_payment`
- `estimated_monthly_payment`
- `subsidized_rate`
- `linked_financing_program_ids`

Полная модель финансовой программы должна находиться в отдельной сущности:

`FinancingProgram`

Это позволит не дублировать банковские правила в каждой квартире.

---

# 18. Promotion — акции

Акция — отдельная сущность, а не поле «скидка = да».

Поля:

- `promotion_id`
- `title`
- `description`
- `developer`
- `valid_from`
- `valid_until`
- `eligible_properties`
- `price_impact`
- `financing_impact`
- `conditions`
- `source`
- `verification_status`

Пример:

> «Без первоначального взноса»

не означает:

```yaml
initial_payment: 0
```

Пока не подтверждено применение акции к конкретному объекту.

---

# 19. Availability — наличие

Поля:

- `availability_status`
- `available_from`
- `last_seen_available_at`
- `reservation_status`
- `sales_status`

## availability_status

- `available`
- `reserved`
- `sold`
- `temporarily_unavailable`
- `unknown`

## Правило

Объект, который был доступен неделю назад, нельзя автоматически показывать как доступный сегодня без статуса актуальности.

---

# 20. Timeline — сроки

Поля:

- `construction_completion_date`
- `commissioning_date`
- `handover_date`
- `move_in_possible_date`
- `ready_now`

Для вторички:

- `vacant`
- `alternative_sale`
- `move_out_terms`
- `deal_ready`

Эти параметры особенно важны для сравнения:

> новостройка через 18 месяцев  
vs  
> вторичка с возможностью въехать через неделю.

---

# 21. Infrastructure — окружение

Поля:

- `schools`
- `kindergartens`
- `clinics`
- `hospitals`
- `shops`
- `malls`
- `parks`
- `sports`
- `public_transport`
- `railway`
- `metro`
- `universities`
- `other_poi`

Каждая точка может хранить:

```yaml
name:
type:
distance_m:
walk_time_min:
drive_time_min:
public_transport_time_min:
data_source:
verification_status:
```

## Правило

Не использовать рекламную фразу «вся инфраструктура рядом» как структурированный факт.

---

# 22. Mobility — транспортная доступность

Поля:

- `distance_to_center_km`
- `drive_to_center_min`
- `public_transport_to_center_min`
- `nearest_stop_distance_m`
- `nearest_major_road`
- `nearest_station`
- `user_destination_times`

Последнее поле особенно важно:

`user_destination_times`

Например, конкретному человеку важны:

- офис;
- школа;
- родители;
- вокзал.

Тогда сравнение строится не только относительно «центра города».

---

# 23. Media — медиа

Поля:

- `photos`
- `floorplans`
- `videos`
- `virtual_tour`
- `site_plan`
- `documents`

Для каждого:

- URL;
- источник;
- тип;
- дата;
- является ли изображение реальным или рендером;
- подтверждение.

Особенно для новостройки важно различать:

- реальные фото;
- рендеры;
- типовые изображения;
- фото конкретной квартиры.

---

# 24. Source — источник данных

Каждая важная характеристика должна по возможности иметь происхождение.

Базовая модель:

```yaml
source:
  source_id:
  source_type:
  name:
  url:
  collected_at:
  last_checked_at:
  extraction_method:
```

## source_type

- `developer_site`
- `project_site`
- `classified`
- `agency_site`
- `bank_site`
- `government`
- `user_link`
- `manual_expert`
- `other`

---

# 25. Field-level provenance — источник конкретного поля

Ключевой принцип проекта:

> Не только объект имеет источник. Важные факты должны иметь источник на уровне поля.

Например:

```yaml
listing_price:
  value: 4850000
  source_id: developer_site_1
  collected_at: 2026-08-12
  verification_status: confirmed
```

А:

```yaml
zero_initial_payment:
  value: true
  source_id: developer_promo_page
  collected_at: 2026-08-12
  verification_status: claimed
```

Это позволяет честно показывать:

- подтверждено;
- заявлено;
- не подтверждено.

---

# 26. Verification — достоверность

Для значимых полей используется статус:

- `confirmed`
- `claimed`
- `unconfirmed`
- `conflicting`
- `stale`
- `unknown`

### confirmed

Есть надёжное подтверждение.

### claimed

Так утверждает продавец/застройщик/объявление.

### unconfirmed

Есть информация, но её нельзя считать подтверждённой.

### conflicting

Разные источники дают разные данные.

### stale

Информация устарела.

### unknown

Данных нет.

---

# 27. Freshness — актуальность

Поля:

- `collected_at`
- `last_checked_at`
- `valid_until`
- `freshness_status`

## freshness_status

- `fresh`
- `aging`
- `stale`
- `unknown`

Разные поля имеют разную скорость устаревания.

Например:

Цена и наличие:
→ требуют частого обновления.

Год постройки:
→ практически статичен.

---

# 28. Conflicts — расхождения источников

Пример:

Сайт застройщика:
4 850 000 ₽

Площадка:
4 990 000 ₽

Система должна хранить обе версии.

```yaml
conflict:
  field: listing_price
  values:
    - 4850000
    - 4990000
  status: unresolved
```

В интерфейсе:

> Цена отличается в источниках. Минимальная найденная — 4,85 млн. Требует подтверждения.

---

# 29. Risks — риски и предупреждения

Поля:

- `risk_type`
- `severity`
- `description`
- `source`
- `verification_status`
- `expert_note`

Категории:

- финансовый;
- юридический;
- строительный;
- инфраструктурный;
- транспортный;
- ликвидность;
- состояние объекта;
- неопределённость данных.

## Важно

Автоматическая система не должна формулировать юридическое заключение без соответствующих данных и компетенции.

Лучше:

> «Обнаружено условие, которое стоит дополнительно проверить».

---

# 30. Calculated — вычисляемые поля

Это значения, которые не собираются напрямую с сайтов, а рассчитываются системой.

Примеры:

- `match_score`
- `match_breakdown`
- `estimated_total_entry_cost`
- `estimated_monthly_payment`
- `price_per_m2`
- `distance_to_user_points`
- `data_completeness_score`
- `data_confidence_score`
- `duplicate_probability`
- `comparison_flags`

Важно различать:

**source data**
и
**calculated data**.

---

# 31. Data completeness — полнота

Каждый объект получает показатель полноты данных.

Например:

```yaml
data_completeness:
  score: 78
  missing_critical_fields:
    - exact_initial_payment
    - finishing_cost
```

Низкая полнота не обязательно означает плохой объект.

Она означает:

> для уверенного решения недостаточно данных.

---

# 32. Confidence — уверенность в объекте

Отдельно от пользовательского match score.

Пример:

**Соответствие вашей задаче:** 91%

**Надёжность данных:** средняя

Это разные показатели.

Нельзя давать 91% соответствия так, будто все данные достоверны, если половина полей неизвестна.

---

# 33. Какие поля обязательны для MVP

Минимальный объект, который можно показать в основной выдаче:

- тип недвижимости;
- город;
- адрес или понятная локация;
- цена;
- площадь;
- количество комнат либо соответствующий тип;
- источник;
- дата проверки;
- статус наличия;
- возможность идентифицировать предложение;
- хотя бы базовые данные для сравнения.

Для ипотечного запроса дополнительно:

- применимость программы либо честный статус «не подтверждено».

---

# 34. Когда объект нельзя выдавать как точное совпадение

Объект нельзя показывать как подтверждённо подходящий, если:

- цена неизвестна;
- объект уже продан;
- обязательный критерий не выполнен;
- обязательный критерий неизвестен и является критичным;
- данные сильно устарели;
- это не конкретный объект, а рекламная цена «от»;
- ключевая финансовая программа только предполагается системой.

Такой объект можно вынести в:

> «Возможно подходит — требуется уточнение».

---

# 35. Сравнение разных типов недвижимости

Чтобы сравнивать квартиру и дом, нужны общие метрики:

- полная стоимость входа;
- ежемесячная финансовая нагрузка;
- готовность к проживанию;
- срок въезда;
- площадь;
- количество комнат;
- инфраструктура;
- транспорт;
- расходы на ремонт;
- эксплуатационные расходы;
- статус данных;
- риски;
- соответствие пользовательской задаче.

Типоспецифические характеристики показываются ниже отдельно.

---

# 36. Обязательное разделение фактов и оценок

Факт:

> Школа находится в 850 м.

Оценка:

> Школа близко.

Факт:

> Дом введён в эксплуатацию в 2024 году.

Оценка:

> Новый дом.

Система хранит факты отдельно.

Оценки формируются только в контексте пользовательского запроса.

---

# 37. Что должен собирать OpenClaw

OpenClaw или другой агент сбора данных не получает задачу:

> «Собери всё про квартиру».

Он получает конкретную схему.

Минимальный набор:

### Идентификация
- название проекта;
- застройщик;
- адрес;
- корпус;
- квартира / предложение;
- URL.

### Объект
- тип;
- комнаты;
- площадь;
- этаж;
- отделка.

### Цена
- текущая цена;
- цена за м²;
- скидка;
- срок действия.

### Наличие
- доступна;
- забронирована;
- продана;
- неизвестно.

### Финансирование
- семейная ипотека;
- первоначальный взнос;
- рассрочка;
- заявленные акции.

### Срок
- сдача;
- ключи;
- готовность.

### Источник
- URL;
- дата;
- тип источника.

### Доказательства
- текст/фрагмент страницы или структурированный источник, откуда взято конкретное поле.

---

# 38. OpenClaw не должен самостоятельно

- объединять объекты без оценки вероятности дубля;
- считать рекламную акцию подтверждённой;
- придумывать отсутствующие значения;
- превращать «от» в конкретную цену;
- считать объект доступным без актуальной проверки;
- определять юридическую чистоту объекта;
- назначать match score;
- решать, что лучше для пользователя.

Его задача:

> найти → извлечь → зафиксировать источник → передать в нормализацию.

---

# 39. Пример нормализованного объекта

```json
{
  "property_id": "prop_tula_000145",

  "identity": {
    "property_type": "apartment",
    "market_type": "new_build",
    "development_name": "ЖК Пример",
    "building_name": "Корпус 2",
    "unit_number": "145"
  },

  "location": {
    "country": "RU",
    "region": "Тульская область",
    "city": "Тула",
    "district": null,
    "full_address": "Тула, ...",
    "latitude": null,
    "longitude": null
  },

  "physical": {
    "total_area_m2": 41.8,
    "rooms": 1,
    "floor": 7,
    "floors_total": 18,
    "ceiling_height_m": null
  },

  "condition": {
    "finishing_type": "pre_finish",
    "requires_renovation": true,
    "estimated_renovation_cost": null
  },

  "price": {
    "listing_price": 4890000,
    "currency": "RUB",
    "price_per_m2": 116986,
    "price_specific_to_unit": true,
    "estimated_total_entry_cost": null
  },

  "availability": {
    "availability_status": "available",
    "last_seen_available_at": "2026-08-12"
  },

  "timeline": {
    "planned_commissioning_date": "2027-06-30",
    "move_in_possible_date": null,
    "ready_now": false
  },

  "financing": {
    "mortgage_available": true,
    "family_mortgage_available": true,
    "zero_initial_payment_claimed": true,
    "min_initial_payment": null
  },

  "sources": [
    {
      "source_id": "source_001",
      "source_type": "developer_site",
      "name": "Сайт застройщика",
      "url": "https://example.ru/property/145",
      "collected_at": "2026-08-12",
      "last_checked_at": "2026-08-12"
    }
  ],

  "verification": {
    "listing_price": "confirmed",
    "availability_status": "confirmed",
    "family_mortgage_available": "claimed",
    "zero_initial_payment_claimed": "claimed"
  },

  "calculated": {
    "data_completeness_score": 74,
    "data_confidence_score": 78
  }
}
```

---

# 40. Поля MVP и поля будущего

## MVP v1 — обязательно моделируем сейчас

- идентификацию;
- тип;
- географию;
- цену;
- площадь;
- комнаты;
- этаж;
- состояние / отделку;
- дом / ЖК;
- застройщика;
- наличие;
- сроки;
- финансирование;
- инфраструктуру базового уровня;
- источники;
- актуальность;
- достоверность;
- вычисляемые поля;
- пользовательское соответствие.

## Можно отложить наполнение, но предусмотреть архитектурно

- кадастровую аналитику;
- полную юридическую историю;
- прогноз ликвидности;
- глубокую инвестиционную аналитику;
- историю всех цен;
- эксплуатационные расходы;
- экологические показатели;
- шум;
- криминальную статистику;
- демографию;
- детальную аналитику УК;
- рейтинг школ;
- сложную оценку качества ремонта.

---

# 41. Критерий готовности Property Model

Модель считается готовой для MVP, если она позволяет без потери основных смыслов представить и сравнить:

1. квартиру в строящейся новостройке;
2. готовую квартиру от застройщика;
3. вторичную квартиру с ремонтом;
4. вторичную квартиру под ремонт;
5. готовый частный дом;
6. строящийся дом;
7. объект с несколькими объявлениями;
8. объект с противоречащими ценами;
9. объект с рекламной ипотечной акцией;
10. объект с неполными данными.

---

# 42. Главный принцип для coding-agent

В базе нет «хороших» и «плохих» объектов сами по себе.

Есть:

- факты;
- источники;
- степень достоверности;
- неизвестные параметры;
- пользовательский запрос;
- вычисленное соответствие конкретному человеку.

Правильная последовательность:

> собрать данные → определить источник → нормализовать → объединить дубли → отметить достоверность → сопоставить с запросом → объяснить пользователю.

Нельзя строить архитектуру так, чтобы карточка объявления одновременно была объектом недвижимости, источником и пользовательской оценкой.

Это разные сущности и разные уровни данных.
