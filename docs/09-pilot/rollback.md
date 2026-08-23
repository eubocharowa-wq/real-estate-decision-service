# Pilot rollback procedure

Rollback stops risky execution; it does not delete evidence, audit events,
expert results, feedback, errors or decision history.

1. Set `REDS_KILL_OPENCLAW_EXECUTION=true` and
   `REDS_FEATURE_OPENCLAW_COLLECTION=false`.
2. Set `REDS_KILL_LIVE_SOURCE_ADAPTER=true` and
   `REDS_FEATURE_LIVE_SOURCE_POC=false`.
3. Set `REDS_KILL_REFRESH_EXECUTION=true` and
   `REDS_FEATURE_REFRESH=false`.
4. Set `REDS_KILL_USER_URL_AUTOMATIC_INGESTION=true`; retain explicit manual
   confirmation where its separate feature remains allowed.
5. Set `REDS_APPLICATION_MODE=demo` and fall back to the explicitly labelled
   curated/synthetic fixture dataset or approved manual workflow.
6. Re-evaluate `PilotReleaseGate`, source readiness and coverage before
   re-enabling any integration.

Feature flags do not change Source Registry decisions. Re-enabling a flag while
policy/readiness is denied must still produce a controlled blocker without
calling an adapter/OpenClaw executor.
