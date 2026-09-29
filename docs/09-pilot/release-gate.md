# Operational pilot release gate

`npm run pilot:release-gate` is the single repository command that answers
whether TASK-020 may start. It extends, but does not replace,
`evaluatePilotReleaseGate(...)`.

## Repository checks

The command runs these checks itself:

- clean Git working tree;
- typecheck;
- lint;
- full core regressions;
- offline pilot regressions;
- production dependency audit at `high` severity;
- high-confidence tracked-file secret scan;
- production build;
- canonical source-readiness evaluation;
- curated real-pilot manifest validation.

Every subprocess runs through the shared `SafeCommandExecutor`. It captures
stdout/stderr without forwarding them, enforces a timeout and bounded buffers,
and exposes only command ID, status, exit code, signal, duration and a fixed
diagnostic code. Raw command output is never copied into CLI diagnostics or the
artifact. The only validated output crossing the boundary is a strict Git SHA,
repository clean-state boolean or validated tracked-file path list.

## External evidence contract

Checks that cannot safely be reproduced locally are supplied with `--evidence`:

```json
{
  "schema_version": "pilot-release-external-evidence-v2",
  "evidence": [
    {
      "schema_version": "pilot-release-evidence-descriptor-v1",
      "check_id": "browser_e2e",
      "evidence_kind": "github_actions_run",
      "repository": "owner/repository",
      "run_id": 123456,
      "job_name": "browser"
    }
  ]
}
```

The input is only an immutable provider locator. It cannot declare its own
status, conclusion, commit SHA, timestamp or readiness. The runner resolves it
through the GitHub or Vercel API and only an internally produced
`VerifiedEvidence` record may reach the release gate. Provider errors, pending
or failed states, missing credentials, malformed responses and missing
locators fail closed.

Supported descriptor kinds are:

- `github_actions_run`: `repository`, `run_id`, optional `job_name`;
- `github_pull_request`: `repository`, `pr_number`;
- `vercel_deployment`: `project`, immutable `deployment_id`.

Generic URLs and arbitrary HTTPS references are not evidence. The verified
artifact preserves the actual revision metadata returned by the provider. The
evaluated revision always comes from `git rev-parse HEAD`; external JSON and
`REDS_APP_VERSION` cannot override it.

## Revision binding

Runtime/test evidence uses exact binding:

- `postgresql_database`, `browser_e2e` and
  `operational_backup_monitoring_restore` require a successful
  `github_actions_run` whose provider-returned tested SHA exactly equals HEAD;
- `rollback_readiness` requires a successful `vercel_deployment` whose
  provider-returned source SHA exactly equals HEAD.

Task-completion checks for TASK-028, TASK-029, TASK-029B, TASK-031 and TASK-031B
require a provider-confirmed merged `github_pull_request`. Its
provider-returned merge commit must equal HEAD or be proven as an ancestor of
HEAD by local `git merge-base --is-ancestor`. PR evidence cannot stand in for a
runtime test, and Actions/deployment evidence cannot stand in for future task
completion.

There is no patch-id, cherry-pick equivalence or manual relation override. A
staging deployment or test run for another SHA remains a blocker even if an
operator believes the code is equivalent.

Required external check IDs:

- `postgresql_database`;
- `browser_e2e`;
- `rollback_readiness`;
- `task_028_evidence_artifact_lifecycle`;
- `task_029_canonical_catalogue`;
- `task_029b_semantic_dedup`;
- `task_031_public_readiness`;
- `task_031b_privacy_legal_readiness`;
- `operational_backup_monitoring_restore`.

`known_limitations` is an optional provider-verified descriptor. Its presence
produces a fixed warning and does not make the gate pass or hide a hard
blocker.

Evidence is rejected when its descriptor is malformed or duplicated, when the
provider cannot verify it, or when the provider timestamp is older than 14
days or dated in the future.

## Running the gate

```bash
npm run pilot:release-gate -- --evidence /protected/path/evidence.json
```

The result is written to `artifacts/pilot-release-gate.json`. The file is a
local/CI artifact and is ignored by Git. Exit code `0` means `ready=true`; any
hard blocker, missing evidence or unavailable repository check produces a
non-zero exit code.

CLI output is intentionally terse: check ID, passed/failed state, fixed
diagnostic code and exit code. To investigate a failure, rerun the underlying
command separately in an authorized local environment; do not weaken this
boundary or forward child output from the gate.

## Sensitive-data boundary

Never put any of the following into the evidence file or evidence reference:

- `DATABASE_URL` or database credentials;
- Vercel bypass token/cookie;
- API tokens or authorization headers;
- raw user requests;
- personal data or raw source content.

The schema rejects unknown descriptor fields and does not accept caller-owned
free-form details. Provider credentials stay inside the verifier and are not
copied into verified evidence, diagnostics or artifacts. The writer performs a
second credential-pattern check before creating the artifact.

Subprocess safety does not rely on redaction: raw stdout, stderr, environment
and command credentials never leave the executor. Credential-pattern scanning
of the final JSON is defense in depth only.

## Current expected result

Until the planned readiness work for TASK-028, TASK-029, TASK-029B,
TASK-031/031B and operational backup/monitoring/restore is completed with
verified evidence, the honest result is `ready=false`. Revision binding now
enforces the provider SHA relationship; missing future provider evidence still
keeps the gate closed. Do not delete these checks or fabricate evidence.
