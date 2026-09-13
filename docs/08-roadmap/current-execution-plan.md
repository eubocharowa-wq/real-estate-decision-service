# Current Execution Plan — «Основание»

**Status:** active source of truth for execution order  
**Updated:** 2026-09-13  
**Baseline HEAD when adopted:** `bfb8f4ba958f9057fe1c0e9f6fa9e393fb42fe00`

This document does not replace `PROJECT.md`, `AGENTS.md`, domain contracts, source policies, or historical task specifications. It defines the **current implementation sequence from the present repository state to a controlled real-buyer pilot and public beta**.

If a current `TASK-XXX.md` conflicts with this document, the task remains the immediate execution contract, but the conflict must be reported and resolved rather than silently changing product semantics.

---

## 1. Product destination

«Основание» is not a listings portal. The product must help a buyer make a better real-estate decision.

Target user journey:

```text
Life task / natural-language request
↓
Structured understanding and confirmation
↓
Relevant shortlist
↓
Personal Match Score + Data Confidence
↓
Reasons, compromises, unknowns and conflicts
↓
Property detail
↓
Comparison of finalists
↓
User-supplied property / URL when needed
↓
Targeted expert verification when needed
↓
Evidence-backed result
↓
Decision recomputation
↓
Clearer next action
```

The first production milestone is not nationwide coverage. It is a **small, trustworthy, end-to-end working buyer decision service** with real data, durable state, evidence provenance, controlled expert workflows, observable failures, and a release gate.

---

## 2. Product invariants that must not be changed by implementation work

The following remain non-negotiable unless the curator explicitly changes product architecture:

- `Property != Offer`;
- one Property may have multiple Offers;
- do not construct a Frankenstein Offer from incompatible facts across offers;
- `unknown != false` and `unknown != true`;
- `claimed != confirmed`;
- Match Score and Data Confidence remain separate;
- hard criteria are gates and cannot be compensated by soft criteria;
- AI is not a factual source;
- critical facts require source/provenance/evidence;
- OpenClaw may collect/extract but does not rank, confirm advertisements, decide legal cleanliness, or write directly to canonical data;
- source access, storage, display, refresh and attribution policy remain independent of technical scraping capability;
- the product remains architecture-neutral to geography even when the pilot dataset is local;
- a new capability is not implemented “along the way” unless required by the current task.

---

## 3. Current repository state at adoption

The project has already moved beyond the original mock-only MVP stage.

Confirmed current capabilities include:

- Next.js + React + TypeScript application with CI;
- deterministic matching and separate data-quality/confidence semantics;
- buyer journey, shortlist, property detail and comparison flows;
- PostgreSQL repository implementations for durable user/application state;
- server-side buyer journey recovery rather than tab-only state;
- expert domain layer and expert workbench flows;
- pilot hardening, telemetry contracts, feature flags, kill switches and release-gate logic;
- source-policy model and data-collection abstractions;
- five manually curated real ЕИСЖС pilot objects with field-level provenance discipline;
- explicit `REDS_APPLICATION_MODE` and real curated data reachable through the actual buyer-journey HTTP runtime in `pilot` mode;
- public brand «Основание» and public informational site;
- GitHub Pages review deployment as a static, noindex visual preview only.

The project is therefore **not a rewrite candidate**. Work should close operational, persistence, deployment, evidence, data-quality and product-completion gaps around the existing architecture.

---

## 4. Known gaps that define the next implementation sequence

### 4.1 Expert runtime is split

The main buyer-journey runtime receives repositories from `createRepositorySet()` and therefore can use PostgreSQL when `DATABASE_URL` is configured. It also receives `resolvePilotRuntimeConfig()`.

However, `document_review` and `onsite_check` can still go through the separate `/api/expert-requests` path, which currently constructs an in-memory expert repository and separately reads the pilot dataset. This creates persistence and dataset/runtime drift.

This is the first blocker to close.

### 4.2 Published GitHub Pages is not the real application runtime

`TASK-022` intentionally exports only a static review build. API routes, PostgreSQL-backed flows and dynamic buyer/expert screens are excluded.

GitHub Pages therefore must remain a **visual preview**, not be treated as the production service.

### 4.3 No production-like dynamic deployment has yet been accepted

The next meaningful environment must run the real Next.js server/application runtime with PostgreSQL and pilot configuration.

### 4.4 Browser-level end-to-end verification is missing

Application/integration tests are strong, but a deployed browser journey must also be tested. This is required to catch broken navigation, missing APIs, environment/configuration drift and responsive UI failures.

### 4.5 Release-gate logic exists but is not yet an operational deployment gate

`evaluatePilotReleaseGate()` must be wired to real evidence and produce a machine-readable pass/fail result that can block pilot deployment.

### 4.6 Evidence artifacts are not yet managed as a production evidence lifecycle

The product model is evidence-first, but production storage must support raw evidence/artifact metadata, checksum, state, access boundaries and retention outside Git.

### 4.7 Curated pilot dedup is not yet semantic identity resolution

Duplicate IDs can be rejected, but the same physical property entered under different IDs can still evade duplicate detection. Before scaling the curated dataset, the project needs semantic/property identity resolution that preserves separate Offers.

### 4.8 Canonical catalogue/data storage is still transitional

Durable user/application state exists, but the real pilot property catalogue remains curated-dataset driven. A controlled transition to canonical Property/Offer/Source/Evidence storage is still required.

### 4.9 Public product and legal content are not fully launch-ready

The public second entry (“I already have options”), expert service scope/price/timing, selection-data privacy language, production domain metadata and final legal/operator review remain launch dependencies.

### 4.10 Dependency/security triage must be completed before external pilot

CI has reported dependency vulnerabilities. These must be classified into production-reachable, dev-only or non-exploitable categories, remediated where required, and turned into a repeatable security gate rather than ignored output.

---

## 5. Execution order

The implementation order below is intentional. Do not jump to large-scale source collection, dataset growth or TASK-020 before the preceding exit criteria are met.

---

# Phase A — Runtime integrity and durable expert flow

## TASK-023 — Unify expert request runtime and durable persistence

### Goal

All ExpertRequest types must use one coherent application/runtime boundary, the correct pilot dataset and durable persistence.

### Required result

- eliminate the split persistence behavior between buyer-journey expert requests and `/api/expert-requests`;
- reuse the existing PostgreSQL expert repository rather than adding a new implementation;
- apply `REDS_APPLICATION_MODE` consistently to expert context;
- real curated pilot properties shown to the buyer must be valid expert-context properties;
- preserve document-review and onsite-specific context and access boundaries;
- add PostgreSQL persistence regression proving survival across a new application/runtime instance;
- add pilot/demo isolation regression tests;
- keep existing matching, evidence and verification semantics unchanged.

### Exit criteria

A real curated pilot property can be selected in the normal buyer journey and used to create every supported expert request type through the real server boundary. With PostgreSQL enabled, the request survives runtime/application re-instantiation.

---

# Phase B — Repository hygiene, security and honest preview

## TASK-024 — Deployment/security hygiene

### Scope

- fix stale `.env.example` statements about PostgreSQL implementation;
- synchronize README/status documentation with the actual architecture;
- run and classify dependency audits, including production-only dependencies;
- remediate reachable critical/high vulnerabilities or document a justified non-production exception;
- review install-script/supply-chain warnings;
- define the minimum dependency-security CI check for pilot.

Do not combine this task with broad framework upgrades unless required to close an actual blocker.

## TASK-024B — GitHub Pages preview integrity

The static preview must not pretend that excluded backend flows work.

Required:

- no navigation link should point to a route removed by the Pages preparation step;
- no primary CTA should attempt an API call that does not exist in the static deployment;
- if interactive flows are shown for design review, they must be clearly non-operational/static;
- generated `out/` artifacts should have an automated internal-link check;
- keep preview noindex.

### Exit criteria

GitHub Pages is internally consistent and clearly a review-only surface. It is not used as evidence that the production application has been deployed.

---

# Phase C — Full dynamic staging

## TASK-025 — Production-like dynamic staging

### Goal

Deploy the actual Next.js application runtime rather than a static export.

### Required environment

- full dynamic Next.js runtime;
- managed PostgreSQL;
- safe connection/pooling configuration;
- real environment-variable/secret management;
- explicit `REDS_APPLICATION_MODE=pilot` only when deliberately enabled;
- persistent journey/expert/feedback/error state;
- no synthetic records presented as real pilot records;
- health/readiness signal;
- documented rollback path.

### Required golden flow on staging

```text
home
→ request entry
→ confirmation
→ shortlist
→ property detail
→ comparison
→ expert request
→ expert workbench/result
→ decision recompute
```

Also verify:

- page reload/recovery;
- a second runtime/process can read prior state from PostgreSQL;
- demo mode remains isolated;
- errors remain diagnosable without leaking sensitive internals.

### Exit criteria

An external staging URL runs the complete application flow over PostgreSQL and survives runtime restart/re-instantiation without losing required journey/expert state.

---

# Phase D — Real browser E2E

## TASK-026 — Browser-level golden journey

Use Playwright or equivalent browser automation against the real deployed application.

Minimum coverage:

- desktop and mobile viewports (at least representative 360, 768 and 1280 widths);
- request → confirmation → shortlist → property → comparison;
- expert request;
- user URL entry path;
- reload/recovery;
- not-found/recoverable-error behavior;
- dead-link/404 detection for primary navigation;
- basic accessibility smoke checks;
- both demo isolation and pilot mode where environment allows.

### Exit criteria

The deployed golden buyer journey is green in a real browser, not only in application tests.

---

# Phase E — Operational release gate

## TASK-027 — Turn pilot release logic into a real gate

### Goal

Connect existing release-gate logic to real release evidence.

### Runner must collect or receive evidence for at least

- build/typecheck/lint status;
- core regression status;
- PostgreSQL/database checks;
- browser E2E result;
- secrets/security status;
- source readiness;
- provenance/evidence readiness;
- hard-criteria semantics;
- Match Score/Data Confidence separation;
- expert evidence boundary;
- URL-ingestion safety;
- real pilot dataset readiness;
- rollback readiness;
- known warnings/limitations.

### Output

Produce a versioned machine-readable artifact, for example:

```json
{
  "ready": false,
  "blockers": [],
  "warnings": [],
  "evidence": {}
}
```

The command/CI step must exit non-zero when hard blockers make `ready=false`.

### Exit criteria

There is one reproducible command/CI job that answers whether TASK-020 may start. No manual assumption may substitute for it.

---

# Phase F — Production evidence lifecycle

## TASK-028 — Evidence Artifact storage

### Goal

Make evidence a durable first-class production asset outside Git.

### Required concepts

At minimum support:

- object/blob storage;
- immutable artifact identity;
- source URL/reference;
- source ID;
- collection timestamp;
- MIME/type metadata;
- checksum (e.g. SHA-256);
- artifact state such as `quarantine`, `staged`, `approved`;
- access policy/private-by-default for user documents;
- retention policy;
- linkage from `FieldEvidence` / source snapshots;
- no public document URL by default;
- no silent canonical write directly from raw collection output.

### Exit criteria

A collected or uploaded evidence artifact can be stored, validated, referenced by normalized facts, audited and access-controlled without committing raw evidence to Git.

---

# Phase G — Canonical property data and semantic dedup

## TASK-029 — Canonical catalogue transition

Move real pilot Property/Offer/Source/Evidence data toward durable canonical storage while preserving current curated import as a controlled ingestion path during transition.

Required:

- explicit Property and Offer persistence;
- source/evidence links;
- versioned/importable curated data;
- no loss of provenance;
- no merging of commercial Offer differences into Property.

## TASK-029B — Semantic dedup / identity resolution

Support detecting the same physical property under different external/internal IDs.

Minimum tests:

- same unit, different sources;
- same unit, different candidate IDs;
- same Property, different Offer/price;
- same layout but different unit must not merge;
- false-merge protection;
- user URL duplicate against canonical inventory;
- ambiguous cases produce a reviewable conflict rather than silent merge.

### Exit criteria

Scaling the dataset no longer depends on operators manually remembering which physical units were already entered.

---

# Phase H — Real data expansion and source coverage

## TASK-030 — Expand real pilot dataset safely

Only after Phase G protections.

### First target

20–30 varied real properties, then 30–50 physical Properties / approximately 40–70 Offers where evidence permits.

Dataset should intentionally include:

- new-build and at least one additional relevant property segment when policy/data allow;
- multiple Offers for selected Properties;
- unknown fields;
- conflicts;
- stale/refresh cases;
- financing scenarios;
- duplicate identity cases;
- hard-fail and critical-unknown benchmark cases.

### Measure

- field coverage;
- critical unknown rate;
- duplicate/identity-resolution rate;
- freshness;
- conflict rate;
- shortlist failure reasons;
- matching misses;
- source-specific gaps.

## TASK-030B — Add a second approved real source

Do not add a source only to increase count. The second source exists to validate:

- multi-source provenance;
- conflict handling;
- semantic dedup;
- different refresh/freshness policies;
- source readiness gates;
- coverage gain.

Prefer high-value approved sources such as developer/authoritative sources before broad aggregator dependence when policy and product coverage support that choice.

### Exit criteria

The product can explain not only what it found, but also the limits of its connected-source coverage.

---

# Phase I — Public product and legal launch readiness

## TASK-031 — Complete public product surface

Required product work:

- expose the second entry point for users who already have properties/URLs;
- ensure all primary public navigation corresponds to working product routes on the real deployment;
- complete expert-service scope, result format, price/timing/SLA and onsite boundary after curator decision;
- ensure result language clearly separates information review, legal opinion, visual onsite check and engineering inspection.

## TASK-031B — Privacy/legal/production metadata

Required before public indexing or paid requests:

- complete privacy treatment for buyer-selection/journey data;
- final operator/legal details and contact channels;
- consent boundaries for pilot telemetry/feedback/expert context where required;
- production `NEXT_PUBLIC_SITE_URL`;
- final canonical URLs, sitemap and robots rules;
- only launch-ready pages indexed;
- no placeholder legal/service copy in public production.

### Exit criteria

A real user can understand what the service does, what expert work includes, what is stored, what is not guaranteed, and how to contact the operator.

---

# Phase J — Production operations readiness

Before real-buyer pilot, verify the operational layer rather than assuming hosting is enough.

Required:

- managed PostgreSQL and pooling;
- backup policy and an actual restore drill;
- object-storage backup/retention where applicable;
- secrets management;
- structured error monitoring;
- health/readiness checks;
- deploy/rollback runbook;
- `demo` / `pilot` / `production` configuration separation;
- kill switches tested;
- no secrets or sensitive evidence in logs;
- no synthetic data silently mixed into pilot/production.

This may be implemented as focused tasks rather than one large infrastructure task, but all items become release-gate evidence.

---

# Phase K — TASK-020 Controlled Real Buyer Pilot

`TASK-020` remains the authoritative task specification for pilot execution. Do not rewrite it into this plan.

Pilot may begin only after the operational release gate reports `ready=true`, unless the existing task’s explicitly defined curator override is deliberately used for a smaller internal/friendly cohort.

Recommended sequence remains:

```text
Wave 1: 3–5 users
↓
review evidence and critical issues
↓
Wave 2: 5–10 users
↓
review again
↓
expand only by explicit decision
```

Primary pilot question:

> Did the service make it clearer what the buyer should consider, why, what the trade-offs are, and what still needs verification before a decision?

Do not optimize pilot success around clicks or purchase conversion alone.

Stop expansion when a critical issue is found, including:

- hard criterion silently violated;
- inconsistent Match Score;
- claimed fact shown as confirmed;
- source-policy bypass;
- private-data leakage;
- incorrect Property/Offer merge;
- expert result overwriting evidence without auditability.

---

# Phase L — Public beta after evidence

After pilot:

- cluster observations by evidence and root cause;
- do not turn every comment into a feature;
- create separate tasks only for repeated/material problems;
- version matching changes rather than tuning weights after one user;
- expand sources/geography only when coverage evidence justifies it;
- re-run browser E2E, security and release gate after material changes;
- then open a larger public beta cohort.

---

## 6. Deferred expansion: investment platform contour

The broader investment concept remains strategically compatible with the architecture, but it must not dilute the buyer MVP before the core decision service is proven.

Potential later contours include:

- investment properties and development projects seeking capital;
- investor profiles/interests and mandate matching;
- project/investment due-diligence workflows;
- commercial, hospitality and other income-producing real estate;
- project owner ↔ investor discovery/matching.

When activated, reuse the existing strengths where appropriate:

- evidence/provenance;
- source verification;
- structured criteria;
- matching;
- expert review;
- decision explanations.

Do **not** force investor/project entities into `Property`/`Offer` if their semantics differ. That expansion requires its own product/domain design decision after the buyer product is validated.

---

## 7. Current task sequence

Current intended order:

```text
TASK-023  Unify expert runtime + durable persistence
TASK-024  Deployment/security/documentation hygiene
TASK-024B Honest GitHub Pages preview
TASK-025  Full dynamic staging
TASK-026  Browser E2E
TASK-027  Operational pilot release gate
TASK-028  Evidence Artifact storage
TASK-029  Canonical catalogue transition
TASK-029B Semantic dedup / identity resolution
TASK-030  Expand real pilot dataset
TASK-030B Second approved real source
TASK-031  Public product completion
TASK-031B Privacy/legal/production metadata
Operational readiness / backup / monitoring checks
TASK-020  Controlled real buyer pilot
Public beta only after pilot evidence
```

Task numbering after `TASK-022` is an execution convention from this plan. If a number is already used on the actual branch when a new task begins, use the next free number rather than rewriting task history.

---

## 8. Go / no-go rules

### GO

- continue the current architecture;
- fix runtime/persistence gaps in place;
- use GitHub Pages only as a visual preview;
- deploy a full dynamic staging runtime;
- scale real data only after evidence and dedup protections;
- start TASK-020 only through the release gate.

### NO-GO

- no rewrite of the product architecture without a demonstrated need;
- no claim that static GitHub Pages is the production application;
- no public paid expert requests while expert persistence/legal scope is incomplete;
- no production indexing of unfinished legal/service pages;
- no large-scale curated-data growth before semantic dedup;
- no raw evidence repository in Git as the production evidence store;
- no uncontrolled crawler/source expansion;
- no real-buyer pilot while hard blockers remain;
- no investment-platform expansion before the buyer decision product proves value.

---

## 9. Curator decisions still required

Technical work must surface, not silently invent, decisions about:

- production/dynamic hosting provider and region;
- managed PostgreSQL provider/region;
- evidence/object-storage provider and region;
- expert service scope;
- expert price and turnaround/SLA;
- exact expert result format;
- onsite service boundary;
- final privacy/legal wording and operator details;
- final domain;
- whether the dark/gold expert/investment contour remains part of the public «Основание» identity;
- when to activate the investment-platform contour after buyer-MVP validation.

---

## 10. How to use this document

Before creating the next implementation task:

1. check actual `main` HEAD and working tree;
2. review the previous task output and uncommitted changes;
3. find the first phase in this plan whose exit criteria are not satisfied;
4. create one atomic `TASK-XXX.md` for that gap;
5. do not implement later phases “while here”;
6. run the task-required tests and build;
7. report exact results, known limitations and next dependency;
8. review the diff before commit/push;
9. update this execution plan when a phase is completed, reordered or intentionally superseded.

This document is intended to prevent agreed work from being lost when attention shifts to a new topic.
