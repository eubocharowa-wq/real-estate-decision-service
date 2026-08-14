"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

import {
  userRequestParserResultSchema,
  type UserRequestParserResult,
} from "../../user-request-parser";
import { PARSER_RESULT_STORAGE_KEY } from "../storage";
import { RequestConfirmation } from "./request-confirmation";

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
  return <RequestConfirmation parserResult={state.result} />;
}
