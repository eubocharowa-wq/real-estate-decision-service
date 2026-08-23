"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  ExpertCheckItemDraft,
  ExpertFindingDraft,
  ExpertResultDraft,
  ExpertWorkbenchInput,
} from "../contracts";
import {
  checkStatusLabels,
  choiceStatusLabels,
  expertRequestTypeLabels,
  findingCategoryLabels,
  findingSeverityLabels,
  nextActionLabels,
  priorityLabels,
  specialistTypeLabels,
  verificationEffectLabels,
  verificationMethodLabels,
  workflowStatusLabels,
} from "../labels";

export type ExpertWorkbenchAction =
  | { readonly type: "claim" }
  | {
      readonly type: "transition";
      readonly status:
        "in_progress" | "waiting_for_user" | "waiting_for_external_info";
      readonly reasonCode: string;
    }
  | { readonly type: "update_check"; readonly item: ExpertCheckItemDraft }
  | { readonly type: "add_finding"; readonly finding: ExpertFindingDraft }
  | { readonly type: "save_draft"; readonly draft: ExpertResultDraft }
  | { readonly type: "complete" };

interface ExpertWorkbenchProps {
  readonly input: ExpertWorkbenchInput;
  readonly onAction?: (action: ExpertWorkbenchAction) => void | Promise<void>;
}

const splitRefs = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const splitLines = (value: string): string[] =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const formatMoney = (
  value: { readonly amount: string; readonly currency: string } | null,
): string =>
  value
    ? `${new Intl.NumberFormat("ru-RU").format(Number(value.amount))} ${value.currency}`
    : "Не задан";

const priorityCriteria = (
  input: ExpertWorkbenchInput,
  priority: "must" | "preferred" | "avoid" | "exclude",
) =>
  input.contextPackage.user_request_summary.criteria.filter(
    (criterion) => criterion.priority === priority,
  );

export function ExpertWorkbench({ input, onAction }: ExpertWorkbenchProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(input.currentResultDraft);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [findingStatement, setFindingStatement] = useState("");
  const [findingCategory, setFindingCategory] =
    useState<ExpertFindingDraft["category"]>("fact");
  const [findingSeverity, setFindingSeverity] =
    useState<ExpertFindingDraft["severity"]>("info");
  const [findingEvidence, setFindingEvidence] = useState("");
  const [findingEntity, setFindingEntity] = useState(
    input.expertRequest.property_ids[0] ?? "",
  );
  const [findingField, setFindingField] = useState("");
  const [findingEffect, setFindingEffect] =
    useState<ExpertFindingDraft["verification_effect"]>("none");
  const [captureSection, setCaptureSection] = useState<
    "confirmed" | "not_confirmed" | "unknown" | "conflict" | "risk"
  >("confirmed");
  const [captureField, setCaptureField] = useState("");
  const [captureStatement, setCaptureStatement] = useState("");
  const [captureEvidence, setCaptureEvidence] = useState("");

  const dispatch = async (action: ExpertWorkbenchAction) => {
    setError(null);
    setSaved(false);
    try {
      if (onAction) await onAction(action);
      else {
        const response = await fetch(
          `/api/expert-workbench/${input.expertRequest.request_id}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(action),
          },
        );
        if (!response.ok) throw new Error("WORKBENCH_ACTION_REJECTED");
        if (action.type === "complete") {
          router.push(`/expert/results/${input.expertRequest.request_id}`);
        } else {
          router.refresh();
        }
      }
      setSaved(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Действие не выполнено.",
      );
    }
  };

  const updateCheck = (
    item: ExpertCheckItemDraft,
    patch: Partial<ExpertCheckItemDraft>,
  ) => {
    const updated = { ...item, ...patch };
    setDraft((current) => ({
      ...current,
      check_items: current.check_items.map((candidate) =>
        candidate.item_id === updated.item_id ? updated : candidate,
      ),
    }));
    void dispatch({ type: "update_check", item: updated });
  };

  const addFinding = () => {
    const statement = findingStatement.trim();
    if (!statement || !findingEntity) {
      setError("Опишите вывод и выберите связанную сущность.");
      return;
    }
    const evidenceRefs = splitRefs(findingEvidence);
    if (
      ["confirmed", "conflicting"].includes(findingEffect) &&
      evidenceRefs.length === 0
    ) {
      setError(
        "Подтверждающий или конфликтующий finding требует evidence ref.",
      );
      return;
    }
    const finding: ExpertFindingDraft = {
      finding_id: `finding_ui_${draft.findings.length + 1}`,
      category: findingCategory,
      severity: findingSeverity,
      statement,
      related_entity_ids: [findingEntity],
      related_field: findingField.trim() || null,
      evidence_refs: evidenceRefs,
      verification_effect: findingEffect,
      requires_technical_specialist:
        findingCategory === "property_condition" &&
        findingSeverity === "critical",
    };
    setDraft((current) => ({
      ...current,
      findings: [...current.findings, finding],
    }));
    setFindingStatement("");
    setFindingEvidence("");
    setFindingField("");
    setFindingEffect("none");
    void dispatch({ type: "add_finding", finding });
  };

  const addCapturedResult = () => {
    const field = captureField.trim();
    const statement = captureStatement.trim();
    const evidenceRefs = splitRefs(captureEvidence);
    if (!field || !statement) {
      setError("Для результата нужны поле и конкретная формулировка.");
      return;
    }
    if (
      (captureSection === "confirmed" || captureSection === "conflict") &&
      evidenceRefs.length === 0
    ) {
      setError("Подтверждение или расхождение требует evidence reference.");
      return;
    }
    const entityId = input.expertRequest.property_ids[0]!;
    const next: ExpertResultDraft = {
      ...draft,
      confirmed:
        captureSection === "confirmed"
          ? [
              ...draft.confirmed,
              {
                entity_id: entityId,
                field,
                value: statement,
                evidence_refs: evidenceRefs,
              },
            ]
          : draft.confirmed,
      unconfirmed:
        captureSection === "not_confirmed" || captureSection === "unknown"
          ? [
              ...draft.unconfirmed,
              {
                entity_id: entityId,
                field,
                outcome:
                  captureSection === "unknown"
                    ? "unable_to_verify"
                    : "unconfirmed",
                reason: statement,
                evidence_refs: evidenceRefs,
              },
            ]
          : draft.unconfirmed,
      conflicts:
        captureSection === "conflict"
          ? [
              ...draft.conflicts,
              {
                conflict_id: `conflict_expert_${draft.conflicts.length + 1}`,
                field,
                outcome: "remains_open",
                reason: statement,
                resolved_value: null,
                evidence_refs: evidenceRefs,
              },
            ]
          : draft.conflicts,
      risks:
        captureSection === "risk"
          ? [
              ...draft.risks,
              {
                category: "risk",
                severity: "attention",
                description: statement,
              },
            ]
          : draft.risks,
    };
    setDraft(next);
    setCaptureField("");
    setCaptureStatement("");
    setCaptureEvidence("");
    void dispatch({ type: "save_draft", draft: next });
  };

  const updateConflict = (
    conflictId: string,
    patch: Partial<ExpertResultDraft["conflicts"][number]>,
  ) =>
    setDraft((current) => ({
      ...current,
      conflicts: current.conflicts.map((conflict) =>
        conflict.conflict_id === conflictId
          ? { ...conflict, ...patch }
          : conflict,
      ),
    }));

  const context = input.contextPackage;
  const findingEntityIds = [
    ...input.expertRequest.property_ids,
    ...input.expertRequest.offer_ids,
    ...input.expertRequest.purchase_scenario_ids,
  ];
  const draftReady = draft.check_items.every(
    (item) =>
      item.status !== null &&
      (item.status === "not_required" || item.verification_method !== null) &&
      (!["checked_confirmed", "checked_conflicting"].includes(item.status) ||
        item.evidence_refs.length > 0),
  );
  const choiceReady =
    input.expertRequest.request_type !== "choice_assistance" ||
    (draft.choice_assistance !== null &&
      (draft.choice_assistance.status !== "clear" ||
        draft.choice_assistance.preferred_property_id !== null) &&
      (draft.choice_assistance.status !== "conditional" ||
        draft.choice_assistance.conditions.length > 0));
  const criteriaGroups = [
    ["Обязательно", priorityCriteria(input, "must")],
    ["Предпочтительно", priorityCriteria(input, "preferred")],
    [
      "Избегать / исключить",
      [
        ...priorityCriteria(input, "avoid"),
        ...priorityCriteria(input, "exclude"),
      ],
    ],
  ] as const;

  return (
    <main className="expert-workbench-shell">
      <header className="expert-workbench-header">
        <p className="eyebrow">Expert Workbench</p>
        <h1>{expertRequestTypeLabels[input.expertRequest.request_type]}</h1>
        <dl className="workbench-header-facts">
          <div>
            <dt>Приоритет</dt>
            <dd>{priorityLabels[input.expertRequest.priority]}</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>{workflowStatusLabels[input.expertRequest.status]}</dd>
          </div>
          <div>
            <dt>Специалист</dt>
            <dd>
              {specialistTypeLabels[input.expertRequest.required_specialist]}
            </dd>
          </div>
          <div>
            <dt>Создано</dt>
            <dd>
              {new Date(input.expertRequest.created_at).toLocaleString("ru-RU")}
            </dd>
          </div>
        </dl>
        <section
          className="workbench-user-question"
          aria-labelledby="user-question-title"
        >
          <h2 id="user-question-title">Вопрос пользователя</h2>
          <blockquote>{context.user_question}</blockquote>
        </section>
        <div className="workbench-status-actions">
          {input.expertRequest.status === "queued" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => void dispatch({ type: "claim" })}
            >
              Взять задачу
            </button>
          ) : null}
          {input.expertRequest.status === "assigned" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() =>
                void dispatch({
                  type: "transition",
                  status: "in_progress",
                  reasonCode: "EXPERT_STARTED_WORK",
                })
              }
            >
              Начать проверку
            </button>
          ) : null}
          {input.expertRequest.status === "in_progress" ? (
            <>
              <button
                className="button button-secondary"
                type="button"
                onClick={() =>
                  void dispatch({
                    type: "transition",
                    status: "waiting_for_user",
                    reasonCode: "EXPERT_REQUESTED_USER_INFO",
                  })
                }
              >
                Запросить данные у пользователя
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() =>
                  void dispatch({
                    type: "transition",
                    status: "waiting_for_external_info",
                    reasonCode: "EXPERT_WAITING_EXTERNAL_INFO",
                  })
                }
              >
                Ожидаем ответ источника
              </button>
            </>
          ) : null}
          {input.expertRequest.status === "waiting_for_user" ||
          input.expertRequest.status === "waiting_for_external_info" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() =>
                void dispatch({
                  type: "transition",
                  status: "in_progress",
                  reasonCode: "EXPERT_RECEIVED_REQUIRED_INFO",
                })
              }
            >
              Продолжить проверку
            </button>
          ) : null}
        </div>
      </header>

      {context.stale ? (
        <aside className="workbench-notice" role="status">
          После создания экспертной задачи данные по объекту изменились. Ниже
          показан сохранённый snapshot; автоматический refresh не запускался.
        </aside>
      ) : null}
      {error ? (
        <div className="workbench-error-summary" role="alert">
          <strong>Действие не выполнено</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {saved ? (
        <p role="status" className="workbench-saved">
          Изменение сохранено.
        </p>
      ) : null}

      <div className="expert-workbench-grid">
        <aside className="workbench-context" aria-labelledby="context-title">
          <h2 id="context-title">Контекст решения</h2>
          <p>{context.user_request_summary.intent}</p>
          {criteriaGroups.map(([label, criteria]) => (
            <section key={label}>
              <h3>{label}</h3>
              {criteria.length ? (
                <ul>
                  {criteria.map((criterion) => (
                    <li key={criterion.criterion_id}>
                      {criterion.user_expression ?? criterion.field}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Нет условий в этой группе.</p>
              )}
            </section>
          ))}
          {context.user_request_summary.financing_constraints ? (
            <section>
              <h3>Финансовые ограничения</h3>
              <dl>
                <div>
                  <dt>Первоначальный взнос</dt>
                  <dd>
                    {formatMoney(
                      context.user_request_summary.financing_constraints
                        .initial_payment_max,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Платёж</dt>
                  <dd>
                    {formatMoney(
                      context.user_request_summary.financing_constraints
                        .monthly_payment_max,
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
          {context.user_request_summary.material_timeline ? (
            <section>
              <h3>Сроки</h3>
              <p>
                Покупка:{" "}
                {context.user_request_summary.material_timeline.purchase_by ??
                  "не задано"}
                ; въезд:{" "}
                {context.user_request_summary.material_timeline.move_in_by ??
                  "не задано"}
                .
              </p>
            </section>
          ) : null}
          {context.properties.map((property) => {
            const match = context.match_results.find(
              (item) => item.property_id === property.property_id,
            );
            const quality = context.data_quality.find(
              (item) => item.property_id === property.property_id,
            );
            const offer = context.selected_offers.find(
              (item) => item.property_id === property.property_id,
            );
            const scenario = context.selected_purchase_scenarios.find(
              (item) => item.property_id === property.property_id,
            );
            return (
              <article
                key={property.property_id}
                className="workbench-property"
              >
                <h3>{property.location_label}</h3>
                <p>
                  {property.property_type} · {property.rooms ?? "?"} комн. ·{" "}
                  {property.total_area_m2 ?? "?"} м²
                </p>
                <dl>
                  <div>
                    <dt>Offer</dt>
                    <dd>
                      {offer
                        ? `${formatMoney(offer.listing_price)} · ${offer.availability}`
                        : "Не выбран"}
                    </dd>
                  </div>
                  <div>
                    <dt>PurchaseScenario</dt>
                    <dd>
                      {scenario
                        ? `${formatMoney(scenario.entry_cash)} / ${formatMoney(scenario.monthly_payment)}`
                        : "Не выбран"}
                    </dd>
                  </div>
                  <div>
                    <dt>Match Score</dt>
                    <dd>{match ? `${match.match_score}%` : "Не рассчитан"}</dd>
                  </div>
                  <div>
                    <dt>Data Confidence</dt>
                    <dd>
                      {quality
                        ? `${quality.data_confidence_score}% · ${quality.confidence_status}`
                        : "Не рассчитана"}
                    </dd>
                  </div>
                </dl>
                {match ? (
                  <>
                    <h4>Сильные стороны</h4>
                    <ul>
                      {match.strengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <h4>Компромиссы</h4>
                    <ul>
                      {match.compromises.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </article>
            );
          })}
          {context.choice_context ? (
            <section>
              <h3>Финалисты и trade-offs</h3>
              <p>
                {context.choice_context.finalist_property_ids.length} финалиста
              </p>
              <ul>
                {context.choice_context.trade_offs.map((item) => (
                  <li key={item.statement}>{item.statement}</li>
                ))}
              </ul>
              <h4>Decision drivers</h4>
              <ul>
                {context.choice_context.decision_drivers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h3>Критичные неизвестные</h3>
            {context.critical_unknowns.length ? (
              <ul>
                {context.critical_unknowns.map((item) => (
                  <li key={`${item.entity_id}:${item.field}`}>
                    {item.field}: {item.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Нет.</p>
            )}
          </section>
          <section>
            <h3>Расхождения</h3>
            {context.conflicts.length ? (
              <ul>
                {context.conflicts.map((item) => (
                  <li key={item.conflict_id}>
                    {item.field} · {item.severity}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Нет.</p>
            )}
          </section>
          <section>
            <h3>Рекомендуемые проверки</h3>
            {context.recommended_checks.length ? (
              <ul>
                {context.recommended_checks.map((item) => (
                  <li key={item.check_code}>{item.reason}</li>
                ))}
              </ul>
            ) : (
              <p>Нет.</p>
            )}
          </section>
          {context.document_refs.length > 0 ? (
            <section>
              <h3>Документы</h3>
              <ul>
                {context.document_refs.map((documentRef) => (
                  <li key={documentRef}>{documentRef}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {context.onsite_context ? (
            <section>
              <h3>Граница проверки на месте</h3>
              <p>{context.onsite_context.boundary_notice}</p>
              <ul>
                {context.onsite_context.items_to_check.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>

        <section
          className="workbench-editor"
          aria-labelledby="check-plan-title"
        >
          <h2 id="check-plan-title">Что нужно проверить</h2>
          <div className="workbench-check-list">
            {draft.check_items.map((item) => (
              <fieldset
                key={item.item_id}
                disabled={!input.canEdit}
                className="workbench-check-item"
              >
                <legend>{item.subject}</legend>
                <label>
                  Статус
                  <select
                    aria-label={`Статус: ${item.subject}`}
                    value={item.status ?? ""}
                    onChange={(event) =>
                      updateCheck(item, {
                        status: event.target.value
                          ? (event.target
                              .value as ExpertCheckItemDraft["status"])
                          : null,
                      })
                    }
                  >
                    <option value="">Выберите результат</option>
                    {Object.entries(checkStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Способ проверки
                  <select
                    aria-label={`Способ: ${item.subject}`}
                    value={item.verification_method ?? ""}
                    onChange={(event) =>
                      updateCheck(item, {
                        verification_method: event.target.value
                          ? (event.target
                              .value as ExpertCheckItemDraft["verification_method"])
                          : null,
                      })
                    }
                  >
                    <option value="">Выберите способ</option>
                    {Object.entries(verificationMethodLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Evidence refs
                  <input
                    aria-label={`Evidence: ${item.subject}`}
                    value={item.evidence_refs.join(", ")}
                    onChange={(event) =>
                      updateCheck(item, {
                        evidence_refs: splitRefs(event.target.value),
                      })
                    }
                    placeholder="Существующие refs через запятую"
                  />
                </label>
                <label>
                  Заметка специалиста
                  <textarea
                    aria-label={`Заметка: ${item.subject}`}
                    value={item.note ?? ""}
                    onChange={(event) =>
                      updateCheck(item, {
                        note: event.target.value.trim() || null,
                      })
                    }
                    rows={2}
                  />
                </label>
              </fieldset>
            ))}
          </div>

          <section
            className="workbench-capture"
            aria-labelledby="capture-title"
          >
            <h2 id="capture-title">Структурированный результат</h2>
            <label>
              Раздел
              <select
                disabled={!input.canEdit}
                value={captureSection}
                onChange={(event) =>
                  setCaptureSection(event.target.value as typeof captureSection)
                }
              >
                <option value="confirmed">Что подтвердилось</option>
                <option value="not_confirmed">Что не подтвердилось</option>
                <option value="unknown">Что осталось неизвестным</option>
                <option value="conflict">Какие расхождения остались</option>
                <option value="risk">Риски</option>
              </select>
            </label>
            <label>
              Связанное поле
              <input
                disabled={!input.canEdit}
                value={captureField}
                onChange={(event) => setCaptureField(event.target.value)}
              />
            </label>
            <label>
              Формулировка
              <textarea
                disabled={!input.canEdit}
                value={captureStatement}
                onChange={(event) => setCaptureStatement(event.target.value)}
                rows={3}
              />
            </label>
            <label>
              Evidence refs
              <input
                disabled={!input.canEdit}
                value={captureEvidence}
                onChange={(event) => setCaptureEvidence(event.target.value)}
              />
            </label>
            <button
              className="button button-secondary"
              type="button"
              disabled={!input.canEdit}
              onClick={addCapturedResult}
            >
              Добавить в результат
            </button>
            <div className="workbench-draft-groups" aria-live="polite">
              <section>
                <h3>Что подтвердилось</h3>
                <ul>
                  {draft.confirmed.map((item) => (
                    <li key={`${item.entity_id}:${item.field}`}>
                      {item.field}: {String(item.value)}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Что не подтвердилось</h3>
                <ul>
                  {draft.unconfirmed
                    .filter((item) => item.outcome === "unconfirmed")
                    .map((item) => (
                      <li key={`${item.entity_id}:${item.field}`}>
                        {item.field}: {item.reason}
                      </li>
                    ))}
                </ul>
              </section>
              <section>
                <h3>Что осталось неизвестным</h3>
                <ul>
                  {draft.unconfirmed
                    .filter((item) => item.outcome === "unable_to_verify")
                    .map((item) => (
                      <li key={`${item.entity_id}:${item.field}`}>
                        {item.field}: {item.reason}
                      </li>
                    ))}
                </ul>
              </section>
              <section>
                <h3>Какие расхождения остались</h3>
                {draft.conflicts.map((item) => (
                  <fieldset
                    key={item.conflict_id}
                    disabled={!input.canEdit}
                    className="workbench-conflict-item"
                  >
                    <legend>{item.field}</legend>
                    <label>
                      Outcome
                      <select
                        aria-label={`Outcome расхождения: ${item.field}`}
                        value={item.outcome}
                        onChange={(event) =>
                          updateConflict(item.conflict_id, {
                            outcome: event.target
                              .value as ExpertResultDraft["conflicts"][number]["outcome"],
                            resolved_value:
                              event.target.value === "remains_open"
                                ? null
                                : item.resolved_value,
                          })
                        }
                      >
                        <option value="remains_open">
                          Расхождение осталось
                        </option>
                        <option value="resolution_requested">
                          Передать подтверждённое разрешение
                        </option>
                      </select>
                    </label>
                    <label>
                      Обоснование
                      <textarea
                        value={item.reason}
                        onChange={(event) =>
                          updateConflict(item.conflict_id, {
                            reason: event.target.value,
                          })
                        }
                        rows={2}
                      />
                    </label>
                    {item.outcome === "resolution_requested" ? (
                      <label>
                        Подтверждённое значение
                        <input
                          value={
                            item.resolved_value === null
                              ? ""
                              : String(item.resolved_value)
                          }
                          onChange={(event) =>
                            updateConflict(item.conflict_id, {
                              resolved_value: event.target.value || null,
                            })
                          }
                        />
                      </label>
                    ) : null}
                    <label>
                      Evidence refs
                      <input
                        value={item.evidence_refs.join(", ")}
                        onChange={(event) =>
                          updateConflict(item.conflict_id, {
                            evidence_refs: splitRefs(event.target.value),
                          })
                        }
                      />
                    </label>
                  </fieldset>
                ))}
              </section>
              <section>
                <h3>Риски</h3>
                <ul>
                  {draft.risks.map((item, index) => (
                    <li key={`${item.category}:${index}`}>
                      {findingSeverityLabels[item.severity]}: {item.description}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </section>

          <section
            className="workbench-findings"
            aria-labelledby="finding-title"
          >
            <h2 id="finding-title">Finding</h2>
            <label>
              Категория
              <select
                disabled={!input.canEdit}
                value={findingCategory}
                onChange={(event) =>
                  setFindingCategory(
                    event.target.value as typeof findingCategory,
                  )
                }
              >
                {Object.entries(findingCategoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Важность
              <select
                disabled={!input.canEdit}
                value={findingSeverity}
                onChange={(event) =>
                  setFindingSeverity(
                    event.target.value as typeof findingSeverity,
                  )
                }
              >
                {Object.entries(findingSeverityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Связанная сущность
              <select
                disabled={!input.canEdit}
                value={findingEntity}
                onChange={(event) => setFindingEntity(event.target.value)}
              >
                {findingEntityIds.map((entityId) => (
                  <option key={entityId} value={entityId}>
                    {entityId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Связанное поле finding
              <input
                disabled={!input.canEdit}
                value={findingField}
                onChange={(event) => setFindingField(event.target.value)}
              />
            </label>
            <label>
              Влияние на verification status
              <select
                disabled={!input.canEdit}
                value={findingEffect}
                onChange={(event) =>
                  setFindingEffect(
                    event.target
                      .value as ExpertFindingDraft["verification_effect"],
                  )
                }
              >
                {Object.entries(verificationEffectLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Конкретный вывод
              <textarea
                disabled={!input.canEdit}
                value={findingStatement}
                onChange={(event) => setFindingStatement(event.target.value)}
                rows={3}
              />
            </label>
            <label>
              Evidence refs
              <input
                disabled={!input.canEdit}
                value={findingEvidence}
                onChange={(event) => setFindingEvidence(event.target.value)}
              />
            </label>
            <button
              className="button button-secondary"
              type="button"
              disabled={!input.canEdit}
              onClick={addFinding}
            >
              Добавить finding
            </button>
            <ul>
              {draft.findings.map((finding) => (
                <li key={finding.finding_id}>
                  <strong>{findingSeverityLabels[finding.severity]}</strong> ·{" "}
                  {finding.statement}
                </li>
              ))}
            </ul>
          </section>

          {input.expertRequest.request_type === "choice_assistance" ? (
            <section className="workbench-choice-capture">
              <h2>Вывод по финалистам</h2>
              <label>
                Результат сравнения
                <select
                  disabled={!input.canEdit}
                  value={draft.choice_assistance?.status ?? ""}
                  onChange={(event) => {
                    const rawStatus = event.target.value;
                    if (!rawStatus) {
                      setDraft((current) => ({
                        ...current,
                        choice_assistance: null,
                      }));
                      return;
                    }
                    const status = rawStatus as NonNullable<
                      ExpertResultDraft["choice_assistance"]
                    >["status"];
                    setDraft((current) => ({
                      ...current,
                      choice_assistance: {
                        status,
                        preferred_property_id:
                          status === "near_tie" ||
                          status === "insufficient_data" ||
                          status === "no_valid_option"
                            ? null
                            : (current.choice_assistance
                                ?.preferred_property_id ?? null),
                        conditions: current.choice_assistance?.conditions ?? [],
                        unresolved_questions:
                          current.choice_assistance?.unresolved_questions ?? [],
                      },
                    }));
                  }}
                >
                  <option value="">Выберите вывод</option>
                  {Object.entries(choiceStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ведущий вариант, если он есть
                <select
                  value={draft.choice_assistance?.preferred_property_id ?? ""}
                  disabled={
                    !input.canEdit ||
                    !draft.choice_assistance ||
                    [
                      "near_tie",
                      "insufficient_data",
                      "no_valid_option",
                    ].includes(draft.choice_assistance.status)
                  }
                  onChange={(event) =>
                    setDraft((current) =>
                      current.choice_assistance
                        ? {
                            ...current,
                            choice_assistance: {
                              ...current.choice_assistance,
                              preferred_property_id: event.target.value || null,
                            },
                          }
                        : current,
                    )
                  }
                >
                  <option value="">Не выбран</option>
                  {context.choice_context?.finalist_property_ids.map(
                    (propertyId) => (
                      <option key={propertyId} value={propertyId}>
                        {propertyId}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Условия выбора, по одному в строке
                <textarea
                  disabled={!input.canEdit || !draft.choice_assistance}
                  value={draft.choice_assistance?.conditions.join("\n") ?? ""}
                  onChange={(event) =>
                    setDraft((current) =>
                      current.choice_assistance
                        ? {
                            ...current,
                            choice_assistance: {
                              ...current.choice_assistance,
                              conditions: splitLines(event.target.value),
                            },
                          }
                        : current,
                    )
                  }
                  rows={3}
                />
              </label>
              <label>
                Неразрешённые вопросы, по одному в строке
                <textarea
                  disabled={!input.canEdit || !draft.choice_assistance}
                  value={
                    draft.choice_assistance?.unresolved_questions.join("\n") ??
                    ""
                  }
                  onChange={(event) =>
                    setDraft((current) =>
                      current.choice_assistance
                        ? {
                            ...current,
                            choice_assistance: {
                              ...current.choice_assistance,
                              unresolved_questions: splitLines(
                                event.target.value,
                              ),
                            },
                          }
                        : current,
                    )
                  }
                  rows={3}
                />
              </label>
            </section>
          ) : null}

          <section className="workbench-recommendation">
            <h2>Рекомендация и next actions</h2>
            <label>
              Рекомендация
              <textarea
                disabled={!input.canEdit}
                value={draft.recommendation?.statement ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recommendation: event.target.value.trim()
                      ? {
                          statement: event.target.value,
                          conditions: current.recommendation?.conditions ?? [],
                          related_property_ids:
                            input.expertRequest.property_ids,
                        }
                      : null,
                  }))
                }
                rows={3}
              />
            </label>
            <label>
              Следующее действие
              <select
                disabled={!input.canEdit}
                value={draft.next_actions[0] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    next_actions: event.target.value
                      ? [
                          event.target
                            .value as ExpertResultDraft["next_actions"][number],
                        ]
                      : [],
                  }))
                }
              >
                <option value="">Не выбрано</option>
                {Object.entries(nextActionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Причина невозможности завершить
              <textarea
                disabled={!input.canEdit}
                value={draft.unable_to_complete_reason ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    unable_to_complete_reason:
                      event.target.value.trim() || null,
                  }))
                }
                rows={2}
              />
            </label>
            <button
              className="button button-secondary"
              type="button"
              disabled={!input.canEdit}
              onClick={() => void dispatch({ type: "save_draft", draft })}
            >
              Сохранить черновик
            </button>
          </section>

          <section className="workbench-completion">
            <h2>Завершение</h2>
            <p>
              Match Score вручную не редактируется. Completion вызывает
              существующие evidence, canonical и recompute hooks.
            </p>
            <button
              className="button button-primary"
              type="button"
              disabled={!input.canComplete || !draftReady || !choiceReady}
              onClick={() => void dispatch({ type: "complete" })}
            >
              Завершить проверку
            </button>
          </section>
        </section>
      </div>

      <section className="workbench-audit" aria-labelledby="audit-title">
        <h2 id="audit-title">Активность</h2>
        <ol>
          {input.auditEvents.map((event) => (
            <li key={event.event_id}>
              <time>{new Date(event.created_at).toLocaleString("ru-RU")}</time>
              <span>{event.event_type}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
