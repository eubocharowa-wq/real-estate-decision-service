import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../app/api/readiness/route";
import { buildEisjsCandidate } from "../../src/pilot-hardening";
import {
  inspectDatabaseMigrationReadiness,
  readMigrations,
} from "../../src/persistence";
import { evaluateStagingReadiness } from "../../src/staging";

const NOW = "2026-09-13T20:00:00.000Z";

const appliedMigrations = () =>
  readMigrations(path.resolve(process.cwd(), "migrations")).map(
    ({ version, name }) => ({ version, name }),
  );

const database = (
  options: {
    readonly table?: boolean;
    readonly applied?: readonly {
      readonly version: string;
      readonly name: string;
    }[];
    readonly failure?: Error;
  } = {},
): Pick<Pool, "query"> => {
  const query = vi.fn(async (statement: string) => {
    if (options.failure) throw options.failure;
    if (statement.includes("readiness_probe"))
      return { rows: [{ readiness_probe: 1 }] };
    if (statement.includes("to_regclass"))
      return {
        rows: [
          { table_name: options.table === false ? null : "schema_migrations" },
        ],
      };
    return { rows: [...(options.applied ?? appliedMigrations())] };
  });
  return { query } as unknown as Pick<Pool, "query">;
};

const writeCuratedFixture = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), "staging-readiness-"));
  const candidate = buildEisjsCandidate({
    schema_version: "eisjs-candidate-input-v1",
    candidate_id: "staging_readiness_fixture",
    source_url: "https://наш.дом.рф/staging-readiness-fixture",
    collected_at: NOW,
    external_object_id: "STAGING-READINESS-0001",
    developer_name: "Тестовый застройщик (фикстура)",
    property_type: "apartment",
    address: {
      country_code: "RU",
      region: "Тестовая область",
      city: "Пилотск",
      locality: null,
      district: null,
      street: "Тестовая улица",
      house_number: "1",
      postal_code: null,
    },
    cadastral_number: "00:00:0000000:0025",
    total_area_m2: 55,
    floors_total: 10,
    rooms: 2,
    floor: 4,
    building_name: "Тестовый корпус",
    handover_quarter: {
      year: 2027,
      quarter: 1,
      as_published: "I квартал 2027 г.",
    },
  }).candidate;
  writeFileSync(
    path.join(directory, `${candidate.candidate_id}.json`),
    JSON.stringify(candidate),
    "utf8",
  );
  return directory;
};

const pilotEnvironment = (
  databaseUrl = "postgres://user:secret@db.invalid/reds",
) => ({
  DATABASE_URL: databaseUrl,
  REDS_APPLICATION_MODE: "pilot",
  REDS_PILOT_COHORT: "internal_test",
  NEXT_PUBLIC_SITE_URL: "https://staging.example",
});

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("TASK-025 staging readiness", () => {
  it("reports ready only for pilot, a curated dataset, matching origin and compatible DB", async () => {
    const curatedPilotDirectory = writeCuratedFixture();
    temporaryDirectories.push(curatedPilotDirectory);
    const result = await evaluateStagingReadiness({
      environment: pilotEnvironment(),
      requestUrl: "https://staging.example/api/readiness",
      database: database(),
      curatedPilotDirectory,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      schema_version: "staging-readiness-v1",
      status: "ready",
      checked_at: NOW,
      checks: {
        application: {
          running: true,
          runtime: "nextjs_dynamic_nodejs",
          mode: "pilot",
          mode_ready: true,
        },
        dataset: {
          expected_type: "manual_curated_pilot",
          configured: true,
          candidate_count: 1,
          synthetic_and_real_mixed: false,
        },
        database: {
          configured: true,
          configuration_valid: true,
          reachable: true,
          schema_compatible: true,
          expected_migration_count: 4,
          applied_migration_count: 4,
        },
        public_origin: {
          configured: true,
          matches_request_origin: true,
        },
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("db.invalid");
    expect(serialized).not.toContain("DATABASE_URL");
  });

  it("keeps the unset mode on demo/synthetic and not staging-ready", async () => {
    const result = await evaluateStagingReadiness({
      environment: {
        DATABASE_URL: "postgres://user:secret@db.invalid/reds",
        NEXT_PUBLIC_SITE_URL: "https://staging.example",
      },
      requestUrl: "https://staging.example/api/readiness",
      database: database(),
      now: () => NOW,
    });

    expect(result.status).toBe("not_ready");
    expect(result.checks.application.mode).toBe("demo");
    expect(result.checks.dataset).toMatchObject({
      expected_type: "synthetic_pilot",
      configured: true,
      synthetic_and_real_mixed: false,
    });
  });

  it.each([
    ["missing DATABASE_URL", { ...pilotEnvironment(), DATABASE_URL: "" }],
    [
      "malformed DATABASE_URL",
      { ...pilotEnvironment(), DATABASE_URL: "https://db.invalid/reds" },
    ],
    ["missing site URL", { ...pilotEnvironment(), NEXT_PUBLIC_SITE_URL: "" }],
  ])("fails closed for %s", async (_label, environment) => {
    const result = await evaluateStagingReadiness({
      environment,
      requestUrl: "https://staging.example/api/readiness",
      database: database(),
      now: () => NOW,
    });
    expect(result.status).toBe("not_ready");
  });

  it("fails when the configured public origin differs from the request", async () => {
    const result = await evaluateStagingReadiness({
      environment: pilotEnvironment(),
      requestUrl: "https://another.example/api/readiness",
      database: database(),
      now: () => NOW,
    });
    expect(result.status).toBe("not_ready");
    expect(result.checks.public_origin.matches_request_origin).toBe(false);
  });

  it("fails closed when a curated dataset file is malformed", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "staging-malformed-"));
    temporaryDirectories.push(directory);
    writeFileSync(path.join(directory, "candidate.json"), "not-json", "utf8");

    const result = await evaluateStagingReadiness({
      environment: pilotEnvironment(),
      requestUrl: "https://staging.example/api/readiness",
      database: database(),
      curatedPilotDirectory: directory,
      now: () => NOW,
    });

    expect(result.status).toBe("not_ready");
    expect(result.checks.dataset).toMatchObject({
      expected_type: "manual_curated_pilot",
      configured: false,
      candidate_count: 0,
    });
    expect(JSON.stringify(result)).not.toContain("candidate.json");
  });

  it("checks migrations without creating or altering the schema", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("readiness_probe")) return { rows: [{}] };
      return { rows: [{ table_name: null }] };
    });
    const result = await inspectDatabaseMigrationReadiness({
      query,
    } as unknown as Pick<Pool, "query">);

    expect(result).toMatchObject({ reachable: true, schemaCompatible: false });
    expect(result.pendingVersions).toEqual(["0001", "0002", "0003", "0004"]);
    expect(
      query.mock.calls.map(([statement]) => String(statement)).join("\n"),
    ).not.toMatch(/CREATE|INSERT|UPDATE|ALTER|DELETE/i);
  });

  it("fails if the deployed migration catalogue is absent", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "staging-migrations-"));
    temporaryDirectories.push(directory);
    const result = await inspectDatabaseMigrationReadiness(
      database(),
      directory,
    );
    expect(result).toMatchObject({
      reachable: true,
      schemaCompatible: false,
      expectedMigrationCount: 0,
    });
  });

  it.each([
    "https://user:password@staging.example",
    "https://staging.example/path",
    "https://staging.example?preview=1",
    "https://staging.example#fragment",
  ])("rejects a non-canonical public origin: %s", async (siteUrl) => {
    const result = await evaluateStagingReadiness({
      environment: {
        ...pilotEnvironment(),
        NEXT_PUBLIC_SITE_URL: siteUrl,
      },
      requestUrl: "https://staging.example/api/readiness",
      database: database(),
      now: () => NOW,
    });
    expect(result.status).toBe("not_ready");
    expect(result.checks.public_origin.configured).toBe(false);
  });

  it("fails closed for missing, renamed, unknown migrations and DB errors", async () => {
    const expected = appliedMigrations();
    const missing = await inspectDatabaseMigrationReadiness(
      database({ applied: expected.slice(0, -1) }),
    );
    const renamed = await inspectDatabaseMigrationReadiness(
      database({
        applied: expected.map((migration, index) =>
          index === 0 ? { ...migration, name: "renamed" } : migration,
        ),
      }),
    );
    const unknown = await inspectDatabaseMigrationReadiness(
      database({
        applied: [...expected, { version: "9999", name: "future" }],
      }),
    );
    const failed = await inspectDatabaseMigrationReadiness(
      database({ failure: new Error("secret-db-host: connection refused") }),
    );

    expect(missing.schemaCompatible).toBe(false);
    expect(missing.pendingVersions).toEqual(["0004"]);
    expect(renamed.mismatchedVersions).toEqual(["0001"]);
    expect(unknown.unexpectedVersions).toEqual(["9999"]);
    expect(failed).toMatchObject({
      reachable: false,
      schemaCompatible: false,
    });
    expect(JSON.stringify(failed)).not.toContain("secret-db-host");
  });

  it("serves a cache-disabled, redacted 503 when staging dependencies are absent", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("REDS_APPLICATION_MODE", "demo");
    const response = await GET(
      new Request("https://staging.example/api/readiness"),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(body).toContain('"status":"not_ready"');
    expect(body).not.toContain("DATABASE_URL");
    expect(body).not.toContain("connectionString");
  });
});
