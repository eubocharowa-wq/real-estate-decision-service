import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { USER_URL_INGESTION_POLICY_V1 } from "../../src/user-url-ingestion/policy";
import { validateUserUrl } from "../../src/user-url-ingestion/url-validation";
import {
  PILOT_URL_FETCH_SECURITY_BOUNDARY_V1,
  scanTextForPotentialSecrets,
  validateUrlFetchBoundary,
} from "../../src/pilot-hardening";

describe("pilot security regressions", () => {
  it.each([
    "http://127.0.0.1/private",
    "http://10.0.0.1/private",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/private",
    "http://service.internal/private",
  ])("blocks private-network user URL %s", (url) => {
    expect(validateUserUrl(url)).toMatchObject({
      success: false,
      error: { code: "PRIVATE_NETWORK_BLOCKED" },
    });
  });

  it("retains redirect, size, content-type, timeout and DNS requirements", () => {
    expect(USER_URL_INGESTION_POLICY_V1.maximumRedirects).toBeGreaterThan(0);
    expect(USER_URL_INGESTION_POLICY_V1.maximumResponseBytes).toBeGreaterThan(
      0,
    );
    expect(USER_URL_INGESTION_POLICY_V1.requestTimeoutMs).toBeGreaterThan(0);
    expect(USER_URL_INGESTION_POLICY_V1.allowedContentTypes).toContain(
      "text/html",
    );
    expect(PILOT_URL_FETCH_SECURITY_BOUNDARY_V1).toEqual({
      redirect_limit_required: true,
      dns_and_private_network_check_required: true,
      response_size_limit_required: true,
      content_type_allowlist_required: true,
      timeout_required: true,
      openclaw_may_not_override: true,
    });
    const denied = validateUrlFetchBoundary({
      initialUrl: "https://public.example/property/1",
      redirectUrls: [
        "https://public.example/property/2",
        "https://public.example/property/3",
        "https://public.example/property/4",
        "http://127.0.0.1/private",
      ],
      resolvedAddresses: ["93.184.216.34", "10.0.0.8"],
      responseBytes: USER_URL_INGESTION_POLICY_V1.maximumResponseBytes + 1,
      contentType: "application/octet-stream",
      durationMs: USER_URL_INGESTION_POLICY_V1.requestTimeoutMs + 1,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason_codes).toEqual(
      expect.arrayContaining([
        "URL_NOT_ALLOWED",
        "REDIRECT_LIMIT_EXCEEDED",
        "PRIVATE_NETWORK_BLOCKED",
        "RESPONSE_TOO_LARGE",
        "CONTENT_TYPE_NOT_ALLOWED",
        "TIMEOUT",
      ]),
    );
  });

  it("does not contain secret-shaped values in config and pilot fixtures", () => {
    const files = Object.fromEntries(
      [
        ".env.example",
        ".github/workflows/ci.yml",
        "src/data-collection/source-registry/config/pilot.ts",
        "tests/pilot/modes-readiness-openclaw.test.ts",
      ].map((file) => [
        file,
        readFileSync(path.resolve(process.cwd(), file), "utf8"),
      ]),
    );
    expect(scanTextForPotentialSecrets(files)).toEqual([]);
  });

  it("opens source links safely and never embeds source HTML", () => {
    const component = readFileSync(
      path.resolve(
        process.cwd(),
        "src/property-detail/components/property-detail-page-view.tsx",
      ),
      "utf8",
    );
    expect(component).toContain('target="_blank"');
    expect(component).toContain('rel="noopener noreferrer"');
    expect(component).not.toContain("dangerouslySetInnerHTML");
  });
});
