"use client";

import { useState } from "react";

import type { RequestOwner } from "../contracts";
import type { ExpertRequestPreview } from "../presentation";
import { getOrCreateBuyerSessionId } from "../../buyer-journey/browser-storage";
import { ensureJourneyState } from "../../buyer-journey/journey-client";

export interface ExpertRequestUiSubmission {
  readonly requestType: ExpertRequestPreview["requestType"];
  readonly triggerType: ExpertRequestPreview["triggerType"];
  readonly questionCategory: ExpertRequestPreview["questionCategory"];
  readonly propertyIds: readonly string[];
  readonly comparisonRef: string | null;
  readonly userRequestRef: string | null;
  readonly field: string | null;
  readonly questionCode: string | null;
  readonly documentRefs: readonly string[];
  readonly onsite: ExpertRequestPreview["onsiteContext"];
  readonly userQuestion: string;
}

interface ExpertRequestFormProps {
  readonly preview: ExpertRequestPreview;
  readonly onSubmit?: (
    submission: ExpertRequestUiSubmission,
  ) => void | Promise<void>;
}

export function ExpertRequestForm({
  preview,
  onSubmit,
}: ExpertRequestFormProps) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = question.trim();
    if (normalized.length < 10) {
      setError("Опишите конкретный вопрос — минимум 10 символов.");
      return;
    }
    setError(null);
    setStatus("saving");
    const submission: ExpertRequestUiSubmission = {
      requestType: preview.requestType,
      triggerType: preview.triggerType,
      questionCategory: preview.questionCategory,
      propertyIds: preview.propertyIds,
      comparisonRef: preview.comparisonRef,
      userRequestRef: preview.userRequestRef,
      field: preview.field,
      questionCode: preview.questionCode,
      documentRefs: preview.documentRefs,
      onsite: preview.onsiteContext,
      userQuestion: normalized,
    };
    try {
      if (onSubmit) await onSubmit(submission);
      else {
        // Owner and confirmed request come from the journey, not from the tab:
        // an expert request outlives the browser session that created it.
        const journey = await ensureJourneyState();
        if (journey.status !== "ready")
          throw new Error(
            "Сначала подтвердите условия — без UserRequest экспертный контекст не создаётся.",
          );
        const userRequest = journey.state.confirmed_request;
        if (!userRequest)
          throw new Error(
            "Сначала подтвердите условия — без UserRequest экспертный контекст не создаётся.",
          );
        const journeyId = journey.state.journey_id;
        const owner: RequestOwner = {
          owner_type: "session",
          owner_id: journey.state.owner_id,
        };
        const useJourneyBoundary = ![
          "document_review",
          "onsite_check",
        ].includes(submission.requestType);
        const response = await fetch(
          useJourneyBoundary ? "/api/buyer-journeys" : "/api/expert-requests",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              useJourneyBoundary
                ? {
                    action: "create_expert_request",
                    journeyId,
                    sessionId: getOrCreateBuyerSessionId(),
                    input: {
                      requestType: submission.requestType,
                      triggerType: submission.triggerType,
                      questionCategory: submission.questionCategory,
                      question: submission.userQuestion,
                      propertyIds: submission.propertyIds,
                      field: submission.field,
                      questionCode: submission.questionCode,
                    },
                  }
                : { owner, submission, userRequest },
            ),
          },
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            typeof Reflect.get(payload, "message") === "string"
              ? String(Reflect.get(payload, "message"))
              : "Не удалось создать экспертный запрос.";
          throw new Error(message);
        }
      }
      setStatus("saved");
    } catch (submissionError) {
      setStatus("idle");
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Не удалось создать экспертный запрос.",
      );
    }
  };

  return (
    <main className="expert-request-shell">
      <header className="expert-request-hero">
        <p className="eyebrow">Экспертный слой · конкретная задача</p>
        <h1>{preview.title}</h1>
        <p>
          Эксперт получит собранный контекст, а не пустую заявку «перезвоните
          мне».
        </p>
      </header>

      <form className="expert-request-form" onSubmit={submit}>
        <section aria-labelledby="expert-what-title">
          <p className="section-index">01</p>
          <h2 id="expert-what-title">Что нужно проверить?</h2>
          <p>{preview.whatToCheck}</p>
          <ul>
            {preview.structuredQuestionPreview.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="expert-why-title">
          <p className="section-index">02</p>
          <h2 id="expert-why-title">Почему это важно?</h2>
          <p>{preview.whyItMatters}</p>
        </section>

        <section aria-labelledby="expert-objects-title">
          <p className="section-index">03</p>
          <h2 id="expert-objects-title">
            Какие объекты будут переданы эксперту?
          </h2>
          <ul className="expert-object-list">
            {preview.propertyLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="expert-question-title">
          <p className="section-index">04</p>
          <h2 id="expert-question-title">Ваш вопрос</h2>
          <label htmlFor="expert-user-question">
            Сформулируйте вопрос своими словами
          </label>
          <textarea
            id="expert-user-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={5}
            placeholder="Например: подтвердите, действует ли семейная ипотека именно для этого предложения."
          />
          <p className="field-hint">
            Системные вопросы дополнят ваш текст, но не заменят его.
          </p>
          {error ? <p className="expert-request-error">{error}</p> : null}
        </section>

        <aside
          className="expert-context-preview"
          aria-labelledby="preview-title"
        >
          <p className="eyebrow">Контекст перед отправкой</p>
          <h2 id="preview-title">Передадим эксперту</h2>
          <ul>
            <li>
              ваш подтверждённый запрос и только относящиеся к вопросу условия;
            </li>
            <li>{preview.propertyLabels.join(", ")};</li>
            <li>выбранные предложения и сценарии покупки, если они есть;</li>
            <li>
              Match/DataQuality, неизвестные и расхождения — в понятном виде;
            </li>
            <li>
              ссылки на evidence без копирования сырого контента источников.
            </li>
          </ul>
          <p>
            Контакты, полный профиль и тексты документов не передаются без
            необходимости.
          </p>
          {preview.boundaryNotice ? (
            <p className="expert-boundary-notice">{preview.boundaryNotice}</p>
          ) : null}
        </aside>

        <button
          className="button button-primary expert-submit"
          type="submit"
          disabled={status === "saving" || status === "saved"}
        >
          {status === "saving"
            ? "Создаём черновик…"
            : status === "saved"
              ? "Черновик создан"
              : preview.submitLabel}
        </button>
        {status === "saved" ? (
          <p role="status" className="expert-request-success">
            Контекстный запрос создан. Application service проверил доступ,
            маршрут и поставил задачу в очередь без передачи лишнего профиля.
          </p>
        ) : null}
      </form>
    </main>
  );
}
