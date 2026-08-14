"use client";

import { useState } from "react";

import type { ClarificationCandidate } from "../../user-request-parser";

interface ClarificationCardProps {
  readonly clarification: ClarificationCandidate;
  readonly onAnswer: (
    answer: ClarificationCandidate["options"][number]["value"],
  ) => void;
}

const inputTokens = new Set([
  "provide_city",
  "provide_destination",
  "provide_links",
  "provide_value",
]);

const inputConfig = (field: string) => {
  if (field === "location.city")
    return { label: "Город", type: "text", placeholder: "Например, Тула" };
  if (field === "location.travel_destination") {
    return {
      label: "Адрес или район работы",
      type: "text",
      placeholder: "Например, центр города",
    };
  }
  if (field === "source_links") {
    return {
      label: "Ссылка на вариант",
      type: "url",
      placeholder: "https://…",
    };
  }
  if (field.startsWith("infrastructure.")) {
    return {
      label: "Максимум минут",
      type: "number",
      placeholder: "Например, 15",
    };
  }
  return { label: "Ваш ответ", type: "text", placeholder: "Введите уточнение" };
};

export function ClarificationCard({
  clarification,
  onAnswer,
}: ClarificationCardProps) {
  const config = inputConfig(clarification.field);
  const needsInput = clarification.options.some((option) =>
    inputTokens.has(String(option.value)),
  );
  const directOptions = clarification.options.filter(
    (option) => !inputTokens.has(String(option.value)),
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = `clarification-${clarification.clarification_id}`;

  const submitInput = () => {
    if (!value.trim()) {
      setError("Введите ответ, чтобы закрыть уточнение.");
      return;
    }
    if (config.type === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        setError("Укажите неотрицательное число минут.");
        return;
      }
      onAnswer(numeric);
      return;
    }
    if (config.type === "url") {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:")
          throw new Error("scheme");
      } catch {
        setError("Введите корректную ссылку http(s).");
        return;
      }
    }
    onAnswer(value.trim());
  };

  return (
    <article className="clarification-card">
      <p className="eyebrow">
        Уточнение ·{" "}
        {clarification.priority === "critical" ? "обязательно" : "важно"}
      </p>
      <h3>{clarification.proposed_question}</h3>
      <p>{clarification.reason}</p>

      {directOptions.length > 0 ? (
        <div className="clarification-options">
          {directOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              className="button button-secondary button-small"
              onClick={() => onAnswer(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {needsInput ? (
        <div className="clarification-input">
          <label htmlFor={inputId}>
            {config.label}
            <input
              id={inputId}
              type={config.type}
              min={config.type === "number" ? "0" : undefined}
              placeholder={config.placeholder}
              value={value}
              aria-describedby={error ? `${inputId}-error` : undefined}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button button-primary button-small"
            onClick={submitInput}
          >
            Ответить
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="field-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
