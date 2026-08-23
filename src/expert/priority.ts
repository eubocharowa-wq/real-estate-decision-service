import { EXPERT_PRIORITY_VERSION, type ExpertPriority } from "./contracts";

export const EXPERT_PRIORITY_POLICY_V1 = Object.freeze({
  version: EXPERT_PRIORITY_VERSION,
  weights: Object.freeze({
    preDecision: 25,
    mustCriterion: 25,
    financialImpact: 20,
    unresolvedConflict: 20,
    deadlineWithinThreeDays: 35,
    deadlineWithinSevenDays: 20,
    explicitUrgency: Object.freeze({
      critical: 60,
      high: 35,
      normal: 10,
      low: 0,
      none: 0,
    }),
  }),
  thresholds: Object.freeze({
    critical: 70,
    high: 40,
    normal: 15,
  }),
});

export interface ExpertPriorityInput {
  readonly preDecision: boolean;
  readonly mustCriterion: boolean;
  readonly financialImpact: boolean;
  readonly unresolvedConflict: boolean;
  readonly transactionDeadline: string | null;
  readonly explicitUrgency: ExpertPriority | "none";
  readonly calculatedAt: string;
}

export interface ExpertPriorityDecision {
  readonly priority: ExpertPriority;
  readonly score: number;
  readonly policyVersion: typeof EXPERT_PRIORITY_VERSION;
  readonly reasonCodes: readonly string[];
}

const daysUntil = (from: string, target: string): number =>
  (Date.parse(target) - Date.parse(from)) / 86_400_000;

export const calculateExpertPriority = (
  input: ExpertPriorityInput,
): ExpertPriorityDecision => {
  const reasons: string[] = [];
  let score = 0;
  const add = (condition: boolean, value: number, reason: string): void => {
    if (!condition) return;
    score += value;
    reasons.push(reason);
  };
  add(
    input.preDecision,
    EXPERT_PRIORITY_POLICY_V1.weights.preDecision,
    "PRE_DECISION",
  );
  add(
    input.mustCriterion,
    EXPERT_PRIORITY_POLICY_V1.weights.mustCriterion,
    "MUST_CRITERION",
  );
  add(
    input.financialImpact,
    EXPERT_PRIORITY_POLICY_V1.weights.financialImpact,
    "FINANCIAL_IMPACT",
  );
  add(
    input.unresolvedConflict,
    EXPERT_PRIORITY_POLICY_V1.weights.unresolvedConflict,
    "UNRESOLVED_CONFLICT",
  );
  if (input.transactionDeadline) {
    const days = daysUntil(input.calculatedAt, input.transactionDeadline);
    if (!Number.isFinite(days)) throw new Error("INVALID_TRANSACTION_DEADLINE");
    if (days <= 3) {
      score += EXPERT_PRIORITY_POLICY_V1.weights.deadlineWithinThreeDays;
      reasons.push("DEADLINE_WITHIN_THREE_DAYS");
    } else if (days <= 7) {
      score += EXPERT_PRIORITY_POLICY_V1.weights.deadlineWithinSevenDays;
      reasons.push("DEADLINE_WITHIN_SEVEN_DAYS");
    }
  }
  const urgencyWeight =
    EXPERT_PRIORITY_POLICY_V1.weights.explicitUrgency[input.explicitUrgency];
  if (urgencyWeight > 0) {
    score += urgencyWeight;
    reasons.push(`EXPLICIT_URGENCY_${input.explicitUrgency.toUpperCase()}`);
  }
  const priority: ExpertPriority =
    score >= EXPERT_PRIORITY_POLICY_V1.thresholds.critical
      ? "critical"
      : score >= EXPERT_PRIORITY_POLICY_V1.thresholds.high
        ? "high"
        : score >= EXPERT_PRIORITY_POLICY_V1.thresholds.normal
          ? "normal"
          : "low";
  return {
    priority,
    score,
    policyVersion: EXPERT_PRIORITY_VERSION,
    reasonCodes: reasons,
  };
};
