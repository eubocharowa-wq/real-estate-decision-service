"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { requestConfirmationResultSchema } from "../../request-confirmation";
import { CONFIRMED_REQUEST_STORAGE_KEY } from "../../request-confirmation/storage";
import type { ShortlistView } from "../types";
import { ShortlistPageView } from "./shortlist-page-view";

interface ShortlistClientProps {
  readonly initialView?: ShortlistView | null;
}

type RemoteState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly view: ShortlistView };

type StoredConfirmationState =
  | { readonly status: "missing" }
  | { readonly status: "invalid" }
  | {
      readonly status: "ready";
      readonly request: ReturnType<
        typeof requestConfirmationResultSchema.parse
      >["confirmed_request"];
    };

const isShortlistView = (value: unknown): value is ShortlistView => {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "heading") === "string" &&
    Array.isArray(Reflect.get(value, "cards")) &&
    Array.isArray(Reflect.get(value, "requestSummary"))
  );
};

function GuardState({
  state,
}: {
  readonly state:
    | Extract<StoredConfirmationState, { status: "missing" | "invalid" }>
    | Extract<RemoteState, { status: "error" }>;
}) {
  const invalid = state.status === "invalid";
  const failed = state.status === "error";
  return (
    <main
      className="empty-state"
      role={invalid || failed ? "alert" : undefined}
    >
      <p className="eyebrow">
        {failed
          ? "Подбор временно недоступен"
          : invalid
            ? "Не удалось проверить запрос"
            : "Запрос не найден"}
      </p>
      <h1>
        {failed
          ? "Не удалось подготовить короткий список."
          : invalid
            ? "Подтверждённый запрос повреждён или устарел."
            : "Сначала опишите и подтвердите условия поиска."}
      </h1>
      <p>
        {state.status === "error"
          ? state.message
          : "Вернитесь к запросу: мы не будем подставлять условия или оценки по умолчанию."}
      </p>
      <Link href="/" className="button button-primary">
        Вернуться к запросу
      </Link>
    </main>
  );
}

export function ShortlistClient({ initialView }: ShortlistClientProps) {
  const stored = useSyncExternalStore(
    () => () => undefined,
    () => window.sessionStorage.getItem(CONFIRMED_REQUEST_STORAGE_KEY),
    () => null,
  );
  const [remote, setRemote] = useState<RemoteState>(() =>
    initialView
      ? { status: "ready", view: initialView }
      : initialView === null
        ? { status: "loading" }
        : { status: "loading" },
  );
  const confirmationState = useMemo<StoredConfirmationState>(() => {
    if (!stored) return { status: "missing" };
    let confirmation: unknown;
    try {
      confirmation = JSON.parse(stored);
    } catch {
      return { status: "invalid" };
    }
    const parsed = requestConfirmationResultSchema.safeParse(confirmation);
    return parsed.success
      ? { status: "ready", request: parsed.data.confirmed_request }
      : { status: "invalid" };
  }, [stored]);

  useEffect(() => {
    if (initialView !== undefined) return;
    if (confirmationState.status !== "ready") return;

    const controller = new AbortController();
    void fetch("/api/shortlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userRequest: confirmationState.request,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            typeof Reflect.get(payload, "message") === "string"
              ? String(Reflect.get(payload, "message"))
              : "Попробуйте открыть подбор ещё раз.";
          throw new Error(message);
        }
        const view =
          typeof payload === "object" && payload !== null
            ? Reflect.get(payload, "view")
            : undefined;
        if (!isShortlistView(view)) {
          setRemote({
            status: "error",
            message: "Сервер вернул неполную модель короткого списка.",
          });
          return;
        }
        setRemote({ status: "ready", view });
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setRemote({
          status: "error",
          message:
            fetchError instanceof Error
              ? fetchError.message
              : "Попробуйте открыть подбор ещё раз.",
        });
      });
    return () => controller.abort();
  }, [confirmationState, initialView]);

  if (initialView === null) {
    return <GuardState state={{ status: "missing" }} />;
  }
  if (initialView === undefined && confirmationState.status !== "ready") {
    return <GuardState state={confirmationState} />;
  }
  if (
    initialView === undefined &&
    confirmationState.status === "ready" &&
    remote.status === "ready" &&
    remote.view.requestId !== confirmationState.request.user_request_id
  ) {
    return (
      <main className="shortlist-loading" aria-busy="true" aria-live="polite">
        <div className="loading-orbit" aria-hidden="true" />
        <p className="eyebrow">Формируем короткий список</p>
        <h1>Подбираем варианты под ваши условия…</h1>
        <p>Сопоставляем готовые результаты и качество данных.</p>
      </main>
    );
  }

  if (remote.status === "loading") {
    return (
      <main className="shortlist-loading" aria-busy="true" aria-live="polite">
        <div className="loading-orbit" aria-hidden="true" />
        <p className="eyebrow">Формируем короткий список</p>
        <h1>Подбираем варианты под ваши условия…</h1>
        <p>Сопоставляем готовые результаты и качество данных.</p>
      </main>
    );
  }
  if (remote.status !== "ready") return <GuardState state={remote} />;
  return <ShortlistPageView view={remote.view} />;
}
