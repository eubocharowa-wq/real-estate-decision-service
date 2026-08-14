import type { ConfirmationSession } from "../state";
import { formatCriterionValue } from "../registry";

interface RequestSummaryProps {
  readonly session: ConfirmationSession;
}

export function RequestSummary({ session }: RequestSummaryProps) {
  const request = session.draft_request;
  const propertyTypes = session.criteria.find(
    (criterion) => criterion.field === "property.allowed_property_types",
  );
  const maximumPrice = session.criteria.find(
    (criterion) => criterion.field === "budget.purchase_price.maximum",
  );
  const location = request.location.cities.length
    ? request.location.cities.join(", ")
    : request.location.regions.length
      ? request.location.regions.join(", ")
      : "город пока не выбран";

  return (
    <section
      className="request-summary"
      aria-labelledby="request-summary-title"
    >
      <div>
        <p className="eyebrow">Ваш исходный запрос</p>
        <blockquote>«{session.initial_result.raw_text}»</blockquote>
      </div>
      <div className="summary-understanding">
        <p className="eyebrow">Кратко поняли так</p>
        <h2 id="request-summary-title">
          {propertyTypes
            ? formatCriterionValue(propertyTypes.field, propertyTypes.value)
            : "Недвижимость"}{" "}
          · {location}
        </h2>
        <p>
          {maximumPrice
            ? `Бюджет ${formatCriterionValue(maximumPrice.field, maximumPrice.value)}.`
            : "Бюджет не задан."}{" "}
          Покажем до {request.result_limit} вариантов после реализации подбора.
        </p>
      </div>
    </section>
  );
}
