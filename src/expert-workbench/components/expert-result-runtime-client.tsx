"use client";

import { useEffect, useState } from "react";

import { getOrCreateBuyerSessionId } from "../../buyer-journey/browser-storage";
import { PilotFeedbackForm } from "../../pilot-hardening/components";
import type { ExpertResultReviewView } from "../presentation";
import { ExpertResultReview } from "./expert-result-review";

type ResultState =
  | { readonly status: "loading" }
  | { readonly status: "denied" }
  | { readonly status: "ready"; readonly view: ExpertResultReviewView };

export function ExpertResultRuntimeClient({
  requestId,
  journeyId,
}: {
  readonly requestId: string;
  readonly journeyId?: string;
}) {
  const [state, setState] = useState<ResultState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const response = await fetch(`/api/expert-workbench/${requestId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "open_result",
          owner: {
            owner_type: "session",
            owner_id: getOrCreateBuyerSessionId(),
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        setState({ status: "denied" });
        return;
      }
      const payload = (await response.json()) as {
        readonly view?: ExpertResultReviewView;
      };
      if (!payload.view) {
        setState({ status: "denied" });
        return;
      }
      setState({ status: "ready", view: payload.view });
    };
    void load().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "denied" });
    });
    return () => controller.abort();
  }, [requestId]);

  if (state.status === "loading")
    return (
      <main className="expert-empty" role="status">
        <h1>Загружаем результат</h1>
        <p>Проверяем доступ текущей сессии к экспертной заявке.</p>
      </main>
    );
  if (state.status === "denied")
    return (
      <main className="expert-empty" role="alert">
        <h1>Результат недоступен</h1>
        <p>Проверка ещё не завершена либо заявка принадлежит другой сессии.</p>
      </main>
    );
  return (
    <>
      <ExpertResultReview view={state.view} />
      {journeyId ? (
        <PilotFeedbackForm journeyId={journeyId} stage="expert_result" />
      ) : null}
    </>
  );
}
