import Link from "next/link";

import type {
  DetailStatusView,
  FinancingView,
  PropertyDetailView,
  PropertyFactView,
} from "../types";

const Status = ({ status }: { readonly status: DetailStatusView }) => (
  <span
    className={`detail-status status-${status.key}`}
    title={status.description}
  >
    {status.label}
  </span>
);

const FactGrid = ({
  facts,
}: {
  readonly facts: readonly PropertyFactView[];
}) => (
  <dl className="detail-fact-grid">
    {facts.map((fact) => (
      <div
        key={fact.id}
        className={`detail-fact fact-${fact.semantics}${fact.requestRelevant ? " fact-relevant" : ""}`}
      >
        <dt>{fact.label}</dt>
        <dd>
          <strong>{fact.value}</strong>
          <span className="fact-statuses">
            <Status status={fact.verification} />
            {fact.freshness ? <Status status={fact.freshness} /> : null}
          </span>
        </dd>
      </div>
    ))}
  </dl>
);

const EmptySection = ({ children }: { readonly children: string }) => (
  <p className="detail-empty">{children}</p>
);

const FinancingSection = ({
  financing,
}: {
  readonly financing: FinancingView;
}) => (
  <section
    className="detail-section financing-section"
    aria-labelledby="financing-title"
  >
    <div className="detail-section-heading">
      <div>
        <p className="eyebrow">Конкретный сценарий</p>
        <h2 id="financing-title">Как устроена покупка</h2>
      </div>
      {financing.verification ? (
        <Status status={financing.verification} />
      ) : null}
    </div>
    <p className="section-intro">{financing.context}</p>
    {!financing.available ? (
      <EmptySection>Нет данных о готовом сценарии покупки.</EmptySection>
    ) : (
      <>
        {financing.claimedNotice ? (
          <p className="claimed-notice" role="status">
            {financing.claimedNotice}
          </p>
        ) : null}
        <dl className="financing-detail-facts">
          {financing.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div className="financing-subsection">
          <h3>Ставка по периодам</h3>
          {financing.rates.length > 0 ? (
            <ol className="rate-periods">
              {financing.rates.map((rate) => (
                <li key={rate.id}>
                  <span>{rate.period}</span>
                  <strong>{rate.rate}</strong>
                  {rate.conditions.length > 0 ? (
                    <small>{rate.conditions.join("; ")}</small>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <EmptySection>Ставка не указана.</EmptySection>
          )}
        </div>
        {financing.priceImpact ? (
          <aside className="price-impact">
            <strong>Влияние на цену</strong>
            <p>{financing.priceImpact}</p>
          </aside>
        ) : null}
        {financing.promotion ? (
          <div className="financing-subsection">
            <h3>Акция</h3>
            <p>{financing.promotion}</p>
          </div>
        ) : null}
        <div className="financing-subsection">
          <h3>Обязательные расходы</h3>
          {financing.mandatoryCosts.length > 0 ? (
            <dl className="cost-list">
              {financing.mandatoryCosts.map((cost) => (
                <div key={`${cost.label}:${cost.value}`}>
                  <dt>{cost.label}</dt>
                  <dd>{cost.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptySection>
              Дополнительные обязательные расходы не указаны.
            </EmptySection>
          )}
        </div>
        <div className="financing-subsection">
          <h3>Допущения расчёта</h3>
          {financing.assumptions.length > 0 ? (
            <ul className="assumption-list">
              {financing.assumptions.map((assumption) => (
                <li key={assumption.text}>
                  <span>{assumption.text}</span>
                  <Status status={assumption.verification} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptySection>Допущения не указаны.</EmptySection>
          )}
        </div>
        {financing.freshness ? (
          <p className="freshness-line">
            Финансовые условия: <Status status={financing.freshness} />
          </p>
        ) : null}
      </>
    )}
  </section>
);

export function PropertyDetailNotFound({
  message = "Объект не найден",
}: {
  readonly message?: string;
}) {
  return (
    <main className="empty-state" role="alert">
      <p className="eyebrow">Страница объекта</p>
      <h1>{message}</h1>
      <p>Проверьте ссылку или вернитесь к ранее подобранным вариантам.</p>
      <Link className="button button-secondary" href="/shortlist">
        Вернуться к вариантам
      </Link>
    </main>
  );
}

export function PropertyDetailPageView({
  view,
  backHrefOverride,
}: {
  readonly view: PropertyDetailView;
  readonly backHrefOverride?: string | null;
}) {
  const backHref = backHrefOverride ?? view.actions.backHref;
  const backLabel =
    backHref === "/comparison"
      ? "Вернуться к сравнению"
      : "Вернуться к вариантам";
  return (
    <main className="property-detail-shell" data-testid="property-detail">
      <nav className="detail-navigation" aria-label="Навигация по объекту">
        <Link href="/" className="brand-mark" aria-label="На главную">
          REDS <span> / 10</span>
        </Link>
        <Link className="back-link" href={backHref}>
          ← {backLabel}
        </Link>
      </nav>

      {view.partial ? (
        <aside className="partial-results" role="status">
          <strong>Часть данных недоступна.</strong>
          <span>
            Готовые факты показаны без подстановки отсутствующих значений.
          </span>
        </aside>
      ) : null}
      {view.contextNotice ? (
        <aside className="context-notice" role="status">
          {view.contextNotice}
        </aside>
      ) : null}

      <header className="detail-hero">
        <div
          className="detail-image-placeholder"
          role="img"
          aria-label={`Изображение объекта «${view.identity.title}» отсутствует`}
        >
          <span aria-hidden="true">⌂</span>
          <small>Страница полноценна без фото</small>
        </div>
        <div className="detail-headline">
          <div className="detail-availability">
            <strong>{view.availability.label}</strong>
            <span>{view.availability.freshness}</span>
            <small>{view.availability.checkedAt}</small>
          </div>
          <p className="eyebrow">Разбор объекта</p>
          <h1>{view.identity.title}</h1>
          <p className="detail-location">{view.identity.location}</p>
          <ul className="property-facts" aria-label="Краткие параметры объекта">
            {view.identity.summary.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <div className={`detail-price price-${view.price.kind}`}>
            <strong>{view.price.label}</strong>
            {view.price.note ? <span>{view.price.note}</span> : null}
          </div>
        </div>
        <aside className="detail-score-panel" aria-label="Оценки объекта">
          {view.matchSummary ? (
            <div
              className={
                view.matchSummary.hardFail
                  ? "hard-fail-score"
                  : "match-score-block"
              }
            >
              <span>Match Score</span>
              <strong>{view.matchSummary.label}</strong>
              <small>{view.matchSummary.eligibility}</small>
            </div>
          ) : (
            <div className="match-pending">
              <strong>Соответствие этому запросу ещё не рассчитано.</strong>
              <span>
                Без ваших условий мы не показываем универсальную оценку.
              </span>
              <Link
                className="button button-primary"
                href={view.actions.describeHref}
              >
                Описать свои условия
              </Link>
            </div>
          )}
          <div
            className={`confidence-block confidence-${view.dataQuality.confidenceBand}`}
          >
            <span>Data Confidence · отдельно от Match Score</span>
            <strong>{view.dataQuality.confidenceLabel}</strong>
          </div>
        </aside>
      </header>

      {view.hardFailures.length > 0 ? (
        <section
          className="hard-fail-section"
          aria-labelledby="hard-fail-title"
        >
          <p className="eyebrow">Обязательное условие</p>
          <h2 id="hard-fail-title">Не соответствует обязательному условию</h2>
          <ul>
            {view.hardFailures.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="detail-content-grid">
        <div className="detail-main-column">
          <section className="detail-section" aria-labelledby="facts-title">
            <div className="detail-section-heading">
              <div>
                <p className="eyebrow">Нормализованные данные</p>
                <h2 id="facts-title">Факты</h2>
              </div>
            </div>
            <FactGrid facts={view.facts} />
          </section>

          <section className="detail-section" aria-labelledby="fit-title">
            <div className="detail-section-heading">
              <div>
                <p className="eyebrow">Только ваши критерии</p>
                <h2 id="fit-title">Почему подходит именно вам</h2>
              </div>
            </div>
            {!view.personalized ? (
              <EmptySection>
                Нет активного подтверждённого запроса — персональные причины не
                сформированы.
              </EmptySection>
            ) : view.strengths.length > 0 ? (
              <ul className="detail-strength-list">
                {view.strengths.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            ) : (
              <EmptySection>
                Подтверждённых сильных сторон пока недостаточно.
              </EmptySection>
            )}
          </section>

          <section
            className="detail-section"
            aria-labelledby="compromises-title"
          >
            <div className="detail-section-heading">
              <div>
                <p className="eyebrow">Trade-offs</p>
                <h2 id="compromises-title">Компромиссы</h2>
              </div>
            </div>
            {!view.personalized ? (
              <EmptySection>
                Компромиссы можно определить только относительно ваших условий.
              </EmptySection>
            ) : view.compromises.length > 0 ? (
              <ul className="detail-compromise-list">
                {view.compromises.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            ) : (
              <EmptySection>
                Существенных компромиссов по заданным условиям не выявлено.
              </EmptySection>
            )}
          </section>

          {view.criterionResults.length > 0 ? (
            <section
              className="detail-section"
              aria-labelledby="criteria-title"
            >
              <div className="detail-section-heading">
                <div>
                  <p className="eyebrow">Результат evaluators</p>
                  <h2 id="criteria-title">Как сработали условия</h2>
                </div>
              </div>
              <FactGrid facts={view.criterionResults} />
            </section>
          ) : null}

          <section className="detail-section" aria-labelledby="timeline-title">
            <div className="detail-section-heading">
              <div>
                <p className="eyebrow">Разные события</p>
                <h2 id="timeline-title">Сроки</h2>
              </div>
            </div>
            <FactGrid facts={view.timeline} />
          </section>

          <FinancingSection financing={view.financing} />

          <section
            className="detail-section uncertainty-section"
            aria-labelledby="unknowns-title"
          >
            <div className="detail-section-heading">
              <div>
                <p className="eyebrow">Неизвестное не равно «нет»</p>
                <h2 id="unknowns-title">Что ещё нужно подтвердить</h2>
              </div>
            </div>
            {view.unknowns.length > 0 ? (
              <ul className="unknown-detail-list">
                {view.unknowns.map((unknown) => (
                  <li key={unknown.id}>
                    <div>
                      <strong>{unknown.title}</strong>
                      <p>{unknown.detail}</p>
                    </div>
                    {unknown.check ? (
                      <Link
                        className="button button-secondary button-small"
                        href={unknown.check.expertHref}
                        data-analytics-event="expert_check_clicked"
                      >
                        Проверить этот вопрос
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptySection>
                Критичных неизвестных по текущему запросу не выявлено.
              </EmptySection>
            )}
          </section>

          <section
            className="detail-section conflict-section"
            aria-labelledby="conflicts-title"
          >
            <div className="detail-section-heading">
              <div>
                <p className="eyebrow">Evidence не совпадает</p>
                <h2 id="conflicts-title">Расхождения источников</h2>
              </div>
            </div>
            {view.conflicts.length > 0 ? (
              view.conflicts.map((conflict) => (
                <article className="conflict-card" key={conflict.id}>
                  <div>
                    <h3>{conflict.title}</h3>
                    <span>{conflict.severityLabel}</span>
                  </div>
                  <ul>
                    {conflict.values.map((value) => (
                      <li key={value.evidenceId}>
                        <strong>{value.value}</strong>
                        <span>
                          {value.source} · {value.checkedAt}
                        </span>
                        <Status status={value.verification} />
                        {value.sourceUrl ? (
                          <a
                            href={value.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Открыть источник
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {conflict.check ? (
                    <Link
                      className="button button-secondary button-small"
                      href={conflict.check.expertHref}
                      data-analytics-event="expert_check_clicked"
                    >
                      Попросить экспертную проверку
                    </Link>
                  ) : null}
                </article>
              ))
            ) : (
              <EmptySection>
                Открытых расхождений в доступных evidence нет.
              </EmptySection>
            )}
          </section>

          <section className="detail-section" aria-labelledby="sources-title">
            <div className="detail-section-heading">
              <div>
                <p className="eyebrow">Provenance</p>
                <h2 id="sources-title">Источники и подтверждения</h2>
              </div>
            </div>
            {view.sources.length > 0 ? (
              <div className="source-detail-list">
                {view.sources.map((source) => (
                  <article key={source.sourceId}>
                    <div>
                      <h3>{source.name}</h3>
                      <span>{source.typeLabel}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Проверено</dt>
                        <dd>{source.checkedAt}</dd>
                      </div>
                      <div>
                        <dt>Что подтверждает</dt>
                        <dd>
                          {source.supports.length > 0
                            ? source.supports.join(", ")
                            : "Связь с предложением"}
                        </dd>
                      </div>
                      <div>
                        <dt>Evidence</dt>
                        <dd>{source.evidenceCount}</dd>
                      </div>
                    </dl>
                    <div className="source-status-row">
                      <Status status={source.verification} />
                      <Status status={source.freshness} />
                    </div>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть источник ↗
                      </a>
                    ) : (
                      <span className="muted-copy">
                        Публичная ссылка недоступна
                      </span>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <EmptySection>Источники для отображения не указаны.</EmptySection>
            )}
          </section>

          {view.alternativeOffers.length > 0 ? (
            <section className="detail-section" aria-labelledby="offers-title">
              <div className="detail-section-heading">
                <div>
                  <p className="eyebrow">Property ≠ Offer</p>
                  <h2 id="offers-title">
                    Другие предложения по этому же объекту
                  </h2>
                </div>
              </div>
              <div className="alternative-offers">
                {view.alternativeOffers.map((offer) => (
                  <article key={offer.offerId}>
                    <div>
                      <strong>{offer.price}</strong>
                      <span>{offer.availability}</span>
                    </div>
                    <h3>{offer.seller}</h3>
                    <p>{offer.source}</p>
                    {offer.commercialTerms.length > 0 ? (
                      <ul>
                        {offer.commercialTerms.map((term) => (
                          <li key={term}>{term}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted-copy">
                        Коммерческие условия не указаны.
                      </p>
                    )}
                    <p>{offer.financingDifference}</p>
                    <Link
                      className="button button-secondary button-small"
                      href={offer.href}
                    >
                      Открыть это предложение
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="detail-side-column">
          <section className="quality-panel" aria-labelledby="quality-title">
            <p className="eyebrow">Отдельно от соответствия</p>
            <h2 id="quality-title">Насколько надёжны данные</h2>
            <dl>
              <div>
                <dt>Уверенность</dt>
                <dd>{view.dataQuality.confidenceLabel}</dd>
              </div>
              <div>
                <dt>Полнота</dt>
                <dd>{view.dataQuality.completenessLabel}</dd>
              </div>
              <div>
                <dt>Критичных неизвестных</dt>
                <dd>{view.dataQuality.criticalUnknownCount}</dd>
              </div>
              <div>
                <dt>Критичных конфликтов</dt>
                <dd>{view.dataQuality.criticalConflictCount}</dd>
              </div>
            </dl>
          </section>
          <section className="checks-panel" aria-labelledby="checks-title">
            <p className="eyebrow">До решения</p>
            <h2 id="checks-title">Что стоит проверить</h2>
            {view.recommendedChecks.length > 0 ? (
              <ol>
                {view.recommendedChecks.map((check) => (
                  <li key={check.id}>
                    <span>{check.title}</span>
                    <Link
                      href={check.expertHref}
                      aria-label={`${check.title}: проверить этот вопрос`}
                      data-analytics-event="expert_check_clicked"
                    >
                      Проверить
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptySection>
                Дополнительных критичных проверок не предложено.
              </EmptySection>
            )}
          </section>
          <div className="detail-actions">
            <Link
              className="button button-primary"
              href={view.actions.comparisonHref}
              data-analytics-event="comparison_add_clicked"
            >
              Добавить к сравнению
            </Link>
            <Link className="button button-secondary" href={backHref}>
              {backLabel}
            </Link>
            {view.personalized ? (
              <Link
                className="button button-ghost"
                href={view.actions.editHref}
              >
                Изменить условия
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
