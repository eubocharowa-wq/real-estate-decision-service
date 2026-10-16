# Evidence Artifacts

## Boundary

`EvidenceArtifact` is the durable container metadata for source bytes. It does
not replace `FieldEvidence` or `SourceSnapshot`: those records describe a fact
and a collection observation, while an artifact identifies the immutable bytes
that can support either record.

PostgreSQL stores only artifact metadata, links, lifecycle state, and audit
events. Bytes go through `EvidenceArtifactBlobStore`; they are never stored in
metadata, audit records, Git, or a public URL. Slice A deliberately leaves the
production blob provider unresolved and supplies only a provider-neutral port
plus an offline in-memory adapter.

## Lifecycle and access

Artifacts start in `quarantine`. The only transitions are:

```text
quarantine -> staged -> approved
```

Content identity (`sha256`, byte size, storage key, source, collection time)
is immutable after creation. Every transition writes an immutable audit event
in the same database transaction. User documents are owner-private by default;
the contract has no public access scope and exposes no public blob URL.

## Provenance linkage

`evidence_artifact_links` references an existing `FieldEvidence` or
`SourceSnapshot` by stable ID. This preserves the existing schemas and their
legacy `evidence_reference` / `raw_reference` fields while enabling durable
artifact adoption incrementally.

Raw collection output cannot write canonical Property or Offer data through
this boundary. Canonical promotion remains a separate validated workflow.
