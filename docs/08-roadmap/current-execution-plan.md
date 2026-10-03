# Current Execution Plan v4 — «Основание»

**Status:** active source of truth for execution order
**Updated:** 2026-10-03
**Baseline HEAD:** `51a33b7071a3773897401777b6572bfb9f40b585`

This document does not replace `PROJECT.md`, `AGENTS.md`, domain contracts,
source policies, or historical task specifications. It defines the current
implementation sequence from the repository baseline above to a controlled
real-buyer pilot and public beta.

If an active `TASK-XXX.md` conflicts with this document, report and resolve the
conflict explicitly. Do not silently change product semantics or rewrite task
history.

---

## 1. Product destination

«Основание» is not a listings portal and does not merely “help choose.” The
service forms an evidence-backed real-estate decision: it structures the
request, compares relevant options, identifies trade-offs and risks, separates
known facts from claims and unknowns, and states what still requires
verification.

Target journey:

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
Property detail and comparison
↓
User-supplied property / URL when needed
↓
Targeted refresh or expert verification when needed
↓
Evidence-backed result
↓
Decision recomputation
↓
Clear conclusion and next action
```

The first production milestone is not nationwide or full-market coverage. It
is a small, trustworthy, end-to-end decision service with real data, durable
state, evidence provenance, controlled expert workflows, observable failures,
measured source coverage, and a reproducible release gate.

---

## 2. Product and data invariants

These rules are non-negotiable unless the curator explicitly changes product
architecture:

- `Property != Offer`;
- one Property may have multiple Offers;
- do not construct a Frankenstein Offer from incompatible facts across offers;
- `unknown != false` and `unknown != true`;
- `claimed != confirmed`;
- Match Score and Data Confidence remain separate;
- hard criteria remain gates and cannot be compensated by soft criteria;
- AI is not a factual source;
- critical facts require provenance and evidence;
- OpenClaw may collect/extract but cannot rank, confirm facts, decide legal
  cleanliness, or write directly to canonical data;
- source access, automation, storage, display, refresh, attribution, and
  retention permissions remain independent of technical accessibility;
- market source != verification source;
- an official or verification source does not replace marketplace discovery;
- a marketplace listing does not automatically confirm its claims;
- source product priority and source technical-access status are separate
  concepts;
- lack of an open API must not silently remove a mandatory product source;
- the architecture remains geography-neutral even when a pilot dataset is
  local;
- a capability is not implemented “along the way” unless required by the
  active task.

---

## 3. Baseline status

### 3.1 Completed execution stages

The following stages are complete at this document baseline:

- `TASK-023` — unified expert runtime and durable persistence;
- `TASK-024` — deployment/security/documentation hygiene;
- `TASK-024B` — honest GitHub Pages preview;
- `TASK-025` — dynamic staging readiness;
- `TASK-025A` — persisted expert workbench and decision recompute;
- `TASK-025B` — managed staging and external golden flow;
- `TASK-026` — deployed browser golden journey, 9/9 passing at 360, 768,
  and 1280 widths;
- `TASK-027` — operational pilot release gate with verifiable external
  evidence, revision binding, safe subprocess handling, and a deterministic
  machine-readable artifact;
- security hotfix — Next.js and `eslint-config-next` upgraded to `16.3.8`;
  production dependency audit is green at the baseline.

### 3.2 Confirmed repository capabilities

- Next.js + React + TypeScript application with CI;
- deterministic matching with separate Match Score and Data Confidence;
- buyer journey, shortlist, property detail, comparison, expert request,
  workbench/result, and affected-only recomputation;
- PostgreSQL-backed durable application state;
- protected dynamic staging with readiness and browser evidence;
- source-policy and source-readiness boundaries;
- versioned real pilot dataset validation with manually curated real records;
- guarded OpenClaw gateway integration that remains disabled for live
  collection until a source/use case is separately approved and pilot-ready;
- feature flags, kill switches, offline regressions, and operational release
  gate;
- public informational surface and an explicitly demo-only GitHub Pages
  preview.

### 3.3 Current release-gate state

`TASK-027` is complete as infrastructure, but the gate is expected to return
`ready=false` until later roadmap evidence exists. In particular, completion
evidence remains required for the production Evidence Artifact lifecycle,
canonical catalogue, semantic dedup, public/legal readiness, and operational
backup/monitoring/restore.

This is a correct fail-closed state. It is not permission to synthesize PASS
evidence or to begin `TASK-020`.

---

## 4. Source architecture v4

### 4.1 Source roles

Source roles are complementary. They do not imply equal authority and do not
allow facts to be promoted without field-level evidence.

#### MARKET / DISCOVERY

- ЦИАН;
- Авито;
- Домклик;
- Яндекс Недвижимость as an additional channel;
- developer sites;
- contractor/construction-organization sites.

#### NEWBUILD

- ЕИСЖС / наш.дом.рф;
- developer sites;
- ЕРЗ as analytics/reference, not as authoritative Property-fact evidence.

#### IJS

- строим.дом.рф / ДОМ.РФ ИЖС;
- Домклик «Строительство домов»;
- construction-organization and contractor sites.

#### VERIFY

- Росреестр / НСПД;
- ФИАС / ГАР;
- ГИС ЖКХ;
- ФНС;
- НОСТРОЙ where applicable;
- Федресурс / ЕФРСБ;
- КАД Арбитр.

#### FINANCE

- ДОМ.РФ;
- official bank sources.

#### GEO

- Яндекс Карты API or another provider only after licensing and storage review.

### 4.2 Mandatory market core

ЦИАН, Авито, and Домклик are mandatory target market sources for the product.
They cannot be moved to optional/secondary status, removed merely because a
general public search API is unavailable, or replaced by ЕИСЖС or developer
sites.

Each mandatory source requires its own supported-access workstream:

1. official partner/API access;
2. approved source-specific channel;
3. supported user-URL path;
4. operator/manual fallback for a controlled pilot.

A fallback is not equivalent to automated market-search coverage. No source is
described as connected until its supported mode is proven, and no full-market
coverage claim is permitted until coverage is measured.

### 4.3 Source authority and coverage rules

- market sources provide discovery and offer evidence but do not automatically
  confirm Property facts;
- verification sources may confirm specific facts but do not replace the
  marketplace inventory needed to discover Offers;
- registry presence is metadata, not proof of integration;
- a credential reference is not proof that an API works;
- a technically reachable page is not permission to automate, store, display,
  or refresh its content;
- supported access may differ by environment, URL/path scope, entity type, and
  operation;
- source-only share, overlap, duplicates, conflicts, freshness, and segment
  coverage must be measured before making coverage claims.

---

## 5. First-class ИЖС scenarios and future domain boundary

The roadmap includes a first-class scenario:

> «У меня есть участок → хочу построить дом».

A later scenario is:

> «Хочу участок + строительство дома».

The ИЖС extension must introduce explicit domain concepts rather than forcing
construction into ready-property entities:

- `Contractor`;
- `HouseProject`;
- `ConstructionOffer`;
- `ConstructionPackage`;
- `ConstructionScope`;
- `ConstructionTechnology`;
- `ConstructionTimeline`;
- `EscrowEligibility`;
- `ContractorEvidence`;
- `BuildScenario`.

A ready house and a `ConstructionOffer` are not the same product. A project
price is comparable only together with its package/completeness and
`ConstructionScope`; headline prices without scope must not be treated as
equivalent exact prices.

These concepts are planned, not implemented at this baseline.

---

## 6. Authoritative execution order

### DONE

```text
TASK-023
TASK-024
TASK-024B
TASK-025
TASK-025A
TASK-025B
TASK-026
TASK-027
Next.js security hotfix 16.3.8
```

### NEXT

```text
TASK-028
TASK-029
TASK-029B
TASK-029C
TASK-029D
TASK-029E
TASK-029F
TASK-030A
TASK-030A1
TASK-030
TASK-030B
TASK-030C
TASK-030D
TASK-030E
TASK-030F
TASK-030G
TASK-030H
TASK-030I
TASK-031
TASK-031A
TASK-031B
TASK-031C
TASK-031D
OPS-01 through OPS-08
TASK-020
Public beta
```

Business-access work for `TASK-030A` (ЦИАН / Авито / Домклик) may begin in
parallel earlier because partner lead times are external. The coding sequence
does not skip `TASK-028`, `TASK-029`, or `TASK-029B`.

---

## 7. Planned task contracts

### TASK-028 — Production Evidence Artifact lifecycle

Make evidence a durable first-class production asset outside Git.

Minimum boundary:

- object/blob storage;
- immutable artifact identity;
- source URL/reference and source ID;
- collection timestamp and MIME/type metadata;
- checksum such as SHA-256;
- lifecycle state such as `quarantine`, `staged`, `approved`;
- private-by-default access for user documents;
- retention policy;
- linkage from `FieldEvidence` / source snapshots;
- no public document URL by default;
- no direct canonical write from raw collection output.

Exit: an artifact can be stored, validated, referenced, audited, retained, and
access-controlled without committing raw evidence to Git.

### TASK-029 — Canonical catalogue transition

Move real pilot Property/Offer/Source/Evidence data into durable canonical
storage while preserving curated import as a controlled ingestion path.

Required: explicit Property and Offer persistence, source/evidence links,
versioned import, provenance preservation, and no merging of commercial Offer
differences into Property.

### TASK-029B — Semantic dedup / identity resolution

Detect the same physical Property under different identifiers while preserving
distinct Offers. Cover different sources and IDs, multiple prices, same-layout
different-unit protection, user-URL duplicates, false-merge protection, and
reviewable ambiguous conflicts.

Large dataset expansion cannot precede this exit criterion.

### TASK-029C — API / credential inventory

Record credential references and integration status without storing secret
values in this roadmap or repository.

Minimum inventory:

- `OPENAI_API_KEY`;
- OpenClaw model-provider credential;
- `REDS_OPENCLAW_GATEWAY_TOKEN`;
- CIAN access credential;
- Avito partner credential;
- Domclick credential;
- Yandex Maps API key;
- other actually purchased/available credentials.

Allowed statuses:

- `ACTIVE_AND_USED`;
- `AVAILABLE_NOT_INTEGRATED`;
- `PENDING_PARTNER_ACCESS`;
- `UNUSED_REVOKE`.

An available key remains not integrated until an allowed runtime path and
provider smoke test prove its use.

### TASK-029D — Parser quality benchmark / OpenAI decision

Benchmark 30–50 real, anonymized requests. Measure:

- must/exclude accuracy;
- missed hard criteria;
- false hard criteria;
- unknown preservation;
- contradiction detection;
- fuzzy Russian handling;
- ИЖС requests.

Add an OpenAI/LLM parser only if the benchmark demonstrates a material need.
If added, require a schema-constrained adapter, deterministic validation,
fallback behavior, and a cost cap. The model does not become a factual source.

### TASK-029E — ИЖС domain extension

Introduce the domain concepts listed in section 5. Keep ready homes,
`HouseProject`, and `ConstructionOffer` distinct. Model packages and scope so
prices are not compared independently of completeness.

### TASK-029F — Source Registry v2

For each source store at least:

- source ID;
- role/category;
- supported entity/property types;
- domains;
- access method;
- automation rights;
- storage rights;
- display rights;
- refresh rights;
- attribution;
- retention;
- `credential_ref`;
- environment;
- URL/path scope;
- rate limits;
- freshness policy;
- evidence contract;
- `reviewed_at`;
- production approval.

Unknown or missing policy fields remain fail-closed.

### TASK-030A — Core Market Access Program

ЦИАН, Авито, and Домклик are all mandatory. Create a separate access dossier
for each:

```text
docs/06-data-collection/access-dossiers/<source>.md
```

Each dossier covers:

- official API/partner channel;
- market-search scope;
- credential process;
- pricing/limits;
- storage/display/refresh rights;
- attribution;
- permitted property types;
- commercial-use status;
- sandbox/test availability;
- partner response;
- final integration decision.

Absence of partner access may produce a blocker or an approved bounded
fallback; it does not make the source optional and does not permit broad
crawling.

### TASK-030A1 — Mandatory Source Coverage Gate

A mandatory source is not connected merely because it appears in the registry.

For each mandatory source prove:

- registered;
- policy reviewed;
- supported mode exists;
- credential/config status known;
- adapter or manual path proven;
- freshness mode known;
- evidence/provenance produced;
- health/smoke status known.

Minimum coverage gate:

- ЦИАН;
- Авито;
- Домклик;
- ЕИСЖС;
- at least one developer source;
- at least one ИЖС source.

OpenClaw readiness is a separate block:

- gateway configured;
- collector skill available;
- model provider configured;
- credential present;
- approved source/use case exists;
- live smoke passed.

API readiness is also separate:

- `credential_ref` exists;
- runtime secret configured;
- provider reachable;
- scope valid;
- billing/limits known;
- integration smoke passed.

Registry-only status must never satisfy this gate.

### TASK-030 — Real pilot dataset expansion

Begin only after canonical storage and semantic dedup.

Targets:

1. first 20–30 real Properties;
2. then 30–50 physical Properties / approximately 40–70 Offers where evidence
   permits.

Include newbuild, secondary, ready houses, multiple Offers, market-core
examples, unknown/conflict/stale cases, financing, duplicate identity, hard
fail, and critical unknown cases.

### TASK-030B — Multi-source coverage proof

Measure rather than assume:

- unique eligible Offers by source;
- overlap;
- source-only share;
- duplicate rate;
- price conflicts;
- freshness;
- segment coverage.

Do not publish an unverified percentage of market coverage.

### TASK-030C — OpenClaw LIVE vertical slice

Required flow:

```text
approved source
→ Collection Plan
→ OpenClaw Gateway
→ real-estate-collector
→ staged result
→ Evidence policy
→ validation
→ normalization
→ identity/dedup
→ canonical
→ matching
```

Rules:

- exact target URLs only;
- no arbitrary crawling;
- no CAPTCHA/auth bypass;
- no direct canonical write;
- no ranking or verification promotion by OpenClaw;
- bounded timeout/output/cost;
- no secrets in logs.

At this baseline OpenClaw is not live. This task cannot begin without the
approved source/use-case and readiness evidence in `TASK-030A1`.

### TASK-030D — Real source-discovery agent

Use for discovery of regional sources, new developers, and ИЖС contractors.

```text
discovery
→ candidate dossier
→ human review
→ Source Policy
→ registry
→ collector approval
```

Discovery must never auto-promote a source to production.

### TASK-030E — Live user URL ingestion

Provide real supported paths for ЦИАН, Авито, Домклик, and developer URLs,
plus an unsupported-source fallback.

Required safety: SSRF protection, redirect limits, private-IP block,
size/type limit, timeout, provenance, and dedup against canonical data.

### TASK-030F — Targeted refresh runtime

Minimum scope:

- price;
- availability;
- permitted promotions;
- financing where policy allows;
- stale detection;
- bounded queue and controlled retries;
- source health;
- evidence;
- affected-only recomputation;
- kill switch.

### TASK-030G — ИЖС contractor/project search proof

Prove the end-to-end scenario:

> «Есть участок, хочу дом 120 м², 3 спальни, до X млн, въехать до Y».

Compare permitted data from строим.дом.рф, Домклик contractor/project paths,
approved contractor sites, and ready houses as an alternative scenario.

### TASK-030H — Verification vertical slice

For a market Offer:

```text
Market Offer
→ Property identity
→ FIAS
→ NSPD/Rosreestr
→ project/building source
→ FNS
→ finance source
→ evidence
→ Data Confidence
```

For a Contractor, use FNS, НОСТРОЙ where applicable, Федресурс, КАД Арбитр,
and platform evidence. Each verification result remains field-scoped and does
not silently overwrite conflicts.

### TASK-030I — Durable pilot telemetry

In-memory telemetry is insufficient. Add persistent, privacy-safe telemetry
for funnel, shortlist, comparison, URL ingestion, expert flow, recompute, and
recoverable errors.

Do not store raw user-request text, documents, contact data, or secrets in
telemetry.

### TASK-031 — Complete public product surface

The public product must include:

- «Опишите задачу»;
- «У меня уже есть варианты»;
- ready-house scenario;
- ИЖС scenario only after `TASK-030G` is ready;
- source-coverage disclosure;
- methodology;
- FAQ;
- clearly labelled demo cases.

Primary buyer-facing copy should use “формируем решение,” “проводим проверку,”
“сопоставляем варианты,” “выявляем риски,” and “формируем вывод,” rather than
“помогаем” as the main product formula.

### TASK-031A — Expert operator access + notifications

Add trusted operator authentication/authorization and bounded notifications
around the existing expert workflow. Operator identity configuration is not a
substitute for HTTP authentication.

### TASK-031B — Privacy/legal/metadata

Complete privacy treatment for buyer/journey/expert data, consent boundaries,
operator/legal details, contact channels, canonical production URL, sitemap,
robots, and indexation rules. No placeholder legal/service copy may be indexed
in public production.

### TASK-031C — Abuse/rate-limit/public API hardening

Define and enforce public API abuse controls, rate limits, payload limits,
safe diagnostics, and operational response procedures without weakening
owner/access boundaries.

### TASK-031D — Paid expert-service commerce

Only after service scope, pricing, SLA, legal terms, access control, and result
boundaries are approved, implement the paid-service boundary. Do not infer
commercial terms or launch paid requests earlier.

---

## 8. Operational readiness gates

Operational readiness is explicit release evidence, not an assumption derived
from successful hosting.

### OPS-01 — Production environment

Managed production runtime, database/pooling, environment separation, and
readiness proof.

### OPS-02 — Secrets

Secret inventory, least privilege, rotation/revocation, no client/log/artifact
leakage, and validated runtime references.

### OPS-03 — Backup/restore

Backup policies for PostgreSQL and evidence storage plus an actual restore
drill with recorded evidence.

### OPS-04 — Monitoring

Privacy-safe structured errors, health/readiness, source health, queue health,
alerts, and ownership/runbooks.

### OPS-05 — Deploy/rollback/kill-switch drill

Prove deploy, rollback, feature-disable, source-disable, and incident-stop
paths rather than relying only on documentation.

### OPS-06 — GitHub governance / branch protection

`main` must have required CI and PR governance before public beta. Direct
unreviewed changes must not bypass the release process.

### OPS-07 — Domain

Production domain, DNS, TLS, canonical URL behavior, and metadata validation.

### OPS-08 — Cost guardrails

Budgets and limits for hosting, database, storage, maps/APIs, model providers,
OpenClaw execution, notifications, and expert operations.

All OPS items become verifiable release-gate evidence. Operational
backup/monitoring/restore remains a hard blocker until proven.

---

## 9. TASK-020 — Controlled Real Buyer Pilot

`TASK-020` remains the authoritative pilot-execution specification and stays
last before public beta.

Pilot begins only after the operational release gate reports `ready=true`,
except for the already documented curator override if it is deliberately used
for its existing smaller internal/friendly cohort. This plan does not broaden
or reinterpret that override.

Recommended waves:

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

Stop expansion for any critical issue, including a hard criterion violation,
inconsistent Match Score, claimed-as-confirmed presentation, source-policy
bypass, private-data leakage, incorrect Property/Offer merge, or unauditable
expert overwrite.

Public beta follows only after pilot evidence is reviewed and the release gate
is rerun for material changes.

---

## 10. Go / no-go rules

### GO

- continue the current architecture and close gaps in place;
- keep Property, Offer, Evidence, matching, and confidence semantics separate;
- build Evidence Artifact storage before canonical scale-up;
- establish canonical storage and semantic dedup before large dataset growth;
- pursue mandatory-source access dossiers in parallel where external lead time
  requires it;
- measure multi-source coverage before making coverage claims;
- add APIs, OpenClaw, discovery, URL ingestion, refresh, and verification only
  through their explicit policy/readiness gates;
- begin `TASK-020` only through the operational release gate or the existing
  explicitly documented curator override.

### NO-GO

- no registry-only claim that a source is connected;
- no market-wide coverage claim without measurement;
- no silent removal or demotion of ЦИАН, Авито, or Домклик because access is
  difficult;
- no replacement of mandatory marketplace sources by one official source or
  developer sites;
- no OpenClaw live collection without an approved source/use case;
- no API key considered integrated until a runtime smoke test passes;
- no broad crawling to compensate for missing partner access;
- no CAPTCHA/auth bypass;
- no large dataset before canonical storage and semantic dedup;
- no raw evidence repository in Git as the production evidence store;
- no LLM promotion of facts or direct canonical writes;
- no ИЖС feature claim before its domain and vertical slice are implemented;
- no real-buyer pilot while hard blockers remain;
- no public beta without required CI/PR governance, privacy/legal readiness,
  and operational evidence.

---

## 11. Decisions and external dependencies still requiring evidence

Do not silently invent decisions about:

- partner/API access for ЦИАН, Авито, and Домклик;
- commercial terms, pricing, quotas, storage/display/refresh rights;
- approved ИЖС sources and contractor-verification scope;
- geo-provider licensing and storage rights;
- actual API/model/OpenClaw credential availability and use;
- evidence/object-storage provider and region;
- production hosting/database regions;
- expert scope, pricing, turnaround/SLA, notifications, and commerce;
- privacy/legal wording, operator details, contact channels, and final domain;
- pilot expansion and public-beta timing.

Record unknowns as blockers or open decisions. Do not describe credentials,
source access, OpenClaw live execution, ИЖС capability, or market coverage as
working before their task-specific evidence exists.

---

## 12. How to use this plan

Before starting the next implementation task:

1. check actual `main` HEAD and working tree;
2. review prior task evidence and release-gate state;
3. select the first incomplete task in section 6;
4. create one atomic task specification for that gap;
5. do not implement later phases “while here”;
6. run the task-required checks and build;
7. report exact evidence, limitations, and the next dependency;
8. review the diff before commit/push;
9. update this plan only when completion, order, or an explicit curator decision
   changes the source of truth.

At this baseline the next coding task is **TASK-028 — Production Evidence
Artifact lifecycle**. `SYNC-ROADMAP-v4` changes documentation only and does not
start that task.
