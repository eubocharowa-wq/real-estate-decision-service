"use client";

import { useEffect, useState } from "react";

import type { PropertyDetailView } from "../types";
import {
  PropertyDetailNotFound,
  PropertyDetailPageView,
} from "./property-detail-page-view";
import { getOrCreateBuyerSessionId } from "../../buyer-journey/browser-storage";
import { useJourneyState } from "../../buyer-journey/journey-client";

interface PropertyDetailClientProps {
  readonly propertyId: string;
  readonly offerId?: string | null;
  readonly scenarioId?: string | null;
  readonly returnToComparison?: boolean;
  readonly initialView?: PropertyDetailView | null;
}

type RemoteState =
  | { readonly status: "loading" }
  | {
      readonly status: "error";
      readonly title: string;
      readonly description: string;
    }
  | { readonly status: "ready"; readonly view: PropertyDetailView };

const LOAD_ERROR_TITLE = "Не удалось загрузить объект";
const LOAD_ERROR_DESCRIPTION =
  "Попробуйте ещё раз или вернитесь к ранее подобранным вариантам.";

const responseText = (
  payload: unknown,
  field: "title" | "message",
  fallback: string,
): string => {
  if (typeof payload !== "object" || payload === null) return fallback;
  const value = Reflect.get(payload, field);
  return typeof value === "string" && value.trim() ? value : fallback;
};

const isPropertyDetailView = (value: unknown): value is PropertyDetailView =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "propertyId") === "string" &&
  typeof Reflect.get(value, "identity") === "object" &&
  Array.isArray(Reflect.get(value, "facts"));

function PropertyDetailLoading() {
  return (
    <main className="shortlist-loading" aria-busy="true" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true" />
      <p className="eyebrow">Страница объекта</p>
      <h1>Загружаем данные объекта…</h1>
      <p>Подготавливаем уже собранные факты и результаты проверки.</p>
    </main>
  );
}

export function PropertyDetailClient({
  propertyId,
  offerId = null,
  scenarioId = null,
  returnToComparison = false,
  initialView,
}: PropertyDetailClientProps) {
  const journey = useJourneyState({ enabled: initialView === undefined });
  const journeyId =
    journey.status === "ready" ? journey.state.journey_id : null;
  const [remote, setRemote] = useState<RemoteState>(() =>
    initialView
      ? { status: "ready", view: initialView }
      : initialView === null
        ? {
            status: "error",
            title: "Объект не найден",
            description:
              "Проверьте ссылку или вернитесь к ранее подобранным вариантам.",
          }
        : { status: "loading" },
  );

  useEffect(() => {
    if (initialView !== undefined) return;
    const controller = new AbortController();
    if (!journeyId) return;
    void fetch("/api/buyer-journeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "open_property",
        journeyId,
        sessionId: getOrCreateBuyerSessionId(),
        propertyId,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const title = responseText(payload, "title", LOAD_ERROR_TITLE);
          const description = responseText(
            payload,
            "message",
            LOAD_ERROR_DESCRIPTION,
          );
          setRemote({ status: "error", title, description });
          return;
        }
        const view =
          typeof payload === "object" && payload !== null
            ? Reflect.get(payload, "view")
            : undefined;
        if (!isPropertyDetailView(view))
          throw new Error("Сервер вернул неполную модель объекта.");
        setRemote({ status: "ready", view });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRemote({
          status: "error",
          title: LOAD_ERROR_TITLE,
          description: LOAD_ERROR_DESCRIPTION,
        });
      });
    return () => controller.abort();
  }, [initialView, journeyId, offerId, propertyId, scenarioId]);

  // The journey is still being restored: keep the loading screen rather than
  // telling the buyer their object is not part of any selection.
  if (initialView === undefined && journey.status === "loading")
    return <PropertyDetailLoading />;
  if (initialView === undefined && !journeyId)
    return (
      <PropertyDetailNotFound title="Сначала опишите задачу и откройте объект из текущего подбора." />
    );

  if (remote.status === "loading") {
    return <PropertyDetailLoading />;
  }
  if (remote.status === "error")
    return (
      <PropertyDetailNotFound
        title={remote.title}
        description={remote.description}
      />
    );
  return (
    <PropertyDetailPageView
      view={remote.view}
      backHrefOverride={returnToComparison ? "/comparison" : null}
    />
  );
}
