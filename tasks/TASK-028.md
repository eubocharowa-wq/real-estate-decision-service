# TASK-028 — Production Evidence Artifact lifecycle

## Status

**ACTIVE / NOT COMPLETED.** Slice A is implemented and provides the foundation
and durable metadata lifecycle only. Completing Slice A does **not** complete
TASK-028.

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
- PostgreSQL migration `0001 -> 0005`, `0005` down, and `0005` re-up when
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

## Remaining TASK-028 work after Slice A

Slice B must select and integrate an approved production blob provider, bind
authorized reads to the application access boundary, prove production
retention and deletion behavior, and provide deployment/operational evidence.
The production blob provider remains intentionally unresolved. TASK-029 has
not started.
