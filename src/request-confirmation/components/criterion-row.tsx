"use client";

import { useState } from "react";

import type { Criterion } from "../../domain/matching/schema";
import {
  formatCriterionValue,
  getCriterionPresentation,
  getPriorityLabel,
} from "../registry";
import type { ConfirmationCriterion } from "../state";
import { CriterionEditor } from "./criterion-editor";
import { PrioritySelector } from "./priority-selector";

interface CriterionRowProps {
  readonly criterion: ConfirmationCriterion;
  readonly lowConfidence: boolean;
  readonly errorMessage?: string;
  readonly onEdit: (value: ConfirmationCriterion["value"]) => void;
  readonly onPriorityChange: (priority: Criterion["priority"]) => void;
  readonly onRemove: () => void;
}

export function CriterionRow({
  criterion,
  lowConfidence,
  errorMessage,
  onEdit,
  onPriorityChange,
  onRemove,
}: CriterionRowProps) {
  const [editing, setEditing] = useState(false);
  const presentation = getCriterionPresentation(criterion.field);

  return (
    <article
      className={`criterion-row priority-${criterion.priority}${lowConfidence ? " needs-review" : ""}`}
      data-testid={`criterion-${criterion.field}`}
    >
      <div className="criterion-main">
        <div>
          <p className="eyebrow">{presentation.category_label}</p>
          <h3>{presentation.label}</h3>
          <p className="criterion-value">
            {formatCriterionValue(criterion.field, criterion.value)}
          </p>
        </div>
        <span className={`priority-badge priority-badge-${criterion.priority}`}>
          {getPriorityLabel(criterion.priority)}
        </span>
      </div>

      {lowConfidence ? (
        <p className="review-note">Проверьте, верно ли понято это условие.</p>
      ) : null}
      {criterion.source_text ? (
        <details className="source-trace">
          <summary>Исходная фраза</summary>
          <p>«{criterion.source_text}»</p>
        </details>
      ) : null}
      {errorMessage ? (
        <p className="field-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {editing ? (
        <CriterionEditor
          criterion={criterion}
          onSave={(value) => {
            onEdit(value);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="criterion-controls">
          <PrioritySelector
            field={criterion.field}
            value={criterion.priority}
            onChange={onPriorityChange}
          />
          <div className="row-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setEditing(true)}
            >
              Изменить
            </button>
            <button
              type="button"
              className="text-button text-button-danger"
              onClick={onRemove}
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
