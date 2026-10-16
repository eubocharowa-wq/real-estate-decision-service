# TASK-028 — Production Evidence Artifact lifecycle

## Status

**ACTIVE / NOT COMPLETED.** Slice A, Slice B1, Slice B2a, and the Slice B2b
code boundary are implemented. The production target for user documents is
now provider-neutral S3-compatible RU storage. No real bucket, credentials, or
deployed storage proof exists yet, so TASK-028 is not complete.

## Goal

Make raw evidence a durable, auditable, access-controlled production asset
outside Git, without allowing raw collection output to mutate canonical
Property or Offer data directly.

The complete TASK-028 boundary includes:

- immutable artifact identity;
- bytes in blob/object storage outside PostgreSQL and Git;
- source URL or opaque source reference plus `source_id`;
- collection timestamp, MIME type, byte size, and SHA-256;
- lifecycle `quarantine -> staged -> approved`;
- private-by-default user documents;
- explicit retention;
- links from `FieldEvidence` and `SourceSnapshot`;
- immutable audit history;
- no public URL by default;
- no direct canonical write from raw collection output.

## Slice A — Foundation and metadata

Slice A provides:

- a provider-neutral, versioned `EvidenceArtifact` domain contract;
- fail-closed lifecycle rules;
- a provider-neutral blob-storage port and offline in-memory adapter;
- PostgreSQL metadata, links, and audit events in migration `0005`;
- in-memory and PostgreSQL repository implementations;
- an application service that verifies bytes and checksum before creating
  quarantined metadata;
- `FieldEvidence` and `SourceSnapshot` linkage without changing their schemas;
- unit and database integration coverage for the foundation.

## Acceptance criteria for Slice A

- SHA-256 is exactly 64 lowercase hex characters.
- A storage key is opaque and cannot be a public URL.
- User documents default to owner-private access.
- An artifact can only be created in `quarantine`.
- Only `quarantine -> staged -> approved` is allowed.
- Content identity and storage metadata cannot be rewritten.
- Lifecycle transition and its audit event are one repository transaction.
- Duplicate artifact IDs fail closed.
- Duplicate links are idempotent and do not create rows.
- Both `FieldEvidence` and `SourceSnapshot` can be linked by reference.
- Blob/checksum failure cannot produce successful metadata.
- Metadata and audit records contain no raw bytes.
- The Slice A service has no canonical Property/Offer write dependency.
- Existing `evidence_reference` and `raw_reference` fields remain compatible.

## Verification

- `npm run format:check`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`
- PostgreSQL migrations `0001 -> 0006`, `0006` down, and `0006` re-up when
  `DATABASE_URL` is available.

## Out of scope for Slice A

- selection or integration of a production blob provider;
- public upload API or UI;
- live OpenClaw ingestion;
- ЦИАН, Авито, Домклик, or Source Registry v2;
- canonical catalogue changes from TASK-029;
- semantic deduplication;
- expert UI changes;
- declaring TASK-028 complete in the release gate or roadmap.

## Slice B1 — Private storage and authorized reads

Slice B1 added Vercel Private Blob as the first private adapter and adds:

- a server-only private Blob adapter behind `EvidenceArtifactBlobStore`;
- OIDC-preferred provider authentication without repository credentials;
- opaque pathname writes with overwrite disabled and no persisted provider URL;
- a separate fail-closed application access policy and read service;
- owner isolation through the existing session/anonymous opaque document
  reference boundary;
- trusted internal access for restricted artifacts;
- validation of owner-scoped references when user documents are created;
- compensating blob deletion when metadata or link persistence fails.

No public or signed download route is part of B1. The Blob store itself is not
created by repository code.

## Slice B2a — Retention operations and orphan reconciliation

Slice B2a adds migration `0006` with mutable operational retention state and
an append-only audit stream, without changing immutable artifact identity. It
implements forward-only retention extension, trusted legal-hold placement,
operator-only release, two-phase idempotent blob deletion, fail-closed reads
during/after deletion, and maintenance-only orphan inventory reconciliation.
Orphan discovery requires a controlled prefix and explicit grace period, is a
dry run by default, and requires an issued operator context for deletion.

## Slice B2b — Provider-neutral production storage

The B2b code boundary adds a private S3-compatible adapter and maintenance
inventory using AWS SDK v3 behind the existing ports. Runtime selection is
explicit (`s3 | vercel | memory`), production/pilot cannot silently fall back
to memory, and user documents in those modes require the configured adapter to
declare RU data residency. Vercel Private Blob remains supported as an
optional/dev/non-PD adapter; provider URLs never become artifact identity.

## Remaining operational proof

An operator must provision a private S3-compatible bucket in Russia, configure
deployment secrets, and prove private write/head/read/delete plus inventory,
retention deletion, orphan reconciliation, and PostgreSQL metadata integration
on deployed Preview. The proof must confirm bucket privacy, checksum behavior,
data residency, credential isolation, and rollback. Only then may TASK-028
become completed. TASK-029 has not started.
