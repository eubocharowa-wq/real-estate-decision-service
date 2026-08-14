import type { Criterion } from "../../domain/matching/schema";
import type {
  ConfirmationCriterion,
  ConfirmationValidationError,
} from "../state";
import { CriterionRow } from "./criterion-row";

interface CriteriaGroupProps {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly criteria: readonly ConfirmationCriterion[];
  readonly lowConfidence: boolean;
  readonly errors: readonly ConfirmationValidationError[];
  readonly onEdit: (
    criterionId: string,
    value: ConfirmationCriterion["value"],
  ) => void;
  readonly onPriorityChange: (
    criterionId: string,
    priority: Criterion["priority"],
  ) => void;
  readonly onRemove: (criterionId: string) => void;
}

export function CriteriaGroup({
  id,
  title,
  description,
  criteria,
  lowConfidence,
  errors,
  onEdit,
  onPriorityChange,
  onRemove,
}: CriteriaGroupProps) {
  if (criteria.length === 0) return null;

  return (
    <section className="criteria-section" aria-labelledby={id}>
      <div className="section-heading">
        <div>
          <p className="section-index">
            {String(criteria.length).padStart(2, "0")}
          </p>
          <h2 id={id}>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      <div className="criteria-list">
        {criteria.map((criterion) => (
          <CriterionRow
            key={criterion.criterion_id}
            criterion={criterion}
            lowConfidence={lowConfidence}
            errorMessage={
              errors.find((error) => error.field === criterion.field)?.message
            }
            onEdit={(value) => onEdit(criterion.criterion_id, value)}
            onPriorityChange={(priority) =>
              onPriorityChange(criterion.criterion_id, priority)
            }
            onRemove={() => onRemove(criterion.criterion_id)}
          />
        ))}
      </div>
    </section>
  );
}
