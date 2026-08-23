import {
  sourcePolicyEngine,
  sourceRegistry,
  type SourceOperation,
  type SourcePolicyEngine,
  type SourceRegistry,
  type SourceRegistryEntry,
} from "../data-collection/source-registry";
import { PILOT_HARDENING_POLICY_VERSION } from "./config";
import type { SourcePilotReadiness } from "./contracts";

export interface PilotSourceCapabilityEvidence {
  readonly adapterTested: boolean;
  readonly fieldEvidenceAvailable: boolean;
}

/** Test/adapter status is explicit; registry page accessibility is not evidence. */
export const PILOT_SOURCE_CAPABILITY_INVENTORY_V1: Readonly<
  Record<string, PilotSourceCapabilityEvidence>
> = Object.freeze({
  src_dev_02: { adapterTested: true, fieldEvidenceAvailable: true },
});

const automaticOperations: readonly SourceOperation[] = [
  "scheduled_collect",
  "targeted_refresh",
];

const approvedStatus = (
  status: "approved" | "conditional" | "denied" | "unknown",
) => status === "approved";

const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values)].sort();

const sourceApprovedOperations = (
  source: SourceRegistryEntry,
): SourceOperation[] => {
  const methods = new Set(source.environment_approval.pilot.allowed_methods);
  return uniqueSorted(
    source.policy.methods
      .filter((policy) => methods.has(policy.method))
      .flatMap((policy) => policy.operations),
  ) as SourceOperation[];
};

export const evaluateSourcePilotReadiness = (
  sourceInput: SourceRegistryEntry | string,
  dependencies: {
    readonly registry?: SourceRegistry;
    readonly policyEngine?: SourcePolicyEngine;
    readonly capabilityInventory?: Readonly<
      Record<string, PilotSourceCapabilityEvidence>
    >;
    readonly evaluatedAt?: string;
  } = {},
): SourcePilotReadiness => {
  const registry = dependencies.registry ?? sourceRegistry;
  const engine = dependencies.policyEngine ?? sourcePolicyEngine;
  const source =
    typeof sourceInput === "string" ? registry.get(sourceInput) : sourceInput;
  const sourceId =
    typeof sourceInput === "string" ? sourceInput : sourceInput.source_id;
  if (!source)
    return {
      source_id: sourceId,
      ready: false,
      blockers: ["SOURCE_NOT_REGISTERED"],
      warnings: [],
      approved_operations: [],
      approved_environment: null,
      policy_version: registry.config.policy_version,
    };

  const blockers: string[] = [];
  const warnings: string[] = [];
  const environment = source.environment_approval.pilot;
  const capability = (dependencies.capabilityInventory ??
    PILOT_SOURCE_CAPABILITY_INVENTORY_V1)[source.source_id] ?? {
    adapterTested: false,
    fieldEvidenceAvailable: false,
  };

  if (
    source.approval_lifecycle !== "approved_for_pilot" &&
    source.approval_lifecycle !== "production_approved"
  )
    blockers.push("PILOT_APPROVAL_MISSING");
  if (environment.status !== "approved")
    blockers.push("PILOT_ENVIRONMENT_NOT_APPROVED");
  if (environment.required_conditions.length > 0)
    blockers.push("PILOT_APPROVAL_CONDITIONS_UNRESOLVED");
  if (!approvedStatus(source.policy.storage.normalized_data))
    blockers.push("NORMALIZED_STORAGE_NOT_APPROVED");
  if (!approvedStatus(source.policy.storage.evidence_metadata))
    blockers.push("EVIDENCE_STORAGE_NOT_APPROVED");
  if (!approvedStatus(source.policy.display.normalized_facts))
    blockers.push("NORMALIZED_DISPLAY_NOT_APPROVED");
  if (!approvedStatus(source.policy.display.source_link))
    blockers.push("SOURCE_LINK_DISPLAY_NOT_APPROVED");
  if (
    !source.policy.attribution.attribution_required ||
    !source.policy.attribution.attribution_label.trim() ||
    !source.policy.attribution.link_required
  )
    blockers.push("ATTRIBUTION_INCOMPLETE");
  if (!capability.adapterTested) blockers.push("ADAPTER_NOT_TESTED");
  if (!capability.fieldEvidenceAvailable)
    blockers.push("FIELD_EVIDENCE_NOT_DEMONSTRATED");
  if (source.freshness.length === 0) blockers.push("FRESHNESS_POLICY_MISSING");

  const manualRefresh = source.policy.refresh.modes.every((mode) =>
    ["manual_only", "none"].includes(mode),
  );
  if (!approvedStatus(source.policy.refresh.permission)) {
    if (manualRefresh) warnings.push("REFRESH_INTENTIONALLY_MANUAL");
    else blockers.push("REFRESH_POLICY_INCOMPLETE");
  }
  if (source.health.status === "degraded") warnings.push("SOURCE_DEGRADED");
  if (source.health.status === "failing") blockers.push("SOURCE_FAILING");
  if (source.health.source_changed) blockers.push("SOURCE_CHANGED");

  const structurallyApproved = sourceApprovedOperations(source);
  // Target/path/field scope is deliberately enforced later by CollectionPlan.
  // Readiness only reports operations structurally approved for the pilot.
  void engine;
  const approvedOperations = structurallyApproved.filter(
    (operation) =>
      !automaticOperations.includes(operation) ||
      (approvedStatus(source.policy.access) &&
        approvedStatus(source.policy.automation)),
  );

  return {
    source_id: source.source_id,
    ready: blockers.length === 0,
    blockers: uniqueSorted(blockers),
    warnings: uniqueSorted(warnings),
    approved_operations: approvedOperations,
    approved_environment: environment.status === "approved" ? "pilot" : null,
    policy_version: `${registry.config.policy_version}+${PILOT_HARDENING_POLICY_VERSION}`,
  };
};

export const evaluateAllPilotSources = (): readonly SourcePilotReadiness[] =>
  sourceRegistry
    .list()
    .map((source) => evaluateSourcePilotReadiness(source))
    .sort((left, right) => left.source_id.localeCompare(right.source_id));
