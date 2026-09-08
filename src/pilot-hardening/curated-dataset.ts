import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  REAL_PILOT_DATASET_MANIFEST_VERSION,
  type RealPilotDatasetCandidate,
  type RealPilotDatasetManifest,
} from "./contracts";
import { validateRealPilotDatasetManifest } from "./real-pilot-dataset";

/**
 * The curated pilot dataset lives as one file per object.
 *
 * Objects are entered by hand, a few at a time, by different people; a single
 * checked-in manifest would collide on every entry. Each file is one object
 * card, and the manifest is composed from the directory.
 */
export const CURATED_PILOT_DIRECTORY = path.resolve(
  process.cwd(),
  "data/examples/real-pilot/candidates",
);

export const CURATED_PILOT_DATASET_VERSION = "real-curated-pilot-v1";

export const readCuratedPilotCandidateFiles = (
  directory = CURATED_PILOT_DIRECTORY,
): readonly RealPilotDatasetCandidate[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map(
      (file) =>
        JSON.parse(
          readFileSync(path.join(directory, file), "utf8"),
        ) as RealPilotDatasetCandidate,
    );
};

export const buildCuratedPilotManifest = (input: {
  readonly candidates: readonly RealPilotDatasetCandidate[];
  readonly createdAt: string;
}): RealPilotDatasetManifest => ({
  schema_version: REAL_PILOT_DATASET_MANIFEST_VERSION,
  manifest_id: "curated_pilot_manifest",
  dataset_version: CURATED_PILOT_DATASET_VERSION,
  environment: "pilot",
  created_at: input.createdAt,
  candidates: [...input.candidates],
  manual_selection_sources: [],
});

export interface CuratedPilotDataset {
  readonly configured: boolean;
  readonly candidates: readonly RealPilotDatasetCandidate[];
  readonly errors: readonly string[];
}

/**
 * Loads the curated objects, refusing anything the pilot validator rejects.
 *
 * An invalid file yields an empty dataset rather than a partially trusted one:
 * a real pilot must not run on objects whose provenance did not validate.
 */
export const loadCuratedPilotDataset = (
  directory = CURATED_PILOT_DIRECTORY,
  options: { readonly now?: string } = {},
): CuratedPilotDataset => {
  const candidates = readCuratedPilotCandidateFiles(directory);
  if (candidates.length === 0)
    return { configured: false, candidates: [], errors: [] };
  const manifest = buildCuratedPilotManifest({
    candidates,
    createdAt: candidates[0]!.observed_at,
  });
  const validation = validateRealPilotDatasetManifest(manifest, options);
  return {
    configured: validation.configured,
    candidates: validation.configured ? candidates : [],
    errors: validation.errors,
  };
};
