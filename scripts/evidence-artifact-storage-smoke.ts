#!/usr/bin/env node
import { Pool } from "pg";

import {
  EVIDENCE_ARTIFACT_STORAGE_SMOKE_SCHEMA_VERSION,
  parseEvidenceArtifactStorageSmokeArguments,
  resolveEvidenceArtifactBlobRuntime,
  runEvidenceArtifactStorageSmoke,
  S3AnonymousEvidenceArtifactReadProbe,
  type EvidenceArtifactStorageSmokeMode,
  type S3EvidenceArtifactConfig,
} from "../src/evidence-artifacts";
import {
  createPostgresRepositories,
  inspectDatabaseMigrationReadiness,
  requireDatabaseConfig,
} from "../src/persistence";

const safeDiagnostic = (error: unknown): string => {
  if (
    error instanceof Error &&
    /^EVIDENCE_ARTIFACT_[A-Z0-9_]+$/.test(error.message) &&
    error.message.length <= 128
  )
    return error.message;
  return "EVIDENCE_ARTIFACT_STORAGE_SMOKE_BOOTSTRAP_FAILED";
};

const s3ConfigFromEnvironment = (): S3EvidenceArtifactConfig => {
  const dataResidency = process.env.REDS_EVIDENCE_S3_DATA_RESIDENCY;
  if (dataResidency !== "RU" && dataResidency !== "NON_RU")
    throw new Error("EVIDENCE_ARTIFACT_S3_CONFIG_INVALID");
  return {
    endpoint: process.env.REDS_EVIDENCE_S3_ENDPOINT ?? "",
    region: process.env.REDS_EVIDENCE_S3_REGION ?? "",
    bucket: process.env.REDS_EVIDENCE_S3_BUCKET ?? "",
    dataResidency,
    accessKeyId: process.env.REDS_EVIDENCE_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.REDS_EVIDENCE_S3_SECRET_ACCESS_KEY ?? "",
  };
};

const writeJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

let mode: EvidenceArtifactStorageSmokeMode = "preflight";
let pool: Pool | undefined;
try {
  const options = parseEvidenceArtifactStorageSmokeArguments(
    process.argv.slice(2),
  );
  mode = options.mode;
  const runtime = resolveEvidenceArtifactBlobRuntime(process.env);
  const database = requireDatabaseConfig(process.env);
  const s3Config = s3ConfigFromEnvironment();
  pool = new Pool({
    connectionString: database.connectionString,
    max: 1,
    connectionTimeoutMillis: database.connectionTimeoutMs,
    idleTimeoutMillis: database.idleTimeoutMs,
  });
  const repositories = createPostgresRepositories(pool);
  const result = await runEvidenceArtifactStorageSmoke(options, {
    runtime,
    artifactRepository: repositories.evidenceArtifactRepository,
    retentionRepository: repositories.evidenceArtifactRetentionRepository,
    inspectDatabase: () => inspectDatabaseMigrationReadiness(pool!),
    anonymousReadProbe: new S3AnonymousEvidenceArtifactReadProbe(s3Config),
  });
  writeJson(result);
  process.exitCode = result.status === "pass" ? 0 : 1;
} catch (error) {
  writeJson({
    schema_version: EVIDENCE_ARTIFACT_STORAGE_SMOKE_SCHEMA_VERSION,
    mode,
    status: "fail",
    provider: "unavailable",
    declared_data_residency: "unavailable",
    writes_performed: false,
    checks: [
      {
        check_id: "bootstrap",
        status: "fail",
        diagnostic_code: safeDiagnostic(error),
      },
    ],
  });
  process.exitCode = 1;
} finally {
  await pool?.end().catch(() => undefined);
}
