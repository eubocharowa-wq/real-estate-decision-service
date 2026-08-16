"use client";

import { useState } from "react";
import Link from "next/link";

import type { UserRequestParserResult } from "../../user-request-parser";
import type { RequestConfirmationResult } from "../contracts";
import {
  addCriterion,
  answerClarification,
  canConfirmRequest,
  changeCriterionPriority,
  confirmRequest,
  createConfirmationSession,
  editCriterionValue,
  removeCriterion,
} from "../state";
import {
  CONFIRMED_REQUEST_STORAGE_KEY,
  RAW_REQUEST_STORAGE_KEY,
} from "../storage";
import { AddCriterion } from "./add-criterion";
import { ClarificationCard } from "./clarification-card";
import { ConfirmationActions } from "./confirmation-actions";
import { ContradictionAlert } from "./contradiction-alert";
import { CriteriaGroup } from "./criteria-group";
import { RequestSummary } from "./request-summary";
import { UnknownsSection } from "./unknowns-section";

interface RequestConfirmationProps {
  readonly parserResult: UserRequestParserResult;
  readonly onConfirmed?: (result: RequestConfirmationResult) => void;
}

export function RequestConfirmation({
  parserResult,
  onConfirmed,
}: RequestConfirmationProps) {
  const [session, setSession] = useState(() =>
    createConfirmationSession(parserResult),
  );
  const lowConfidence =
    session.initial_result.interpretation_confidence.band === "low";
  const required = session.criteria.filter(
    (criterion) =>
      criterion.priority === "must" || criterion.priority === "exclude",
  );
  const preferred = session.criteria.filter(
    (criterion) =>
      criterion.priority === "preferred" || criterion.priority === "avoid",
  );
  const flexible = session.criteria.filter(
    (criterion) =>
      criterion.priority === "neutral" || criterion.priority === "unknown",
  );

  const handleConfirm = () => {
    const updated = confirmRequest(session);
    setSession(updated);
    if (updated.confirmation_result) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          CONFIRMED_REQUEST_STORAGE_KEY,
          JSON.stringify(updated.confirmation_result),
        );
      }
      onConfirmed?.(updated.confirmation_result);
    }
  };

  if (session.status === "confirmed" && session.confirmation_result) {
    return (
      <main
        className="confirmation-shell confirmation-success"
        data-testid="confirmation-success"
      >
        <div className="success-mark" aria-hidden="true">
          ✓
        </div>
        <p className="eyebrow">Условия сохранены</p>
        <h1>Запрос подтверждён</h1>
        <p>
          Структурированный запрос прошёл проверку. Теперь можно открыть
          короткий список вариантов с объяснениями и оценкой данных.
        </p>
        <dl className="success-facts">
          <div>
            <dt>Изменений</dt>
            <dd>{session.confirmation_result.user_changes.length}</dd>
          </div>
          <div>
            <dt>Неопределённостей</dt>
            <dd>
              {
                session.confirmation_result.unresolved_nonblocking_unknowns
                  .length
              }
            </dd>
          </div>
        </dl>
        <div className="primary-actions">
          <Link href="/shortlist" className="button button-primary">
            Открыть подбор
          </Link>
          <Link href="/" className="button button-secondary">
            Вернуться к запросу
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="confirmation-shell">
      <header className="confirmation-hero">
        <Link href="/" className="brand-mark" aria-label="На главную">
          REDS <span> / 04</span>
        </Link>
        <p className="step-label">Шаг 2 · Подтверждение</p>
        <h1>Проверьте, правильно ли мы вас поняли</h1>
        <p className="hero-lead">
          Вы можете изменить любое условие перед подбором.
        </p>
      </header>

      <RequestSummary session={session} />

      <div className="confirmation-content">
        <CriteriaGroup
          id="required-criteria"
          title="Обязательно"
          description="Нарушение этих условий исключает вариант из подбора."
          criteria={required}
          lowConfidence={lowConfidence}
          errors={session.validation_errors}
          onEdit={(id, value) =>
            setSession((current) => editCriterionValue(current, id, value))
          }
          onPriorityChange={(id, priority) =>
            setSession((current) =>
              changeCriterionPriority(current, id, priority),
            )
          }
          onRemove={(id) =>
            setSession((current) => removeCriterion(current, id))
          }
        />
        <CriteriaGroup
          id="preferred-criteria"
          title="Желательно"
          description="Эти условия помогают выбрать лучшее, но допускают компромисс."
          criteria={preferred}
          lowConfidence={lowConfidence}
          errors={session.validation_errors}
          onEdit={(id, value) =>
            setSession((current) => editCriterionValue(current, id, value))
          }
          onPriorityChange={(id, priority) =>
            setSession((current) =>
              changeCriterionPriority(current, id, priority),
            )
          }
          onRemove={(id) =>
            setSession((current) => removeCriterion(current, id))
          }
        />
        <CriteriaGroup
          id="flexible-criteria"
          title="Можно гибко"
          description="Параметры сохранены, но не ограничивают выбор жёстко."
          criteria={flexible}
          lowConfidence={lowConfidence}
          errors={session.validation_errors}
          onEdit={(id, value) =>
            setSession((current) => editCriterionValue(current, id, value))
          }
          onPriorityChange={(id, priority) =>
            setSession((current) =>
              changeCriterionPriority(current, id, priority),
            )
          }
          onRemove={(id) =>
            setSession((current) => removeCriterion(current, id))
          }
        />

        <UnknownsSection unknowns={session.unknowns} />
        <ContradictionAlert contradictions={session.contradictions} />

        {session.clarifications.length > 0 ? (
          <section
            className="clarifications-section"
            aria-labelledby="clarifications-title"
          >
            <div className="section-heading">
              <div>
                <p className="section-index">01–03</p>
                <h2 id="clarifications-title">Короткие уточнения</h2>
              </div>
              <p>Только вопросы, которые заметно влияют на результат.</p>
            </div>
            <div className="clarification-list">
              {session.clarifications.map((clarification) => (
                <ClarificationCard
                  key={clarification.clarification_id}
                  clarification={clarification}
                  onAnswer={(answer) =>
                    setSession((current) =>
                      answerClarification(
                        current,
                        clarification.clarification_id,
                        answer,
                      ),
                    )
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        <AddCriterion
          existingFields={session.criteria.map((criterion) => criterion.field)}
          onAdd={(field, value, priority) =>
            setSession((current) =>
              addCriterion(current, field, value, priority),
            )
          }
        />
      </div>

      {session.transition_error ? (
        <p className="transition-error" role="alert">
          {session.transition_error}
        </p>
      ) : null}

      <ConfirmationActions
        disabled={!canConfirmRequest(session)}
        errors={session.validation_errors}
        onConfirm={handleConfirm}
        onEditOriginal={() => {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(
              RAW_REQUEST_STORAGE_KEY,
              session.initial_result.raw_text,
            );
          }
        }}
      />
    </main>
  );
}
