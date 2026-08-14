# Choice Assistance — MVP v1

## 1. Назначение документа

Этот документ описывает услугу помощи пользователю в выборе между несколькими финальными объектами.

Это не новый подбор с нуля.

Вход:

```text
2–5 финальных вариантов
+ UserRequest
+ MatchResults
+ PurchaseScenarios
+ DataConfidence
+ Unknowns / Conflicts
```

Задача эксперта:

> помочь пользователю понять, какой вариант лучше решает именно его задачу и какую цену он платит за каждый компромисс.

---

# 2. Когда возникает сценарий

Пользователь:

- уже сузил выбор;
- сохранил 2–5 объектов;
- добавил собственные ссылки;
- видит близкие MatchScore;
- не понимает, что выбрать.

---

# 3. ChoiceAssistanceRequest

```yaml
choice_assistance_request:
  request_id:
  user_request_id:
  property_ids:
  purchase_scenario_ids:
  comparison_id:
  decision_deadline:
  user_question:
  status:
```

---

# 4. Контекст

Эксперт получает:

- обязательные критерии;
- желательные критерии;
- бюджет;
- финансовые ограничения;
- сроки;
- lifestyle;
- comparison;
- top strengths;
- compromises;
- critical unknowns;
- источники.

---

# 5. Эксперт не должен пересобирать анкету

Если критерий уже подтверждён:

не спрашивать снова.

Уточнение допустимо только если:

- пользователь изменил приоритет;
- возникло противоречие;
- выбор зависит от скрытого trade-off.

---

# 6. Сначала hard criteria

Перед экспертным сравнением:

1. исключить подтверждённые hard fail;
2. отметить unknown hard criteria;
3. проверить финальные financial scenarios.

Эксперт не должен рекомендовать объект, нарушающий must, не объяснив это.

---

# 7. Comparison Dimensions

Общие:

- MatchScore;
- цена;
- total entry cost;
- ПВ;
- monthly payment;
- move-in;
- area;
- rooms;
- condition;
- location;
- infrastructure;
- commute;
- risks;
- unknowns;
- DataConfidence.

---

# 8. Cross-type Choice

Сервис должен корректно сравнивать:

```text
новостройка
vs
вторичка
vs
дом
```

через общие потребительские последствия, а не через одинаковые физические поля.

---

# 9. Trade-off

Пример:

Квартира A:

- меньше;
- ближе к школе;
- готова сейчас.

Дом B:

- больше;
- дольше дорога;
- нужен автомобиль.

Эксперт должен сформулировать:

> A лучше решает ежедневную логистику. B даёт больше пространства, но увеличивает транспортную нагрузку.

---

# 10. Decision Scenarios

Полезно формировать сценарии:

### Если главное — минимальный платёж
→ вариант A.

### Если главное — въехать сразу
→ вариант B.

### Если главное — площадь
→ вариант C.

---

# 11. Не искать универсального победителя

Если нет одного очевидного варианта:

это нормальный результат.

---

# 12. Dominated Option

Если один объект:

- дороже;
- хуже по must;
- хуже по preferred;
- данные слабее;

он может быть отмечен как `dominated`.

Но причина должна быть объяснима.

---

# 13. Near-tie

Если два объекта близки:

система должна определить, какие 1–3 критерия реально решают выбор.

---

# 14. Decision Drivers

```yaml
decision_drivers:
  - monthly_payment
  - move_in_date
  - school_walk_time
```

---

# 15. Unknowns Before Decision

Перед рекомендацией эксперт должен отделить:

```text
известные trade-offs
```

от:

```text
неизвестных фактов
```

---

# 16. Verification First

Если выбор зависит от неподтверждённого условия:

сначала предложить проверку.

Пример:

> Вариант A выглядит выгоднее только при условии ПВ 0, которое пока не подтверждено.

---

# 17. Choice Assistance Result

```yaml
choice_result:
  request_id:
  recommendation_status:
  recommended_property_id:
  alternative_property_id:
  decision_drivers:
  strengths_by_option:
  compromises_by_option:
  unresolved_questions:
  verification_needed:
  decision_summary:
```

---

# 18. Recommendation Status

- `clear_preference`
- `conditional_preference`
- `near_tie`
- `insufficient_data`
- `no_valid_option`

---

# 19. Clear Preference

Объект явно лучше соответствует задаче без существенных неизвестных.

---

# 20. Conditional Preference

> Вариант A предпочтительнее, **если** подтвердится ипотечное условие.

---

# 21. Near Tie

> Варианты практически равны. Решение зависит от того, что важнее: площадь или время до школы.

---

# 22. No Valid Option

Если все финалисты нарушают must:

эксперт не должен выбирать «наименее плохой» без согласия пользователя пересмотреть критерии.

---

# 23. Expert Conclusion

Пример структуры:

### Я бы оставил в финале
A и B.

### Почему A выше
- ниже платёж;
- школа ближе;
- можно въехать раньше.

### Чем B сильнее
- больше площадь;
- лучше состояние.

### Что проверить перед решением
- актуальный ПВ по A;
- срок освобождения B.

---

# 24. Neutrality

Эксперт не учитывает:

- комиссию;
- партнёрский статус;
- рекламу.

---

# 25. User Priority Override

Если пользователь говорит:

> «Я всё-таки понял, что площадь важнее школы».

Нужно обновить `UserRequest`/priority и пересчитать Matching.

Эксперт не должен просто помнить это в комментарии.

---

# 26. Recalculation

После изменения приоритета:

```text
UserRequest update
↓
Match recalculation
↓
Comparison refresh
↓
Expert conclusion update
```

---

# 27. Choice Assistance и external URL

Пользователь может добавить собственный объект прямо в comparison.

Он проходит:

- ingestion;
- normalization;
- deduplication;
- matching;

и только потом участвует в экспертном выборе.

---

# 28. Финансовое сравнение

Нужно сравнивать PurchaseScenario.

Не просто:

```text
A = 5.0 млн
B = 5.2 млн
```

а:

```text
A:
ПВ 0.8м
платёж 72к

B:
ПВ 1.5м
платёж 58к
```

---

# 29. Full Cost

Если известно:

- ремонт;
- обязательные доплаты;
- parking;
- услуги;

они должны участвовать в decision context.

---

# 30. DataConfidence

Вариант с 95% Match и 40% Confidence может быть хуже для финального решения, чем 91% Match и 95% Confidence.

Эксперт должен объяснить эту разницу.

---

# 31. Choice Assistance API

```json
{
  "request_id": "choice_001",
  "user_request_id": "req_001",
  "property_ids": ["prop_a", "prop_b", "prop_c"],
  "comparison_id": "cmp_001",
  "status": "new"
}
```

---

# 32. Result Example

```json
{
  "recommendation_status": "conditional_preference",
  "recommended_property_id": "prop_a",
  "alternative_property_id": "prop_b",

  "decision_drivers": [
    "monthly_payment",
    "move_in_date",
    "school_walk_time"
  ],

  "unresolved_questions": [
    "Confirm zero-down applicability for prop_a"
  ]
}
```

---

# 33. Acceptance Criteria

Сценарий готов, если:

1. эксперт получает 2–5 объектов;
2. видит исходный UserRequest;
3. видит Match/Confidence;
4. hard fail не скрываются;
5. можно сравнивать разные типы недвижимости;
6. можно видеть разные PurchaseScenario;
7. эксперт формирует trade-offs;
8. умеет вернуть near_tie;
9. умеет вернуть insufficient_data;
10. умеет запросить verification;
11. изменение приоритета пересчитывает Matching;
12. результат сохраняется структурированно.

---

# 34. Главный принцип для coding-agent

Не строить Choice Assistance как свободный текстовый чат без структуры.

Правильно:

```text
UserRequest
+
Comparison
+
MatchResult
+
PurchaseScenarios
+
Confidence
↓
Decision Drivers
↓
Trade-offs
↓
Expert Conclusion
↓
Structured ChoiceResult
```

Главная ценность — не «мнение эксперта», а понятная логика выбора между реальными альтернативами.
