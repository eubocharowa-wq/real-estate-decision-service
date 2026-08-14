"use client";

import { useState } from "react";

import type { ConfirmationCriterion } from "../state";
import { getCriterionPresentation } from "../registry";

interface CriterionEditorProps {
  readonly criterion: ConfirmationCriterion;
  readonly onSave: (value: ConfirmationCriterion["value"]) => void;
  readonly onCancel: () => void;
  readonly submitLabel?: string;
}

const propertyTypeOptions = [
  ["apartment", "Квартира"],
  ["apartments", "Апартаменты"],
  ["house", "Дом"],
  ["townhouse", "Таунхаус"],
  ["land", "Участок"],
] as const;

const initialNumber = (value: unknown): string => {
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && "maximum" in value) {
    return typeof value.maximum === "number" ? String(value.maximum) : "";
  }
  return "";
};

const rangeBoundary = (
  value: unknown,
  boundary: "minimum" | "maximum",
): string => {
  if (typeof value === "number")
    return boundary === "minimum" ? String(value) : "";
  if (typeof value === "object" && value !== null && boundary in value) {
    const boundaryValue = (value as Record<string, unknown>)[boundary];
    return typeof boundaryValue === "number" ? String(boundaryValue) : "";
  }
  return "";
};

export function CriterionEditor({
  criterion,
  onSave,
  onCancel,
  submitLabel = "Сохранить",
}: CriterionEditorProps) {
  const presentation = getCriterionPresentation(criterion.field);
  const [singleValue, setSingleValue] = useState(() =>
    initialNumber(criterion.value),
  );
  const [textValue, setTextValue] = useState(() =>
    typeof criterion.value === "string" ? criterion.value : "",
  );
  const [booleanValue, setBooleanValue] = useState(() =>
    typeof criterion.value === "boolean" ? criterion.value : true,
  );
  const [minimum, setMinimum] = useState(() =>
    rangeBoundary(criterion.value, "minimum"),
  );
  const [maximum, setMaximum] = useState(() =>
    rangeBoundary(criterion.value, "maximum"),
  );
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() =>
    (Array.isArray(criterion.value) ? criterion.value : [criterion.value]).map(
      String,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const editorId = `editor-${criterion.criterion_id}`;
  const errorId = `${editorId}-error`;

  const submit = () => {
    if (presentation.editor === "money" || presentation.editor === "number") {
      const numeric = Number(singleValue);
      if (!singleValue || !Number.isFinite(numeric) || numeric < 0) {
        setError("Укажите неотрицательное число.");
        return;
      }
      if (presentation.editor === "money" && !Number.isSafeInteger(numeric)) {
        setError("Укажите сумму целыми рублями.");
        return;
      }
      onSave(numeric);
      return;
    }
    if (presentation.editor === "range") {
      const minimumValue = minimum === "" ? null : Number(minimum);
      const maximumValue = maximum === "" ? null : Number(maximum);
      if (minimumValue === null && maximumValue === null) {
        setError("Укажите хотя бы одну границу.");
        return;
      }
      if (
        (minimumValue !== null &&
          (!Number.isFinite(minimumValue) || minimumValue < 0)) ||
        (maximumValue !== null &&
          (!Number.isFinite(maximumValue) || maximumValue < 0))
      ) {
        setError("Границы должны быть неотрицательными числами.");
        return;
      }
      onSave({ minimum: minimumValue, maximum: maximumValue });
      return;
    }
    if (presentation.editor === "property_types") {
      if (selectedTypes.length === 0) {
        setError("Выберите хотя бы один тип недвижимости.");
        return;
      }
      onSave(selectedTypes);
      return;
    }
    if (presentation.editor === "boolean") {
      onSave(booleanValue);
      return;
    }
    if (textValue.trim() === "") {
      setError("Укажите значение.");
      return;
    }
    onSave(textValue.trim());
  };

  return (
    <div
      className="criterion-editor"
      aria-label={`Редактирование: ${presentation.label}`}
    >
      {presentation.editor === "money" || presentation.editor === "number" ? (
        <label htmlFor={editorId}>
          {presentation.editor === "money"
            ? "Сумма в рублях"
            : presentation.label}
          <input
            id={editorId}
            type="number"
            min="0"
            step={presentation.editor === "money" ? "1" : "any"}
            value={singleValue}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setSingleValue(event.target.value)}
          />
        </label>
      ) : null}

      {presentation.editor === "range" ? (
        <div className="range-editor">
          <label htmlFor={`${editorId}-min`}>
            Минимум
            <input
              id={`${editorId}-min`}
              type="number"
              min="0"
              step="any"
              value={minimum}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setMinimum(event.target.value)}
            />
          </label>
          <label htmlFor={`${editorId}-max`}>
            Максимум
            <input
              id={`${editorId}-max`}
              type="number"
              min="0"
              step="any"
              value={maximum}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setMaximum(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {presentation.editor === "property_types" ? (
        <fieldset aria-describedby={error ? errorId : undefined}>
          <legend>Допустимые типы недвижимости</legend>
          <div className="checkbox-grid">
            {propertyTypeOptions.map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(value)}
                  onChange={(event) =>
                    setSelectedTypes((current) =>
                      event.target.checked
                        ? [...current, value]
                        : current.filter((item) => item !== value),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {presentation.editor === "boolean" ? (
        <label htmlFor={editorId}>
          Значение
          <select
            id={editorId}
            value={String(booleanValue)}
            onChange={(event) => setBooleanValue(event.target.value === "true")}
          >
            <option value="true">Да</option>
            <option value="false">Нет</option>
          </select>
        </label>
      ) : null}

      {presentation.editor === "text" || presentation.editor === "date" ? (
        <label htmlFor={editorId}>
          {presentation.label}
          <input
            id={editorId}
            type={presentation.editor === "date" ? "date" : "text"}
            value={textValue}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setTextValue(event.target.value)}
          />
        </label>
      ) : null}

      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}

      <div className="inline-actions">
        <button
          type="button"
          className="button button-primary button-small"
          onClick={submit}
        >
          {submitLabel}
        </button>
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
