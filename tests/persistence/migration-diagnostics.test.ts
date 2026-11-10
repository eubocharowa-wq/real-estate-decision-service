import { describe, expect, it } from "vitest";

import {
  connectionStringProtocol,
  diagnoseMigrationFailure,
  formatMigrationFailureReport,
  queryParameterNames,
  requireDatabaseConfig,
} from "../../src/persistence";

/**
 * A realistic connection string carrying secrets a real pg/Node error would
 * routinely embed in its message or properties — the host, user, password
 * and database name below are deliberately distinctive so a leak is easy to
 * spot.
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

describe("diagnoseMigrationFailure", () => {
  it("categorizes an unparseable or non-postgres connection string as INVALID_CONFIG", () => {
    const error = new Error(
      `INVALID_DATABASE_CONFIG: connectionString: DATABASE_URL must be a postgres:// or postgresql:// URL`,
    );
    expect(diagnoseMigrationFailure(error)).toMatchObject({
      category: "INVALID_CONFIG",
    });
  });

  it("reads invalidFields off a real INVALID_DATABASE_CONFIG error from requireDatabaseConfig", () => {
    let caught: unknown;
    try {
      requireDatabaseConfig({
        DATABASE_URL: `postgres://${SECRET_USER}:${SECRET_PASSWORD}@${SECRET_HOST}/${SECRET_DATABASE}`,
        DATABASE_POOL_MAX: "0",
      });
    } catch (error) {
      caught = error;
    }
    expect(diagnoseMigrationFailure(caught)).toMatchObject({
      category: "INVALID_CONFIG",
      invalidFields: ["maxConnections"],
    });
  });

  it.each(["ENOTFOUND", "EAI_AGAIN"])("categorizes %s as DNS", (code) => {
    const error = errorWith(`getaddrinfo ${code} ${SECRET_HOST}`, {
      code,
      hostname: SECRET_HOST,
    });
    expect(diagnoseMigrationFailure(error)).toMatchObject({
      category: "DNS",
      errorCode: code,
    });
  });

  it.each(["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"])(
    "categorizes %s as CONNECTION",
    (code) => {
      const error = errorWith(`connect ${code} 10.0.0.5:5432`, {
        code,
        address: "10.0.0.5",
        port: 5432,
      });
      expect(diagnoseMigrationFailure(error)).toMatchObject({
        category: "CONNECTION",
        errorCode: code,
      });
    },
  );

  it("categorizes a known TLS error code as TLS", () => {
    const error = errorWith("self signed certificate in certificate chain", {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    });
    expect(diagnoseMigrationFailure(error)).toMatchObject({
      category: "TLS",
      errorCode: "SELF_SIGNED_CERT_IN_CHAIN",
    });
  });

  it("categorizes a codeless SSL/TLS message as TLS", () => {
    const error = new Error("The server does not support SSL connections");
    expect(diagnoseMigrationFailure(error)).toMatchObject({
      category: "TLS",
      errorCode: null,
    });
  });

  it.each(["28P01", "28000"])("categorizes SQLSTATE %s as AUTH", (code) => {
    const error = errorWith(
      `password authentication failed for user "${SECRET_USER}"`,
      { code },
    );
    expect(diagnoseMigrationFailure(error)).toMatchObject({
      category: "AUTH",
      errorCode: code,
    });
  });

  it("categorizes SQLSTATE 3D000 as DATABASE_MISSING", () => {
    const error = errorWith(`database "${SECRET_DATABASE}" does not exist`, {
      code: "3D000",
    });
    expect(diagnoseMigrationFailure(error)).toMatchObject({
      category: "DATABASE_MISSING",
      errorCode: "3D000",
    });
  });

  it("categorizes an error carrying migration context as MIGRATION_SQL, with the migration and SQLSTATE", () => {
    const error = errorWith('syntax error at or near "TABLE"', {
      code: "42601",
      migrationVersion: "0007",
      migrationName: "widget_catalog",
    });
    expect(diagnoseMigrationFailure(error)).toMatchObject({
      category: "MIGRATION_SQL",
      errorCode: "42601",
      migrationVersion: "0007",
      migrationName: "widget_catalog",
    });
  });

  it("categorizes an unrecognized error code as UNKNOWN, keeping the code", () => {
    const error = errorWith(`unexpected backend state at ${SECRET_HOST}`, {
      code: "XX000",
    });
    expect(diagnoseMigrationFailure(error)).toMatchObject({
      category: "UNKNOWN",
      errorCode: "XX000",
    });
  });

  it("categorizes a plain error with no code as UNKNOWN, with no code", () => {
    const error = new Error("something went wrong");
    expect(diagnoseMigrationFailure(error)).toMatchObject({
      category: "UNKNOWN",
      errorCode: null,
    });
  });
});

describe("queryParameterNames", () => {
  it("lists only the query parameter names, never their values", () => {
    expect(queryParameterNames(CONNECTION_STRING)).toEqual([
      "sslmode",
      "connect_timeout",
    ]);
  });

  it("returns an empty list for an unparseable string", () => {
    expect(queryParameterNames("not-a-url")).toEqual([]);
  });

  it("returns an empty list when there is no query string", () => {
    expect(queryParameterNames("postgres://user:pass@host/db")).toEqual([]);
  });
});

describe("connectionStringProtocol", () => {
  it("returns only the protocol, with its trailing colon", () => {
    expect(connectionStringProtocol(CONNECTION_STRING)).toBe("postgres:");
    expect(
      connectionStringProtocol(
        `mysql://${SECRET_USER}:${SECRET_PASSWORD}@${SECRET_HOST}/${SECRET_DATABASE}`,
      ),
    ).toBe("mysql:");
  });

  it("returns null for an unparseable string", () => {
    expect(connectionStringProtocol("not-a-url")).toBeNull();
  });
});

describe("formatMigrationFailureReport — INVALID_CONFIG names the failing fields safely", () => {
  it("names a single invalid non-connectionString field with its env var, no protocol line", () => {
    const diagnosis = diagnoseMigrationFailure(
      errorWith("INVALID_DATABASE_CONFIG: maxConnections: too small", {
        invalidFields: ["maxConnections"],
      }),
    );
    const lines = formatMigrationFailureReport(diagnosis, "DATABASE_URL", []);
    expect(lines).toContain(
      "vercel-prebuild: invalid field: maxConnections (env: DATABASE_POOL_MAX)",
    );
  });

  it.each([
    ["connectionTimeoutMs", "DATABASE_CONNECTION_TIMEOUT_MS"],
    ["idleTimeoutMs", "DATABASE_IDLE_TIMEOUT_MS"],
  ])("maps %s to %s", (field, envVar) => {
    const diagnosis = diagnoseMigrationFailure(
      errorWith("INVALID_DATABASE_CONFIG: x", { invalidFields: [field] }),
    );
    const lines = formatMigrationFailureReport(diagnosis, "DATABASE_URL", []);
    expect(lines).toContain(
      `vercel-prebuild: invalid field: ${field} (env: ${envVar})`,
    );
  });

  it("names connectionString with the actual source variable and its protocol only — never the host, user, password or database", () => {
    const badConnectionString = `mysql://${SECRET_USER}:${SECRET_PASSWORD}@${SECRET_HOST}/${SECRET_DATABASE}`;
    const diagnosis = diagnoseMigrationFailure(
      errorWith("INVALID_DATABASE_CONFIG: connectionString: must be postgres", {
        invalidFields: ["connectionString"],
      }),
    );
    const lines = formatMigrationFailureReport(
      diagnosis,
      "REDS_DATABASE_URL",
      [],
      connectionStringProtocol(badConnectionString),
    );
    expect(lines).toContain(
      "vercel-prebuild: invalid field: connectionString (env: REDS_DATABASE_URL, protocol: mysql:)",
    );
    const output = lines.join("\n");
    expect(output).not.toContain(SECRET_HOST);
    expect(output).not.toContain(SECRET_USER);
    expect(output).not.toContain(SECRET_PASSWORD);
    expect(output).not.toContain(SECRET_DATABASE);
  });

  it("omits the protocol suffix for connectionString when the string doesn't even parse as a URL", () => {
    const diagnosis = diagnoseMigrationFailure(
      errorWith("INVALID_DATABASE_CONFIG: connectionString: must be postgres", {
        invalidFields: ["connectionString"],
      }),
    );
    const lines = formatMigrationFailureReport(
      diagnosis,
      "DATABASE_URL",
      [],
      connectionStringProtocol("not-a-url"),
    );
    expect(lines).toContain(
      "vercel-prebuild: invalid field: connectionString (env: DATABASE_URL)",
    );
  });

  it("names every invalid field when several fail at once", () => {
    const diagnosis = diagnoseMigrationFailure(
      errorWith("INVALID_DATABASE_CONFIG: x; y", {
        invalidFields: ["connectionString", "maxConnections"],
      }),
    );
    const lines = formatMigrationFailureReport(diagnosis, "DATABASE_URL", []);
    expect(lines).toContain(
      "vercel-prebuild: invalid field: connectionString (env: DATABASE_URL)",
    );
    expect(lines).toContain(
      "vercel-prebuild: invalid field: maxConnections (env: DATABASE_POOL_MAX)",
    );
  });
});

describe("formatMigrationFailureReport — no secret ever leaks", () => {
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
      "MIGRATION_SQL",
      errorWith(
        `relation "${SECRET_DATABASE}_widgets" already exists on ${SECRET_HOST}`,
        { code: "42P07", migrationVersion: "0007", migrationName: "widgets" },
      ),
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
      const lines = formatMigrationFailureReport(
        diagnosis,
        "REDS_DATABASE_URL",
        queryParams,
        connectionStringProtocol(CONNECTION_STRING),
      );
      assertNoSecrets(lines);
      // The source variable's name is reported deliberately; its value never is.
      expect(lines.join("\n")).toContain("REDS_DATABASE_URL");
      expect(lines.join("\n")).toContain("sslmode, connect_timeout");
    },
  );

  it("reports the failing migration and SQLSTATE for MIGRATION_SQL", () => {
    const diagnosis = diagnoseMigrationFailure(
      errorWith("duplicate column name", {
        code: "42701",
        migrationVersion: "0007",
        migrationName: "widget_catalog",
      }),
    );
    const lines = formatMigrationFailureReport(diagnosis, "DATABASE_URL", []);
    expect(lines).toContain(
      "vercel-prebuild: failing migration: 0007_widget_catalog",
    );
    expect(lines).toContain("vercel-prebuild: SQLSTATE: 42701");
  });

  it("reports only the error code for UNKNOWN", () => {
    const diagnosis = diagnoseMigrationFailure(
      errorWith("unexpected backend state", { code: "XX000" }),
    );
    const lines = formatMigrationFailureReport(diagnosis, "DATABASE_URL", []);
    expect(lines).toContain("vercel-prebuild: error code: XX000");
  });
});
