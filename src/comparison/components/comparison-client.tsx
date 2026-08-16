"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { requestConfirmationResultSchema } from "../../request-confirmation";
import { CONFIRMED_REQUEST_STORAGE_KEY } from "../../request-confirmation/storage";
import {
  addComparisonItem,
  comparisonSelectionMatchesRequest,
  createComparisonSelection,
  getComparisonSelectionSnapshot,
  parseComparisonSelection,
  removeComparisonItem,
  subscribeComparisonSelection,
  writeComparisonSelection,
} from "../selection";
import type { ComparisonSelectionItem } from "../selection";
import type { ComparisonView } from "../types";
import { ComparisonPageView } from "./comparison-page-view";

interface ComparisonClientProps {
  readonly initialView?: ComparisonView | null;
  readonly requestedItem?: ComparisonSelectionItem | null;
}

type RemoteState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly view: ComparisonView };

const selectionSignature = (
  items: readonly ComparisonSelectionItem[],
): string =>
  items
    .map(
      (item) =>
        `${item.propertyId}:${item.offerId ?? ""}:${item.scenarioId ?? ""}`,
    )
    .join("|");

const isComparisonView = (value: unknown): value is ComparisonView =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray(Reflect.get(value, "columns")) &&
  Array.isArray(Reflect.get(value, "sections")) &&
  typeof Reflect.get(value, "selectionSignature") === "string";

function ComparisonGuard({
  title,
  message,
  stale = false,
}: {
  readonly title: string;
  readonly message: string;
  readonly stale?: boolean;
}) {
  return (
    <main className="empty-state" role={stale ? "alert" : undefined}>
      <p className="eyebrow">Сравнение финалистов</p>
      <h1>{title}</h1>
      <p>{message}</p>
      <Link className="button button-primary" href="/shortlist">
        Вернуться к подбору
      </Link>
    </main>
  );
}

export function ComparisonSelectionState({ count }: { readonly count: 0 | 1 }) {
  return count === 0 ? (
    <ComparisonGuard
      title="Выберите минимум два варианта для сравнения."
      message="Добавьте в сравнение от 2 до 4 объектов из короткого списка."
    />
  ) : (
    <ComparisonGuard
      title="Добавьте ещё один вариант для сравнения."
      message="Один объект уже выбран. Для сравнения нужен как минимум ещё один финалист."
    />
  );
}

export function ComparisonClient({
  initialView,
  requestedItem = null,
}: ComparisonClientProps) {
  const storedRequest = useSyncExternalStore(
    () => () => undefined,
    () => window.sessionStorage.getItem(CONFIRMED_REQUEST_STORAGE_KEY),
    () => null,
  );
  const storedSelection = useSyncExternalStore(
    subscribeComparisonSelection,
    getComparisonSelectionSnapshot,
    () => null,
  );
  const confirmation = useMemo(() => {
    if (!storedRequest) return null;
    try {
      const parsed = requestConfirmationResultSchema.safeParse(
        JSON.parse(storedRequest),
      );
      return parsed.success ? parsed.data.confirmed_request : null;
    } catch {
      return null;
    }
  }, [storedRequest]);
  const selection = useMemo(
    () => parseComparisonSelection(storedSelection),
    [storedSelection],
  );
  const [remote, setRemote] = useState<RemoteState>(() =>
    initialView
      ? { status: "ready", view: initialView }
      : { status: "loading" },
  );

  useEffect(() => {
    if (!requestedItem || !confirmation) return;
    const current =
      selection && comparisonSelectionMatchesRequest(selection, confirmation)
        ? selection
        : createComparisonSelection(confirmation);
    const outcome = addComparisonItem(current, requestedItem);
    if (outcome.success) writeComparisonSelection(outcome.state);
  }, [confirmation, requestedItem, selection]);

  useEffect(() => {
    if (initialView !== undefined || !confirmation || !selection) return;
    if (
      !comparisonSelectionMatchesRequest(selection, confirmation) ||
      selection.items.length < 2
    )
      return;
    const controller = new AbortController();
    void fetch("/api/comparison", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userRequest: confirmation, selection }),
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
              : "Не удалось подготовить сравнение.";
          throw new Error(message);
        }
        const view =
          typeof payload === "object" && payload !== null
            ? Reflect.get(payload, "view")
            : null;
        if (!isComparisonView(view))
          throw new Error("Сервер вернул неполную модель сравнения.");
        setRemote({ status: "ready", view });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setRemote({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Не удалось подготовить сравнение.",
          });
      });
    return () => controller.abort();
  }, [confirmation, initialView, selection]);

  const handleRemove = useCallback(
    (propertyId: string) => {
      if (!selection) return;
      const outcome = removeComparisonItem(selection, propertyId);
      if (outcome.success) writeComparisonSelection(outcome.state);
    },
    [selection],
  );

  if (initialView === null)
    return (
      <ComparisonGuard
        title="Сравнение не найдено"
        message="Вернитесь к подбору и выберите от 2 до 4 вариантов."
      />
    );
  if (initialView !== undefined && remote.status === "ready")
    return <ComparisonPageView view={remote.view} onRemove={handleRemove} />;
  if (!confirmation)
    return (
      <ComparisonGuard
        title="Сначала подтвердите условия"
        message="Без одного подтверждённого UserRequest нельзя корректно сравнить Match Score."
      />
    );
  if (selection && !comparisonSelectionMatchesRequest(selection, confirmation))
    return (
      <ComparisonGuard
        stale
        title="Условия изменились — пересчитайте сравнение."
        message="Сохранённые оценки относятся к другой версии запроса и поэтому не показаны."
      />
    );
  if (!selection || selection.items.length === 0)
    return <ComparisonSelectionState count={0} />;
  if (selection.items.length === 1)
    return <ComparisonSelectionState count={1} />;
  if (remote.status === "error")
    return (
      <ComparisonGuard
        title="Не удалось подготовить сравнение"
        message={remote.message}
      />
    );
  if (
    remote.status === "ready" &&
    remote.view.selectionSignature === selectionSignature(selection.items)
  )
    return <ComparisonPageView view={remote.view} onRemove={handleRemove} />;
  return (
    <main className="shortlist-loading" aria-busy="true" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true" />
      <p className="eyebrow">Сравниваем финалистов</p>
      <h1>Готовим таблицу решения…</h1>
      <p>Сопоставляем готовые результаты по одному запросу.</p>
    </main>
  );
}
