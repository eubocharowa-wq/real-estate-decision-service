"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { requestConfirmationResultSchema } from "../../request-confirmation";
import { CONFIRMED_REQUEST_STORAGE_KEY } from "../../request-confirmation/storage";
import type { PropertyDetailView } from "../types";
import {
  PropertyDetailNotFound,
  PropertyDetailPageView,
} from "./property-detail-page-view";

interface PropertyDetailClientProps {
  readonly propertyId: string;
  readonly offerId?: string | null;
  readonly scenarioId?: string | null;
  readonly returnToComparison?: boolean;
  readonly initialView?: PropertyDetailView | null;
}

type RemoteState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly view: PropertyDetailView };

const isPropertyDetailView = (value: unknown): value is PropertyDetailView =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "propertyId") === "string" &&
  typeof Reflect.get(value, "identity") === "object" &&
  Array.isArray(Reflect.get(value, "facts"));

export function PropertyDetailClient({
  propertyId,
  offerId = null,
  scenarioId = null,
  returnToComparison = false,
  initialView,
}: PropertyDetailClientProps) {
  const stored = useSyncExternalStore(
    () => () => undefined,
    () => window.sessionStorage.getItem(CONFIRMED_REQUEST_STORAGE_KEY),
    () => null,
  );
  const confirmation = useMemo(() => {
    if (!stored) return { request: null, notice: null } as const;
    try {
      const parsed = requestConfirmationResultSchema.safeParse(
        JSON.parse(stored),
      );
      return parsed.success
        ? { request: parsed.data.confirmed_request, notice: null }
        : {
            request: null,
            notice:
              "Сохранённый запрос повреждён или устарел. Показаны только факты об объекте.",
          };
    } catch {
      return {
        request: null,
        notice:
          "Сохранённый запрос повреждён или устарел. Показаны только факты об объекте.",
      };
    }
  }, [stored]);
  const [remote, setRemote] = useState<RemoteState>(() =>
    initialView
      ? { status: "ready", view: initialView }
      : initialView === null
        ? { status: "error", message: "Объект не найден" }
        : { status: "loading" },
  );

  useEffect(() => {
    if (initialView !== undefined) return;
    const controller = new AbortController();
    void fetch("/api/property-detail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        propertyId,
        offerId,
        scenarioId,
        userRequest: confirmation.request,
        contextNotice: confirmation.notice,
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
              : "Не удалось загрузить объект.";
          throw new Error(message);
        }
        const view =
          typeof payload === "object" && payload !== null
            ? Reflect.get(payload, "view")
            : undefined;
        if (!isPropertyDetailView(view))
          throw new Error("Сервер вернул неполную модель объекта.");
        setRemote({ status: "ready", view });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRemote({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Не удалось загрузить объект.",
        });
      });
    return () => controller.abort();
  }, [
    confirmation.notice,
    confirmation.request,
    initialView,
    offerId,
    propertyId,
    scenarioId,
  ]);

  if (remote.status === "loading") {
    return (
      <main className="shortlist-loading" aria-busy="true" aria-live="polite">
        <div className="loading-orbit" aria-hidden="true" />
        <p className="eyebrow">Страница объекта</p>
        <h1>Загружаем данные объекта…</h1>
        <p>Подготавливаем уже собранные факты и результаты проверки.</p>
      </main>
    );
  }
  if (remote.status === "error")
    return <PropertyDetailNotFound message={remote.message} />;
  return (
    <PropertyDetailPageView
      view={remote.view}
      backHrefOverride={returnToComparison ? "/comparison" : null}
    />
  );
}
