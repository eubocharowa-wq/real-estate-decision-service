import { describe, expect, it } from "vitest";

import {
  connectionStringProtocol,
  diagnoseMigrationFailure,
  formatProductionDbCheckFailure,
  formatProductionDbCheckStatus,
  queryParameterNames,
} from "../../src/persistence";

/**
 * A realistic connection string carrying secrets a real pg/Node error would
 * routinely embed in its message or properties — deliberately distinctive
 * so a leak is easy to spot.
 */
const SECRET_HOST = "my-secret-host.example.com";
const SECRET_USER = "secretuser";
const SECRET_PASSWORD = "SuperSecretPass123";
const SECRET_DATABASE = "secretdb";
const CONNECTION_STRING = `postgres://${SECRET_USER}:${SECRET_PASSWORD}@${SECRET_HOST}:5432/${SECRET_DATABASE}?sslmode=require&connect_timeout=5`;

const errorWith = (
  message: string,
  extra: Record<string, unknown> = {},
): Error => Object.assign(new Error(message), extra);

describe("formatProductionDbCheckFailure", () => {
  const assertNoSecrets = (lines: readonly string[]): void => {
    const output = lines.join("\n");
    expect(output).not.toContain(SECRET_HOST);
    expect(output).not.toContain(SECRET_USER);
    expect(output).not.toContain(SECRET_PASSWORD);
    expect(output).not.toContain(SECRET_DATABASE);
  };

  const cases: ReadonlyArray<[string, Error]> = [
    [
      "INVALID_CONFIG",
      errorWith(
        `INVALID_DATABASE_CONFIG: connectionString: DATABASE_URL must be a postgres:// or postgresql:// URL (got ${CONNECTION_STRING})`,
        { invalidFields: ["connectionString", "maxConnections"] },
      ),
    ],
    [
      "DNS",
      errorWith(`getaddrinfo ENOTFOUND ${SECRET_HOST}`, { code: "ENOTFOUND" }),
    ],
    [
      "CONNECTION",
      errorWith(`connect ECONNREFUSED ${SECRET_HOST}:5432`, {
        code: "ECONNREFUSED",
      }),
    ],
    [
      "TLS",
      errorWith(`unable to verify the first certificate for ${SECRET_HOST}`, {
        code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      }),
    ],
    [
      "AUTH",
      errorWith(`password authentication failed for user "${SECRET_USER}"`, {
        code: "28P01",
      }),
    ],
    [
      "DATABASE_MISSING",
      errorWith(`database "${SECRET_DATABASE}" does not exist`, {
        code: "3D000",
      }),
    ],
    [
      "UNKNOWN",
      errorWith(`unexpected backend state for ${SECRET_USER}@${SECRET_HOST}`, {
        code: "XX000",
      }),
    ],
  ];

  it.each(cases)(
    "category %s never prints the connection secrets",
    (_label, error) => {
      const diagnosis = diagnoseMigrationFailure(error);
      const queryParams = queryParameterNames(CONNECTION_STRING);
      const lines = formatProductionDbCheckFailure(
        diagnosis,
        "REDS_DATABASE_URL",
        queryParams,
        connectionStringProtocol(CONNECTION_STRING),
      );
      assertNoSecrets(lines);
      expect(lines.join("\n")).toContain("REDS_DATABASE_URL");
      expect(lines.join("\n")).toContain("sslmode, connect_timeout");
    },
  );

  it("names every invalid field for INVALID_CONFIG, with the env var and (for connectionString) only the protocol", () => {
    const diagnosis = diagnoseMigrationFailure(
      errorWith(`INVALID_DATABASE_CONFIG: x`, {
        invalidFields: ["connectionString", "maxConnections"],
      }),
    );
    const lines = formatProductionDbCheckFailure(
      diagnosis,
      "REDS_DATABASE_URL",
      [],
      connectionStringProtocol(CONNECTION_STRING),
    );
    expect(lines).toContain(
      "production-db-check: invalid field: connectionString (env: REDS_DATABASE_URL, protocol: postgres:)",
    );
    expect(lines).toContain(
      "production-db-check: invalid field: maxConnections (env: DATABASE_POOL_MAX)",
    );
  });

  it("reports only the error code for UNKNOWN", () => {
    const diagnosis = diagnoseMigrationFailure(
      errorWith("unexpected backend state", { code: "XX000" }),
    );
    const lines = formatProductionDbCheckFailure(
      diagnosis,
      "REDS_DATABASE_URL",
      [],
    );
    expect(lines).toContain("production-db-check: error code: XX000");
  });

  it("never mentions applying a migration or aborting a build — this is read-only", () => {
    const diagnosis = diagnoseMigrationFailure(
      errorWith("connect ECONNREFUSED", { code: "ECONNREFUSED" }),
    );
    const lines = formatProductionDbCheckFailure(
      diagnosis,
      "REDS_DATABASE_URL",
      [],
    ).join("\n");
    expect(lines).not.toMatch(/migration|build/i);
  });
});

describe("formatProductionDbCheckStatus", () => {
  it("reports an up-to-date schema", () => {
    const lines = formatProductionDbCheckStatus({
      reachable: true,
      schemaCompatible: true,
      expectedMigrationCount: 6,
      appliedMigrationCount: 6,
      pendingVersions: [],
      unexpectedVersions: [],
      mismatchedVersions: [],
    });
    expect(lines).toEqual([
      "production-db-check: reachable=true",
      "production-db-check: schema_compatible=true",
      "production-db-check: expected_migrations=6",
      "production-db-check: applied_migrations=6",
      "production-db-check: pending_versions=none",
      "production-db-check: unexpected_versions=none",
      "production-db-check: mismatched_versions=none",
    ]);
  });

  it("names pending, unexpected and mismatched versions when present", () => {
    const lines = formatProductionDbCheckStatus({
      reachable: true,
      schemaCompatible: false,
      expectedMigrationCount: 6,
      appliedMigrationCount: 4,
      pendingVersions: ["0005", "0006"],
      unexpectedVersions: ["0099"],
      mismatchedVersions: ["0003"],
    });
    expect(lines).toContain("production-db-check: pending_versions=0005, 0006");
    expect(lines).toContain("production-db-check: unexpected_versions=0099");
    expect(lines).toContain("production-db-check: mismatched_versions=0003");
  });
});
