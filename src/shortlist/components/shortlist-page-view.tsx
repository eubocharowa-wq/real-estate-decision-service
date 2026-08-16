import Link from "next/link";

import type { ShortlistView } from "../types";
import { PropertyMatchCard } from "./property-match-card";

interface ShortlistPageViewProps {
  readonly view: ShortlistView;
}

export function EmptyShortlistState() {
  return (
    <section className="shortlist-empty" aria-labelledby="empty-title">
      <p className="eyebrow">Подходящих вариантов нет</p>
      <h2 id="empty-title">
        По подтверждённым обязательным условиям вариантов пока нет.
      </h2>
      <p>
        Мы не стали ослаблять must-критерии и добавлять неподходящие объекты.
        Результат относится только к текущему покрытию источников.
      </p>
      <Link className="button button-secondary" href="/request/confirm">
        Изменить условия
      </Link>
    </section>
  );
}

export function ShortlistPageView({ view }: ShortlistPageViewProps) {
  return (
    <main className="shortlist-shell">
      <header className="shortlist-header">
        <div className="shortlist-navigation">
          <Link href="/" className="brand-mark" aria-label="На главную">
            REDS <span> / 09</span>
          </Link>
          <Link
            href="/request/confirm"
            className="button button-ghost button-small"
            data-analytics-event="request_edit_clicked"
          >
            Изменить условия
          </Link>
        </div>
        <p className="step-label">Шаг 3 · Короткий список</p>
        <h1>{view.heading}</h1>
        <p className="shortlist-lead">{view.description}</p>
        <ul className="request-summary-chips" aria-label="Условия запроса">
          {view.requestSummary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="shortlist-meta">
          <span>{view.generatedAtLabel}</span>
          <span>
            {view.cards.length} из максимум {view.resultLimit} вариантов
          </span>
        </div>
        {view.datasetNotice ? (
          <p className="dataset-notice">{view.datasetNotice}</p>
        ) : null}
      </header>

      {view.partial ? (
        <aside className="partial-results" role="status">
          <strong>Некоторые данные ещё обновляются.</strong>
          <span>
            Готовые варианты уже показаны; у недостающей надёжности нет
            подставленного среднего значения.
          </span>
        </aside>
      ) : null}

      {view.cards.length === 0 ? (
        <EmptyShortlistState />
      ) : (
        <section className="shortlist-results" aria-labelledby="results-title">
          <div className="shortlist-section-heading">
            <div>
              <p className="eyebrow">Короткий список</p>
              <h2 id="results-title">Варианты для решения</h2>
            </div>
            <p>
              Карточки с важными неизвестными отмечены отдельно. Порядок пришёл
              из matching layer и не пересортирован по цене.
            </p>
          </div>
          <div className="shortlist-grid">
            {view.cards.map((card) => (
              <PropertyMatchCard
                key={`${card.propertyId}:${card.offerId ?? "property"}:${card.purchaseScenarioId ?? "scenario"}`}
                card={card}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
