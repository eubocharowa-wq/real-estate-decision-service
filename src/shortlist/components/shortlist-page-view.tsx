import Link from "next/link";

import type { ShortlistView } from "../types";
import type { ShortlistCardView } from "../types";
import { PropertyMatchCard } from "./property-match-card";

interface ShortlistPageViewProps {
  readonly view: ShortlistView;
  readonly comparisonPropertyIds?: ReadonlySet<string>;
  readonly comparisonNotice?: string | null;
  readonly onComparisonToggle?: (card: ShortlistCardView) => void;
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

export function ShortlistPageView({
  view,
  comparisonPropertyIds = new Set<string>(),
  comparisonNotice = null,
  onComparisonToggle,
}: ShortlistPageViewProps) {
  const comparisonCount = comparisonPropertyIds.size;
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

      {onComparisonToggle ? (
        <aside className="comparison-selection-bar" aria-live="polite">
          <div>
            <strong>Сравнение: {comparisonCount} из 4</strong>
            <span>
              {comparisonCount === 0
                ? "Выберите 2–4 финалиста."
                : comparisonCount === 1
                  ? "Добавьте ещё один вариант."
                  : "Можно открыть сравнение или добавить ещё."}
            </span>
            {comparisonNotice ? (
              <small role="status">{comparisonNotice}</small>
            ) : null}
          </div>
          {comparisonCount >= 2 ? (
            <Link className="button button-primary" href="/comparison">
              Сравнить выбранные
            </Link>
          ) : null}
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
                comparisonSelected={comparisonPropertyIds.has(card.propertyId)}
                comparisonDisabled={comparisonCount >= 4}
                onComparisonToggle={onComparisonToggle}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
