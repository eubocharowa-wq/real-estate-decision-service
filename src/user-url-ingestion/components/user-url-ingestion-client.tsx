"use client";

import Link from "next/link";
import { useState } from "react";

import { requestConfirmationResultSchema } from "../../request-confirmation";
import { CONFIRMED_REQUEST_STORAGE_KEY } from "../../request-confirmation/storage";
import {
  addComparisonItem,
  comparisonSelectionMatchesRequest,
  createComparisonSelection,
  parseComparisonSelection,
  writeComparisonSelection,
} from "../../comparison/selection";
import type {
  ManualConfirmationFields,
  NormalizedUserUrlCandidate,
  UserUrlIngestionPreview,
} from "../types";
import { upsertStoredUserUrlCandidate } from "../storage";

type State =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly status: "preview";
      readonly preview: UserUrlIngestionPreview;
      readonly fields: ManualConfirmationFields;
    }
  | {
      readonly status: "saved";
      readonly candidate: NormalizedUserUrlCandidate;
      readonly notice: string;
    }
  | { readonly status: "error"; readonly message: string };

const responseObject = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  const value: unknown = await response.json();
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
};

export function UserUrlIngestionClient() {
  const [url, setUrl] = useState("https://fixture.example/listing/apartment");
  const [state, setState] = useState<State>({ status: "idle" });

  const preview = async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/user-url-ingestion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview", url }),
      });
      const payload = await responseObject(response);
      const result = payload.preview as UserUrlIngestionPreview | undefined;
      if (!result)
        throw new Error(
          String(payload.message ?? "Не удалось проверить ссылку."),
        );
      if (result.status === "failed") {
        setState({ status: "error", message: result.userMessage });
        return;
      }
      setState({
        status: "preview",
        preview: result,
        fields: result.editableFields,
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось проверить ссылку.",
      });
    }
  };

  const patchField = <K extends keyof ManualConfirmationFields>(
    key: K,
    value: ManualConfirmationFields[K],
  ) => {
    setState((current) =>
      current.status === "preview"
        ? { ...current, fields: { ...current.fields, [key]: value } }
        : current,
    );
  };

  const confirm = async () => {
    if (state.status !== "preview") return;
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/user-url-ingestion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          preview: state.preview,
          fields: state.fields,
        }),
      });
      const payload = await responseObject(response);
      if (!response.ok || payload.success !== true) {
        const error = payload.error as { message?: string } | undefined;
        throw new Error(error?.message ?? "Не удалось сохранить вариант.");
      }
      const candidate = payload.candidate as NormalizedUserUrlCandidate;
      upsertStoredUserUrlCandidate(candidate);
      const duplicateNotice =
        candidate.duplicateDecision.status === "same_property"
          ? "Похоже, этот объект уже есть в сервисе: выбран существующий Property, а ссылка сохранена как новое Offer. "
          : "";
      let notice = `${duplicateNotice}Вариант сохранён локально и готов для оценки.`;
      const requestRaw = window.sessionStorage.getItem(
        CONFIRMED_REQUEST_STORAGE_KEY,
      );
      if (requestRaw) {
        const confirmed = requestConfirmationResultSchema.safeParse(
          JSON.parse(requestRaw),
        );
        if (confirmed.success) {
          const existing = parseComparisonSelection(
            window.sessionStorage.getItem("reds.comparison-selection.v1"),
          );
          const selection =
            existing &&
            comparisonSelectionMatchesRequest(
              existing,
              confirmed.data.confirmed_request,
            )
              ? existing
              : createComparisonSelection(confirmed.data.confirmed_request);
          const added = addComparisonItem(selection, {
            propertyId: candidate.propertyCandidate.identity.property_id,
            offerId: candidate.offerCandidate.offer_id,
            scenarioId: null,
          });
          if (added.success) {
            writeComparisonSelection(added.state);
            notice = `${duplicateNotice}Вариант сохранён и добавлен в сравнение.`;
          } else
            notice = `${duplicateNotice}Вариант сохранён. ${added.message}`;
        }
      }
      setState({ status: "saved", candidate, notice });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить вариант.",
      });
    }
  };

  return (
    <main className="url-ingestion-shell">
      <header>
        <Link href="/" className="brand-mark">
          REDS <span> / 12</span>
        </Link>
        <p className="step-label">Добавить вариант</p>
        <h1>Объект по ссылке</h1>
        <p>
          Сначала проверяем источник и правила доступа, затем показываем
          извлечённые поля для ручного подтверждения.
        </p>
      </header>
      <section className="url-ingestion-panel" aria-labelledby="url-title">
        <h2 id="url-title">Ссылка на объявление</h2>
        <label>
          URL
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={state.status === "loading"}
          />
        </label>
        <p className="field-hint">
          Демо без сетевого доступа: fixture.example/listing/apartment,
          price-from, house, financing, partial или duplicate-new-offer.
        </p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void preview()}
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? "Проверяем…" : "Проверить ссылку"}
        </button>
      </section>
      {state.status === "error" ? (
        <aside className="url-ingestion-error" role="alert">
          <strong>Ссылка не обработана</strong>
          <p>{state.message}</p>
        </aside>
      ) : null}
      {state.status === "preview" ? (
        <section
          className="url-ingestion-panel"
          aria-labelledby="confirm-title"
        >
          <p className="eyebrow">
            Источник: {state.preview.sourceIdentification?.hostname}
          </p>
          <h2 id="confirm-title">Проверьте извлечённые данные</h2>
          <p className="claimed-notice">
            Это заявленные данные из объявления, а не подтверждённые факты.
            Исправления пользователя сохраняются как отдельное неподтверждённое
            evidence.
          </p>
          {state.preview.rawResult === null ? (
            <p className="claimed-notice">
              Автоматический доступ запрещён политикой источника. Заполните
              основные параметры вручную; они будут помечены как данные
              пользователя.
            </p>
          ) : null}
          <div className="url-fields-grid">
            <label>
              Название
              <input
                value={state.fields.title}
                onChange={(e) => patchField("title", e.target.value)}
              />
            </label>
            <label>
              Тип
              <select
                value={state.fields.propertyType}
                onChange={(e) =>
                  patchField(
                    "propertyType",
                    e.target.value as ManualConfirmationFields["propertyType"],
                  )
                }
              >
                <option value="apartment">Квартира</option>
                <option value="apartments">Апартаменты</option>
                <option value="house">Дом</option>
                <option value="townhouse">Таунхаус</option>
                <option value="land">Участок</option>
              </select>
            </label>
            <label>
              Город
              <input
                value={state.fields.city}
                onChange={(e) => patchField("city", e.target.value)}
              />
            </label>
            <label>
              Расположение
              <input
                value={state.fields.locationText}
                onChange={(e) => patchField("locationText", e.target.value)}
              />
            </label>
            <label>
              Цена, ₽
              <input
                inputMode="decimal"
                value={state.fields.priceAmount ?? ""}
                onChange={(e) =>
                  patchField("priceAmount", e.target.value || null)
                }
              />
            </label>
            <label>
              Комнаты
              <input
                type="number"
                value={state.fields.rooms ?? ""}
                onChange={(e) =>
                  patchField(
                    "rooms",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </label>
            <label>
              Площадь, м²
              <input
                type="number"
                step="0.1"
                value={state.fields.areaM2 ?? ""}
                onChange={(e) =>
                  patchField(
                    "areaM2",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </label>
            <label>
              Этаж
              <input
                type="number"
                value={state.fields.floor ?? ""}
                onChange={(e) =>
                  patchField(
                    "floor",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </label>
            <label>
              Доступность
              <select
                value={state.fields.availability}
                onChange={(e) =>
                  patchField(
                    "availability",
                    e.target.value as ManualConfirmationFields["availability"],
                  )
                }
              >
                <option value="available">Доступен</option>
                <option value="reserved">Зарезервирован</option>
                <option value="sold">Продан</option>
                <option value="temporarily_unavailable">
                  Временно недоступен
                </option>
                <option value="unknown">Неизвестно</option>
              </select>
            </label>
            <label>
              Продавец
              <input
                value={state.fields.sellerName}
                onChange={(e) => patchField("sellerName", e.target.value)}
              />
            </label>
            <label>
              Название источника
              <input
                value={state.fields.sourceName}
                onChange={(e) => patchField("sourceName", e.target.value)}
              />
            </label>
          </div>
          <label className="url-checkbox">
            <input
              type="checkbox"
              checked={state.fields.priceExplicitUnknown}
              onChange={(e) =>
                patchField("priceExplicitUnknown", e.target.checked)
              }
            />
            Цена явно неизвестна
          </label>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void confirm()}
          >
            Сохранить и добавить к сравнению
          </button>
        </section>
      ) : null}
      {state.status === "saved" ? (
        <section className="url-ingestion-success" role="status">
          <p className="eyebrow">Готово с оговорками</p>
          <h2>{state.notice}</h2>
          <p>
            Original URL сохранён в provenance. Match Score не зависит от
            extraction confidence; надёжность показана отдельно.
          </p>
          <div>
            <Link className="button button-primary" href="/comparison">
              Открыть сравнение
            </Link>
            <Link className="button button-secondary" href="/shortlist">
              Вернуться к подбору
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
