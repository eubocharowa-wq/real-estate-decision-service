"use client";

import { useState } from "react";

import type { Criterion } from "../../domain/matching/schema";
import { createAddCriterionDraft, type ConfirmationCriterion } from "../state";
import { getAddableCriteria, getCriterionPresentation } from "../registry";
import { CriterionEditor } from "./criterion-editor";
import { PrioritySelector } from "./priority-selector";

interface AddCriterionProps {
  readonly existingFields: readonly string[];
  readonly onAdd: (
    field: string,
    value: ConfirmationCriterion["value"],
    priority: Criterion["priority"],
  ) => void;
}

export function AddCriterion({ existingFields, onAdd }: AddCriterionProps) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("");
  const [priority, setPriority] = useState<Criterion["priority"]>("preferred");
  const available = getAddableCriteria().filter(
    ([key]) => !existingFields.includes(key),
  );
  const draft = field ? createAddCriterionDraft(field) : null;

  if (!open) {
    return (
      <button
        type="button"
        className="add-condition-button"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">＋</span> Добавить условие
      </button>
    );
  }

  return (
    <section
      className="add-condition-panel"
      aria-labelledby="add-condition-title"
    >
      <div className="section-heading compact">
        <div>
          <p className="section-index">+</p>
          <h2 id="add-condition-title">Добавить условие</h2>
        </div>
        <p>Только безопасные структурированные поля — без raw JSON.</p>
      </div>
      {available.length === 0 ? (
        <p>Все доступные условия уже добавлены.</p>
      ) : (
        <label htmlFor="new-criterion-field">
          Условие
          <select
            id="new-criterion-field"
            value={field}
            onChange={(event) => setField(event.target.value)}
          >
            <option value="">Выберите условие</option>
            {available.map(([key, presentation]) => (
              <option key={key} value={key}>
                {presentation.category_label} — {presentation.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {draft ? (
        <div className="add-condition-editor">
          <PrioritySelector
            field={field}
            value={priority}
            onChange={setPriority}
          />
          <CriterionEditor
            key={field}
            criterion={{
              ...draft,
              label: getCriterionPresentation(field).label,
            }}
            submitLabel="Добавить"
            onSave={(value) => {
              onAdd(field, value, priority);
              setField("");
              setOpen(false);
            }}
            onCancel={() => setField("")}
          />
        </div>
      ) : null}
      <button
        type="button"
        className="text-button"
        onClick={() => setOpen(false)}
      >
        Закрыть
      </button>
    </section>
  );
}
