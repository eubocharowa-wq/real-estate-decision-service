import type { Property } from "../domain";
import type { CoverageSummary, SourcePilotReadiness } from "./contracts";

const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values)].sort();

export const buildCoverageSummary = (input: {
  readonly properties: readonly Property[];
  readonly eligiblePropertyIds: readonly string[];
  readonly sourceReadiness: readonly SourcePilotReadiness[];
  readonly unavailableSourceIds?: readonly string[];
  readonly staleSourceIds?: readonly string[];
  readonly expectedGeography?: readonly string[];
  readonly expectedPropertyTypes?: readonly string[];
  readonly generatedAt: string;
}): CoverageSummary => {
  const activeReadiness = input.sourceReadiness.filter(
    (source) => source.ready,
  );
  const active = activeReadiness.map((source) => source.source_id);
  const blocked = input.sourceReadiness
    .filter((source) => !source.ready)
    .map((source) => source.source_id);
  const geography = uniqueSorted(
    input.properties.flatMap((property) =>
      [property.location.address.region, property.location.address.city].filter(
        (value): value is string => value !== null,
      ),
    ),
  );
  const propertyTypes = uniqueSorted(
    input.properties.map((property) => property.property_type),
  );
  const gaps = [
    ...(input.expectedGeography ?? [])
      .filter((value) => !geography.includes(value))
      .map((value) => `geography:${value}`),
    ...(input.expectedPropertyTypes ?? [])
      .filter((value) => !propertyTypes.includes(value))
      .map((value) => `property_type:${value}`),
  ];
  if (active.length === 0) gaps.push("active_pilot_source");
  if (
    activeReadiness.length > 0 &&
    activeReadiness.every((source) =>
      source.warnings.some((warning) =>
        ["SYNTHETIC_DEMO_SOURCE", "USER_SUPPLIED_NOT_MARKET_COVERAGE"].includes(
          warning,
        ),
      ),
    )
  )
    gaps.push("approved_market_source_coverage");
  if (input.properties.length === 0) gaps.push("candidate_records");
  const coverageSufficient =
    active.length > 0 && gaps.length === 0 && input.properties.length > 0;
  const emptyResultKind =
    input.eligiblePropertyIds.length > 0
      ? ("not_empty" as const)
      : coverageSufficient
        ? ("no_eligible_in_available_data" as const)
        : ("insufficient_data_coverage" as const);
  const confidence =
    coverageSufficient && (input.staleSourceIds?.length ?? 0) === 0
      ? ("high" as const)
      : active.length > 0 && input.properties.length > 0
        ? ("medium" as const)
        : ("low" as const);
  return {
    schema_version: "coverage-summary-v1",
    geography,
    property_types: propertyTypes,
    active_sources: uniqueSorted(active),
    unavailable_sources: uniqueSorted(input.unavailableSourceIds ?? []),
    blocked_sources: uniqueSorted(blocked),
    stale_sources: uniqueSorted(input.staleSourceIds ?? []),
    object_count: input.properties.length,
    coverage_gaps: uniqueSorted(gaps),
    confidence,
    empty_result_kind: emptyResultKind,
    user_message:
      emptyResultKind === "no_eligible_in_available_data"
        ? "По подключённым источникам подходящих вариантов пока не найдено."
        : emptyResultKind === "insufficient_data_coverage"
          ? "Данных подключённых источников пока недостаточно, чтобы делать вывод о наличии вариантов на рынке."
          : "Подходящие варианты найдены в доступном наборе данных.",
    generated_at: input.generatedAt,
  };
};
