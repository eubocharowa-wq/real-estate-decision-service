"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { userRequestParserOutcomeSchema } from "../src/user-request-parser";
import {
  PARSER_RESULT_STORAGE_KEY,
  RAW_REQUEST_STORAGE_KEY,
} from "../src/request-confirmation/storage";

const examples = [
  "Найди 5 квартир в Туле до 5 млн, семейная ипотека обязательно, желательно без первоначального взноса.",
  "Рассматриваю квартиру или дом. До работы не больше 40 минут. Минимум 70 метров.",
];

export function RequestEntry() {
  const router = useRouter();
  const preservedText = useSyncExternalStore(
    () => () => undefined,
    () => window.sessionStorage.getItem(RAW_REQUEST_STORAGE_KEY) ?? "",
    () => "",
  );
  const [editedText, setEditedText] = useState<string | null>(null);
  const rawText = editedText ?? preservedText;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!rawText.trim()) {
      setError("Опишите задачу хотя бы одним предложением.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/user-request/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw_text: rawText }),
      });
      const payload: unknown = await response.json();
      const outcome = userRequestParserOutcomeSchema.safeParse(payload);
      if (!outcome.success) {
        setError("Не удалось проверить ответ parser. Попробуйте ещё раз.");
        return;
      }
      if (!outcome.data.success) {
        setError(outcome.data.error.message);
        return;
      }
      window.sessionStorage.setItem(RAW_REQUEST_STORAGE_KEY, rawText);
      window.sessionStorage.setItem(
        PARSER_RESULT_STORAGE_KEY,
        JSON.stringify(outcome.data.result),
      );
      router.push("/request/confirm");
    } catch {
      setError(
        "Не удалось разобрать запрос. Ваш текст сохранён — попробуйте ещё раз.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="entry-shell">
      <header className="entry-header">
        <p className="brand-mark">
          REDS <span> / MVP</span>
        </p>
        <p className="step-label">Шаг 1 · Ваша задача</p>
      </header>
      <section className="entry-card" aria-labelledby="entry-title">
        <p className="eyebrow">Не каталог. Инструмент выбора.</p>
        <h1 id="entry-title">Опишите, какую недвижимость вы ищете</h1>
        <p className="hero-lead">
          Расскажите о бюджете, сроках, семье и важных условиях обычными
          словами.
        </p>
        <label htmlFor="request-text">Ваша задача</label>
        <textarea
          id="request-text"
          rows={7}
          value={rawText}
          aria-describedby={error ? "request-error" : "request-help"}
          placeholder="Например: нужна квартира до 7 млн, семейная ипотека обязательна…"
          onChange={(event) => setEditedText(event.target.value)}
        />
        <p id="request-help" className="input-help">
          Исходная формулировка сохранится без изменений.
        </p>
        {error ? (
          <p id="request-error" className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="button button-primary entry-submit"
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? "Разбираем условия…" : "Проверить условия"}
        </button>
      </section>
      <aside className="entry-examples" aria-labelledby="examples-title">
        <p className="eyebrow" id="examples-title">
          Примеры формулировок
        </p>
        {examples.map((example, index) => (
          <button
            key={example}
            type="button"
            onClick={() => setEditedText(example)}
          >
            <span>0{index + 1}</span>
            {example}
          </button>
        ))}
      </aside>
    </main>
  );
}
