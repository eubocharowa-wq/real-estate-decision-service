# Evidence Artifacts

## Boundary

`EvidenceArtifact` is the durable container metadata for source bytes. It does
not replace `FieldEvidence` or `SourceSnapshot`: those records describe a fact
and a collection observation, while an artifact identifies the immutable bytes
that can support either record.

PostgreSQL stores only artifact metadata, links, lifecycle state, and audit
events. Bytes go through `EvidenceArtifactBlobStore`; they are never stored in
metadata, audit records, Git, or a public URL. The physical provider is runtime
configuration and provider URLs are discarded rather than becoming artifact
identity.

The production target for user documents is a private S3-compatible bucket
with declared RU data residency. The adapter uses the opaque `storage_key` as
the exact object key, performs conditional immutable writes, supplies and
verifies SHA-256 checksums, returns bytes rather than URLs, and maps provider
failures to deterministic application errors. Endpoint and credentials are
server-only deployment configuration and never enter metadata or audit.

The existing Vercel Private Blob adapter remains supported for
optional/dev/non-PD usage. It still uses private access only, disables
overwrite and random pathname suffixes, and prefers Vercel OIDC. The in-memory
adapter remains offline/test/demo only. Production and pilot runtimes require
an explicit provider and never silently fall back to memory.

## Lifecycle and access

Artifacts start in `quarantine`. The only transitions are:

```text
quarantine -> staged -> approved
```

Content identity (`sha256`, byte size, storage key, source, collection time)
is immutable after creation. Every transition writes an immutable audit event
in the same database transaction. User documents are owner-private by default;
the contract has no public access scope and exposes no public blob URL.

Storage and authorization are separate. `EvidenceArtifactBlobStore` performs
only `putImmutable`, `head`, `get`, and `delete`. The application read service
loads metadata, evaluates a fail-closed access policy, and only then reads
bytes. Owner access is bound to the existing opaque document reference,
including both `owner_type` and `owner_id`; a request-supplied actor string or
`decision: allow` object is not authorization. Restricted internal artifacts
require a trusted system/operator context. No public download route exists in
Slice B1.

For user documents, creation requires a valid owner-scoped opaque document
reference and the matching owner context. If metadata or link persistence
fails after a blob write, the service deletes the exact pathname immediately.
If that cleanup also fails, it returns the deterministic
`EVIDENCE_ARTIFACT_ORPHAN_CLEANUP_FAILED` error without raw bytes, credentials,
or a provider URL.

## Retention operations

The immutable `retention_policy` and `retain_until` fields are the initial
declaration. Migration `0006` backfills a separate mutable operational state:
effective retention deadline, legal-hold flag, and blob state
`present | deletion_pending | deleted`. Each change appends a retention event
in the same PostgreSQL transaction. A legal-hold declaration initializes an
active hold. Retention can only move forward; a null deadline is never treated
as expired.

Only issued trusted system/operator contexts may place a hold, and only an
issued operator context may release it. Active holds block deletion. Expired
blobs move atomically from `present` to `deletion_pending` before the provider
call, then to `deleted` after an idempotent successful delete. Provider failure
leaves the pending state for retry. Reads fail closed for both pending and
deleted blobs; metadata, links, and both audit histories remain intact.

Orphan reconciliation uses a separate maintenance inventory port rather than
the application BlobStore. Both Vercel and S3 adapters list private opaque
pathnames and metadata without returning provider URLs. Candidates must be
below the controlled prefix, have no matching `storage_key`, and be older than
an explicit caller-supplied grace period. Runs are dry-run by default;
execution requires both `execute=true` and an issued operator context.

## Provenance linkage

`evidence_artifact_links` references an existing `FieldEvidence` or
`SourceSnapshot` by stable ID. This preserves the existing schemas and their
legacy `evidence_reference` / `raw_reference` fields while enabling durable
artifact adoption incrementally.

Raw collection output cannot write canonical Property or Offer data through
this boundary. Canonical promotion remains a separate validated workflow.

TASK-028 remains active. Slice A, B1, B2a, and the B2b code boundary are
implemented. Operational completion still requires a provisioned private
S3-compatible RU bucket and deployed proof of private object operations,
checksum enforcement, PostgreSQL integration, retention/orphan behavior,
credential isolation, data residency, and rollback. No bucket is provisioned
by repository code.
