import type {
  CollectionPlan,
  PermissionDecision,
  ResolveCollectionPlanInput,
  ResolvePolicyInput,
  SourcePolicyDecision,
} from "./contracts";
import type {
  PermissionStatus,
  PolicyReasonCode,
  RegistryCollectionMethod,
  SourceRegistryEntry,
} from "./schema";
import { normalizeRegistryHostname, SourceRegistry } from "./registry";

const automaticMethods = new Set<RegistryCollectionMethod>([
  "api",
  "partner_feed",
  "xml_feed",
  "http",
  "browser",
  "openclaw",
  "fixture_mock",
]);
const manualMethods = new Set<RegistryCollectionMethod>([
  "manual",
  "user_supplied",
  "expert",
]);
const scopedCollectionOperations = new Set([
  "scheduled_collect",
  "targeted_refresh",
]);

const conditionsMissing = (
  required: readonly string[],
  satisfied: ReadonlySet<string>,
): string[] => [...new Set(required)].filter((item) => !satisfied.has(item));

const permissionDecision = (
  status: PermissionStatus,
  conditionsSatisfied: boolean,
): PermissionDecision => ({
  status,
  allowed:
    status === "approved" || (status === "conditional" && conditionsSatisfied),
});

const deniedPermission = (): PermissionDecision => ({
  status: "denied",
  allowed: false,
});

const reasonOrder: readonly PolicyReasonCode[] = [
  "SOURCE_UNKNOWN",
  "SOURCE_BLOCKED",
  "SOURCE_PAUSED",
  "SOURCE_DEPRECATED",
  "PRODUCTION_NOT_APPROVED",
  "ENVIRONMENT_NOT_APPROVED",
  "PERMISSION_REQUIRED",
  "REVIEW_REQUIRED",
  "PARTNER_API_ONLY",
  "PARTNER_CHANNEL",
  "DO_NOT_AUTOCOLLECT",
  "ACCESS_NOT_APPROVED",
  "STORAGE_NOT_APPROVED",
  "DISPLAY_NOT_APPROVED",
  "REFRESH_NOT_APPROVED",
  "DERIVATION_NOT_APPROVED",
  "CACHE_NOT_APPROVED",
  "SCOPED_POC_ONLY",
  "REQUIRED_CONDITION_MISSING",
  "TARGET_SCOPE_REQUIRED",
  "TARGET_LIMIT_EXCEEDED",
  "TARGET_URL_NOT_ALLOWED",
  "REQUESTED_FIELDS_REQUIRED",
  "FIELD_NOT_ALLOWED",
  "DISCOVERY_NOT_ALLOWED",
  "LINK_TRAVERSAL_NOT_ALLOWED",
  "PAGINATION_NOT_ALLOWED",
  "SITEMAP_NOT_ALLOWED",
  "AUTHENTICATION_NOT_ALLOWED",
  "CHALLENGE_ACTION_NOT_ALLOWED",
  "METHOD_NOT_ALLOWED",
  "OPERATION_NOT_SUPPORTED",
  "ENTITY_NOT_COVERED",
  "FIELD_NOT_COVERED",
  "SOURCE_FAILING",
  "SOURCE_DEGRADED",
  "SOURCE_CHANGED",
  "ATTRIBUTION_REQUIRED",
  "MANUAL_ONLY",
  "FIXTURE_APPROVED",
  "AUTOMATION_ALLOWED",
  "POLICY_ALLOWED",
];

const orderedReasons = (
  reasons: readonly PolicyReasonCode[],
): PolicyReasonCode[] => {
  const unique = new Set(reasons);
  return reasonOrder.filter((reason) => unique.has(reason));
};

const allProductionGatesPassed = (entry: SourceRegistryEntry): boolean =>
  Object.values(entry.production_gate).every(Boolean) &&
  entry.approval_lifecycle === "production_approved";

const matchesFieldPattern = (pattern: string, field: string): boolean =>
  pattern === "*" ||
  pattern === field ||
  (pattern.endsWith(".*") &&
    field.startsWith(pattern.slice(0, Math.max(0, pattern.length - 1))));

interface CollectionScopeValidation {
  readonly allowed: boolean;
  readonly validatedTargetUrls: readonly string[];
  readonly validatedRequestedFields: readonly string[];
  readonly reasonCodes: readonly PolicyReasonCode[];
}

const validateCollectionScope = (
  source: SourceRegistryEntry,
  input: ResolvePolicyInput,
): CollectionScopeValidation => {
  if (!scopedCollectionOperations.has(input.operation))
    return {
      allowed: true,
      validatedTargetUrls: [],
      validatedRequestedFields: [],
      reasonCodes: [],
    };

  const scope = source.policy.collection_scope;
  const fieldPolicy = source.policy.field_policy;
  const targets = input.targetUrls ?? [];
  const requestedFields = input.requestedFields ?? [];
  const reasons: PolicyReasonCode[] = [];
  const validatedTargetUrls: string[] = [];

  if (scope.explicit_targets_only && targets.length === 0)
    reasons.push("TARGET_SCOPE_REQUIRED");
  if (targets.length > scope.maximum_target_urls)
    reasons.push("TARGET_LIMIT_EXCEEDED");

  for (const target of targets) {
    try {
      const url = new URL(target);
      const allowed =
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.search &&
        !url.hash &&
        scope.allowed_hosts.some(
          (hostname) =>
            normalizeRegistryHostname(hostname) === url.hostname.toLowerCase(),
        ) &&
        scope.allowed_path_patterns.some((pattern) =>
          new RegExp(pattern, "u").test(url.pathname),
        );
      if (!allowed) reasons.push("TARGET_URL_NOT_ALLOWED");
      else validatedTargetUrls.push(url.toString());
    } catch {
      reasons.push("TARGET_URL_NOT_ALLOWED");
    }
  }

  if (fieldPolicy.requested_fields_required && requestedFields.length === 0)
    reasons.push("REQUESTED_FIELDS_REQUIRED");
  for (const field of requestedFields) {
    if (
      !field ||
      !fieldPolicy.allowed_fields.some((pattern) =>
        matchesFieldPattern(pattern, field),
      )
    )
      reasons.push("FIELD_NOT_ALLOWED");
  }
  if (input.discovery && !scope.discovery_allowed)
    reasons.push("DISCOVERY_NOT_ALLOWED");
  if (input.followLinks && !scope.follow_links_allowed)
    reasons.push("LINK_TRAVERSAL_NOT_ALLOWED");
  if (input.pagination && !scope.pagination_allowed)
    reasons.push("PAGINATION_NOT_ALLOWED");
  if (input.sitemap && !scope.sitemap_allowed)
    reasons.push("SITEMAP_NOT_ALLOWED");
  if (input.authentication && !scope.authentication_allowed)
    reasons.push("AUTHENTICATION_NOT_ALLOWED");
  if ((input.challengeAction ?? "stop") !== scope.challenge_action)
    reasons.push("CHALLENGE_ACTION_NOT_ALLOWED");

  const allowed = reasons.length === 0;
  return {
    allowed,
    validatedTargetUrls: allowed ? [...new Set(validatedTargetUrls)] : [],
    validatedRequestedFields: allowed ? [...new Set(requestedFields)] : [],
    reasonCodes: reasons,
  };
};

const mostSpecific = <T extends { readonly field_pattern: string }>(
  values: readonly T[],
  field: string | null,
): T | null => {
  if (!field) return null;
  return (
    values
      .filter((value) => matchesFieldPattern(value.field_pattern, field))
      .sort(
        (left, right) =>
          right.field_pattern.length - left.field_pattern.length ||
          left.field_pattern.localeCompare(right.field_pattern),
      )[0] ?? null
  );
};

const unknownHealth: SourceRegistryEntry["health"] = {
  status: "unknown",
  recent_success_rate: null,
  recent_error_rate: null,
  last_successful_run_at: null,
  source_changed: false,
  auth_issue: false,
  rate_limited: false,
  reason_codes: ["NO_RUNTIME_DATA"],
};

export class SourcePolicyEngine {
  constructor(readonly registry: SourceRegistry) {}

  resolve(input: ResolvePolicyInput): SourcePolicyDecision {
    const source = this.registry.get(input.sourceId);
    if (!source) return this.resolveUnknown(input);
    const environment = source.environment_approval[input.environment];
    const satisfied = new Set(input.satisfiedConditions ?? []);
    const globalRequired = [
      ...source.policy.required_conditions,
      ...environment.required_conditions,
    ];
    const globalMissing = conditionsMissing(globalRequired, satisfied);
    const conditionsSatisfied = globalMissing.length === 0;
    const access = permissionDecision(
      source.policy.access,
      conditionsSatisfied,
    );
    const automation = permissionDecision(
      source.policy.automation,
      conditionsSatisfied,
    );
    const storage = {
      rawContent: permissionDecision(
        source.policy.storage.raw_content,
        conditionsSatisfied,
      ),
      normalizedData: permissionDecision(
        source.policy.storage.normalized_data,
        conditionsSatisfied,
      ),
      evidenceMetadata: permissionDecision(
        source.policy.storage.evidence_metadata,
        conditionsSatisfied,
      ),
      snapshots: permissionDecision(
        source.policy.storage.snapshots,
        conditionsSatisfied,
      ),
      derivedData: permissionDecision(
        source.policy.storage.derived_data,
        conditionsSatisfied,
      ),
    };
    const display = {
      normalizedFacts: permissionDecision(
        source.policy.display.normalized_facts,
        conditionsSatisfied,
      ),
      sourceLink: permissionDecision(
        source.policy.display.source_link,
        conditionsSatisfied,
      ),
      evidenceSnippet: permissionDecision(
        source.policy.display.evidence_snippet,
        conditionsSatisfied,
      ),
      rawContent: permissionDecision(
        source.policy.display.raw_content,
        conditionsSatisfied,
      ),
      imageMedia: permissionDecision(
        source.policy.display.image_media,
        conditionsSatisfied,
      ),
    };
    const refresh = {
      permission: permissionDecision(
        source.policy.refresh.permission,
        conditionsSatisfied,
      ),
      modes: source.policy.refresh.modes,
    };
    const derivation = permissionDecision(
      source.policy.derivation,
      conditionsSatisfied,
    );
    const cache = permissionDecision(source.policy.cache, conditionsSatisfied);
    const statusBlocksAutomation = [
      "paused",
      "blocked",
      "deprecated",
      "manual_only",
    ].includes(source.status);
    const productionBlocksAutomation =
      input.environment === "production" && !allProductionGatesPassed(source);
    const scopeValidation = validateCollectionScope(source, input);
    const methodPolicies = source.policy.methods
      .filter((method) => method.operations.includes(input.operation))
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          left.method.localeCompare(right.method),
      );
    const allowedMethods = methodPolicies
      .filter((method) => {
        if (method.method === "none") return false;
        const isManual = manualMethods.has(method.method);
        if (!environment.allowed_methods.includes(method.method)) return false;
        if (!isManual && environment.status === "denied") return false;
        if (!isManual && (statusBlocksAutomation || productionBlocksAutomation))
          return false;
        if (!isManual && (!access.allowed || !automation.allowed)) return false;
        if (!isManual && !scopeValidation.allowed) return false;
        const required = isManual
          ? method.required_conditions
          : [...globalRequired, ...method.required_conditions];
        return conditionsMissing(required, satisfied).length === 0;
      })
      .map((method) => method.method);
    const requestedMethod = input.requestedMethod ?? null;
    const selectedMethodAllowed = requestedMethod
      ? allowedMethods.includes(requestedMethod)
      : allowedMethods.length > 0;
    let allowed = selectedMethodAllowed;
    if (input.operation === "identify") allowed = true;
    if (input.operation === "display")
      allowed = display.normalizedFacts.allowed;
    if (input.operation === "store") allowed = storage.normalizedData.allowed;
    if (input.operation === "targeted_refresh")
      allowed = allowed && refresh.permission.allowed;
    const reasons: PolicyReasonCode[] = [...source.policy.reason_codes];
    reasons.push(...scopeValidation.reasonCodes);
    if (source.status === "blocked") reasons.push("SOURCE_BLOCKED");
    if (source.status === "paused") reasons.push("SOURCE_PAUSED");
    if (source.status === "deprecated") reasons.push("SOURCE_DEPRECATED");
    if (productionBlocksAutomation) reasons.push("PRODUCTION_NOT_APPROVED");
    if (
      environment.status === "denied" &&
      !allowedMethods.some((method) => manualMethods.has(method))
    )
      reasons.push("ENVIRONMENT_NOT_APPROVED");
    if (!access.allowed && automaticMethods.has(requestedMethod ?? "none"))
      reasons.push("ACCESS_NOT_APPROVED");
    if (globalMissing.length > 0) reasons.push("REQUIRED_CONDITION_MISSING");
    if (requestedMethod && !allowedMethods.includes(requestedMethod))
      reasons.push("METHOD_NOT_ALLOWED");
    if (methodPolicies.length === 0 && input.operation !== "identify")
      reasons.push("OPERATION_NOT_SUPPORTED");
    if (!storage.normalizedData.allowed) reasons.push("STORAGE_NOT_APPROVED");
    if (!display.normalizedFacts.allowed) reasons.push("DISPLAY_NOT_APPROVED");
    if (!refresh.permission.allowed) reasons.push("REFRESH_NOT_APPROVED");
    if (!derivation.allowed) reasons.push("DERIVATION_NOT_APPROVED");
    if (!cache.allowed) reasons.push("CACHE_NOT_APPROVED");
    if (source.policy.attribution.attribution_required)
      reasons.push("ATTRIBUTION_REQUIRED");
    if (source.health.status === "degraded") reasons.push("SOURCE_DEGRADED");
    if (source.health.status === "failing") reasons.push("SOURCE_FAILING");
    if (source.health.source_changed) reasons.push("SOURCE_CHANGED");
    if (allowedMethods.some((method) => automaticMethods.has(method)))
      reasons.push("AUTOMATION_ALLOWED");
    if (allowed) reasons.push("POLICY_ALLOWED");
    const methodRequired = methodPolicies.flatMap(
      (method) => method.required_conditions,
    );
    const requiredConditions = [
      ...new Set([...globalRequired, ...methodRequired]),
    ].sort();
    return {
      sourceId: source.source_id,
      environment: input.environment,
      operation: input.operation,
      requestedMethod,
      allowed,
      access,
      automation,
      storage,
      display,
      refresh,
      derivation,
      cache,
      attribution: source.policy.attribution,
      collectionScope: source.policy.collection_scope,
      fieldPolicy: source.policy.field_policy,
      retentionPolicy: source.policy.retention_policy,
      validatedTargetUrls: scopeValidation.validatedTargetUrls,
      validatedRequestedFields: scopeValidation.validatedRequestedFields,
      allowedMethods: [...new Set(allowedMethods)],
      requiredConditions,
      missingConditions: conditionsMissing(requiredConditions, satisfied),
      reasonCodes: orderedReasons(reasons),
      sourceStatus: source.status,
      health: source.health,
      registryVersion: this.registry.config.registry_version,
      policyVersion: this.registry.config.policy_version,
      decidedAt: input.decidedAt,
    };
  }

  resolveCollectionPlan(input: ResolveCollectionPlanInput): CollectionPlan {
    const decision = this.resolve({
      sourceId: input.sourceId,
      operation: input.operation,
      environment: input.environment,
      requestedMethod: input.requestedMethod,
      targetUrls: input.targetUrls,
      requestedFields: input.requestedFields,
      discovery: input.discovery,
      followLinks: input.followLinks,
      pagination: input.pagination,
      sitemap: input.sitemap,
      authentication: input.authentication,
      challengeAction: input.challengeAction,
      satisfiedConditions: input.satisfiedConditions,
      decidedAt: input.decidedAt,
    });
    const source = this.registry.get(input.sourceId);
    const health = input.healthOverride ?? source?.health ?? unknownHealth;
    const methods = input.requestedMethod
      ? decision.allowed &&
        decision.allowedMethods.includes(input.requestedMethod)
        ? [input.requestedMethod]
        : []
      : [...decision.allowedMethods];
    let preferredMethod: RegistryCollectionMethod | null = methods[0] ?? null;
    if (health.status === "degraded" && methods.length > 1)
      preferredMethod = methods[1] ?? null;
    if (health.status === "failing")
      preferredMethod =
        methods.find((method) => manualMethods.has(method)) ?? null;
    const fallbackMethods = methods.filter(
      (method) => method !== preferredMethod,
    );
    const fieldCoverage = mostSpecific(
      source?.coverage.fields ?? [],
      input.targetField ?? null,
    );
    const entityCovered =
      !input.entityType ||
      Boolean(source?.coverage.entity_types.includes(input.entityType));
    const fieldCovered =
      !input.targetField ||
      (fieldCoverage !== null && fieldCoverage.support !== "none");
    const targetFieldValidated =
      !source?.policy.field_policy.requested_fields_required ||
      !input.targetField ||
      decision.validatedRequestedFields.includes(input.targetField);
    const healthReasons: PolicyReasonCode[] = [];
    if (health.status === "degraded") healthReasons.push("SOURCE_DEGRADED");
    if (health.status === "failing") healthReasons.push("SOURCE_FAILING");
    if (health.source_changed) healthReasons.push("SOURCE_CHANGED");
    if (!entityCovered) healthReasons.push("ENTITY_NOT_COVERED");
    if (!fieldCovered) healthReasons.push("FIELD_NOT_COVERED");
    if (!targetFieldValidated) healthReasons.push("FIELD_NOT_ALLOWED");
    return {
      sourceId: input.sourceId,
      operation: input.operation,
      environment: input.environment,
      entityType: input.entityType ?? null,
      targetField: targetFieldValidated ? (input.targetField ?? null) : null,
      validatedTargetUrls: decision.validatedTargetUrls,
      validatedRequestedFields: decision.validatedRequestedFields,
      allowed:
        decision.allowed &&
        preferredMethod !== null &&
        entityCovered &&
        fieldCovered &&
        targetFieldValidated,
      preferredMethod,
      fallbackMethods,
      storagePolicy: decision.storage,
      displayPolicy: decision.display,
      fieldCoverage,
      freshnessPolicy: mostSpecific(
        source?.freshness ?? [],
        input.targetField ?? null,
      ),
      fieldAuthority: mostSpecific(
        source?.field_authority ?? [],
        input.targetField ?? null,
      ),
      attributionPolicy: decision.attribution,
      collectionScope: decision.collectionScope,
      fieldPolicy: decision.fieldPolicy,
      retentionPolicy: decision.retentionPolicy,
      requiredConditions: decision.requiredConditions,
      reasonCodes: orderedReasons([...decision.reasonCodes, ...healthReasons]),
      registryVersion: decision.registryVersion,
      policyVersion: decision.policyVersion,
      decidedAt: decision.decidedAt,
    };
  }

  private resolveUnknown(input: ResolvePolicyInput): SourcePolicyDecision {
    const manualAllowed = [
      "user_url_ingest",
      "manual_import",
      "expert_verification",
    ].includes(input.operation);
    const methods: RegistryCollectionMethod[] = manualAllowed
      ? ["user_supplied", "manual"]
      : [];
    const allowed =
      input.operation === "identify" ||
      (manualAllowed &&
        (!input.requestedMethod || methods.includes(input.requestedMethod)));
    const normalizedUserData = permissionDecision(
      manualAllowed ? "approved" : "denied",
      true,
    );
    return {
      sourceId: null,
      environment: input.environment,
      operation: input.operation,
      requestedMethod: input.requestedMethod ?? null,
      allowed,
      access: deniedPermission(),
      automation: deniedPermission(),
      storage: {
        rawContent: deniedPermission(),
        normalizedData: normalizedUserData,
        evidenceMetadata: normalizedUserData,
        snapshots: deniedPermission(),
        derivedData: normalizedUserData,
      },
      display: {
        normalizedFacts: normalizedUserData,
        sourceLink: normalizedUserData,
        evidenceSnippet: deniedPermission(),
        rawContent: deniedPermission(),
        imageMedia: deniedPermission(),
      },
      refresh: { permission: deniedPermission(), modes: ["manual_only"] },
      derivation: normalizedUserData,
      cache: normalizedUserData,
      attribution: {
        attribution_required: true,
        attribution_label: "Пользовательская ссылка",
        link_required: true,
        logo_allowed: false,
        display_restrictions: [
          "Unknown source data must remain user-provided and unconfirmed.",
        ],
      },
      collectionScope: {
        explicit_targets_only: true,
        allowed_hosts: [],
        allowed_path_patterns: [],
        maximum_target_urls: 1,
        discovery_allowed: false,
        follow_links_allowed: false,
        pagination_allowed: false,
        sitemap_allowed: false,
        authentication_allowed: false,
        challenge_action: "stop",
      },
      fieldPolicy: {
        requested_fields_required: true,
        allowed_fields: [],
        required_evidence_metadata: ["source_url", "observed_at"],
        verification_ceilings: [],
      },
      retentionPolicy: {
        normalized_facts: manualAllowed ? "transient_only" : "prohibited",
        evidence_metadata: manualAllowed ? "transient_only" : "prohibited",
        raw_content: "prohibited",
        raw_snapshots: "prohibited",
      },
      validatedTargetUrls: [],
      validatedRequestedFields: [],
      allowedMethods: methods,
      requiredConditions: [],
      missingConditions: [],
      reasonCodes: orderedReasons([
        "SOURCE_UNKNOWN",
        "MANUAL_ONLY",
        ...(allowed ? (["POLICY_ALLOWED"] as const) : []),
      ]),
      sourceStatus: "unknown",
      health: unknownHealth,
      registryVersion: this.registry.config.registry_version,
      policyVersion: this.registry.config.policy_version,
      decidedAt: input.decidedAt,
    };
  }
}
