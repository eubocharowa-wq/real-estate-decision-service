# TASK-P0-029 — Server-side public data write guard

## Status

ACTIVE — GitHub Issue #29 P0 hotfix. This is not roadmap TASK-029.

## Goal

Prevent an untrusted public HTTP request from persisting buyer, journey,
expert, feedback, or user-URL data until an operator has explicitly enabled a
server-side processing mode.

## Scope

- audit the public input path and every current HTTP write boundary;
- add a fail-closed server-only write policy before runtime/repository access;
- preserve synthetic/offline tests and an explicitly configured protected
  pilot mode;
- return a fixed, non-sensitive denial and avoid false persistence promises;
- keep read-only recovery endpoints and static GitHub Pages preview working.

## Out of scope

- production environment changes or privacy approval;
- database migrations, retention, storage, or existing user-data changes;
- matching, source adapters, design, uploads, or new product flows;
- roadmap TASK-029 and later work.

## SPEC CONFLICT

- document A: `docs/08-roadmap/current-execution-plan.md` keeps TASK-028 as the
  active roadmap task before roadmap TASK-029;
- document B: the curator's latest GitHub Issue #29 comment explicitly makes
  this narrow P0 server protection the next engineering task;
- impact: public writes are currently reachable independently of the release
  gate, so continuing the broader roadmap would retain a confirmed privacy
  boundary risk;
- resolution: implement only the Issue #29 P0 guard. TASK-028 remains active,
  the roadmap is unchanged, and roadmap TASK-029 is not started.

## Acceptance criteria

- missing, unknown, or incomplete server configuration denies writes;
- request body, cookies, headers, and client flags cannot grant access;
- denial happens before PostgreSQL/storage/runtime write access;
- denial response contains no submitted text or internal configuration;
- trusted synthetic tests still run offline;
- protected pilot access requires explicit server deployment context;
- read-only journey recovery remains available without error/audit writes;
- public expert/workbench writes use the same fail-closed boundary;
- GitHub Pages continues to submit nothing.

## Verification

- focused public-write-guard unit/integration tests;
- existing buyer journey, expert, workbench, and static-preview tests;
- format, typecheck, lint, full tests, production build, and diff check;
- protected Vercel Preview build/status and a synthetic denial probe only.
