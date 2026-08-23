"use client";

import { useState } from "react";

import { getOrCreateBuyerSessionId } from "../../buyer-journey/browser-storage";
import type { JourneyFeedback, PilotFeedbackStage } from "../contracts";

const promptByStage: Readonly<Record<PilotFeedbackStage, string>> = {
  shortlist: "Помог ли короткий список понять варианты?",
  comparison: "Помогло ли сравнение увидеть компромиссы?",
  expert_result: "Помог ли результат проверки принять решение?",
  journey_end: "Стало ли понятнее, какой следующий шаг выбрать?",
};

export function PilotFeedbackForm({
  journeyId,
  stage,
}: {
  readonly journeyId: string;
  readonly stage: PilotFeedbackStage;
}) {
  const [answer, setAnswer] = useState<JourneyFeedback["answer"]>("yes");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "saved" | "error">(
    "idle",
  );

  return (
    <section
      className="journey-decision-card"
      aria-labelledby={`feedback-${stage}`}
    >
      <h2 id={`feedback-${stage}`}>{promptByStage[stage]}</h2>
      <label>
        Ответ
        <select
          value={answer}
          onChange={(event) =>
            setAnswer(event.target.value as JourneyFeedback["answer"])
          }
        >
          <option value="yes">Да</option>
          <option value="partly">Частично</option>
          <option value="no">Нет</option>
          <option value="not_sure">Пока не уверен(а)</option>
        </select>
      </label>
      <label>
        Комментарий — необязательно
        <textarea
          maxLength={2000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Не указывайте телефон, email или данные документов."
        />
      </label>
      <button
        className="button button-secondary"
        disabled={status === "sending" || status === "saved"}
        type="button"
        onClick={() => {
          setStatus("sending");
          void fetch("/api/buyer-journeys", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "submit_feedback",
              journeyId,
              sessionId: getOrCreateBuyerSessionId(),
              stage,
              questionCode: `pilot_${stage}_helpfulness_v1`,
              answer,
              optionalComment: comment || null,
            }),
          })
            .then((response) => {
              if (!response.ok) throw new Error("FEEDBACK_SAVE_FAILED");
              setStatus("saved");
            })
            .catch(() => setStatus("error"));
        }}
      >
        {status === "saved" ? "Спасибо, ответ сохранён" : "Отправить ответ"}
      </button>
      {status === "error" ? (
        <p role="alert">Не удалось сохранить ответ. Попробуйте ещё раз.</p>
      ) : null}
    </section>
  );
}
