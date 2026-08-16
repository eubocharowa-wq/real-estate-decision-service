import Link from "next/link";

import type { ShortlistCardView } from "../types";

interface PropertyMatchCardProps {
  readonly card: ShortlistCardView;
}

function Price({ card }: PropertyMatchCardProps) {
  if (card.price.kind === "old_new") {
    return (
      <div className="shortlist-price">
        <strong>{card.price.current}</strong>
        <del>{card.price.previous}</del>
        <small>{card.price.note}</small>
      </div>
    );
  }
  return (
    <div className={`shortlist-price price-${card.price.kind}`}>
      <strong>{card.price.label}</strong>
      {card.price.note ? <small>{card.price.note}</small> : null}
    </div>
  );
}

function Financing({ card }: PropertyMatchCardProps) {
  if (!card.financing.available) {
    return (
      <section className="card-decision-block" aria-label="Сценарий покупки">
        <h3>Сценарий покупки</h3>
        <p className="muted-copy">Готовый финансовый сценарий не выбран.</p>
      </section>
    );
  }
  return (
    <section className="card-decision-block" aria-label="Сценарий покупки">
      <div className="card-section-title">
        <h3>Сценарий покупки</h3>
        {card.financing.claimLabel ? (
          <span className="claim-label">{card.financing.claimLabel}</span>
        ) : null}
      </div>
      <dl className="financing-facts">
        {card.financing.program ? (
          <div>
            <dt>Программа</dt>
            <dd>{card.financing.program}</dd>
          </div>
        ) : null}
        {card.financing.initialPayment ? (
          <div>
            <dt>ПВ</dt>
            <dd>{card.financing.initialPayment}</dd>
          </div>
        ) : null}
        {card.financing.monthlyPayment ? (
          <div>
            <dt>В месяц</dt>
            <dd>{card.financing.monthlyPayment}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

export function PropertyMatchCard({ card }: PropertyMatchCardProps) {
  const titleId = `shortlist-title-${card.propertyId}`;
  return (
    <article
      className={`property-match-card eligibility-${card.eligibilityStatus}`}
      aria-labelledby={titleId}
      data-testid="shortlist-card"
      data-property-id={card.propertyId}
      data-offer-id={card.offerId ?? ""}
      data-scenario-id={card.purchaseScenarioId ?? ""}
    >
      <div
        className="property-image-placeholder"
        role="img"
        aria-label={`Изображение объекта «${card.title}» отсутствует`}
      >
        <span aria-hidden="true">⌂</span>
        <small>Фото пока нет</small>
      </div>

      <div className="property-card-body">
        <div className="card-status-row">
          <span className="availability-label">{card.availabilityLabel}</span>
          <span className="property-type-label">{card.propertyTypeLabel}</span>
        </div>
        <div className="property-identity">
          <h2 id={titleId}>{card.title}</h2>
          <p>{card.subtitle}</p>
        </div>
        <ul className="property-facts" aria-label="Основные параметры объекта">
          {card.secondaryFacts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <Price card={card} />

        <div className="decision-scores">
          <div className="match-score-block">
            <strong>{card.matchLabel}</strong>
            <span>{card.matchContext}</span>
          </div>
          <div
            className={`confidence-block confidence-${card.confidence.band}`}
          >
            <span>Надёжность данных</span>
            <strong>{card.confidence.label}</strong>
          </div>
        </div>

        {card.requiresVerification ? (
          <p className="eligibility-warning" role="status">
            {card.eligibilityLabel}
          </p>
        ) : (
          <p className="eligibility-confirmed">{card.eligibilityLabel}</p>
        )}

        <section className="card-decision-block" aria-label="Почему подходит">
          <h3>Почему подходит</h3>
          {card.strengths.length > 0 ? (
            <ul className="strength-list">
              {card.strengths.map((strength) => (
                <li key={strength}>{strength}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              Подтверждённых сильных сторон пока недостаточно.
            </p>
          )}
        </section>

        <section className="card-decision-block" aria-label="Компромиссы">
          <h3>Компромиссы</h3>
          {card.noMaterialCompromises ? (
            <p className="no-compromise">
              Существенных компромиссов по заданным условиям не выявлено.
            </p>
          ) : (
            <ul className="compromise-list">
              {card.compromises.map((compromise) => (
                <li key={compromise}>{compromise}</li>
              ))}
            </ul>
          )}
        </section>

        {card.criticalUnknowns.length > 0 ? (
          <aside className="unknown-alert" aria-label="Нужно подтвердить">
            <strong>Что важно проверить</strong>
            <ul>
              {card.criticalUnknowns.map((unknown) => (
                <li key={unknown}>{unknown}</li>
              ))}
            </ul>
          </aside>
        ) : null}

        <Financing card={card} />

        <footer className="property-card-footer">
          <div className="source-freshness">
            <span>{card.sourceSummary}</span>
            <span>{card.freshnessLabel}</span>
          </div>
          <Link className="button button-primary" href={card.detailHref}>
            Посмотреть подробнее
            <span className="visually-hidden">: {card.title}</span>
          </Link>
        </footer>
      </div>
    </article>
  );
}
