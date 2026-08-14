import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  type FieldEvidence,
  type FinancingOffer,
  type FinancingProgram,
  type Offer,
  type Promotion,
  type Property,
  type PropertyFinancingEligibility,
  type PurchaseScenario,
  type Source,
  type SourceConflict,
  type UserRequest,
  fieldEvidenceSchema,
  financingOfferSchema,
  financingProgramSchema,
  offerSchema,
  promotionSchema,
  propertyFinancingEligibilitySchema,
  propertySchema,
  purchaseScenarioSchema,
  sourceConflictSchema,
  sourceSchema,
  userRequestSchema,
} from "../domain";
import {
  type BenchmarkManifest,
  type ComparisonGroup,
  type ConfidenceCase,
  type DuplicateCluster,
  type FalseDuplicatePair,
  type FinancingCompatibility,
  type FixtureNotes,
  type PilotDatasetMetadata,
  benchmarkManifestSchema,
  comparisonGroupSchema,
  confidenceCaseSchema,
  duplicateClusterSchema,
  falseDuplicatePairSchema,
  financingCompatibilitySchema,
  fixtureNotesSchema,
  pilotDatasetMetadataSchema,
} from "./contracts";

export const PILOT_DATASET_DIRECTORY = path.resolve(
  process.cwd(),
  "data/examples/pilot",
);

const parseFile = <TSchema extends z.ZodType>(
  directory: string,
  fileName: string,
  schema: TSchema,
): z.infer<TSchema> => {
  const filePath = path.join(directory, fileName);
  const payload: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `Invalid pilot fixture ${fileName}: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
};

const sorted = <T>(items: readonly T[], id: (item: T) => string): T[] =>
  [...items].sort((left, right) => id(left).localeCompare(id(right)));

export interface PilotDataset {
  readonly metadata: PilotDatasetMetadata;
  readonly properties: readonly Property[];
  readonly offers: readonly Offer[];
  readonly financingPrograms: readonly FinancingProgram[];
  readonly financingOffers: readonly FinancingOffer[];
  readonly promotions: readonly Promotion[];
  readonly propertyFinancingEligibility: readonly PropertyFinancingEligibility[];
  readonly purchaseScenarios: readonly PurchaseScenario[];
  readonly sources: readonly Source[];
  readonly fieldEvidence: readonly FieldEvidence[];
  readonly sourceConflicts: readonly SourceConflict[];
  readonly duplicateClusters: readonly DuplicateCluster[];
  readonly falseDuplicatePairs: readonly FalseDuplicatePair[];
  readonly comparisonGroups: readonly ComparisonGroup[];
  readonly confidenceCases: readonly ConfidenceCase[];
  readonly financingCompatibility: readonly FinancingCompatibility[];
  readonly fixtureNotes: FixtureNotes;
  readonly benchmarkManifest: BenchmarkManifest;
  readonly userRequests: readonly UserRequest[];
}

export const loadPilotDataset = (
  directory = PILOT_DATASET_DIRECTORY,
): PilotDataset => {
  const groundTruthDirectory = path.join(directory, "ground-truth");
  const userRequestDirectory = path.join(directory, "user-requests");
  const userRequestFiles = readdirSync(userRequestDirectory)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  return {
    metadata: parseFile(directory, "metadata.json", pilotDatasetMetadataSchema),
    properties: sorted(
      parseFile(directory, "properties.json", z.array(propertySchema)),
      (item) => item.identity.property_id,
    ),
    offers: sorted(
      parseFile(directory, "offers.json", z.array(offerSchema)),
      (item) => item.offer_id,
    ),
    financingPrograms: sorted(
      parseFile(
        directory,
        "financing-programs.json",
        z.array(financingProgramSchema),
      ),
      (item) => item.program_id,
    ),
    financingOffers: sorted(
      parseFile(
        directory,
        "financing-offers.json",
        z.array(financingOfferSchema),
      ),
      (item) => item.financing_offer_id,
    ),
    promotions: sorted(
      parseFile(directory, "promotions.json", z.array(promotionSchema)),
      (item) => item.promotion_id,
    ),
    propertyFinancingEligibility: sorted(
      parseFile(
        directory,
        "property-financing-eligibility.json",
        z.array(propertyFinancingEligibilitySchema),
      ),
      (item) => item.eligibility_id,
    ),
    purchaseScenarios: sorted(
      parseFile(
        directory,
        "purchase-scenarios.json",
        z.array(purchaseScenarioSchema),
      ),
      (item) => item.scenario_id,
    ),
    sources: sorted(
      parseFile(directory, "sources.json", z.array(sourceSchema)),
      (item) => item.source_id,
    ),
    fieldEvidence: sorted(
      parseFile(directory, "field-evidence.json", z.array(fieldEvidenceSchema)),
      (item) => item.evidence_id,
    ),
    sourceConflicts: sorted(
      parseFile(
        directory,
        "source-conflicts.json",
        z.array(sourceConflictSchema),
      ),
      (item) => item.conflict_id,
    ),
    duplicateClusters: sorted(
      parseFile(
        groundTruthDirectory,
        "duplicate-clusters.json",
        z.array(duplicateClusterSchema),
      ),
      (item) => item.cluster_id,
    ),
    falseDuplicatePairs: sorted(
      parseFile(
        groundTruthDirectory,
        "false-duplicate-pairs.json",
        z.array(falseDuplicatePairSchema),
      ),
      (item) => item.pair_id,
    ),
    comparisonGroups: sorted(
      parseFile(
        groundTruthDirectory,
        "comparison-groups.json",
        z.array(comparisonGroupSchema),
      ),
      (item) => item.group_id,
    ),
    confidenceCases: sorted(
      parseFile(
        groundTruthDirectory,
        "confidence-cases.json",
        z.array(confidenceCaseSchema),
      ),
      (item) => item.case_id,
    ),
    financingCompatibility: sorted(
      parseFile(
        groundTruthDirectory,
        "financing-compatibility.json",
        z.array(financingCompatibilitySchema),
      ),
      (item) => item.case_id,
    ),
    fixtureNotes: parseFile(
      groundTruthDirectory,
      "fixture-notes.json",
      fixtureNotesSchema,
    ),
    benchmarkManifest: parseFile(
      directory,
      "benchmark-manifest.json",
      benchmarkManifestSchema,
    ),
    userRequests: sorted(
      userRequestFiles.map((fileName) =>
        parseFile(userRequestDirectory, fileName, userRequestSchema),
      ),
      (item) => item.user_request_id,
    ),
  };
};
