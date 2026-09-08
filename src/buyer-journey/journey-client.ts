"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  comparisonSelectionSchema,
  type ComparisonSelection,
} from "../comparison/selection";
import {
  getBuyerJourneyId,
  getOrCreateBuyerSessionId,
} from "./browser-storage";
import type { JourneyClientState } from "./contracts";

/**
 * The browser keeps two identifiers and nothing else.
 *
 * Everything a screen needs — the confirmed request, the parser result, the
 * comparison selection, the candidates the buyer added, the owner the expert
 * layer bills the request to — is read back from the server with the journey
 * id. That is what makes a closed tab survivable: the tab held the key, not
 * the state.
 */
export type JourneyStateSnapshot =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly state: JourneyClientState };

const LOADING: JourneyStateSnapshot = { status: "loading" };
const MISSING: JourneyStateSnapshot = { status: "missing" };

let snapshot: JourneyStateSnapshot = LOADING;
let pending: Promise<JourneyStateSnapshot> | null = null;
const listeners = new Set<() => void>();

const publish = (next: JourneyStateSnapshot): JourneyStateSnapshot => {
  snapshot = next;
  for (const listener of listeners) listener();
  return next;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const readSnapshot = (): JourneyStateSnapshot => snapshot;
const readServerSnapshot = (): JourneyStateSnapshot => LOADING;

const messageOf = (payload: unknown, fallback: string): string =>
  typeof payload === "object" &&
  payload !== null &&
  typeof Reflect.get(payload, "message") === "string"
    ? String(Reflect.get(payload, "message"))
    : fallback;

const isJourneyClientState = (value: unknown): value is JourneyClientState =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "journey_id") === "string" &&
  typeof Reflect.get(value, "session_id") === "string" &&
  typeof Reflect.get(value, "owner_id") === "string" &&
  typeof Reflect.get(value, "raw_request_text") === "string" &&
  typeof Reflect.get(value, "current_stage") === "string" &&
  Array.isArray(Reflect.get(value, "imported_candidates"));

const postJourneyAction = async (
  body: Readonly<Record<string, unknown>>,
  fallbackMessage: string,
): Promise<unknown> => {
  const response = await fetch("/api/buyer-journeys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(messageOf(payload, fallbackMessage));
  return payload;
};

const fetchJourneyState = async (): Promise<JourneyStateSnapshot> => {
  const journeyId = getBuyerJourneyId();
  if (!journeyId) return publish(MISSING);
  try {
    const payload = await postJourneyAction(
      {
        action: "journey_state",
        journeyId,
        sessionId: getOrCreateBuyerSessionId(),
      },
      "Не удалось восстановить путь выбора.",
    );
    const state =
      typeof payload === "object" && payload !== null
        ? Reflect.get(payload, "state")
        : null;
    if (!isJourneyClientState(state))
      return publish({
        status: "error",
        message: "Сервер вернул неполное состояние пути выбора.",
      });
    return publish({ status: "ready", state });
  } catch (error) {
    return publish({
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Не удалось восстановить путь выбора.",
    });
  }
};

const track = async (
  request: Promise<JourneyStateSnapshot>,
): Promise<JourneyStateSnapshot> => {
  pending = request;
  try {
    return await request;
  } finally {
    if (pending === request) pending = null;
  }
};

/** Loads the journey once; concurrent callers share the same request. */
export const ensureJourneyState = async (): Promise<JourneyStateSnapshot> => {
  if (snapshot.status === "ready") return snapshot;
  return pending ?? track(fetchJourneyState());
};

/**
 * Re-reads the journey after a write that changed it on the server. Always a
 * fresh request: joining a read that started before the write would return the
 * state the write replaced.
 */
export const refreshJourneyState = async (): Promise<JourneyStateSnapshot> =>
  track(fetchJourneyState());

export const resetJourneyStateForTests = (): void => {
  pending = null;
  publish(LOADING);
};

/**
 * Persists the shortlist selection.
 *
 * The screen reacts immediately and the server is told afterwards; a rejected
 * write puts the previous selection back rather than leaving the buyer looking
 * at a choice that was never stored.
 */
export const saveComparisonSelection = async (
  selection: ComparisonSelection | null,
): Promise<void> => {
  const journeyId = getBuyerJourneyId();
  if (!journeyId)
    throw new Error("Путь выбора не найден. Вернитесь к описанию задачи.");
  const previous = snapshot;
  if (previous.status === "ready")
    publish({
      status: "ready",
      state: { ...previous.state, comparison_selection: selection },
    });
  try {
    const payload = await postJourneyAction(
      {
        action: "comparison_selection",
        journeyId,
        sessionId: getOrCreateBuyerSessionId(),
        selection,
      },
      "Не удалось сохранить выбор для сравнения.",
    );
    const saved =
      typeof payload === "object" && payload !== null
        ? Reflect.get(payload, "selection")
        : null;
    const parsed = comparisonSelectionSchema.safeParse(saved);
    if (snapshot.status === "ready")
      publish({
        status: "ready",
        state: {
          ...snapshot.state,
          comparison_selection: parsed.success ? parsed.data : null,
        },
      });
  } catch (error) {
    publish(previous);
    throw error;
  }
};

/**
 * The journey id, the one key the browser still holds.
 *
 * Screens that were handed a server-rendered view need it for feedback and
 * follow-up calls without restoring anything else.
 */
export const useBuyerJourneyId = (): string | null =>
  useSyncExternalStore(
    () => () => undefined,
    () => getBuyerJourneyId(),
    () => null,
  );

/**
 * Subscribes a screen to the restored journey.
 *
 * `enabled` is false where a screen was handed a server-rendered view and has
 * nothing to restore, so those screens issue no request at all.
 */
export const useJourneyState = (
  options: { readonly enabled?: boolean } = {},
): JourneyStateSnapshot => {
  const enabled = options.enabled ?? true;
  const value = useSyncExternalStore(
    subscribe,
    readSnapshot,
    readServerSnapshot,
  );
  useEffect(() => {
    if (enabled) void ensureJourneyState();
  }, [enabled]);
  return enabled ? value : LOADING;
};
