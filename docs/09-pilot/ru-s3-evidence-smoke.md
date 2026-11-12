# RU S3 EvidenceArtifact smoke

## Purpose and safety boundary

`npm run evidence:storage-smoke` is an operator-only check of the existing
EvidenceArtifact S3, PostgreSQL, access-policy, retention, and orphan-cleanup
ports. It does not provision a bucket, apply migrations, expose an upload or
download API, or modify canonical Property/Offer data.

The command is read-only by default. A live run requires `--execute` plus an
explicit orphan grace period. Every written object is synthetic, uses a fresh
`evidence/smoke/<run-id>/` prefix, and is deleted through retention or orphan
reconciliation during the same run. PostgreSQL intentionally retains the
synthetic artifact metadata and append-only audit records as operational
evidence; it stores no object bytes.

## Required server-only configuration

Run against an already migrated non-production proof database and an already
provisioned private S3-compatible bucket. Supply values only through the
operator process/secret manager:

```text
REDS_APPLICATION_MODE=pilot
REDS_EVIDENCE_BLOB_PROVIDER=s3
REDS_EVIDENCE_S3_ENDPOINT=<canonical HTTPS endpoint origin>
REDS_EVIDENCE_S3_REGION=<provider region>
REDS_EVIDENCE_S3_BUCKET=<private bucket>
REDS_EVIDENCE_S3_DATA_RESIDENCY=RU
REDS_EVIDENCE_S3_ACCESS_KEY_ID=<server credential>
REDS_EVIDENCE_S3_SECRET_ACCESS_KEY=<server credential>
REDS_DATABASE_URL=<migrated proof PostgreSQL>
```

The command fails closed when configuration is incomplete, when the provider
is not S3 with declared `RU` residency, when application mode is not
`pilot|production`, or when PostgreSQL is unreachable/schema-incompatible. It
never falls back to memory. Do not use a production database or bucket for the
first proof.

## Read-only preflight

```bash
npm run evidence:storage-smoke
```

Preflight validates runtime selection and PostgreSQL migration readiness, then
performs only metadata existence and S3 inventory reads under a unique empty
prefix. `writes_performed` must be `false`; all checks must be `pass`.

## Explicit live run

Choose a short, explicit grace period suitable for the isolated proof bucket.
The example is one second; it is not a production orphan-retention policy:

```bash
npm run evidence:storage-smoke -- --execute --orphan-grace-ms 1000
```

The versioned JSON report must show `status=pass` and covers:

- immutable private write, head, read, byte size, and SHA-256;
- overwrite rejection;
- owner-authorized read and foreign-owner denial before blob access;
- an unsigned, redirect-free object GET denied by the provider;
- inventory scoped to the current run prefix;
- PostgreSQL artifact metadata, source-snapshot link, retention state, and
  append-only events;
- expired-object `present -> deletion_pending -> deleted` execution;
- orphan dry-run followed by trusted-operator execution;
- an empty current-run prefix at completion.

The report contains check IDs, status, a synthetic run ID, and safe diagnostic
codes only. It excludes endpoint, bucket, credentials, connection strings,
provider URLs, opaque owner references, and synthetic object content.

## Failure and cleanup

On failure the runner attempts cleanup only for the two exact synthetic keys
of its current unique prefix. A metadata-backed object is removed through the
retention service so PostgreSQL state cannot claim that deleted bytes remain
present; an unreferenced synthetic orphan is deleted directly. A failed
`current_run_cleanup` requires an operator to inspect that exact run prefix
with provider tooling and the existing dry-run reconciler before any manual
delete. Never broaden cleanup to `evidence/` or another run's prefix.

The command does not delete EvidenceArtifact metadata, links, or audit rows:
those are immutable proof records by design.

## Evidence limitations

A successful run proves behavior only for the configured bucket, credentials,
database schema, application revision, and time of execution. The value
`REDS_EVIDENCE_S3_DATA_RESIDENCY=RU` is a declared capability, not independent
proof of physical residency. TASK-028 still requires provider/contractual
evidence for Russian storage location, deployed Preview runtime evidence,
credential and bucket-policy review, rollback/restore evidence, and capture of
the successful report with an immutable deployment/revision reference.
