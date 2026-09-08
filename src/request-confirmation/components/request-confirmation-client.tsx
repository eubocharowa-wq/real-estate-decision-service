"use client";

import Link from "next/link";

import type { UserRequestParserResult } from "../../user-request-parser";
import { RequestConfirmation } from "./request-confirmation";
import {
  getBuyerJourneyId,
  getOrCreateBuyerSessionId,
} from "../../buyer-journey/browser-storage";
import {
  refreshJourneyState,
  useJourneyState,
} from "../../buyer-journey/journey-client";

interface RequestConfirmationClientProps {
  readonly initialResult?: UserRequestParserResult | null;
}

export function RequestConfirmationClient({
  initialResult,
}: RequestConfirmationClientProps) {
  const journey = useJourneyState({ enabled: initialResult === undefined });
  const state = (() => {
    if (initialResult === null) return { status: "missing" as const };
    if (initialResult)
      return { status: "ready" as const, result: initialResult };
    if (journey.status === "loading") return { status: "loading" as const };
    if (journey.status === "error") return { status: "invalid" as const };
    if (journey.status === "missing") return { status: "missing" as const };
    return journey.state.parsed_request
      ? { status: "ready" as const, result: journey.state.parsed_request }
      : { status: "missing" as const };
  })();

  if (state.status === "loading") {
    return (
      <main className="shortlist-loading" aria-busy="true" aria-live="polite">
        <div className="loading-orbit" aria-hidden="true" />
        <p className="eyebrow">Ваш запрос</p>
        <h1>Восстанавливаем разобранные условия…</h1>
        <p>Исходная формулировка сохранена на сервере без изменений.</p>
      </main>
    );
  }
  if (state.status === "missing") {
    return (
      <main className="empty-state">
        <p className="eyebrow">Запрос не найден</p>
        <h1>Сначала опишите, какую недвижимость вы ищете.</h1>
        <p>
          Мы сохраним исходный текст и покажем структурированные условия на этом
          экране.
        </p>
        <Link href="/selection" className="button button-primary">
          Вернуться к запросу
        </Link>
      </main>
    );
  }
  if (state.status === "invalid") {
    return (
      <main className="empty-state" role="alert">
        <p className="eyebrow">Не удалось проверить данные</p>
        <h1>Модель подтверждения повреждена или устарела.</h1>
        <p>Исходный запрос не изменён. Вернитесь и отправьте его ещё раз.</p>
        <Link href="/selection" className="button button-primary">
          Вернуться к запросу
        </Link>
      </main>
    );
  }
  return (
    <RequestConfirmation
      parserResult={state.result}
      onConfirmed={async (confirmationResult) => {
        const journeyId = getBuyerJourneyId();
        if (!journeyId)
          throw new Error(
            "Путь выбора не найден. Вернитесь к описанию задачи.",
          );
        const response = await fetch("/api/buyer-journeys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "confirm_and_match",
            journeyId,
            sessionId: getOrCreateBuyerSessionId(),
            confirmationResult,
          }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            typeof Reflect.get(payload, "message") === "string"
              ? String(Reflect.get(payload, "message"))
              : "Не удалось подготовить подбор.";
          throw new Error(message);
        }
        // The confirmed request now lives on the server; re-read it so the
        // next screen restores from the journey rather than from this render.
        await refreshJourneyState();
      }}
    />
  );
}
