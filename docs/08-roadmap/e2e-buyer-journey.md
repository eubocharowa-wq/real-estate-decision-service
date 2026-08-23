# End-to-End Buyer Journey (TASK-018)

## Purpose

This integration joins the existing parser, request confirmation, matching,
Data Quality, shortlist, detail, comparison, user URL, refresh, and expert
boundaries into one versioned application workflow. It does not add a matching
formula or a new source/expert engine.

## Controlled flow

```text
Natural-language request
→ Parser
→ Request Confirmation
→ ConfirmedRequestRecord vN
→ MatchingBundle v1
→ Shortlist / Property Detail / ComparisonState vN
→ ExpertRequest + versioned ExpertContextPackage
→ ExpertResult
→ FieldEvidence + canonical update hook
→ affected-only Match/DataQuality recompute
→ DecisionUpdate
→ Updated Decision
```

The golden fixture request is:

```text
Найди 5 квартир до 5 млн.
Семейная ипотека обязательна.
Желательно без первоначального взноса.
Первый этаж не рассматриваю.
```

## State ownership

`BuyerJourneyRepository` is the sole application-state boundary. The pilot
implementation is `InMemoryBuyerJourneyRepository`; its interface separates:

- `BuyerJourney` workflow refs;
- `ConfirmedRequestRecord` business versions;
- `MatchingBundle` result versions;
- `ComparisonState` versions;
- `DecisionUpdate` before/after records;
- normalized imported candidates;
- append-only expert evidence and canonical overlays.

The browser stores only a stable anonymous `session_id`, `journey_id`, the
existing parser confirmation payload, and navigation selections. It does not
store duplicate full `Property`, `Offer`, or `MatchResult` state. In-memory
state survives navigation/page reload while the application runtime remains
alive, but it is not long-term account persistence.

## Version rules

- Every confirmation increments `confirmed_user_request_version`.
- Every `MatchingBundle` records request ID/version, matching/confidence/
  criteria versions, and the dataset snapshot.
- Editing a request marks the previous bundle and comparison stale before any
  new score may be shown.
- A comparison accepts only entries from one active bundle/request version.
- Expert context contains a `decision_snapshot` with journey, request,
  matching, Data Quality, and comparison refs/versions.
- A `DecisionUpdate` is emitted only from real old/new bundles. A
  no-recompute expert outcome does not fabricate a new result.

## Matching and confidence

`runMatchingForConfirmedRequest(...)` calls the existing Criteria Registry,
`matchProperty(...)`, and `calculateDataQuality(...)`. It contains no price,
floor, or financing scoring rules. The shortlist and downstream views are
built from the saved bundle.

Expert evidence can improve Data Confidence independently. Match Score changes
only if a validated canonical fact changes an evaluator input. The golden case
confirms a previously claimed financing applicability: confidence rises while
the already-matching factual score remains stable.

## Property, Offer, and scenario integrity

`Property` and `Offer` remain separate. Selected offer/scenario refs originate
from the same `MatchingEngineResult`; comparison and expert context reuse those
exact refs. The golden test asserts that each scenario belongs to the selected
property and offer, preventing a Frankenstein offer.

## User URL integration

The offline `fixture.example` adapter produces a normalized candidate. The
journey repository stores it by ingestion ID, and the candidate enters the same
matching/confidence engines before it can join comparison. `user_link` origin
adds no Match Score bonus or penalty. Restricted sources retain manual fallback
and never trigger an automatic fetch through this integration.

## Refresh integration

Refresh requests use the TASK-015 `RefreshTaskService` and Source Policy
boundary. The current `src_dev_02` `targeted_refresh` decision remains denied;
the journey returns `SOURCE_POLICY_BLOCKED` and continues with the current
freshness status. A successful synthetic `RefreshResult` can trigger an
affected-only recompute. TASK-018 adds no scheduler, worker, adapter, or live
request.

## Expert integration

Journey requests use `ExpertRequestService`, deterministic routing, the
existing status machine, and `ExpertCompletionService`. Evidence is appended
through the evidence hook; confirmed facts request a validated transient
canonical overlay; only affected properties are recomputed. If recompute fails,
the immutable expert result remains saved and the journey exposes a recoverable
state.

## Recovery and errors

The application taxonomy maps internal states to human-readable recovery:

- missing journey → start at request entry;
- stale request/bundle/comparison → confirm and recompute;
- one comparison item → add another finalist;
- policy-blocked refresh → continue with current data/manual check;
- expert unable to verify → preserve unknown/conflict;
- recompute failure → preserve result and retry later.

Raw codes are not rendered as user copy.

## Instrumentation

The in-memory instrumentation port records journey lifecycle events and version
refs without the full free-form request, personal finance, document content, or
private URLs. It is not an analytics-vendor integration.

## Run

```bash
npm run demo:seed
npm run test:e2e
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

All automated paths are offline and deterministic.

## Capability status

| Capability | TASK-018 status |
| --- | --- |
| Synthetic pilot buyer journey | Working (`dataset_type=synthetic_pilot`) |
| Offline user URL fixture | Working |
| Expert evidence/recompute fixture | Working |
| `src_dev_02` approved unit HTTP collection | Existing TASK-014 PoC boundary; not invoked here |
| `src_dev_02` live targeted refresh | Policy-blocked |
| Browser/OpenClaw collection | Not used and not added |
| Live crawl / production source coverage | Not implemented |
| Production DB/auth/worker persistence | Not implemented |

TASK-019 is not part of this implementation.

