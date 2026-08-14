import {
  assertPilotDatasetIntegrity,
  loadPilotDataset,
} from "../src/pilot-dataset";

const dataset = loadPilotDataset();
assertPilotDatasetIntegrity(dataset);

console.log(
  [
    `Validated pilot dataset ${dataset.metadata.dataset_version}.`,
    `${dataset.properties.length} properties,`,
    `${dataset.offers.length} offers,`,
    `${dataset.sources.length} sources,`,
    `${dataset.fieldEvidence.length} evidence records,`,
    `${dataset.purchaseScenarios.length} purchase scenarios.`,
  ].join(" "),
);
