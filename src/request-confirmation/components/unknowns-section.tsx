import type { ParserUnknown } from "../../user-request-parser";

interface UnknownsSectionProps {
  readonly unknowns: readonly ParserUnknown[];
}

const unknownLabels: Record<string, string> = {
  "location.city": "Город пока не выбран",
  "location.travel_destination":
    "Не указан адрес, относительно которого считать время в пути",
  "budget.context": "Неясно, что входит в общий бюджет",
  source_links: "Не добавлены варианты для сравнения",
  "infrastructure.school_proximity":
    "Не определено, что именно значит «рядом со школой»",
};

export function UnknownsSection({ unknowns }: UnknownsSectionProps) {
  if (unknowns.length === 0) return null;

  return (
    <section className="unknowns-section" aria-labelledby="unknowns-title">
      <div className="section-heading compact">
        <div>
          <p className="section-index">?</p>
          <h2 id="unknowns-title">Не определено</h2>
        </div>
        <p>Только то, что может повлиять на дальнейший выбор.</p>
      </div>
      <ul className="unknown-list">
        {unknowns.map((unknown) => (
          <li key={`${unknown.field}-${unknown.reason}`}>
            <span>
              {unknownLabels[unknown.field] ?? "Нужно уточнить условие"}
            </span>
            <small>{unknown.explanation}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
