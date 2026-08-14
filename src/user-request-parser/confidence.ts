import type {
  ExtractedFact,
  InterpretationConfidence,
  ParserContradiction,
  ParserUnknown,
  ParserWarning,
} from "./contracts";
import { userRequestParserPolicy } from "./config";

export const calculateInterpretationConfidence = (
  facts: readonly ExtractedFact[],
  unknowns: readonly ParserUnknown[],
  contradictions: readonly ParserContradiction[],
  warnings: readonly ParserWarning[],
): InterpretationConfidence => {
  const factors: InterpretationConfidence["factors"] = [];
  let score = 55;
  const explicitImpact = Math.min(30, facts.length * 4);
  score += explicitImpact;
  factors.push({
    code: "explicit_fields",
    impact: explicitImpact,
    explanation: `Извлечено явных фактов: ${facts.length}.`,
  });

  const priorityFacts = facts.filter(
    (fact) => fact.priority_interpretation !== null,
  );
  if (priorityFacts.length > 0) {
    const average =
      priorityFacts.reduce(
        (sum, fact) => sum + (fact.priority_interpretation?.confidence ?? 0),
        0,
      ) / priorityFacts.length;
    const impact = -Math.round((1 - average) * 10);
    score += impact;
    factors.push({
      code: "priority_mapping",
      impact,
      explanation: `Средняя уверенность классификации приоритета: ${average.toFixed(2)}.`,
    });
  }

  const blockingCount = contradictions.filter((item) => item.blocking).length;
  if (blockingCount > 0) {
    const impact =
      -blockingCount *
      userRequestParserPolicy.confidence.blocking_contradiction_penalty;
    score += impact;
    factors.push({
      code: "blocking_contradictions",
      impact,
      explanation: `Блокирующих противоречий: ${blockingCount}.`,
    });
  }

  const unknownPenalty = unknowns.reduce((sum, unknown) => {
    const penalty =
      unknown.materiality === "critical"
        ? userRequestParserPolicy.confidence.critical_unknown_penalty
        : unknown.materiality === "high"
          ? userRequestParserPolicy.confidence.high_unknown_penalty
          : unknown.materiality === "medium"
            ? userRequestParserPolicy.confidence.medium_unknown_penalty
            : 0;
    return sum + penalty;
  }, 0);
  if (unknownPenalty > 0) {
    score -= unknownPenalty;
    factors.push({
      code: "material_unknowns",
      impact: -unknownPenalty,
      explanation: `Материальных неизвестных полей: ${unknowns.filter((item) => item.materiality !== "low").length}.`,
    });
  }

  if (warnings.length > 0) {
    const impact =
      -warnings.length *
      userRequestParserPolicy.confidence.ambiguous_warning_penalty;
    score += impact;
    factors.push({
      code: "warnings",
      impact,
      explanation: `Предупреждений нормализации: ${warnings.length}.`,
    });
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const band =
    bounded >= userRequestParserPolicy.confidence.high_minimum
      ? "high"
      : bounded >= userRequestParserPolicy.confidence.medium_minimum
        ? "medium"
        : "low";
  return { score: bounded, band, factors };
};
