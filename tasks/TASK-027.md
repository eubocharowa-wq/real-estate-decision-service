# TASK-027 — Operational Pilot Release Gate

## Goal

Turn the existing `evaluatePilotReleaseGate(...)` domain check into one
reproducible operational command that answers whether TASK-020 may start.

## Scope

- Keep `evaluatePilotReleaseGate(...)` as the core release-policy evaluator.
- Collect safe repository-side evidence by running build, typecheck, lint,
  regression, pilot, dependency-security and tracked-file secret checks.
- Derive source readiness and real-pilot dataset readiness from the canonical
  repository implementations.
- Accept external evidence only as strict, versioned provider locators and
  resolve their actual state, timestamp and source SHA through an injectable
  verification boundary.
- Require external proof for PostgreSQL/database readiness, browser E2E,
  rollback readiness and the mandatory stages that still precede TASK-020.
- Produce a versioned JSON artifact without command output, credentials, raw
  user requests or personal data.
- Run every repository and Git subprocess through one injectable safe executor
  with captured output, timeout, bounded buffers and fixed diagnostics.
- Exit successfully only when every hard release check passes.
- Document the operator workflow and evidence boundary.

## Out of scope

- Starting TASK-020 or TASK-028.
- Implementing Evidence Artifact storage, canonical catalogue transition,
  semantic deduplication, public/legal readiness or operational backup and
  monitoring systems.
- Changing matching, buyer journey, UI, datasets, Source Registry approvals,
  OpenClaw permissions or staging/Production configuration.
- Treating a caller-supplied boolean as release evidence.

## Acceptance criteria

- `npm run pilot:release-gate` executes the repository checks and writes
  `artifacts/pilot-release-gate.json`.
- Output includes schema version, readiness, blockers, warnings, checks,
  evidence summaries, evaluation time and exact application commit SHA.
- Raw external descriptors are a discriminated union of immutable GitHub
  Actions run, GitHub pull request or Vercel deployment locators; generic URLs
  and caller-supplied status/conclusion/readiness fields are rejected.
- A provider verifier obtains the actual state, conclusion, checked time and
  source SHA; only internally produced `VerifiedEvidence` reaches the gate.
- The evaluated revision is resolved from repository HEAD, never environment
  or external evidence. Runtime evidence requires exact tested/source SHA;
  task-completion PR evidence requires an equal or locally proven ancestor
  merge commit.
- Check-specific policy prevents PRs from satisfying runtime checks and
  Actions/deployments from satisfying future task-completion checks.
- Missing, malformed, stale, duplicate, unavailable, pending, failed or
  provider-error evidence fails closed.
- A failing database check or missing browser proof blocks release.
- Warnings remain visible but do not become blockers by themselves.
- The required readiness records for TASK-028, TASK-029, TASK-029B,
  TASK-031/031B and backup/monitoring/restore cannot be omitted or bypassed.
- Artifact serialization rejects credential-like values and never copies raw
  command output or arbitrary external payload fields.
- Failing, successful, timed-out and output-overflowing subprocesses never
  forward stdout/stderr; malformed Git output and ancestry errors fail closed
  with fixed diagnostic codes.
- Unit tests prove the complete-pass case and every specified fail-closed
  boundary.

## Verification

- `npx vitest run tests/pilot/release-gate-runner.test.ts`
- `npm run format:check`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`
- `npm run pilot:release-gate -- --evidence <external-evidence.json>`

## Known external dependencies

- PostgreSQL/database and browser evidence must come from provider-verified CI
  or protected staging records whose tested SHA exactly matches the evaluated
  repository HEAD.
- Rollback evidence requires an operator-reviewed deployment proof.
- TASK-028, TASK-029, TASK-029B, TASK-031, TASK-031B and operational
  backup/monitoring/restore readiness are not complete at the start of this
  task. Their absent evidence must keep `ready=false`.
