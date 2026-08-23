# Pilot privacy and data inventory

The pilot stores the minimum context needed for a decision. Generic telemetry
contains identifiers, stages and bounded operational metadata only.

| Field / data class | Collected at | Purpose | Storage | Logging / telemetry | Retention expectation |
| --- | --- | --- | --- | --- | --- |
| raw request text | request entry | parse buyer intent | in-memory journey/demo browser session | never in generic telemetry | session/pilot investigation only; define production retention before launch |
| normalized UserRequest | confirmation | deterministic matching | in-memory repository/demo browser session | ID/version only | decision history while journey is active |
| household constraints | UserRequest | applicability of explicit criteria | within minimized UserRequest | no full profile | same as request; do not copy to unrelated expert work |
| financing constraints | UserRequest | evaluate purchase scenarios | within minimized UserRequest | no precise profile | same as request; no bank credentials or approval claim |
| user URL | user URL boundary | import one explicit candidate | normalized candidate/evidence reference | ingestion ID/status only; no private URL | transient in current implementation |
| ExpertRequest | expert workflow | route a scoped question | in-memory repository | request ID/type/status only | audit requirement to be defined before production |
| ExpertResult | expert workflow | create evidence and affected-only recompute | in-memory repository/evidence | result ID/status only; no free text | evidence/audit history must survive feature rollback |
| document refs | document review boundary | opaque reference to an existing accessible document | opaque owner-scoped reference only | never content or private URL | no upload/storage added in TASK-019 |
| telemetry | all journey stages | funnel and failure diagnostics | vendor-neutral in-memory repository | already the logging-safe form | bounded pilot measurement period |
| structured errors | application boundaries | recovery and failure aggregation | in-memory repository | safe codes/layers/context IDs | pilot investigation period |
| OpenClaw input | approved collection boundary | scoped target and field request | CollectionTask/plan IDs and public approved target | IDs/status/method only | no execution under current approval state |
| OpenClaw output | staging boundary | facts for later normalization/evidence | staged facts/evidence refs; raw content ref is `null` | counts/status/error only | source retention policy; currently no live output |

Potentially sensitive feedback comments are stored with feedback, never copied
to telemetry metadata. The UI asks users not to enter contacts or document
data. Feedback never changes matching weights, parser logic or source policy.

## Secrets review

- `.env.example` contains empty credential placeholders and non-secret flags.
- Source Registry stores credential *references*, never values.
- committed fixtures and offline OpenClaw tests contain no tokens, cookies,
  credentials or copied live pages.
- logs/telemetry reject token/password/cookie/authorization-shaped keys.
- CI remains offline for source/OpenClaw tests.

## URL and collection security

The TASK-012 URL boundary continues to require redirect limits, DNS/private
network checks on every resolved/final target, maximum response size, content
type allowlisting and timeouts. Local, private, link-local and metadata hosts
remain blocked. OpenClaw cannot override these requirements and cannot bypass
auth, CAPTCHA or challenges.
