import Link from "next/link";

import type { BuyerJourney, DecisionUpdate } from "../contracts";

const delta = (before: number, after: number): string => {
  const change = after - before;
  return change === 0 ? "без изменения" : `${change > 0 ? "+" : ""}${change}`;
};

export function JourneyDecisionUpdateView({
  journey,
  update,
}: {
  readonly journey: BuyerJourney;
  readonly update: DecisionUpdate;
}) {
  const previousByProperty = new Map(
    update.previous_results.map((result) => [result.property_id, result]),
  );
  return (
    <main className="journey-decision-shell">
      <header className="journey-decision-header">
        <p className="brand-mark">REDS / Decision update</p>
        <p className="eyebrow">Обновлённое решение</p>
        <h1>Что изменилось после проверки</h1>
        <p>
          Показаны только реально существующие версии до и после пересчёта.
          Match Score и надёжность данных остаются отдельными показателями.
        </p>
      </header>

      {update.new_results.length === 0 ? (
        <section className="journey-decision-card">
          <h2>Фактического пересчёта не потребовалось</h2>
          <p>
            Результат проверки сохранён, но подтверждённые факты решения не
            изменились. Поддельное сравнение «до / после» не показывается.
          </p>
        </section>
      ) : (
        <div className="journey-decision-grid">
          {update.new_results.map((current) => {
            const previous = previousByProperty.get(current.property_id);
            if (!previous) return null;
            return (
              <article
                className="journey-decision-card"
                key={current.property_id}
              >
                <p className="eyebrow">{current.property_id}</p>
                <h2>Пересчитан только затронутый вариант</h2>
                <dl>
                  <div>
                    <dt>Match Score</dt>
                    <dd>
                      {previous.match_score} → {current.match_score} (
                      {delta(previous.match_score, current.match_score)})
                    </dd>
                  </div>
                  <div>
                    <dt>Надёжность данных</dt>
                    <dd>
                      {previous.data_confidence_score ?? "—"} →{" "}
                      {current.data_confidence_score ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Полнота данных</dt>
                    <dd>
                      {previous.data_completeness_score ?? "—"} →{" "}
                      {current.data_completeness_score ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Статус применимости</dt>
                    <dd>
                      {previous.eligibility_status} →{" "}
                      {current.eligibility_status}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}

      <section className="journey-decision-card">
        <h2>Неизвестные и конфликты</h2>
        <p>
          Снято неопределённостей: {update.resolved_unknowns.length}. Осталось:{" "}
          {update.unresolved_unknowns.length}.
        </p>
        {update.unresolved_unknowns.length > 0 ? (
          <ul>
            {update.unresolved_unknowns.map((unknown) => (
              <li key={unknown}>{unknown}</li>
            ))}
          </ul>
        ) : null}
        <p>
          Новых конфликтов: {update.new_conflicts.length}. Разрешено явно:{" "}
          {update.resolved_conflicts.length}.
        </p>
      </section>

      <nav className="primary-actions" aria-label="Навигация по решению">
        <Link className="button button-primary" href="/shortlist">
          Открыть обновлённый подбор
        </Link>
        {journey.comparison_id ? (
          <Link className="button button-secondary" href="/comparison">
            Вернуться к сравнению
          </Link>
        ) : null}
      </nav>
      <p className="dataset-notice">
        Демонстрационные данные · dataset_type=synthetic_pilot.
      </p>
    </main>
  );
}
