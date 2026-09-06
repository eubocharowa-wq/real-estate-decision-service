import { describe, expect, it } from "vitest";

import {
  readDatabaseConfig,
  requireDatabaseConfig,
} from "../../src/persistence";

const base = { DATABASE_URL: "postgres://user:pass@localhost:5432/reds" };

describe("database configuration", () => {
  it("accepts a postgres URL and applies pool defaults", () => {
    const result = readDatabaseConfig(base);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.connectionString).toBe(base.DATABASE_URL);
    expect(result.config.maxConnections).toBe(10);
    expect(result.config.connectionTimeoutMs).toBe(10_000);
    expect(result.config.idleTimeoutMs).toBe(30_000);
  });

  it("accepts the postgresql:// spelling", () => {
    expect(
      readDatabaseConfig({
        DATABASE_URL: "postgresql://localhost/reds",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["not a URL", "not-a-url"],
    ["wrong protocol", "mysql://localhost/reds"],
    ["file protocol", "file:///tmp/reds.sqlite"],
  ])("rejects a %s DATABASE_URL", (_label, value) => {
    const result = readDatabaseConfig({ DATABASE_URL: value });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a pool size outside the allowed range", () => {
    expect(
      readDatabaseConfig({ ...base, DATABASE_POOL_MAX: "0" }).success,
    ).toBe(false);
    expect(
      readDatabaseConfig({ ...base, DATABASE_POOL_MAX: "1000" }).success,
    ).toBe(false);
    expect(
      readDatabaseConfig({ ...base, DATABASE_POOL_MAX: "25" }).success,
    ).toBe(true);
  });

  it("throws with a diagnosable message when required", () => {
    expect(() => requireDatabaseConfig({})).toThrowError(
      /INVALID_DATABASE_CONFIG/,
    );
  });
});
