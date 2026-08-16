import Link from "next/link";

import type { ComparisonView } from "../types";

interface ComparisonPageViewProps {
  readonly view: ComparisonView;
  readonly onRemove?: (propertyId: string) => void;
}

const stateLabel: Readonly<Record<string, string>> = Object.freeze({
  best_confirmed: "Лучшее подтверждённое значение",
  hard_fail: "Не проходит обязательное условие",
  critical_unknown: "Критично: нужно подтвердить",
  conflict: "Есть расхождение источников",
  not_applicable: "Не применимо",
  unavailable: "Вариант недоступен",
  neutral: "",
});

export function ComparisonPageView({
  view,
  onRemove,
}: ComparisonPageViewProps) {
  return (
    <main className="comparison-shell">
      <header className="comparison-header">
        <nav className="comparison-navigation" aria-label="Навигация сравнения">
          <Link href="/" className="brand-mark" aria-label="На главную">
            REDS <span> / 11</span>
          </Link>
          <div>
            <Link
              className="button button-ghost button-small"
              href={view.actions.editRequestHref}
            >
              Изменить условия
            </Link>
            <Link
              className="button button-secondary button-small"
              href={view.actions.shortlistHref}
            >
              {view.actions.canAdd
                ? "Добавить ещё вариант"
                : "Вернуться к подбору"}
            </Link>
          </div>
        </nav>
        <p className="step-label">Шаг 5 · Сравнение финалистов</p>
        <h1>Сравнение вариантов</h1>
        <p className="comparison-lead">
          Match Score и надёжность данных показаны отдельно. Подсветка не
          создаёт универсальный рейтинг объекта.
        </p>
        <ul
          className="request-summary-chips"
          aria-label="Обязательные условия запроса"
        >
          {view.requestSummary.map((summary) => (
            <li key={summary}>{summary}</li>
          ))}
        </ul>
        {view.partial ? (
          <p className="partial-results" role="status">
            Часть данных или один из вариантов недоступны. Сравнение не
            подставляет значения по умолчанию.
          </p>
        ) : null}
      </header>

      <section
        className="comparison-table-section"
        aria-labelledby="comparison-table-title"
      >
        <div className="comparison-section-heading">
          <div>
            <p className="eyebrow">2–4 варианта рядом</p>
            <h2 id="comparison-table-title">Таблица решения</h2>
          </div>
          <p>
            На узком экране прокручивайте таблицу горизонтально; названия
            условий остаются слева.
          </p>
        </div>
        <div
          className="comparison-table-region"
          tabIndex={0}
          aria-label="Горизонтально прокручиваемая таблица сравнения"
        >
          <table className="comparison-table">
            <caption className="visually-hidden">
              Сравнение выбранных объектов по условиям пользователя
            </caption>
            <thead>
              <tr>
                <th scope="col" className="comparison-row-label">
                  Условие
                </th>
                {view.columns.map((column) => (
                  <th
                    scope="col"
                    key={column.propertyId}
                    className={
                      column.status === "unavailable"
                        ? "comparison-unavailable"
                        : undefined
                    }
                  >
                    <span className="comparison-property-type">
                      {column.propertyType}
                    </span>
                    <strong>{column.title}</strong>
                    <span className="comparison-price">{column.price}</span>
                    <span>{column.matchLabel}</span>
                    <span>Надёжность: {column.confidence}</span>
                    <span>Сценарий покупки: {column.scenarioLabel}</span>
                    <small>{column.scenarioVerification}</small>
                    {column.hardFail ? (
                      <b className="comparison-hard-fail">Hard fail</b>
                    ) : null}
                    {column.availabilityWarning ? (
                      <b className="comparison-warning">
                        {column.availabilityWarning}
                      </b>
                    ) : null}
                    <div className="comparison-column-actions">
                      {column.detailHref ? (
                        <Link href={column.detailHref}>Подробнее</Link>
                      ) : null}
                      {onRemove ? (
                        <button
                          type="button"
                          onClick={() => onRemove(column.propertyId)}
                          aria-label={`Убрать ${column.title} из сравнения`}
                        >
                          Убрать
                        </button>
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            {view.sections.map((section) => (
              <tbody key={section.id}>
                <tr className="comparison-group-row">
                  <th scope="rowgroup" colSpan={view.columns.length + 1}>
                    {section.title}
                  </th>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="comparison-row-label">
                      <strong>{row.label}</strong>
                      <span>
                        {row.importanceLabel}
                        {row.target ? ` · ${row.target}` : ""}
                      </span>
                    </th>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.propertyId}
                        className={`comparison-cell cell-${cell.state}`}
                      >
                        <strong>{cell.value}</strong>
                        <span>{cell.statusLabel}</span>
                        {stateLabel[cell.state] ? (
                          <b>{stateLabel[cell.state]}</b>
                        ) : null}
                        <small>
                          {cell.verificationLabel}
                          {cell.freshnessLabel
                            ? ` · ${cell.freshnessLabel}`
                            : ""}
                        </small>
                        {cell.detail ? <small>{cell.detail}</small> : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <div className="comparison-decision-grid">
        <section className="comparison-panel" aria-labelledby="drivers-title">
          <p className="eyebrow">Что действительно меняет выбор</p>
          <h2 id="drivers-title">Decision Drivers</h2>
          {view.decisionDrivers.length > 0 ? (
            <ol>
              {view.decisionDrivers.map((driver) => (
                <li key={driver.id}>
                  <strong>{driver.label}</strong>
                  <span>{driver.description}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p>Существенных подтверждённых различий пока недостаточно.</p>
          )}
        </section>
        <section className="comparison-panel" aria-labelledby="tradeoffs-title">
          <p className="eyebrow">Цена преимуществ</p>
          <h2 id="tradeoffs-title">Trade-offs</h2>
          {view.tradeoffs.length > 0 ? (
            <ul>
              {view.tradeoffs.map((tradeoff) => (
                <li key={tradeoff.id}>{tradeoff.text}</li>
              ))}
            </ul>
          ) : (
            <p>Явные trade-offs не выявлены.</p>
          )}
        </section>
      </div>

      {view.criticalUnknowns.length > 0 ? (
        <section
          className="comparison-unknowns"
          aria-labelledby="comparison-unknowns-title"
        >
          <p className="eyebrow">До решения</p>
          <h2 id="comparison-unknowns-title">Что важно проверить</h2>
          <div>
            {view.criticalUnknowns.map((group) => (
              <article key={group.propertyId}>
                <h3>{group.propertyTitle}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section
        className={`comparison-conclusion conclusion-${view.conclusion.status}`}
        aria-labelledby="conclusion-title"
      >
        <p className="eyebrow">Вывод без скрытого рейтинга</p>
        <h2 id="conclusion-title">{view.conclusion.label}</h2>
        <p>{view.conclusion.summary}</p>
        {view.conclusion.conditions.length > 0 ? (
          <ul>
            {view.conclusion.conditions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {view.conclusion.unresolvedQuestions.length > 0 ? (
          <ul>
            {view.conclusion.unresolvedQuestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        <div className="comparison-footer-actions">
          <Link
            className="button button-secondary"
            href={view.actions.shortlistHref}
          >
            Вернуться к подбору
          </Link>
          {view.actions.expertHref ? (
            <Link
              className="button button-primary"
              href={view.actions.expertHref}
            >
              Помочь выбрать между этими вариантами
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
