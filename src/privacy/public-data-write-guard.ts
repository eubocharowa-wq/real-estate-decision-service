export const PUBLIC_DATA_WRITE_DISABLED = "PUBLIC_DATA_WRITE_DISABLED";

export const publicDataWriteOperationValues = [
  "buyer_journey",
  "expert_request",
  "expert_workbench",
] as const;

export type PublicDataWriteOperation =
  (typeof publicDataWriteOperationValues)[number];

type Environment = Readonly<Record<string, string | undefined>>;

export type PublicDataWriteAccessDecision =
  | {
      readonly allowed: true;
      readonly mode: "synthetic_test" | "trusted_pilot" | "approved_public";
    }
  | {
      readonly allowed: false;
      readonly reason:
        | "disabled"
        | "invalid_mode"
        | "public_approval_missing"
        | "trusted_pilot_context_incomplete";
    };

const configuredMode = (environment: Environment): string | null => {
  const value = environment.REDS_PUBLIC_DATA_WRITE_MODE?.trim();
  return value ? value : null;
};

/**
 * Server-only policy. Nothing from Request (headers, cookies, body or query)
 * is accepted here, so a caller cannot manufacture permission.
 *
 * Vitest's NODE_ENV=test is the deliberately narrow synthetic seam. An
 * explicit `disabled` still wins, which lets route tests prove the real denial
 * boundary without reaching a repository.
 */
export const evaluatePublicDataWriteAccess = (
  _operation: PublicDataWriteOperation,
  environment: Environment = process.env,
): PublicDataWriteAccessDecision => {
  const mode = configuredMode(environment);

  if (mode === null && environment.NODE_ENV === "test")
    return { allowed: true, mode: "synthetic_test" };

  if (mode === null || mode === "disabled")
    return { allowed: false, reason: "disabled" };

  if (mode === "synthetic_test")
    return environment.NODE_ENV === "test"
      ? { allowed: true, mode: "synthetic_test" }
      : { allowed: false, reason: "invalid_mode" };

  if (mode === "approved_public")
    return environment.REDS_PUBLIC_DATA_PROCESSING_APPROVAL_REF?.trim()
      ? { allowed: true, mode: "approved_public" }
      : { allowed: false, reason: "public_approval_missing" };

  if (mode === "trusted_pilot") {
    const trustedContext =
      environment.VERCEL === "1" &&
      environment.VERCEL_ENV === "preview" &&
      environment.REDS_APPLICATION_MODE === "pilot" &&
      environment.REDS_TRUSTED_DEPLOYMENT_ACCESS === "vercel_sso";
    return trustedContext
      ? { allowed: true, mode: "trusted_pilot" }
      : { allowed: false, reason: "trusted_pilot_context_incomplete" };
  }

  return { allowed: false, reason: "invalid_mode" };
};

export const publicDataWriteDeniedResponse = (): Response =>
  Response.json(
    {
      error: PUBLIC_DATA_WRITE_DISABLED,
      title: "Приём новых данных временно закрыт",
      message:
        "Сейчас отправка новых данных недоступна. Введённые данные не были сохранены.",
      recovery: { label: "Вернуться на главную", href: "/" },
    },
    {
      status: 503,
      headers: { "cache-control": "no-store" },
    },
  );

export const requirePublicDataWriteAccess = (
  operation: PublicDataWriteOperation,
): Response | null =>
  evaluatePublicDataWriteAccess(operation).allowed
    ? null
    : publicDataWriteDeniedResponse();
