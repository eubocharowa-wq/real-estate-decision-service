# RU data residency and migration plan

Status date: 2026-11-11. Scope: engineering review for GitHub Issue #27 at
application revision `1f592c39fd3602965823890034127d48723ff253`.

This document does not determine legal status or give a legal opinion. It
describes the current technical boundary, a safe target architecture, and the
evidence required before public processing. No production data was read,
copied, migrated, or changed during the review. Environment values, passwords,
connection strings, tokens, and request contents were not inspected or
recorded.

## Executive finding

The repository can durably store free-form buyer requests, normalized
household/financing constraints, journey decisions, expert questions/results,
feedback, URLs, and pseudonymous owner/session identifiers in PostgreSQL.
These records may be personal data when they relate to an identifiable person.

The actual Production database provider and region are not proven. Connected
database inventory includes only non-Russian regions, but project names alone
cannot safely identify the Production binding. The deployed dynamic request
boundary also runs on Vercel; no Russian function region is configured in the
repository, and Vercel documents a US default for new Node.js Functions. A
Russian S3 bucket alone would therefore not establish an end-to-end Russian
localization boundary.

The operational release gate remains `ready=false`, so public launch is not
approved. This is a release-readiness decision, not runtime enforcement. The
current `/selection` form can submit `rawRequestText` to
`POST /api/buyer-journeys`, and that route does not check the release-gate
result before the buyer-journey application may persist the request in
PostgreSQL. No server-side denial of this public input path has been proven in
the current revision or deployment.

The required fail-closed server boundary is tracked separately in
[GitHub Issue #29](https://github.com/eubocharowa-wq/real-estate-decision-service/issues/29).
Until it is implemented and deployment-tested, `ready=false`, `noindex`, a
demo/pilot label, or browser UI behavior must not be described as blocking an
HTTP POST.

## Verified facts and unknowns

| Boundary | Verified fact | Unknown or blocker |
| --- | --- | --- |
| application ingress | dynamic Next.js routes process form submissions on Vercel | actual function region, platform-log location, and whether that processing model is approved for data in scope |
| Production PostgreSQL | a production-scoped primary variable exists and wins over the generic fallback | provider, project, country/region, backups, subprocessors, and restore location |
| Preview PostgreSQL | a branch-scoped staging variable exists | whether all active previews are isolated and whether any real user data has entered staging |
| connected database inventory | the visible projects are in UK or US cloud regions | which, if any, is bound to Production; names are insufficient evidence |
| object storage | S3-compatible private adapter and RU capability guard exist in code | no configured production S3 provider, bucket, credentials, residency attestation, or deployed CRUD/retention proof |
| external AI | no current repository path sends the complete buyer request to OpenAI | future parser/AI work requires a fresh data-flow and legal review before enablement |
| source collection | source adapters receive scoped URLs/facts; Source Policy gates live access | external source permissions remain separate and do not authorize processing user personal data |
| application logs | structured telemetry/error repositories exclude raw request bodies and common secrets | Vercel request/platform logs, support access, IP/user-agent retention, and deletion controls are not proven |

## Recommended production architecture

### 1. Russian request-processing boundary

Personal-data-bearing forms and APIs should terminate first in a controlled
Russian infrastructure boundary. Preferred options are:

1. run the complete dynamic Next.js/API service in an approved Russian cloud;
   or
2. retain Vercel only for a static/non-personal public shell and send personal
   form traffic directly to a Russian API origin.

Do not proxy a personal-data request through a foreign dynamic function merely
to forward it to a Russian database. CDN, TLS termination, WAF, analytics,
support access, and request logging must be included in the operator's data
map and legal decision.

### 2. Russian PostgreSQL primary

- provision an operator-approved managed PostgreSQL service in Russia;
- use TLS and private networking/IP allowlists where available;
- separate pooled application and direct migration credentials;
- use least-privilege roles for runtime, migration, backup, and support;
- keep encrypted backups, point-in-time recovery, and restore targets in the
  approved Russian boundary;
- keep Production and staging projects, roles, secrets, and data separate;
- use synthetic or de-identified staging data until staging is approved for
  real records;
- record immutable provider project/region and deployment binding as release
  evidence without revealing a connection string.

### 3. Private RU S3-compatible storage

- create a private bucket in an approved Russian region;
- configure only server-side credentials through the deployment secret
  manager, with separate runtime and maintenance privileges;
- prohibit public ACLs, public bucket URLs, and provider URLs as artifact
  identity;
- retain the existing opaque storage key, checksum, private read policy,
  lifecycle, legal hold, deletion-pending retry, and orphan reconciliation;
- prove actual provider/region independently; the runtime value
  `REDS_EVIDENCE_S3_DATA_RESIDENCY=RU` is a declaration, not evidence;
- enable encryption, access audit, retention, backup/restore where applicable,
  credential rotation, and documented provider exit.

### 4. Logging and operational data

- never log HTTP bodies, user questions, documents, source URL query values,
  authorization data, or connection details;
- keep only stable diagnostic codes and the minimum pseudonymous correlation
  identifiers;
- define retention for IP addresses, user agents, access logs, audit records,
  application errors, and backups;
- keep log sinks and support access inside the approved boundary or obtain a
  separately reviewed legal basis and transfer process;
- test deletion, restore, incident response, and credential revocation.

## Controlled migration plan

No step below is authorized for automatic execution by repository code.

1. Before public personal-data collection, obtain an operator-approved closed
   access mode or implement and test a server-side fail-closed data-entry guard
   as tracked in Issue #29. The current repository does not prove that this
   protection is active. Preserve explicitly authorized synthetic CI/QA and
   internal flows without treating client-side UI, `noindex`, or release-gate
   output as API authorization.
2. Have the operator and counsel approve the data map, lawful basis,
   notices/consents, processor contracts, cross-border analysis, retention,
   and destruction.
3. Identify the actual Production and staging bindings using provider project
   IDs and region metadata. Do not infer them from a secret hostname or project
   display name in documentation.
4. Provision the RU PostgreSQL and S3 boundaries, least-privilege roles,
   encryption, network restrictions, backups, monitoring, and secret-manager
   bindings.
5. Apply migrations to an empty RU staging database and run database,
   readiness, EvidenceArtifact, retention, and restore tests with synthetic
   data.
6. Create an encrypted, access-controlled export of the existing database only
   after authorization. Transfer through an approved channel, import into the
   RU target, and compare migration history, table counts, referential
   integrity, and controlled checksums without printing row content.
7. Migrate private object bytes with an inventory and checksum manifest, then
   prove private write/head/read/delete, lifecycle, legal hold, retention, and
   orphan reconciliation against PostgreSQL metadata.
8. Run Preview/golden-flow verification using RU-only processing, database,
   object storage, logs, and backups. Produce provider-verified evidence bound
   to the evaluated commit.
9. During an approved maintenance window, freeze writes, take a rollback
   snapshot, apply the final delta, switch secrets/routes, and monitor the
   complete flow. Do not change Production and staging simultaneously.
10. After acceptance and the approved retention window, revoke old credentials
   and close or delete foreign copies, backups, and processor access according
   to the operator's legal decision. Preserve only the required audit record,
   never the credentials or row contents.

## TASK-028 relationship

TASK-028 already supplies the repository-side EvidenceArtifact contract:

- immutable artifact identity and checksum;
- bytes outside PostgreSQL metadata;
- private access and owner-scoped authorization;
- S3-compatible provider port with explicit RU capability;
- lifecycle, retention, legal hold, deletion retry, and orphan reconciliation;
- no provider URL and no direct canonical Property/Offer write.

TASK-028 cannot be closed until deployed evidence proves a private RU bucket,
credential isolation, private write/head/read/delete, inventory, checksum,
retention deletion, legal hold, orphan reconciliation, PostgreSQL linkage, and
rollback on the evaluated application revision.

That proof covers EvidenceArtifact bytes only. It does **not** prove that the
buyer journey, expert records, logs, backups, or dynamic request ingress meet
the operator's privacy/localization requirements. TASK-031B is a future roadmap
stage and required release-evidence check; it is not an implemented runtime
guard in the current revision. Runtime denial of unapproved public data entry
is tracked in Issue #29.

## Release blockers

- actual Production database project and region not provider-verified;
- no approved Russian request-processing boundary;
- no provisioned or deployed RU S3 bucket proof;
- no approved operator/legal classification, lawful basis, notices/consents,
  processor agreements, cross-border decision, or retention schedule;
- owner/session namespace is not authenticated user identity;
- no end-to-end deletion/retention program for journey, expert, feedback,
  application error, log, and backup data;
- no provider-verified backup/restore, monitoring, incident, and processor-exit
  evidence;
- the Issue #29 server-side public-input guard is not implemented or proven;
- TASK-028, the future TASK-031B work, and operational release evidence remain
  incomplete.

Until these blockers are resolved, the release gate must remain
`ready=false`, and public launch is not approved. This state does not itself
disable `/api/buyer-journeys`; this document must not be used as evidence that
public processing is technically blocked, or as authorization for public
processing or a production migration.

## References

- [GitHub Issue #27](https://github.com/eubocharowa-wq/real-estate-decision-service/issues/27)
- [GitHub Issue #29 — runtime public-input protection](https://github.com/eubocharowa-wq/real-estate-decision-service/issues/29)
- [Article 18 of Federal Law No. 152-FZ](https://www.consultant.ru/document/cons_doc_LAW_61801/cbf4e15b7c330f9372e876cdf2bc928bad7950ef/)
- [Vercel Function region configuration](https://vercel.com/docs/functions/configuring-functions/region)
- [Vercel regions and global network](https://vercel.com/docs/regions)
- [Evidence Artifact lifecycle](../04-data/evidence-artifacts.md)
- [Operational release gate](release-gate.md)
