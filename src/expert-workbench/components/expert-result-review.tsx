import Link from "next/link";

import type { ExpertResultReviewView } from "../presentation";

const ResultList = ({
  title,
  items,
  empty,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly empty: string;
}) => (
  <section className="expert-result-section">
    <h2>{title}</h2>
    {items.length > 0 ? (
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ) : (
      <p>{empty}</p>
    )}
  </section>
);

export function ExpertResultReview({
  view,
}: {
  readonly view: ExpertResultReviewView;
}) {
  return (
    <main className="expert-result-shell">
      <header className="expert-result-header">
        <Link href="/" className="brand-mark" aria-label="На главную">
          REDS <span>/ result</span>
        </Link>
        <p className="eyebrow">{view.header.status}</p>
        <h1>{view.header.title}</h1>
        <dl>
          <div>
            <dt>Что проверяли?</dt>
            <dd>{view.header.checked}</dd>
          </div>
          <div>
            <dt>К какому объекту или сравнению относится?</dt>
            <dd>{view.header.context}</dd>
          </div>
          <div>
            <dt>Главный результат</dt>
            <dd>{view.header.mainResult}</dd>
          </div>
        </dl>
      </header>

      {view.boundaryNotice ? (
        <aside className="expert-result-boundary" role="note">
          {view.boundaryNotice}
        </aside>
      ) : null}

      {view.documentRefs.length > 0 ? (
        <section className="expert-result-section">
          <h2>Проверенные документы</h2>
          <ul>
            {view.documentRefs.map((documentRef) => (
              <li key={documentRef}>{documentRef}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="expert-result-section">
        <h2>Что проверили</h2>
        <ul>
          {view.checkedItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <div className="expert-result-grid">
        <ResultList
          title="Подтверждено"
          items={view.confirmed}
          empty="Новых подтверждённых фактов нет."
        />
        <ResultList
          title="Не подтвердилось"
          items={view.notConfirmed}
          empty="Опровергнутых условий нет."
        />
        <ResultList
          title="Осталось неясным"
          items={view.unknown}
          empty="Неизвестные вопросы явно не зафиксированы."
        />
        <ResultList
          title="Неразрешённые расхождения"
          items={view.unresolvedConflicts}
          empty="Открытых расхождений нет."
        />
      </div>

      <section className="expert-result-section">
        <h2>Наблюдения и выводы эксперта</h2>
        {view.findings.length ? (
          <ul>
            {view.findings.map((finding) => (
              <li key={`${finding.label}:${finding.text}`}>
                <strong>{finding.label}</strong> · {finding.text}
              </li>
            ))}
          </ul>
        ) : (
          <p>Дополнительных findings нет.</p>
        )}
      </section>

      <section className="expert-result-section">
        <h2>Риски</h2>
        {view.risks.length ? (
          <ul>
            {view.risks.map((risk) => (
              <li key={`${risk.label}:${risk.text}`}>
                <strong>{risk.label}</strong> · {risk.text}
              </li>
            ))}
          </ul>
        ) : (
          <p>Новых рисков не зафиксировано.</p>
        )}
      </section>

      {view.choice ? (
        <section className="expert-choice-result">
          <p className="eyebrow">Экспертный вывод по финалистам</p>
          <h2>{view.choice.label}</h2>
          {view.choice.preferredPropertyId ? (
            <p>Ведущий вариант: {view.choice.preferredPropertyId}</p>
          ) : null}
          {view.choice.conditions.length ? (
            <ul>
              {view.choice.conditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          ) : null}
          {view.choice.unresolvedQuestions.length ? (
            <>
              <h3>Что ещё проверить</h3>
              <ul>
                {view.choice.unresolvedQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="expert-decision-impact">
        <p className="eyebrow">Что это меняет в вашем выборе</p>
        <h2>Результат и пересчёт</h2>
        <div>
          <article>
            <h3>Match Score</h3>
            <p>{view.decisionImpact.match}</p>
          </article>
          <article>
            <h3>Data Confidence</h3>
            <p>{view.decisionImpact.confidence}</p>
          </article>
        </div>
        <p role="status">{view.decisionImpact.explanation}</p>
      </section>

      <ResultList
        title="Что делать дальше"
        items={view.nextActions}
        empty="Дополнительные действия не указаны."
      />
      {view.technicalEscalationHref ? (
        <Link
          className="button button-primary"
          href={view.technicalEscalationHref}
        >
          Передать техническому специалисту
        </Link>
      ) : null}
    </main>
  );
}
