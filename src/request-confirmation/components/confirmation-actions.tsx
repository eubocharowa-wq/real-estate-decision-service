import Link from "next/link";

import type { ConfirmationValidationError } from "../state";

interface ConfirmationActionsProps {
  readonly disabled: boolean;
  readonly errors: readonly ConfirmationValidationError[];
  readonly onConfirm: () => void;
  readonly onEditOriginal: () => void;
}

export function ConfirmationActions({
  disabled,
  errors,
  onConfirm,
  onEditOriginal,
}: ConfirmationActionsProps) {
  return (
    <section
      className="confirmation-actions"
      aria-labelledby="confirmation-actions-title"
    >
      <div>
        <p className="eyebrow">Перед подбором</p>
        <h2 id="confirmation-actions-title">Подтвердите условия</h2>
        <p>
          После подтверждения исходный текст останется сохранён отдельно от
          исправленного запроса.
        </p>
      </div>
      {errors.length > 0 ? (
        <div className="validation-summary" role="alert" aria-live="polite">
          <p>Пока нужно исправить:</p>
          <ul>
            {[...new Set(errors.map((error) => error.message))].map(
              (message) => (
                <li key={message}>{message}</li>
              ),
            )}
          </ul>
        </div>
      ) : null}
      <div className="primary-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={disabled}
          onClick={onConfirm}
        >
          Подтвердить и подобрать варианты
        </button>
        <Link className="button button-ghost" href="/" onClick={onEditOriginal}>
          Изменить исходный запрос
        </Link>
      </div>
    </section>
  );
}
