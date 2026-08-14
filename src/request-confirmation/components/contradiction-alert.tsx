import type { ParserContradiction } from "../../user-request-parser";

interface ContradictionAlertProps {
  readonly contradictions: readonly ParserContradiction[];
}

export function ContradictionAlert({
  contradictions,
}: ContradictionAlertProps) {
  if (contradictions.length === 0) return null;

  return (
    <section
      className="contradiction-alert"
      aria-labelledby="contradictions-title"
      role="alert"
    >
      <p className="eyebrow">Нужно исправить перед подтверждением</p>
      <h2 id="contradictions-title">Условия противоречат друг другу</h2>
      {contradictions.map((contradiction) => (
        <div
          key={contradiction.contradiction_id}
          className="contradiction-item"
        >
          <p>{contradiction.message}</p>
          {contradiction.source_spans.length > 0 ? (
            <ul>
              {contradiction.source_spans.map((span, index) => (
                <li key={`${span.text}-${index}`}>«{span.text}»</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
}
