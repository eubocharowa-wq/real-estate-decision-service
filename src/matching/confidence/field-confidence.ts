import type { FieldEvidence, Source } from "../../domain";
import { CONFIDENCE_V1_CONFIG } from "./config";
import type {
  DataQualityBand,
  DataQualityConflictStatus,
  DataQualityEvidenceQuality,
  FieldConfidenceCalculation,
} from "./types";

const round = (value: number, digits: number): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const clampRatio = (value: number): number => Math.max(0, Math.min(1, value));
const MILLISECONDS_PER_HOUR = 3_600_000;

export const confidenceBandForScore = (score: number): DataQualityBand => {
  if (score >= CONFIDENCE_V1_CONFIG.confidenceBands.high) return "high";
  if (score >= CONFIDENCE_V1_CONFIG.confidenceBands.medium) return "medium";
  if (score >= CONFIDENCE_V1_CONFIG.confidenceBands.low) return "low";
  return "critical";
};

export const completenessBandForScore = (score: number): DataQualityBand => {
  if (score >= CONFIDENCE_V1_CONFIG.completenessBands.high) return "high";
  if (score >= CONFIDENCE_V1_CONFIG.completenessBands.medium) return "medium";
  if (score >= CONFIDENCE_V1_CONFIG.completenessBands.low) return "low";
  return "critical";
};

export interface CalculateFieldConfidenceInput {
  readonly verification_status: FieldEvidence["verification_status"];
  readonly freshness_status: FieldEvidence["freshness_status"];
  readonly conflict_status: DataQualityConflictStatus;
  readonly evidence_quality: DataQualityEvidenceQuality;
  readonly evidence_quality_factor?: number;
}

export const calculateFieldConfidence = (
  input: CalculateFieldConfidenceInput,
): FieldConfidenceCalculation => {
  const factors = {
    verification:
      CONFIDENCE_V1_CONFIG.verificationFactors[input.verification_status],
    freshness: CONFIDENCE_V1_CONFIG.freshnessFactors[input.freshness_status],
    conflict: CONFIDENCE_V1_CONFIG.conflictFactors[input.conflict_status],
    evidence_quality:
      input.evidence_quality_factor ??
      CONFIDENCE_V1_CONFIG.evidenceQualityFactors[input.evidence_quality],
  };
  const confidenceRatio = round(
    clampRatio(
      factors.verification *
        factors.freshness *
        factors.conflict *
        factors.evidence_quality,
    ),
    CONFIDENCE_V1_CONFIG.scorePrecisionDigits,
  );
  return {
    confidence_ratio: confidenceRatio,
    confidence_score: round(
      confidenceRatio * 100,
      CONFIDENCE_V1_CONFIG.fieldScorePrecisionDigits,
    ),
    factors,
  };
};

const statusWithLowestFactor = <TStatus extends string>(
  statuses: readonly TStatus[],
  factors: Readonly<Record<TStatus, number>>,
): TStatus =>
  [...statuses].sort(
    (left, right) =>
      factors[left] - factors[right] || left.localeCompare(right),
  )[0];

export const leastReliableVerificationStatus = (
  statuses: readonly FieldEvidence["verification_status"][],
): FieldEvidence["verification_status"] =>
  statusWithLowestFactor(statuses, CONFIDENCE_V1_CONFIG.verificationFactors);

export const leastFreshStatus = (
  statuses: readonly FieldEvidence["freshness_status"][],
): FieldEvidence["freshness_status"] =>
  statusWithLowestFactor(statuses, CONFIDENCE_V1_CONFIG.freshnessFactors);

const freshnessPolicyFor = (fields: readonly string[]) =>
  CONFIDENCE_V1_CONFIG.freshnessPolicies.find((policy) =>
    policy.fields.some((configured) =>
      fields.some(
        (field) => field === configured || field.startsWith(configured),
      ),
    ),
  );

export interface ResolveFreshnessInput {
  readonly fields: readonly string[];
  readonly declared_statuses: readonly FieldEvidence["freshness_status"][];
  readonly evidence: readonly FieldEvidence[];
  readonly current_time: string;
  readonly valid_until?: string | null;
}

export const resolveFreshnessStatus = (
  input: ResolveFreshnessInput,
): FieldEvidence["freshness_status"] => {
  const currentTime = Date.parse(input.current_time);
  if (
    input.valid_until !== null &&
    input.valid_until !== undefined &&
    Date.parse(input.valid_until) < currentTime
  ) {
    return "expired";
  }

  const statuses = [...input.declared_statuses];
  const policy = freshnessPolicyFor(input.fields);
  if (policy && input.evidence.length > 0) {
    const latestCollectedAt = Math.max(
      ...input.evidence.map((item) => Date.parse(item.collected_at)),
    );
    const ageHours =
      Math.max(0, currentTime - latestCollectedAt) / MILLISECONDS_PER_HOUR;
    statuses.push(
      ageHours <= policy.fresh_through_hours
        ? "fresh"
        : ageHours <= policy.aging_through_hours
          ? "aging"
          : "stale",
    );
  }
  return leastFreshStatus(statuses.length > 0 ? statuses : ["unknown"]);
};

const sourceOrigin = (
  sourceId: string,
  sourceById: ReadonlyMap<string, Source>,
): string => {
  const seen = new Set<string>();
  let current = sourceId;
  while (!seen.has(current)) {
    seen.add(current);
    const upstream = sourceById.get(current)?.upstream_source_id;
    if (upstream === null || upstream === undefined) return current;
    current = upstream;
  }
  return current;
};

const serializedValue = (value: FieldEvidence["value"]): string =>
  JSON.stringify(value);

export interface EvidenceQualityResolution {
  readonly quality: DataQualityEvidenceQuality;
  readonly factor: number;
  readonly multiple_agreeing_independent_evidence: boolean;
}

export const resolveEvidenceQuality = (
  evidence: readonly FieldEvidence[],
  sources: readonly Source[],
  hasConflict: boolean,
): EvidenceQualityResolution => {
  if (evidence.length === 0) {
    return {
      quality: "missing",
      factor: 0,
      multiple_agreeing_independent_evidence: false,
    };
  }

  const sourceById = new Map(
    sources.map((source) => [source.source_id, source]),
  );
  const ranked = evidence.map((item) => {
    const quality =
      CONFIDENCE_V1_CONFIG.evidenceTypeQuality[item.evidence_type];
    const source = sourceById.get(item.source_id);
    const trustFactor = source
      ? CONFIDENCE_V1_CONFIG.sourceTrustFactors[source.trust_level]
      : CONFIDENCE_V1_CONFIG.sourceTrustFactors.unknown;
    return {
      quality,
      factor:
        CONFIDENCE_V1_CONFIG.evidenceQualityFactors[quality] * trustFactor,
      item,
    };
  });
  ranked.sort(
    (left, right) =>
      right.factor - left.factor ||
      left.item.evidence_id.localeCompare(right.item.evidence_id),
  );

  const agreeingOrigins = new Map<string, Set<string>>();
  for (const item of evidence) {
    const valueKey = serializedValue(item.value);
    const origins = agreeingOrigins.get(valueKey) ?? new Set<string>();
    origins.add(sourceOrigin(item.source_id, sourceById));
    agreeingOrigins.set(valueKey, origins);
  }
  const independentAgreementCount = hasConflict
    ? 1
    : Math.max(...[...agreeingOrigins.values()].map((origins) => origins.size));
  const multipleAgreeing = independentAgreementCount >= 2;
  const factor = clampRatio(
    ranked[0].factor +
      (multipleAgreeing
        ? (independentAgreementCount - 1) *
          CONFIDENCE_V1_CONFIG.agreeingEvidenceBonusPerIndependentOrigin
        : 0),
  );

  return {
    quality: ranked[0].quality,
    factor: round(factor, CONFIDENCE_V1_CONFIG.scorePrecisionDigits),
    multiple_agreeing_independent_evidence: multipleAgreeing,
  };
};
