# Confidence Status — MVP v1

## 1. Назначение документа

Этот документ формализует, как сервис оценивает качество данных, используемых для подбора и сравнения недвижимости.

Он отвечает на пять разных вопросов:

1. **Данные вообще есть?**
2. **Насколько они полные именно для запроса этого пользователя?**
3. **Насколько надёжен источник каждого важного факта?**
4. **Насколько данные свежие?**
5. **Есть ли между источниками противоречия?**

Главный принцип:

> Высокий процент соответствия не означает высокую надёжность данных.

Пример:

```text
Соответствие задаче: 92%
Надёжность данных: 58%
```

Это означает:

> По доступным данным объект очень хорошо подходит, но часть существенных условий пока недостаточно подтверждена.

Система обязана разделять:

- **Match Score** — насколько объект подходит пользователю;
- **Data Confidence** — насколько надёжны данные, на которых основан Match Score;
- **Data Completeness** — насколько полно собраны данные, необходимые именно для этого запроса;
- **Freshness** — насколько актуальны динамические данные;
- **Conflict Status** — есть ли расхождения между источниками.

---

# 2. Связь с другими документами

Этот документ используется совместно с:

```text
docs/04-data/source-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/05-matching/matching-logic.md
docs/05-matching/hard-soft-criteria.md
```

`source-model.md` определяет происхождение данных.

`confidence-status.md` определяет, **как качество этих данных влияет на matching и пользовательскую выдачу**.

---

# 3. Основные показатели

Для каждого `MatchResult` система должна иметь минимум:

```yaml
data_quality:
  data_confidence_score:
  data_completeness_score:
  freshness_score:
  conflict_score:
  critical_unknown_count:
  critical_conflict_count:
  confidence_status:
```

Не все технические показатели обязательно показываются пользователю напрямую.

---

# 4. Data Confidence Score

`data_confidence_score` отвечает на вопрос:

> Насколько можно доверять фактам, которые реально используются для оценки этого объекта под данный пользовательский запрос?

Диапазон:

```text
0–100
```

Это **не рейтинг источника** и **не рейтинг объекта**.

Он рассчитывается по важным критериям конкретного пользователя.

---

# 5. Data Completeness Score

`data_completeness_score` отвечает:

> Какая доля данных, необходимых для оценки этого объекта по запросу пользователя, известна?

Пример.

Пользователь указал:

- бюджет;
- семейную ипотеку;
- ПВ;
- срок въезда;
- школу;
- отделку.

Если известны:

- цена;
- отделка;
- школа;
- срок въезда;

но неизвестны:

- семейная ипотека;
- ПВ;

полнота должна заметно снижаться, потому что отсутствуют именно важные параметры.

---

# 6. Completeness зависит от запроса

Нельзя рассчитывать полноту только по количеству заполненных полей карточки.

Пример:

У объекта неизвестен:

```text
балкон
```

Если пользователь не спрашивал про балкон:

→ это практически не влияет на completeness.

Если пользователь сказал:

> «Балкон обязателен».

→ отсутствие этого поля становится критическим.

Формула должна учитывать importance конкретного критерия.

---

# 7. Field Confidence

Каждое фактическое поле получает собственную оценку качества.

Пример структуры:

```yaml
field_quality:
  field: listing_price
  verification_status: confirmed
  source_trust: primary
  freshness_status: fresh
  conflict_status: none
  evidence_quality: high
  field_confidence: 0.96
```

---

# 8. Verification Status

Базовые статусы из `source-model.md`:

- `confirmed`
- `claimed`
- `unconfirmed`
- `conflicting`
- `stale`
- `unknown`

Они являются семантическими статусами.

Дополнительно Matching Engine может преобразовывать их во внутренний коэффициент.

Пример стартовой шкалы MVP:

```text
confirmed    → 1.00
claimed      → 0.70
unconfirmed  → 0.45
conflicting  → 0.25
stale        → зависит от типа поля
unknown      → 0.00
```

Это стартовые значения для тестирования, а не вечные константы продукта.

---

# 9. Source Trust

Источник тоже имеет уровень доверия:

- `authoritative`
- `primary`
- `secondary`
- `user_provided`
- `unknown`

Но `source_trust` нельзя напрямую считать равным достоверности поля.

Пример:

```text
официальный сайт застройщика = primary
```

но рекламный баннер:

> «Ипотека от 0,1%»

остаётся:

```text
verification_status = claimed
```

Источник сильный, но конкретный факт не подтверждает персональные условия сделки.

---

# 10. Evidence Quality

Для конкретного поля желательно оценивать качество evidence.

Возможные значения:

- `direct`
- `derived`
- `indirect`
- `weak`
- `missing`

## direct

Источник прямо сообщает факт по конкретному объекту.

Пример:

> Квартира №145 — 4 890 000 ₽.

## derived

Значение корректно вычислено из подтверждённых данных.

Например:

```text
price_per_m2 = price / area
```

## indirect

Факт относится к проекту или общему предложению, но применимость к конкретному объекту не доказана.

## weak

Маркетинговое описание / косвенный признак.

## missing

Evidence нет.

---

# 11. Freshness

Каждое динамическое поле должно иметь:

- `collected_at`
- `last_checked_at`
- `valid_until`, если есть;
- `freshness_status`.

Статусы:

- `fresh`
- `aging`
- `stale`
- `expired`
- `unknown`

---

# 12. Не существует единого TTL для всех полей

Разные данные устаревают с разной скоростью.

## Очень динамические

- наличие;
- бронь;
- цена;
- акция;
- ставка;
- ПВ;
- рассрочка;
- скидка.

## Средне динамические

- срок передачи ключей;
- стадия строительства;
- статус сделки;
- инфраструктурный объект в строительстве.

## Почти статические

- этаж;
- общая площадь;
- адрес;
- количество комнат;
- площадь участка;
- год постройки готового дома.

Поэтому freshness policy должна задаваться по типу поля.

---

# 13. Freshness Policy Registry

Рекомендуемый формат:

```yaml
freshness_registry:

  listing_price:
    fresh_for: 24h
    aging_after: 24h
    stale_after: 72h

  availability_status:
    fresh_for: 12h
    aging_after: 12h
    stale_after: 48h

  financing_offer:
    fresh_for: 24h
    stale_after: 72h

  total_area_m2:
    fresh_for: indefinite
```

Конкретные интервалы должны калиброваться после тестирования источников.

Coding-agent не должен самостоятельно придумывать окончательные production TTL.

---

# 14. Expired

Если источник содержит явный срок действия:

```text
Акция действует до 31 августа.
```

после этой даты:

```text
freshness_status = expired
```

Независимо от того, когда последний раз была открыта страница.

---

# 15. Conflict Status

Для каждого поля:

- `none`
- `minor`
- `significant`
- `critical`
- `unresolved`

Пример:

```text
площадь 41.8 vs 41.9
```

может быть `minor`.

```text
цена 4.89 млн vs 5.4 млн
```

может быть `significant`.

```text
ПВ 0% vs минимум 20%
```

для пользователя, которому ПВ 0 обязателен:

→ `critical`.

---

# 16. Severity конфликта зависит от запроса

Один и тот же конфликт может иметь разную важность.

Пример:

Цена расходится на 100 000 ₽.

Пользователь:

> «Строго до 5 млн».

Источники:

```text
4.95 млн
5.05 млн
```

Это критический конфликт.

Для пользователя с бюджетом 7 млн тот же конфликт гораздо менее существенен для eligibility, хотя всё равно должен быть показан.

---

# 17. Critical Unknown

`critical_unknown` возникает, если:

1. критерий пользователя `must` или `exclude`;
2. значение отсутствует / недостаточно подтверждено;
3. без него нельзя определить прохождение hard filter.

Примеры:

- неизвестно, подходит ли семейная ипотека;
- неизвестен реальный ПВ;
- неизвестна актуальная цена при жёстком бюджете;
- неизвестен срок въезда при жёстком дедлайне.

---

# 18. Non-critical Unknown

Пример:

Пользователь сказал:

> «Балкон был бы плюсом».

Данных о балконе нет.

Результат:

- Match Score не получает ни полного совпадения, ни штрафа за реальное отсутствие;
- Data Completeness немного снижается;
- это может быть показано как второстепенное unknown.

---

# 19. Unknown не равно false

Ключевое правило:

```text
unknown ≠ no
```

Пример:

```text
parking = unknown
```

нельзя преобразовывать в:

```text
parking = false
```

И наоборот.

---

# 20. Claimed не равно confirmed

Пример:

Застройщик пишет:

> «Без первоначального взноса».

Это может дать:

```yaml
value: true
verification_status: claimed
```

Но пока не проверено:

- для конкретной квартиры;
- банка;
- цены;
- условий заемщика;

нельзя повышать статус до `confirmed`.

---

# 21. Stale не равно false

Старая цена не означает, что цена изменилась.

Она означает:

> текущая цена неизвестна с достаточной уверенностью.

Поэтому:

```text
stale → uncertainty
```

а не:

```text
stale → criterion failed
```

---

# 22. Базовая модель Field Confidence

Для MVP можно использовать факторную модель:

```text
Field Confidence =
Verification Factor
× Freshness Factor
× Conflict Factor
× Evidence Factor
```

Результат ограничивается диапазоном 0–1.

Пример:

```text
confirmed = 1.00
fresh = 1.00
no conflict = 1.00
direct evidence = 1.00

Field Confidence = 1.00
```

Другой пример:

```text
claimed = 0.70
fresh = 1.00
no conflict = 1.00
indirect = 0.80

Field Confidence = 0.56
```

Конкретные коэффициенты калибруются позже.

---

# 23. Нельзя компенсировать critical uncertainty количеством слабых источников

Пример:

Пять агентских сайтов повторяют:

> «ПВ 0».

Это не обязательно превращает утверждение в `confirmed`.

Количество копий одного рекламного текста не равно независимому подтверждению.

Нужно учитывать независимость источников.

---

# 24. Source Independence

В перспективе Evidence может иметь:

`origin_group`

Пример:

```text
Developer feed
   ↓
Portal A
Portal B
Agency site
```

Три вторичных публикации могут фактически происходить из одного первичного фида.

Нельзя считать их тремя независимыми подтверждениями.

Для MVP достаточно заложить поле:

```yaml
upstream_source_id:
```

---

# 25. Data Confidence по критериям пользователя

После расчёта Field Confidence:

```text
Data Confidence =
Σ(importance_i × field_confidence_i)
────────────────────────────────────
Σ(importance_i)
```

Где importance зависит от:

- `must`;
- `preferred`;
- веса preferred;
- влияния критерия на решение.

Пример стартовых importance:

```text
exclude/must → 5
preferred weight 5 → 5
preferred weight 4 → 4
preferred weight 3 → 3
preferred weight 2 → 2
preferred weight 1 → 1
neutral → 0
```

---

# 26. Data Completeness Formula

Для каждого relevant criterion:

```text
known = 1
partially_known = 0.5
unknown = 0
```

Тогда:

```text
Completeness =
Σ(importance_i × known_factor_i)
────────────────────────────────
Σ(importance_i)
```

Здесь качество источника не учитывается.

Это специально.

Completeness отвечает только:

> данные есть или нет?

Confidence отвечает:

> насколько им можно доверять?

---

# 27. Пример различия Completeness и Confidence

Объект A:

```text
Все необходимые поля заполнены.
Все взяты из старых рекламных объявлений.
```

Результат:

```text
Completeness: 100%
Confidence: 45%
```

Объект B:

```text
Есть 7 из 10 нужных полей.
Но они подтверждены официальными свежими источниками.
```

Результат:

```text
Completeness: 76%
Confidence: 93%
```

Это принципиально разные ситуации.

---

# 28. Confidence Status — понятный пользовательский статус

Помимо цифры системе нужен семантический статус:

- `high`
- `medium`
- `low`
- `critical`

Пример стартовой логики:

```text
85–100 → high
65–84  → medium
40–64  → low
<40    → critical
```

Но статус также может быть понижен из-за одного критического unknown, даже если средний score высокий.

---

# 29. Critical Override

Пример:

```text
Цена confirmed
Этаж confirmed
Школа confirmed
Площадь confirmed
Отделка confirmed
Семейная ипотека unknown
```

Пользователь:

> Семейная ипотека обязательна.

Средний Data Confidence математически может получиться высоким.

Но итоговый статус не должен быть `high`.

Вводим:

```text
critical_override = true
```

Результат:

```text
confidence_status = medium / low
eligibility = eligible_with_unknowns
```

в зависимости от политики.

---

# 30. Confidence Status не должен скрывать причину

Пользователь должен видеть не просто:

> Надёжность данных: средняя.

А при раскрытии:

> Цена и характеристики подтверждены.  
> Требуется подтвердить семейную ипотеку и условия первоначального взноса.

---

# 31. Как confidence влияет на eligibility

Примерная матрица:

## Все must confirmed

→ `eligible`

## Must claimed / unconfirmed

→ `eligible_with_unknowns` либо `possible_match`

## Must conflicting

→ `possible_match`

## Must unknown

→ `possible_match` / `insufficient_data`

## Must confirmed fail

→ `hard_fail`

То есть низкий confidence сам по себе не превращает объект в hard fail.

---

# 32. Как confidence влияет на Match Score

Match Score и Data Confidence рассчитываются отдельно.

Правило:

> Не уменьшать пользовательский Match Score скрытым умножением на confidence.

Пользователь должен понимать разницу между:

- «объект хуже подходит»;
- «мы хуже знаем его параметры».

---

# 33. Как confidence влияет на Ranking Score

Внутренний `ranking_score` может учитывать confidence.

Например:

```text
A: Match 95 / Confidence 45
B: Match 92 / Confidence 94
```

B может быть выше в shortlist.

Но пользователю показываются реальные:

```text
Match = 95
Confidence = 45
```

а не изменённый искусственный Match = 72.

---

# 34. Confidence Penalty для ranking

В MVP можно использовать отдельный penalty:

```text
ranking_score =
match_score
- uncertainty_penalty
- conflict_penalty
```

или другую прозрачную техническую формулу.

Окончательные коэффициенты должны калиброваться на benchmark.

---

# 35. Freshness и ranking

При прочих равных:

- свежая подтверждённая цена;
- свежее наличие;
- актуальная программа;

могут дать объекту преимущество в shortlist перед объектом с тем же Match Score, но устаревшими данными.

---

# 36. Conflict и ranking

Критический конфликт по важному полю должен понижать ranking.

Пример:

```text
ПВ 0% — один источник
ПВ 20% — другой источник
```

При запросе «ПВ 0 обязательно» такой объект не должен занимать первое место, пока конфликт не разрешён.

---

# 37. User-visible labels

Для MVP можно использовать понятные формулировки.

## confirmed

**Подтверждено**

## claimed

**Заявлено источником**

## unconfirmed

**Требует подтверждения**

## conflicting

**Данные расходятся**

## stale

**Нужно обновить**

## unknown

**Нет данных**

---

# 38. Пользователь не должен видеть технический шум

Не показываем:

```text
Field confidence = 0.563
Source trust factor = 0.8
Evidence factor = 0.7
```

Показываем:

> Условия акции заявлены застройщиком, но применимость к этой квартире не подтверждена.

Технические коэффициенты нужны для алгоритма и аудита.

---

# 39. Общий блок в карточке

Пример:

## Надёжность данных: высокая

**Подтверждено**
- цена;
- площадь;
- этаж;
- наличие.

**Требует уточнения**
- первоначальный взнос.

**Данные расходятся**
- срок передачи ключей.

---

# 40. Confidence для финансовых данных

Финансовые поля должны иметь более строгую политику.

Особенно:

- ставка;
- ПВ;
- семейная ипотека;
- ежемесячный платёж;
- акция;
- рассрочка.

Рекламный источник не должен давать максимальный confidence.

Для `confirmed` желательно иметь:

- актуальную программу;
- конкретный объект;
- конкретное предложение;
- актуальную дату;
- отсутствие критического конфликта.

---

# 41. Confidence для цены

Цена может иметь:

### high

- конкретный объект;
- первичный источник;
- сегодня;
- доступен;
- нет конфликта.

### medium

- вторичный источник;
- недавно;
- объект идентифицирован.

### low

- цена «от»;
- старая карточка;
- непонятные условия.

---

# 42. Confidence для наличия

Availability особенно быстро устаревает.

Если объект последний раз был доступен несколько дней назад:

> «Был доступен при последней проверке»

а не:

> «Доступен сейчас».

---

# 43. Confidence для инфраструктуры

Источник может быть:

- картографический источник;
- официальный реестр;
- проверенная геолокация.

Расстояние может быть confirmed.

Но субъективный вывод:

> «хорошая школа»

не должен иметь тот же confidence без отдельной методики.

---

# 44. Confidence для характеристик дома

Для дома особенно важны:

- газ;
- вода;
- канализация;
- отопление;
- подъездная дорога.

Фраза:

> «Газ рядом»

не равна:

```text
gas = connected
```

Confidence должен отражать точность статуса.

---

# 45. Manual Verification

Эксперт может повысить статус данных.

Пример:

```yaml
verification:
  method: manual_expert
  verified_at:
  verified_by:
  evidence:
  note:
```

Но ручная проверка не должна уничтожать предыдущую историю.

---

# 46. User-confirmed Data

Пользователь может сообщить:

> «Я звонила застройщику, ПВ действительно 0».

Такое значение можно сохранить как:

```text
source_type = user_confirmed
```

но это не обязательно равно `confirmed` уровня официального документа.

Можно использовать:

```text
verification_status = user_confirmed
```

внутри расширенной модели либо `claimed` с отдельным evidence type.

В MVP главное — не смешивать это с независимым подтверждением.

---

# 47. Conflicts после ручной проверки

Если эксперт подтвердил:

```text
ПВ = 20%
```

а старые рекламные источники показывают:

```text
ПВ = 0
```

canonical value может стать 20%.

Но старые evidence остаются в истории.

---

# 48. Confidence и external URL пользователя

Если пользователь добавил объект по ссылке:

1. извлекаются данные;
2. определяется источник;
3. создаётся evidence;
4. проводится deduplication;
5. рассчитывается confidence;
6. пользователю показываются поля, которые нужно проверить.

Новая ссылка не получает доверие автоматически только потому, что её добавил пользователь.

---

# 49. Confidence и OpenClaw

OpenClaw должен возвращать:

- поле;
- значение;
- источник;
- URL;
- время;
- evidence;
- extraction confidence;
- предупреждения.

Но:

> extraction confidence ≠ verification confidence.

OpenClaw может быть на 99% уверен, что правильно прочитал текст:

> «Ипотека без ПВ».

Но сам текст всё равно может быть только рекламным claim.

---

# 50. Extraction Confidence

Отдельное техническое поле:

- `high`
- `medium`
- `low`

или 0–1.

Оно означает:

> насколько агент уверен, что правильно извлёк значение из источника.

Не означает:

> насколько факт соответствует реальности.

---

# 51. Пример полного поля

```json
{
  "field": "zero_initial_payment",

  "value": true,

  "source": {
    "source_id": "developer_001",
    "url": "https://example.ru/promo"
  },

  "evidence": {
    "text": "Ипотека без первоначального взноса",
    "extraction_confidence": 0.99
  },

  "verification_status": "claimed",
  "freshness_status": "fresh",
  "conflict_status": "none",

  "field_confidence": 0.56
}
```

---

# 52. Confidence Explanation Object

Для пользователя формируется:

```yaml
confidence_explanation:
  overall_status:
  confirmed_fields:
  claimed_fields:
  unknown_fields:
  stale_fields:
  conflicts:
  critical_items:
  recommended_checks:
```

LLM может превратить это в естественный текст.

Но причины должны приходить из структуры.

---

# 53. Recommended Check Priority

Не все неизвестные одинаково важны.

Уровни:

- `critical`
- `high`
- `medium`
- `low`

Пример:

### critical

семейная ипотека при обязательном условии.

### high

актуальная цена при бюджете близко к пределу.

### low

неизвестен балкон, если это только слабое пожелание.

---

# 54. Когда нужен повторный сбор данных

Система должна создавать `refresh_required`, если:

- price stale;
- availability stale;
- financing stale;
- promotion expired/aging;
- critical field unknown;
- источник конфликтует;
- пользователь собирается перейти к финальному решению.

---

# 55. Refresh Priority

Пример:

```yaml
refresh_priority:
  listing_price: critical
  availability_status: critical
  zero_initial_payment: critical
  school_distance: low
```

Это позволит агенту не перепроверять всё подряд.

---

# 56. OpenClaw Refresh Strategy

Перед обновлением shortlist агенту можно передавать:

```text
Объект prop_145

Обновить только:
- цену;
- наличие;
- семейную ипотеку;
- ПВ.

Не собирать заново:
- площадь;
- этаж;
- адрес.
```

Это уменьшает стоимость и нагрузку.

---

# 57. Confidence Decay

Для динамических полей confidence может снижаться с возрастом.

Например:

```text
сегодня → 1.00
через 24 ч → 0.90
через 72 ч → 0.60
далее → stale
```

Но функция decay должна зависеть от поля и источника.

---

# 58. Hard expiry vs gradual decay

Есть два режима.

## Gradual

Цена постепенно становится менее надёжной.

## Hard expiry

Акция закончилась 31 августа.

1 сентября:

```text
expired
```

а не «confidence 0.8».

---

# 59. Data Quality и no-result сценарий

Если подтверждённых вариантов нет, но есть варианты с недостатком данных, система должна различать:

> Точных подтверждённых совпадений нет.

и:

> Есть 4 потенциальных варианта, но по ним нужно подтвердить ключевые условия.

Это лучше, чем либо скрыть всё, либо выдать неподтверждённые варианты как точные.

---

# 60. Группы выдачи

При необходимости shortlist можно разделить:

## Подтверждённо подходят

Высокий match + обязательные условия подтверждены.

## Предварительно подходят

Высокий match, но есть critical unknowns.

## Стоит проверить

Объект может быть интересным, но данные неполны / конфликтуют.

## Не подходят

Hard failure.

---

# 61. Confidence и сравнение объектов

В таблице сравнения:

```text
                     A          B          C
Соответствие         92%        89%        84%
Надёжность данных    Высокая    Средняя    Высокая
```

По критичным полям:

```text
ПВ                   0 ₽ ✓      0 ₽ ?      1,2 млн ✓
```

Легенда:

```text
✓ подтверждено
? требуется проверка
! данные расходятся
```

---

# 62. Нельзя использовать confidence как маркетинговый инструмент

Запрещено искусственно повышать confidence для:

- партнёрских объектов;
- платных размещений;
- собственных объектов агентства;
- объектов с высокой комиссией.

Confidence определяется только качеством данных.

---

# 63. Confidence Audit

Каждый рассчитанный показатель должен быть воспроизводим.

Сохраняем:

- algorithm version;
- field evidence IDs;
- coefficients version;
- freshness policy version;
- timestamp.

Пример:

```yaml
confidence_calculation:
  version: confidence-v1
  calculated_at:
  evidence_ids:
  policy_version:
```

---

# 64. Изменение алгоритма

Если позже меняются:

- коэффициенты;
- TTL;
- source trust;
- conflict rules;

старый `MatchResult` не должен выглядеть как рассчитанный по новым правилам.

Нужно либо:

- сохранить старую версию;
- либо пересчитать явно.

---

# 65. Тестирование Data Confidence

Минимальные тесты:

1. все поля confirmed;
2. всё заполнено, но claimed;
3. половина полей unknown;
4. один critical must unknown;
5. один critical must conflicting;
6. stale price;
7. expired promotion;
8. fresh secondary source;
9. old primary source;
10. три источника с одинаковой информацией;
11. три источника, копирующие один upstream source;
12. ручная экспертная проверка;
13. user-provided URL;
14. OpenClaw extraction high, verification low;
15. высокий Match Score + низкий Confidence.

---

# 66. Тестирование Completeness

Проверяем:

- отсутствие нейтрального поля почти не влияет;
- отсутствие must резко влияет;
- отсутствие preferred влияет пропорционально weight;
- not_applicable исключается;
- conflicting считается как known, но не reliable;
- stale считается как known, но менее reliable.

Это важное различие:

```text
conflicting / stale → данные существуют → completeness есть
```

но:

```text
confidence падает
```

---

# 67. Пример Match Result

Пользователь:

```text
до 5 млн — must
семейная ипотека — must
ПВ 0 — preferred
не первый этаж — must
школа — preferred
```

Объект:

```text
Цена            confirmed
Семейная ипотека claimed
ПВ 0             claimed
Этаж             confirmed
Школа            confirmed
```

Результат:

```yaml
match_score: 90

data_completeness_score: 100

data_confidence_score: 76

critical_unknowns:
  - family_mortgage

confidence_status: medium

eligibility_status: eligible_with_unknowns
```

Почему completeness 100?

Все необходимые поля найдены.

Почему confidence только 76?

Часть ключевых условий только заявлена, а не подтверждена.

---

# 68. Другой пример

Объект:

```text
Цена               confirmed
Семейная ипотека   unknown
ПВ                  unknown
Этаж                confirmed
Школа               unknown
```

Результат:

```yaml
data_completeness_score: 48
data_confidence_score: 88_on_known_fields
critical_unknown_count: 1+
```

Для пользовательского интерфейса общий статус должен учитывать отсутствие данных и не создавать впечатление «88% надёжности».

Поэтому итоговый user-facing Confidence рекомендуется считать по всем relevant criteria с unknown = 0.

---

# 69. Рекомендуемый итоговый Data Confidence

Чтобы избежать путаницы:

```text
User-facing Data Confidence =
Σ(importance_i × field_confidence_i)
────────────────────────────────────
Σ(importance_i for all relevant criteria)
```

Unknown:

```text
field_confidence = 0
```

Таким образом отсутствие данных автоматически снижает итоговую надёжность.

А `Data Completeness` отдельно показывает причину.

---

# 70. JSON Contract

```json
{
  "data_quality": {
    "data_confidence_score": 76,
    "data_completeness_score": 100,
    "freshness_score": 91,

    "confidence_status": "medium",

    "critical_unknown_count": 1,
    "critical_conflict_count": 0,

    "critical_override": true,

    "fields": [
      {
        "field": "listing_price",
        "importance": 5,
        "verification_status": "confirmed",
        "freshness_status": "fresh",
        "conflict_status": "none",
        "evidence_quality": "direct",
        "field_confidence": 1.0
      },
      {
        "field": "family_mortgage",
        "importance": 5,
        "verification_status": "claimed",
        "freshness_status": "fresh",
        "conflict_status": "none",
        "evidence_quality": "indirect",
        "field_confidence": 0.56
      }
    ],

    "recommended_checks": [
      {
        "field": "family_mortgage",
        "priority": "critical",
        "action": "Confirm applicability to this specific property"
      }
    ],

    "algorithm_version": "confidence-v1"
  }
}
```

---

# 71. Что показываем пользователю в MVP

Минимум:

### В карточке shortlist

```text
92% соответствует
Данные: высокая / средняя / низкая надёжность
```

### В карточке объекта

```text
Подтверждено:
✓ цена
✓ площадь
✓ этаж

Требует проверки:
? семейная ипотека
? ПВ 0

Данные расходятся:
! срок передачи ключей
```

### В сравнении

Статус каждого критичного значения.

---

# 72. Что не нужно показывать пользователю

Не показываем без необходимости:

- технические коэффициенты;
- source weighting;
- confidence multiplication;
- parser confidence;
- internal policy version;
- raw evidence IDs.

Это остаётся для аудита и разработчиков.

---

# 73. Что входит в MVP v1

Обязательно:

- `FieldConfidence`;
- `DataConfidenceScore`;
- `DataCompletenessScore`;
- freshness statuses;
- field-level TTL policy;
- conflict severity;
- critical unknown;
- critical override;
- source trust;
- evidence quality;
- отдельная обработка финансовых данных;
- влияние confidence на eligibility;
- влияние confidence на ranking;
- user-facing статусы;
- refresh_required;
- алгоритм versioning;
- JSON contract.

---

# 74. Что можно отложить

На потом:

- ML confidence calibration;
- probabilistic truth discovery;
- автоматическая оценка независимости источников;
- сложная Bayesian-модель;
- source reputation learning;
- историческая статистика точности каждого источника;
- автоматическое прогнозирование вероятности изменения цены;
- сложная anomaly detection;
- confidence на основе пользовательской обратной связи.

MVP должен быть прозрачным rule-based механизмом.

---

# 75. Критерий готовности Confidence Status

Модуль считается готовым, если система умеет корректно различать:

1. данные есть и подтверждены;
2. данные есть, но только заявлены;
3. данные есть, но устарели;
4. данных нет;
5. источники конфликтуют;
6. конфликт несущественный;
7. конфликт критический;
8. unknown по must;
9. unknown по preferred;
10. высокий match + низкий confidence;
11. высокий completeness + низкий confidence;
12. низкий completeness + высокое качество известных данных;
13. expired promotion;
14. stale availability;
15. ручное подтверждение;
16. user-provided source;
17. OpenClaw extraction confidence vs verification confidence;
18. refresh critical fields;
19. изменение confidence после обновления;
20. ранжирование двух близких объектов с разной надёжностью данных.

---

# 76. Главный принцип для coding-agent

Нельзя реализовывать надёжность как одно поле:

```text
verified = true / false
```

Правильная архитектура:

```text
Field Value
    ↓
Evidence
    ↓
Verification Status
    ↓
Freshness
    ↓
Conflict Status
    ↓
Field Confidence
    ↓
Request Importance
    ↓
Data Confidence
```

И отдельно:

```text
Relevant Fields
    ↓
Known / Unknown
    ↓
Data Completeness
```

Главное правило:

> Система должна различать «не подходит», «мы не знаем» и «данные противоречат друг другу».

Это три разные ситуации и они должны по-разному влиять на подбор, ranking и объяснение пользователю.
