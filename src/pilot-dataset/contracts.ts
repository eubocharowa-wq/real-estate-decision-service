import { z } from "zod";

import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
} from "../domain/common/schema";

export const pilotDatasetMetadataSchema = z.strictObject({
  dataset_id: entityIdSchema,
  dataset_version: nonEmptyStringSchema,
  dataset_type: z.literal("synthetic_pilot"),
  created_at: isoDateTimeSchema,
  schema_version: schemaVersionSchema,
  geography: z.strictObject({
    country_code: z.string().regex(/^[A-Z]{2}$/),
    region: nonEmptyStringSchema,
    cities: z.array(nonEmptyStringSchema).min(1),
  }),
  property_count: z.number().int().nonnegative(),
  offer_count: z.number().int().nonnegative(),
  notes: z.array(nonEmptyStringSchema),
});

export const duplicateClusterSchema = z.strictObject({
  cluster_id: entityIdSchema,
  property_id: entityIdSchema,
  offer_ids: z.array(entityIdSchema).min(2),
  expected_relation: z.literal("same_property"),
  strong_identifiers: z.array(nonEmptyStringSchema),
});

export const falseDuplicatePairSchema = z.strictObject({
  pair_id: entityIdSchema,
  property_ids: z.tuple([entityIdSchema, entityIdSchema]),
  offer_ids: z.tuple([entityIdSchema, entityIdSchema]),
  expected_relation: z.literal("different_property"),
  similarity_trap: nonEmptyStringSchema,
});

export const comparisonGroupSchema = z.strictObject({
  group_id: entityIdSchema,
  property_ids: z.array(entityIdSchema).min(2),
  tradeoff_dimensions: z.array(nonEmptyStringSchema).min(1),
  known_differences: z.array(nonEmptyStringSchema).min(1),
  unknowns: z.array(nonEmptyStringSchema),
  winner: z.null(),
});

export const confidenceCaseSchema = z.strictObject({
  case_id: entityIdSchema,
  profile: z.enum([
    "high_match_potential_high_confidence",
    "high_match_potential_low_confidence",
    "medium_match_potential_high_confidence",
    "hard_critical_field_unknown",
  ]),
  property_id: entityIdSchema,
  offer_ids: z.array(entityIdSchema).min(1),
  evidence_ids: z.array(entityIdSchema),
  rationale: nonEmptyStringSchema,
});

export const financingCompatibilitySchema = z.strictObject({
  case_id: entityIdSchema,
  property_id: entityIdSchema,
  allowed_scenario_ids: z.array(entityIdSchema),
  forbidden_combinations: z.array(
    z.strictObject({
      price_offer_id: entityIdSchema,
      financing_offer_id: entityIdSchema,
      reason: nonEmptyStringSchema,
    }),
  ),
});

const fixtureNoteSchema = z.strictObject({
  purpose: nonEmptyStringSchema,
  fixture_tags: z.array(nonEmptyStringSchema),
});

export const fixtureNotesSchema = z.strictObject({
  properties: z.record(entityIdSchema, fixtureNoteSchema),
  offers: z.record(entityIdSchema, fixtureNoteSchema),
});

export const benchmarkCaseSchema = z.strictObject({
  id: entityIdSchema,
  purpose: nonEmptyStringSchema,
  property_ids: z.array(entityIdSchema),
  offer_ids: z.array(entityIdSchema),
  relevant_user_request_ids: z.array(entityIdSchema),
  expected_invariants: z.array(nonEmptyStringSchema).min(1),
});

export const benchmarkManifestSchema = z.strictObject({
  dataset_id: entityIdSchema,
  dataset_version: nonEmptyStringSchema,
  cases: z.array(benchmarkCaseSchema).min(1),
});

export type PilotDatasetMetadata = z.infer<typeof pilotDatasetMetadataSchema>;
export type DuplicateCluster = z.infer<typeof duplicateClusterSchema>;
export type FalseDuplicatePair = z.infer<typeof falseDuplicatePairSchema>;
export type ComparisonGroup = z.infer<typeof comparisonGroupSchema>;
export type ConfidenceCase = z.infer<typeof confidenceCaseSchema>;
export type FinancingCompatibility = z.infer<
  typeof financingCompatibilitySchema
>;
export type FixtureNotes = z.infer<typeof fixtureNotesSchema>;
export type BenchmarkManifest = z.infer<typeof benchmarkManifestSchema>;
