import type { Criterion } from "../../domain/matching/schema";
import { getCriterionPresentation, getPriorityLabel } from "../registry";

interface PrioritySelectorProps {
  readonly field: string;
  readonly value: Criterion["priority"];
  readonly onChange: (priority: Criterion["priority"]) => void;
}

export function PrioritySelector({
  field,
  value,
  onChange,
}: PrioritySelectorProps) {
  const presentation = getCriterionPresentation(field);
  const inputId = `priority-${field.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <div className="priority-control">
      <label htmlFor={inputId}>Приоритет</label>
      <select
        id={inputId}
        value={value}
        onChange={(event) =>
          onChange(event.target.value as Criterion["priority"])
        }
      >
        {presentation.allowed_priorities.map((priority) => (
          <option key={priority} value={priority}>
            {getPriorityLabel(priority)}
          </option>
        ))}
      </select>
    </div>
  );
}
