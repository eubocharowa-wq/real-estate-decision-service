"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

import {
  userRequestParserResultSchema,
  type UserRequestParserResult,
} from "../../user-request-parser";
import { PARSER_RESULT_STORAGE_KEY } from "../storage";
import { RequestConfirmation } from "./request-confirmation";
import {
  getBuyerJourneyId,
  getOrCreateBuyerSessionId,
} from "../../buyer-journey/browser-storage";

interface RequestConfirmationClientProps {
  readonly initialResult?: UserRequestParserResult | null;
}

export function RequestConfirmationClient({
  initialResult,
}: RequestConfirmationClientProps) {
  const stored = useSyncExternalStore(
    () => () => undefined,
    () => window.sessionStorage.getItem(PARSER_RESULT_STORAGE_KEY),
    () => null,
  );
  const state = (() => {
    if (initialResult === null) return { status: "missing" as const };
    if (initialResult)
      return { status: "ready" as const, result: initialResult };
    if (!stored) return { status: "missing" as const };
    try {
      const parsed: unknown = JSON.parse(stored);
      const validated = userRequestParserResultSchema.safeParse(parsed);
      return validated.success
        ? { status: "ready" as const, result: validated.data }
        : { status: "invalid" as const };
    } catch {
      return { status: "invalid" as const };
    }
  })();

  if (state.status === "missing") {
    return (
      <main className="empty-state">
        <p className="eyebrow">Запрос не найден</p>
        <h1>Сначала опишите, какую недвижимость вы ищете.</h1>
        <p>
          Мы сохраним исходный текст и покажем структурированные условия на этом
          экране.
        </p>
        <Link href="/" className="button button-primary">
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
        <Link href="/" className="button button-primary">
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
      }}
    />
  );
}
