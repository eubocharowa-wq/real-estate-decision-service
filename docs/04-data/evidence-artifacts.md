# Evidence Artifacts

## Boundary

`EvidenceArtifact` is the durable container metadata for source bytes. It does
not replace `FieldEvidence` or `SourceSnapshot`: those records describe a fact
and a collection observation, while an artifact identifies the immutable bytes
that can support either record.

PostgreSQL stores only artifact metadata, links, lifecycle state, and audit
events. Bytes go through `EvidenceArtifactBlobStore`; they are never stored in
metadata, audit records, Git, or a public URL. Vercel Private Blob is the
initial production provider, isolated behind the same low-level port as the
offline in-memory adapter. Provider URLs are discarded and are not artifact
identity.

The production adapter uses private access only, disables overwrite and random
pathname suffixes, and uses the artifact's opaque `storage_key` as the exact
pathname. Authentication is resolved server-side by the SDK; Vercel OIDC with
`BLOB_STORE_ID` is preferred. No long-lived provider credential belongs in the
repository or artifact metadata.

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

## Provenance linkage

`evidence_artifact_links` references an existing `FieldEvidence` or
`SourceSnapshot` by stable ID. This preserves the existing schemas and their
legacy `evidence_reference` / `raw_reference` fields while enabling durable
artifact adoption incrementally.

Raw collection output cannot write canonical Property or Offer data through
this boundary. Canonical promotion remains a separate validated workflow.

TASK-028 remains active. Slice B2 still covers retention/deletion execution,
legal-hold mutation semantics, operational orphan cleanup, and deployed
private-storage proof.
