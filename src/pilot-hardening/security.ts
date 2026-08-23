export interface SecretScanFinding {
  readonly file: string;
  readonly kind: string;
}

const secretPatterns: readonly {
  readonly kind: string;
  readonly pattern: RegExp;
}[] = [
  {
    kind: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
  { kind: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/u },
  { kind: "openai_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/u },
  { kind: "aws_access_key", pattern: /\bAKIA[A-Z0-9]{16}\b/u },
  { kind: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/iu },
];

export const scanTextForPotentialSecrets = (
  files: Readonly<Record<string, string>>,
): readonly SecretScanFinding[] =>
  Object.entries(files).flatMap(([file, content]) =>
    secretPatterns.flatMap(({ kind, pattern }) =>
      pattern.test(content) ? [{ file, kind }] : [],
    ),
  );

export const PILOT_URL_FETCH_SECURITY_BOUNDARY_V1 = Object.freeze({
  redirect_limit_required: true,
  dns_and_private_network_check_required: true,
  response_size_limit_required: true,
  content_type_allowlist_required: true,
  timeout_required: true,
  openclaw_may_not_override: true,
});

export interface UrlFetchBoundaryInput {
  readonly initialUrl: string;
  readonly redirectUrls: readonly string[];
  readonly resolvedAddresses: readonly string[];
  readonly responseBytes: number;
  readonly contentType: string | null;
  readonly durationMs: number;
}

export interface UrlFetchBoundaryDecision {
  readonly allowed: boolean;
  readonly reason_codes: readonly (
    | "URL_NOT_ALLOWED"
    | "REDIRECT_LIMIT_EXCEEDED"
    | "PRIVATE_NETWORK_BLOCKED"
    | "RESPONSE_TOO_LARGE"
    | "CONTENT_TYPE_NOT_ALLOWED"
    | "TIMEOUT"
  )[];
}

/**
 * Pure pre/post-fetch guard. A future collector must call it after every DNS
 * resolution and redirect; neither an adapter nor OpenClaw may skip it.
 */
export const validateUrlFetchBoundary = (
  input: UrlFetchBoundaryInput,
): UrlFetchBoundaryDecision => {
  const reasons: UrlFetchBoundaryDecision["reason_codes"][number][] = [];
  const urls = [input.initialUrl, ...input.redirectUrls];
  if (input.redirectUrls.length > USER_URL_INGESTION_POLICY_V1.maximumRedirects)
    reasons.push("REDIRECT_LIMIT_EXCEEDED");
  if (urls.some((url) => !validateUserUrl(url).success))
    reasons.push("URL_NOT_ALLOWED");
  if (input.resolvedAddresses.some(isBlockedNetworkHostname))
    reasons.push("PRIVATE_NETWORK_BLOCKED");
  if (input.responseBytes > USER_URL_INGESTION_POLICY_V1.maximumResponseBytes)
    reasons.push("RESPONSE_TOO_LARGE");
  const contentType = input.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    !contentType ||
    !USER_URL_INGESTION_POLICY_V1.allowedContentTypes.includes(
      contentType as (typeof USER_URL_INGESTION_POLICY_V1.allowedContentTypes)[number],
    )
  )
    reasons.push("CONTENT_TYPE_NOT_ALLOWED");
  if (input.durationMs > USER_URL_INGESTION_POLICY_V1.requestTimeoutMs)
    reasons.push("TIMEOUT");
  return { allowed: reasons.length === 0, reason_codes: [...new Set(reasons)] };
};
import {
  USER_URL_INGESTION_POLICY_V1,
  isBlockedNetworkHostname,
  validateUserUrl,
} from "../user-url-ingestion";
