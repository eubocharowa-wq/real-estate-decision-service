import {
  sourcePolicyEngine,
  sourceRegistry,
  type CollectionPlan,
  type SourceOperation,
} from "../data-collection/source-registry";
import type {
  OpenClawCollectionRequest,
  OpenClawExecutionOutcome,
  OpenClawExecutor,
  SourcePilotReadiness,
} from "./contracts";
import { isFeatureOperational, type PilotRuntimeConfig } from "./config";
import { evaluateSourcePilotReadiness } from "./source-readiness";

const operationForMode = (
  mode: OpenClawCollectionRequest["controlled_mode"],
): SourceOperation =>
  mode === "user_url_ingestion" ? "user_url_ingest" : "targeted_refresh";

const environmentForMode = (
  mode: PilotRuntimeConfig["mode"],
): OpenClawCollectionRequest["environment"] =>
  mode === "demo" ? "test" : mode;

const stringField = (value: unknown, key: string): string | null => {
  const field =
    typeof value === "object" && value !== null
      ? Reflect.get(value, key)
      : null;
  return typeof field === "string" ? field : null;
};

/** Runtime validation for facts returned by the untrusted capability boundary. */
export const parseOpenClawStagedResult = (
  value: unknown,
  input: {
    readonly request: OpenClawCollectionRequest;
    readonly plan: CollectionPlan;
  },
): OpenClawExecutionOutcome["staged_result"] => {
  if (typeof value !== "object" || value === null) return null;
  const facts = Reflect.get(value, "facts");
  const warnings = Reflect.get(value, "warnings");
  const status = stringField(value, "status");
  const sourceUrl = stringField(value, "source_url");
  if (
    stringField(value, "schema_version") !== "openclaw-staged-result-v1" ||
    stringField(value, "request_id") !== input.request.request_id ||
    stringField(value, "source_id") !==
      input.request.collection_task.source_id ||
    !sourceUrl ||
    !input.plan.validatedTargetUrls.includes(sourceUrl) ||
    !["partial", "complete", "source_changed", "failed"].includes(
      status ?? "",
    ) ||
    Reflect.get(value, "raw_content_reference") !== null ||
    !Array.isArray(facts) ||
    !Array.isArray(warnings) ||
    warnings.some((warning) => typeof warning !== "string")
  )
    return null;
  for (const fact of facts) {
    const field = stringField(fact, "field");
    const verification = stringField(fact, "verification_status");
    if (
      !field ||
      !input.plan.validatedRequestedFields.includes(field) ||
      !["claimed", "unconfirmed", "unknown"].includes(verification ?? "") ||
      !stringField(fact, "evidence_reference")
    )
      return null;
  }
  if (
    !stringField(value, "collection_run_id") ||
    Number.isNaN(Date.parse(stringField(value, "observed_at") ?? ""))
  )
    return null;
  return value as OpenClawExecutionOutcome["staged_result"];
};

const blocked = (
  code: NonNullable<OpenClawExecutionOutcome["blocker_code"]>,
  policyVersion: string,
  readiness: SourcePilotReadiness,
): OpenClawExecutionOutcome => ({
  status: "blocked",
  blocker_code: code,
  executor_invoked: false,
  policy_version: policyVersion,
  collection_method: null,
  readiness,
  plan: null,
  staged_result: null,
});

export const executeControlledOpenClawCollection = async (input: {
  readonly request: OpenClawCollectionRequest;
  readonly runtimeConfig: PilotRuntimeConfig;
  readonly executor: OpenClawExecutor;
}): Promise<OpenClawExecutionOutcome> => {
  const engine = sourcePolicyEngine;
  const source = engine.registry.get(input.request.collection_task.source_id);
  const policyVersion = engine.registry.config.policy_version;
  const operation = operationForMode(input.request.controlled_mode);
  const expectedEnvironment = environmentForMode(input.runtimeConfig.mode);

  const policyDecision = engine.resolve({
    sourceId: input.request.collection_task.source_id,
    operation,
    environment: input.request.environment,
    requestedMethod: "openclaw",
    targetUrls: input.request.collection_task.target_urls,
    requestedFields: input.request.collection_task.requested_fields,
    discovery: false,
    followLinks: false,
    pagination: false,
    sitemap: false,
    authentication: false,
    challengeAction: "stop",
    satisfiedConditions: input.request.satisfied_conditions,
    decidedAt: input.request.requested_at,
  });
  const readiness = evaluateSourcePilotReadiness(
    source ?? input.request.collection_task.source_id,
    { registry: engine.registry, policyEngine: engine },
  );
  if (!policyDecision.allowed)
    return blocked("SOURCE_POLICY_DENIED", policyVersion, readiness);
  if (!readiness.ready || !readiness.approved_operations.includes(operation))
    return blocked("SOURCE_NOT_PILOT_READY", policyVersion, readiness);
  if (
    input.request.environment !== expectedEnvironment ||
    !input.runtimeConfig.modePolicy.allowedSourceOperations.includes(operation)
  )
    return blocked("APPLICATION_MODE_DENIED", policyVersion, readiness);
  if (!input.runtimeConfig.features.openclaw_collection)
    return blocked("FEATURE_DISABLED", policyVersion, readiness);
  if (input.runtimeConfig.killSwitches.openclaw_execution)
    return blocked("KILL_SWITCH_ACTIVE", policyVersion, readiness);
  if (
    !isFeatureOperational(
      input.runtimeConfig,
      "live_source_poc",
      "live_source_adapter",
    )
  )
    return blocked("FEATURE_DISABLED", policyVersion, readiness);

  const plan = engine.resolveCollectionPlan({
    sourceId: input.request.collection_task.source_id,
    operation,
    environment: input.request.environment,
    entityType: input.request.collection_task.entity_type,
    requestedMethod: "openclaw",
    targetUrls: input.request.collection_task.target_urls,
    requestedFields: input.request.collection_task.requested_fields,
    discovery: false,
    followLinks: false,
    pagination: false,
    sitemap: false,
    authentication: false,
    challengeAction: "stop",
    satisfiedConditions: input.request.satisfied_conditions,
    decidedAt: input.request.requested_at,
  });
  if (
    !plan.allowed ||
    plan.preferredMethod !== "openclaw" ||
    plan.fallbackMethods.some((method) => method === "browser")
  )
    return {
      ...blocked("COLLECTION_PLAN_DENIED", policyVersion, readiness),
      plan,
    };

  try {
    const untrustedResult = await input.executor.execute({
      task: input.request.collection_task,
      plan,
      controlledMode: input.request.controlled_mode,
    });
    const staged = parseOpenClawStagedResult(untrustedResult, {
      request: input.request,
      plan,
    });
    if (!staged)
      return {
        status: "failed",
        blocker_code: "EXECUTION_FAILED",
        executor_invoked: true,
        policy_version: policyVersion,
        collection_method: "openclaw",
        readiness,
        plan,
        staged_result: null,
      };
    return {
      status: staged.status === "failed" ? "failed" : "staged",
      blocker_code: staged.status === "failed" ? "EXECUTION_FAILED" : null,
      executor_invoked: true,
      policy_version: policyVersion,
      collection_method: "openclaw",
      readiness,
      plan,
      staged_result: staged,
    };
  } catch {
    return {
      status: "failed",
      blocker_code: "EXECUTION_FAILED",
      executor_invoked: true,
      policy_version: policyVersion,
      collection_method: "openclaw",
      readiness,
      plan,
      staged_result: null,
    };
  }
};

export const CURRENT_OPENCLAW_LIVE_DIAGNOSTIC = Object.freeze({
  selected_use_case: null,
  live_execution_enabled: false,
  blocker: "NO_PILOT_APPROVED_BROWSER_BENEFICIAL_SOURCE",
  evaluated_source_count: sourceRegistry.list().length,
  note: "src_dev_02 remains HTTP-only and development/test-only.",
});
