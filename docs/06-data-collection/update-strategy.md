# Update Strategy — MVP v1

## 1. Назначение документа

Этот документ описывает, как сервис должен поддерживать данные недвижимости, цен, наличия, акций, ипотечных условий и инфраструктуры в актуальном состоянии.

Он используется совместно с:

```text
docs/04-data/source-model.md
docs/04-data/property-model.md
docs/04-data/financing-model.md
docs/05-matching/confidence-status.md
docs/06-data-collection/openclaw-role.md
docs/06-data-collection/sources.md
docs/06-data-collection/pilot-source-matrix.md
```

Главный принцип:

> Мы не перепроверяем всё одинаково часто. Частота обновления зависит от того, насколько быстро поле меняется, насколько оно важно пользователю и насколько мы уверены в текущем значении.

---

# 2. Цели Update Strategy

Стратегия обновления должна одновременно решать пять задач:

1. поддерживать актуальность критичных данных;
2. не перегружать внешние источники;
3. не тратить OpenClaw на повторный сбор статических полей;
4. вовремя перепроверять данные перед важным пользовательским решением;
5. сохранять историю изменений.

---

# 3. Основные режимы обновления

Для MVP используются четыре режима:

- `scheduled_refresh`
- `priority_refresh`
- `user_triggered_refresh`
- `event_or_change_refresh`

## scheduled_refresh

Плановое обновление источника или набора полей по расписанию.

Пример:

```text
availability — каждые 3 часа
price — каждые 6 часов
promotion — каждые 12 часов
```

## priority_refresh

Точечная перепроверка поля, которое стало критичным для текущего shortlist.

## user_triggered_refresh

Пользователь открыл объект, нажал «Проверить актуальность» или собирается сравнивать финальные варианты.

## event_or_change_refresh

Обновление запускается после обнаружения изменения:

- новая акция;
- изменение цены;
- новый корпус;
- смена статуса объекта;
- изменение правил ипотечной программы.

---

# 4. Классы изменчивости данных

Каждое поле получает `volatility_class`.

## V1 — очень динамичные

- availability;
- reservation status;
- current price;
- promotion;
- mortgage rate;
- initial payment;
- installment terms.

## V2 — умеренно динамичные

- construction status;
- planned handover;
- actual move-in date;
- seller status;
- infrastructure under construction.

## V3 — слабо динамичные

- finishing type;
- project characteristics;
- parking type;
- management company;
- utilities status.

## V4 — почти статичные

- total area;
- floor;
- rooms;
- building address;
- cadastral number;
- land area.

---

# 5. Freshness Registry

Для каждого поля должна существовать policy.

Пример:

```yaml
freshness_registry:

  listing_price:
    volatility: V1
    fresh_for: 24h
    stale_after: 72h
    refresh_on_shortlist: true

  availability_status:
    volatility: V1
    fresh_for: 12h
    stale_after: 36h
    refresh_on_shortlist: true

  promotion:
    volatility: V1
    fresh_for: 24h
    stale_after: 48h
    hard_expiry_if_valid_until_passed: true

  financing_offer:
    volatility: V1
    fresh_for: 24h
    stale_after: 72h
    refresh_on_shortlist: true

  handover_date:
    volatility: V2
    fresh_for: 7d
    stale_after: 30d

  total_area_m2:
    volatility: V4
    refresh_mode: on_conflict_or_source_change
```

Точные production TTL должны быть откалиброваны после пилота.

---

# 6. Не путать TTL и срок действия

TTL — это политика актуальности нашей копии данных.

`valid_until` — явный срок самого предложения.

Пример:

```text
Акция действует до 31 августа.
```

Даже если страница была проверена сегодня:

1 сентября акция считается `expired`.

---

# 7. Поля, которые обязательно обновлять перед shortlist

Для shortlist с высоким пользовательским intent желательно иметь свежими:

- price;
- availability;
- financing program applicability;
- initial payment;
- promotion;
- move-in / handover date, если это must.

---

# 8. Поля, которые обязательно обновлять перед финальным сравнением

Если пользователь сократил выбор до 2–4 вариантов:

создаётся `finalist_refresh`.

Приоритетно перепроверяются:

- текущая цена;
- статус продажи;
- ПВ;
- ипотечная программа;
- ежемесячный платёж;
- акция;
- срок передачи;
- обязательные доплаты.

---

# 9. Refresh Priority

Допустимые уровни:

- `critical`
- `high`
- `normal`
- `low`

## critical

Примеры:

- must-поле stale;
- финансовое условие claimed;
- объект в финальном сравнении;
- price conflict около жёсткого бюджета;
- availability неизвестен.

## high

- shortlist object;
- price aging;
- promotion close to expiry.

## normal

- scheduled background refresh.

## low

- второстепенное preferred-поле;
- статическое поле без конфликта.

---

# 10. Priority Formula

Для внутренней очереди можно использовать:

```text
refresh_priority_score =
field_importance
+ volatility
+ staleness
+ user_stage
+ conflict_severity
+ source_health_modifier
```

Это технический score.

Пользователю он не показывается.

---

# 11. User Stage

Обновление зависит от стадии выбора.

## Discovery

Пользователь только ищет.

Допустимы:

- умеренно свежие данные;
- часть `claimed` значений;
- ограниченный targeted refresh.

## Shortlist

Нужна более высокая актуальность:

- price;
- availability;
- finance.

## Comparison

Усиливается точность критичных полей.

## Pre-decision

Максимальный refresh critical fields.

---

# 12. Scheduled Collection

Для активного source adapter планировщик создаёт задачи.

Пример:

```text
03:00 — availability
06:00 — price
12:00 — finance
18:00 — availability
```

Расписание задаётся не в коде конкретного parser, а в policy/config.

---

# 13. Batch Refresh

При возможности задачи группируются.

Пример:

Вместо:

```text
100 квартир × 100 отдельных запусков
```

использовать:

```text
одна inventory page
→ 100 unit statuses
```

если источник позволяет это сделать надёжно и допустимо.

---

# 14. Incremental Update

Если источник позволяет получать только изменения:

использовать incremental ingestion.

Пример:

```text
updated_since=...
```

Это предпочтительнее полного пересбора.

---

# 15. Change Detection

Каждое динамическое поле сравнивается с предыдущим значением.

Пример:

```yaml
old:
  listing_price: 5050000

new:
  listing_price: 4890000
```

Создаётся:

```yaml
change_event:
  field: listing_price
  old_value: 5050000
  new_value: 4890000
  changed_at:
  source_id:
```

---

# 16. История изменений

Обязательно хранить историю:

- price;
- availability;
- promotion;
- financing terms;
- reservation status.

История не должна заменяться новым значением.

---

# 17. Canonical Update

Новое значение не должно автоматически становиться canonical.

Pipeline:

```text
new evidence
↓
validation
↓
normalization
↓
conflict check
↓
source priority
↓
freshness
↓
canonical decision
```

---

# 18. Если новое значение конфликтует со старым

Пример:

Сайт застройщика:

```text
4.89 млн
```

А партнёрский источник:

```text
5.05 млн
```

Система создаёт conflict.

Она не должна просто выбрать минимальную цену.

---

# 19. Refresh при конфликте

Если конфликт относится к критичному полю:

```text
conflict detected
↓
priority_refresh
↓
primary source
↓
secondary confirmation
↓
manual review if unresolved
```

---

# 20. Refresh при low confidence

Если:

```text
verification_status = claimed
```

для must-критерия:

создаётся задача `verify`.

Пример:

```text
семейная ипотека — must
status = claimed
→ refresh priority = critical
```

---

# 21. Refresh при stale

Если поле перешло:

```text
fresh → aging
```

можно обновить по расписанию.

Если:

```text
aging → stale
```

и поле участвует в shortlist:

→ high/critical refresh.

---

# 22. Refresh при source failure

Если источник временно недоступен:

- старые данные не удаляются;
- freshness продолжает стареть;
- source health становится degraded;
- система использует fallback, если он есть.

---

# 23. Fallback Refresh

Пример:

Основной источник цены недоступен.

Можно использовать:

```text
secondary source
```

но:

```text
verification_status
```

может быть ниже.

---

# 24. No Silent Downgrade

Если ранее цена была confirmed, а новый primary source недоступен:

не заменять её secondary price как будто качество не изменилось.

Нужно сохранить:

```text
previous confirmed value — stale
new secondary value — unconfirmed/claimed
```

---

# 25. Source Health и update strategy

Если source health = degraded:

планировщик может:

- уменьшить частоту retries;
- включить fallback;
- создать adapter maintenance task;
- не блокировать весь pipeline.

---

# 26. Retry Strategy

Для временных ошибок:

```text
retry 1
↓
short backoff
↓
retry 2
↓
longer backoff
↓
fallback/manual
```

Для CAPTCHA:

не делать бесконечные retries.

---

# 27. Refresh Queue

Рекомендуемая структура:

```yaml
refresh_job:
  job_id:
  entity_id:
  source_id:
  requested_fields:
  reason:
  priority:
  scheduled_at:
  deadline:
  retry_count:
  status:
```

---

# 28. Reasons

`reason`:

- `scheduled`
- `stale`
- `critical_unknown`
- `conflict`
- `user_request`
- `shortlist`
- `finalist`
- `source_recovery`
- `program_change`

---

# 29. Deduplicate Refresh Jobs

Если уже существует задача:

```text
prop_145
listing_price
critical
```

не создавать вторую такую же.

Новая задача может повысить priority существующей.

---

# 30. Rate Limits

Планировщик должен учитывать source-specific limits.

В source config:

```yaml
rate_limits:
  max_requests_per_minute:
  concurrent_sessions:
  cooldown:
```

Если limits неизвестны:

работать консервативно до PoC.

---

# 31. Cost Control

Перед запуском browser/OpenClaw refresh:

проверять, можно ли получить поле дешевле:

1. cache;
2. existing fresh evidence;
3. API;
4. feed;
5. HTTP;
6. browser agent.

---

# 32. Cache

Кэш не заменяет provenance.

Даже если значение взято из cache:

нужно знать:

- когда исходно собрано;
- из какого source;
- насколько свежо.

---

# 33. Refresh Lock

Для одного entity/source не должно запускаться несколько конкурирующих deep collection sessions.

Нужен:

```text
refresh lock / lease
```

---

# 34. User-triggered refresh

Пользователь может нажать:

> Проверить актуальность

Тогда:

- создаётся high/critical job;
- UI показывает last checked;
- старое значение не исчезает;
- после refresh результат пересчитывается.

---

# 35. UI во время refresh

Пример:

> Цена по последней проверке — 4,89 млн ₽.  
> Обновляем актуальность.

После завершения:

> Цена подтверждена.

или:

> Цена изменилась до 5,02 млн ₽.

---

# 36. Match Recalculation

Если обновилось поле, участвующее в Matching:

```text
canonical update
↓
identify affected MatchResults
↓
recalculate
↓
update shortlist/order
```

---

# 37. Recalculation Scope

Не пересчитывать всё приложение.

Пересчитываются только:

- запросы, где этот объект присутствует;
- критерии, зависящие от изменённого поля.

---

# 38. Notification Candidate

В будущем change event может стать уведомлением.

Пример:

> Цена объекта снизилась на 210 тыс. ₽.

Но в MVP уведомления можно не реализовывать.

---

# 39. Финансовые программы

Финансовые правила требуют отдельной update policy.

При изменении:

- ставки;
- лимитов;
- ПВ;
- требований;
- допустимых объектов;

создаётся новая `rule_version`.

Старая версия не удаляется.

---

# 40. Program Change Propagation

Если изменилась Family Mortgage rule:

```text
FinancingProgram version updated
↓
affected FinancingOffers
↓
affected PropertyEligibility
↓
affected PurchaseScenarios
↓
affected MatchResults
```

---

# 41. Promotion Expiry

Акции имеют hard expiry.

Если:

```text
valid_until < now
```

→ `expired`

и PurchaseScenario должен быть пересчитан.

---

# 42. Update Strategy для инфраструктуры

Инфраструктура обновляется реже.

Для существующих школ/парков/остановок:

- periodic check;
- re-fetch по конфликту;
- update при новом городе.

Travel time может пересчитываться по запросу, если зависит от user destination.

---

# 43. Update Strategy для домов

Особенно динамичны:

- price;
- availability;
- seller;
- utilities claims;
- construction completeness.

Физическая площадь и участок обновляются только по конфликту/новому evidence.

---

# 44. Update Strategy для вторички

Приоритет:

- listing active;
- price;
- seller;
- publication date;
- duplicated offers;
- changed description/photos.

Если объявление исчезло:

это не всегда означает «sold».

Статус:

```text
listing_removed
```

отдельно от:

```text
sold
```

---

# 45. Listing Removed

Если страница исчезла:

```yaml
availability_status: unknown
offer_status: removed
```

Не делать вывод:

```text
property sold
```

без подтверждения.

---

# 46. Deactivation Policy

Offer можно помечать inactive, если:

- source больше не показывает его;
- истёк срок;
- seller removed listing;
- API сообщает inactive.

Physical Property не удаляется автоматически.

---

# 47. Garbage Collection

Старые raw snapshots можно очищать по retention policy.

Но обязательно сохраняются:

- canonical history;
- change events;
- critical evidence references;
- audit trail.

---

# 48. Retention Policy

На MVP можно задать:

```text
raw temporary payloads — short retention
critical evidence — longer
canonical history — long term
audit log — long term
```

Точные сроки определяются отдельно.

---

# 49. Update Metrics

Отслеживать:

- % fresh shortlist prices;
- % fresh availability;
- % fresh financing terms;
- average refresh latency;
- failed refresh rate;
- conflict resolution rate;
- stale critical field rate;
- source-specific success.

---

# 50. SLO MVP

Пример целевых продуктовых метрик для пилота:

```text
Shortlist price freshness: >90%
Shortlist availability freshness: >85%
Critical financing fields refreshed before final comparison: >95%
```

Это рабочие ориентиры, не production SLA.

---

# 51. Update Test Cases

Обязательно протестировать:

1. price unchanged;
2. price increased;
3. price decreased;
4. availability changed;
5. listing disappeared;
6. promotion expired;
7. financing rule changed;
8. source unavailable;
9. source conflict;
10. manual correction;
11. user-triggered refresh;
12. duplicate refresh job;
13. retry exhaustion;
14. stale hard criterion;
15. source recovers after downtime.

---

# 52. Acceptance Criteria

Update Strategy считается реализуемой для MVP, если:

1. существует freshness registry;
2. разные поля обновляются с разной частотой;
3. planned jobs создаются из config;
4. targeted refresh работает;
5. stale critical fields получают приоритет;
6. history сохраняется;
7. conflict не уничтожается;
8. source failure не удаляет старые данные;
9. fallback снижает confidence, если нужно;
10. финальный shortlist может перепроверять critical fields;
11. MatchResult пересчитывается после изменений;
12. duplicate refresh jobs не плодятся;
13. retry ограничен;
14. expired promotion снимается автоматически;
15. source health влияет на scheduler.

---

# 53. Главный принцип для coding-agent

Нельзя строить обновление как:

```text
раз в сутки пересобрать всю базу
```

и нельзя строить как:

```text
каждый пользовательский запрос → live crawl всего рынка
```

Правильная модель:

```text
field volatility
      ↓
freshness policy
      ↓
scheduled / targeted refresh
      ↓
new evidence
      ↓
validation + conflicts
      ↓
canonical update
      ↓
matching recalculation
```

Главное правило:

> Чем сильнее поле влияет на решение пользователя и чем быстрее оно меняется, тем чаще и точнее оно должно перепроверяться.
