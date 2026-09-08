#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  buildEisjsCandidate,
  EISJS_EXPLICIT_UNKNOWN_FIELDS,
} from "../src/pilot-hardening/eisjs-candidate";
import {
  buildCuratedPilotManifest,
  CURATED_PILOT_DIRECTORY,
  loadCuratedPilotDataset,
  readCuratedPilotCandidateFiles,
} from "../src/pilot-hardening/curated-dataset";
import { validateRealPilotDatasetManifest } from "../src/pilot-hardening/real-pilot-dataset";

/**
 * Data-entry tool for the curated pilot dataset.
 *
 * It performs no network access of any kind: it turns values a person copied
 * from a published ЕИСЖС object card into a validated PilotCandidate with
 * provenance. `add` writes one object; `check` re-validates everything on disk.
 *
 *   npx tsx scripts/pilot-candidate.ts add <input.json>
 *   npx tsx scripts/pilot-candidate.ts check
 */
const usage = `Usage:
  pilot-candidate add <input.json>   Build and store one curated object
  pilot-candidate check              Validate every stored object
  pilot-candidate unknowns           Print the fields a declaration never states
`;

const add = (inputPath: string): void => {
  const raw: unknown = JSON.parse(readFileSync(inputPath, "utf8"));
  let built: ReturnType<typeof buildEisjsCandidate>;
  try {
    built = buildEisjsCandidate(raw);
  } catch (error) {
    // The template ships with markers instead of values, so this is the
    // normal first response until an operator fills it in.
    console.error(`The entry form is not complete: ${inputPath}`);
    console.error(
      error instanceof z.ZodError
        ? z.prettifyError(error)
        : error instanceof Error
          ? error.message
          : String(error),
    );
    process.exitCode = 1;
    return;
  }
  const manifest = buildCuratedPilotManifest({
    candidates: [built.candidate],
    createdAt: built.candidate.observed_at,
  });
  const validation = validateRealPilotDatasetManifest(manifest);
  if (!validation.valid) {
    console.error("The candidate did not validate:");
    for (const error of validation.errors) console.error(`  ${error}`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(CURATED_PILOT_DIRECTORY, { recursive: true });
  const file = path.join(
    CURATED_PILOT_DIRECTORY,
    `${built.candidate.candidate_id}.json`,
  );
  writeFileSync(file, `${JSON.stringify(built.candidate, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
  console.log(
    `  confirmed fields: ${built.confirmedFieldCount}, claimed: ${built.claimedFieldCount}`,
  );
  console.log(
    `  explicit unknowns: ${built.candidate.explicit_unknown_fields.length}`,
  );
};

const check = (): void => {
  const stored = readCuratedPilotCandidateFiles();
  const dataset = loadCuratedPilotDataset();
  console.log(`Stored objects: ${stored.length}`);
  console.log(`Configured for the pilot: ${dataset.configured ? "yes" : "no"}`);
  for (const error of dataset.errors) console.error(`  ${error}`);
  if (stored.length > 0 && !dataset.configured) process.exitCode = 1;
};

const main = (): void => {
  const [command, argument] = process.argv.slice(2);
  if (command === "add") {
    if (!argument) {
      console.error(usage);
      process.exitCode = 1;
      return;
    }
    add(argument);
    return;
  }
  if (command === "check") {
    check();
    return;
  }
  if (command === "unknowns") {
    for (const field of EISJS_EXPLICIT_UNKNOWN_FIELDS) console.log(field);
    return;
  }
  console.error(usage);
  process.exitCode = 1;
};

main();
