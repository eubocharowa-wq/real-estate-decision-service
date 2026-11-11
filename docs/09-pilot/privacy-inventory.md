# Pilot privacy and data inventory

Status date: 2026-11-11. This is an engineering inventory, not a legal
conclusion. The operator and qualified counsel must determine which records
are personal data in the actual deployment, the lawful basis for processing,
required notices or consents, cross-border-transfer obligations, and approved
retention periods.

The application stores more than a browser-only demo session. When a database
URL is configured, the dynamic buyer journey and expert workflows use durable
PostgreSQL repositories. A pseudonymous session or owner identifier is still
linkable data and must not be treated as anonymous solely because it does not
contain a person's name.

## Data-flow inventory

| Field / data class | Entry point and purpose | Durable or local storage | External boundary | Logging / telemetry | Privacy notes |
| --- | --- | --- | --- | --- | --- |
| browser session and journey IDs | browser recovery and owner namespace | two IDs in browser `localStorage`; corresponding IDs in PostgreSQL records | Vercel request routing before the application | bounded IDs may appear in audit/error context | pseudonymous, linkable identifiers; not proof of authentication |
| raw buyer request text | `/selection` -> `/api/buyer-journeys`, intent parsing | full text in `buyer_journeys.raw_request_text` and the versioned journey document | processed by the deployed Next.js runtime; no current repository path sends it to OpenAI | generic telemetry records safe length/status metadata, not the text | may reveal location, budget, household, financing, timing, health/accessibility preferences, or text entered by mistake |
| normalized and confirmed UserRequest | deterministic matching and decision history | parsed/confirmed request documents in PostgreSQL | no current repository path sends the complete request to a source adapter | IDs, version, stage, and bounded metadata only | household and financing constraints can remain personal when linked to a session |
| matching, comparison, and decision state | explain and reproduce a buyer decision | PostgreSQL journey documents, matching bundles, comparison and decision updates | no direct third-party call | stage/result IDs and safe counters | creates a behavioral decision profile even without direct identity fields |
| user-supplied property URL and manual facts | import one explicit candidate | imported candidate document includes original/canonical source URL and manual fields | a source request occurs only after URL validation and Source Policy approval | ingestion ID/status only; no private URL in generic telemetry | URL query data, address, source/seller label, or manually entered text can contain third-party or user identifiers |
| ExpertRequest and context | route a scoped user question | PostgreSQL expert request/context and queue state | expert/operator access boundary | request ID/type/status only | user question and minimized decision context may contain personal data; whole profile must not be copied when unnecessary |
| expert draft, findings, and result | manual verification and decision recompute | PostgreSQL draft/result/finding records | trusted expert/operator boundary | result/status IDs only | free text and evidence references require access control and retention rules |
| document reference | bind a pre-existing owner-scoped document | opaque owner-scoped reference in PostgreSQL; not document bytes | authorized EvidenceArtifact read service | never document content or a provider URL | reference is not proof that deployed private object storage exists |
| EvidenceArtifact metadata | evidence identity, lifecycle, retention, and access | PostgreSQL metadata, links, lifecycle/retention events; bytes remain outside PostgreSQL | configured private object-storage provider | no raw bytes, secret, or provider URL | `user_document` in pilot/production is code-gated to a storage adapter declaring RU residency; deployed proof is still absent |
| feedback comment | pilot outcome review | PostgreSQL feedback record | no intended external transfer | comment is excluded from generic telemetry exports | optional free text may contain personal data despite UI guidance |
| application error | recovery and operational diagnosis | PostgreSQL safe error code/layer/context IDs | hosting/logging platform receives request-level operational metadata | no raw request body or raw provider error | platform logs may still contain IP address, user agent, route, and timestamps |
| source collection task/result | collect approved property facts | staged result/evidence metadata; no direct canonical write | approved source adapter or OpenClaw only after all gates | source/method/status/counts, not raw buyer profile | CIAN and Avito automation remain denied without separate source permission |

## Actual persistence path

```text
browser form
  -> Vercel/Next.js request boundary
  -> /api/buyer-journeys
  -> BuyerJourneyApplication
  -> PostgreSQL buyer journey / parsed request / matching / decision records

expert form or workbench
  -> Vercel/Next.js request boundary
  -> expert application boundary
  -> PostgreSQL request / context / draft / finding / result records

approved evidence bytes
  -> EvidenceArtifact application boundary
  -> private object storage (bytes)
  + PostgreSQL (metadata, links, lifecycle, retention and audit)
```

The local request parser is rule-based. An `OPENAI_API_KEY` deployment setting,
if present, does not by itself establish that buyer requests are sent to
OpenAI; no such runtime path was found in this audit. Source adapters receive a
validated source URL and requested fact scope, not the full buyer request.

## Configuration and hosting boundary

The 2026-11-11 read-only inspection verified only environment-variable names,
scopes, and provider inventory; no secret values or connection strings were
read or recorded.

- Production has a production-scoped primary database variable, and Preview
  has a branch-scoped staging database variable. A generic database variable
  also exists across environments, so precedence and removal of obsolete
  bindings must be controlled explicitly.
- The application prefers the production-specific database variable over the
  generic one, but the production database provider and region cannot be
  proven without an authorized provider-to-deployment binding.
- Known database projects in the connected inventory are located outside
  Russia. None can be asserted to be the Production database merely from its
  name.
- No EvidenceArtifact S3 runtime variables were found in the inspected Vercel
  project. The repository's RU-residency guard is implemented but not deployed
  or proven.
- No repository `vercel.json` pins a Russian runtime region. Vercel documents
  Washington, D.C. (`iad1`) as the default for new Node.js Functions and uses a
  global network. The actual project setting and every processing/logging
  location therefore require deployment evidence, not inference.
- No configured Vercel log drain was found. This does not prove that platform
  request logs contain no personal data or that all processing occurs in an
  approved location.

See [RU data residency and migration plan](ru-data-residency.md) for the
recommended boundary and unresolved proof.

## Existing privacy controls

- `.env.example` contains placeholders, not credentials.
- Source Registry stores credential references, not values.
- generic telemetry rejects raw-request, document, phone, email, financing
  profile, token, password, cookie, authorization, private URL, expert text,
  and optional-comment fields, and rejects common sensitive value patterns;
- application errors persist stable codes and scoped IDs rather than raw
  request bodies or raw database/provider errors;
- readiness and migration commands avoid returning connection-string details;
- the TASK-012 URL boundary rejects credentials in URLs and local/private,
  link-local, and metadata targets, and rechecks redirects;
- EvidenceArtifact metadata contains no raw bytes or provider URL; user
  documents are private by default and use owner-scoped references;
- Source Policy, readiness, feature flags, and collection plans remain required
  before any approved external collection.

These controls reduce exposure but do not establish legal compliance, Russian
localization, authenticated ownership, or an approved retention/destruction
program.

## Open risks and required decisions

1. Identify the actual Production and Preview database projects and regions by
   immutable provider/deployment evidence, without copying credentials into an
   audit artifact.
2. Determine whether each data class is personal data for the actual operator,
   users, and use case; approve lawful basis, notices/consents, processor
   agreements, notification duties, and any cross-border transfer.
3. Ensure the first collection/recording/systematization/storage path for data
   in scope terminates in Russia. Moving only object bytes to RU S3 is not
   sufficient while dynamic form processing or the primary database remains
   outside the approved boundary.
4. Add authenticated buyer and trusted expert/operator access. A caller-held
   session ID is an ownership namespace, not HTTP authentication.
5. Define and execute retention/deletion for buyer journey, expert, feedback,
   and operational data. EvidenceArtifact retention does not cover all tables.
6. Prevent sensitive URL query values and unnecessary free text from being
   retained; define field-level minimization and request-size/rate limits.
7. Prove platform logging, backup, restore, support access, credential rotation,
   incident response, and processor exit procedures.

Relevant references:

- [Article 18 of Federal Law No. 152-FZ](https://www.consultant.ru/document/cons_doc_LAW_61801/cbf4e15b7c330f9372e876cdf2bc928bad7950ef/)
- [Vercel Function region configuration](https://vercel.com/docs/functions/configuring-functions/region)
- [Vercel regions and global network](https://vercel.com/docs/regions)
