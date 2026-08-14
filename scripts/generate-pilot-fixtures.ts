import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import * as prettier from "prettier";
import { z } from "zod";

import {
  SCHEMA_VERSION,
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
  criterionSchema,
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
} from "../src/domain";
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
} from "../src/pilot-dataset/contracts";

const outputDirectory = path.resolve(process.cwd(), "data/examples/pilot");
const checkOnly = process.argv.includes("--check");
const fixedNow = "2026-08-15T00:00:00.000Z";
const schemaVersion = SCHEMA_VERSION;

const money = (amount: number) => ({
  amount: `${Math.round(amount)}.00`,
  currency: "RUB",
});

const sourceReference = (
  sourceId: string,
  evidenceIds: readonly string[] = [],
) => ({
  source_id: sourceId,
  snapshot_id: null,
  source_url: `https://${sourceId.replaceAll("_", "-")}.example/fixture`,
  evidence_ids: [...evidenceIds],
});

const sources: Source[] = [
  ["src_dev_alpha", "developer_site", "Developer Alpha", "primary", "manual"],
  ["src_project_delta", "project_site", "Project Delta", "primary", "manual"],
  ["src_market_beta", "classified", "Marketplace Beta", "secondary", "import"],
  ["src_agency_eta", "agency_site", "Agency Eta", "secondary", "import"],
  ["src_bank_gamma", "bank_site", "Bank Gamma", "primary", "manual"],
  [
    "src_government_test",
    "government",
    "Synthetic Rules Authority",
    "authoritative",
    "manual",
  ],
  [
    "src_user_fixture",
    "user_link",
    "User Fixture Link",
    "user_provided",
    "user_submission",
  ],
  [
    "src_expert_fixture",
    "manual_expert",
    "Pilot Expert Fixture",
    "primary",
    "manual",
  ],
].map(([sourceId, sourceType, name, trustLevel, method]) =>
  sourceSchema.parse({
    schema_version: schemaVersion,
    source_id: sourceId,
    source_type: sourceType,
    name,
    domain: `${sourceId.replaceAll("_", "-")}.example`,
    base_url: `https://${sourceId.replaceAll("_", "-")}.example`,
    coverage: {
      country_codes: ["RU"],
      regions: ["Тестовая область"],
      property_types: ["apartment", "apartments", "house", "townhouse", "land"],
    },
    collection_method: method,
    trust_level: trustLevel,
    status: "active",
    policy_metadata: {
      access_status: "approved",
      storage_rights: true,
      display_rights: true,
      refresh_rights: true,
      reviewed_at: fixedNow,
      notes: "Synthetic test-only source; no external collection is performed.",
    },
    upstream_source_id: null,
  }),
);

const evidence: FieldEvidence[] = [];
const addEvidence = (input: {
  evidenceId: string;
  entityType: string;
  entityId: string;
  field: string;
  value: unknown;
  sourceId: string;
  verificationStatus?: FieldEvidence["verification_status"];
  freshnessStatus?: FieldEvidence["freshness_status"];
  evidenceType?: FieldEvidence["evidence_type"];
  evidenceText: string;
}) => {
  const item = fieldEvidenceSchema.parse({
    schema_version: schemaVersion,
    evidence_id: input.evidenceId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    field: input.field,
    value: input.value,
    raw_value: input.value,
    source_id: input.sourceId,
    snapshot_id: null,
    source_url: `https://${input.sourceId.replaceAll("_", "-")}.example/evidence/${input.evidenceId}`,
    collected_at: fixedNow,
    verification_status: input.verificationStatus ?? "confirmed",
    freshness_status: input.freshnessStatus ?? "fresh",
    extraction_confidence: input.verificationStatus === "unknown" ? null : 1,
    evidence_type: input.evidenceType ?? "primary_source",
    evidence_text: input.evidenceText,
    evidence_reference: `pilot://${input.evidenceId}`,
  });
  evidence.push(item);
  return item.evidence_id;
};

type ScenarioCategory =
  "new_build" | "secondary" | "house" | "townhouse" | "land" | "special";

const fixturePropertyNotes: FixtureNotes["properties"] = {};
const fixtureOfferNotes: FixtureNotes["offers"] = {};

const makeProperty = (input: {
  id: string;
  category: ScenarioCategory;
  index: number;
  propertyType: Property["property_type"];
  marketType: Property["market_type"];
  area: number | null;
  rooms: number | null;
  floor: number | null;
  floorsTotal: number | null;
  ready: boolean | null;
  moveInDate: string | null;
  finishing: Property["condition"]["finishing_type"];
  gas?: Property["utilities"]["gas"];
  landArea?: number | null;
  concrete?: boolean;
  missingHouseNumber?: boolean;
  tags: string[];
  purpose: string;
}): Property => {
  const sourceId =
    input.category === "new_build" || input.category === "special"
      ? "src_dev_alpha"
      : input.category === "secondary"
        ? "src_market_beta"
        : input.category === "land"
          ? "src_user_fixture"
          : "src_agency_eta";
  const gasStatus =
    input.gas ??
    (input.propertyType === "land" || input.category === "special"
      ? "unknown"
      : "connected");
  const timelineEvidenceId = addEvidence({
    evidenceId: `evidence_${input.id}_timeline`,
    entityType: "property",
    entityId: input.id,
    field: "timeline.move_in_possible_date",
    value: input.moveInDate,
    sourceId,
    verificationStatus: input.moveInDate === null ? "unknown" : "confirmed",
    freshnessStatus: input.moveInDate === null ? "unknown" : "fresh",
    evidenceText:
      input.moveInDate === null
        ? "Move-in date is intentionally unknown in this synthetic case."
        : `Synthetic move-in date: ${input.moveInDate}.`,
  });
  const propertyEvidenceIds = [timelineEvidenceId];
  if (input.area !== null) {
    propertyEvidenceIds.push(
      addEvidence({
        evidenceId: `evidence_${input.id}_area`,
        entityType: "property",
        entityId: input.id,
        field: "physical.total_area_m2",
        value: input.area,
        sourceId,
        evidenceText: `Synthetic normalized total area: ${input.area} m2.`,
      }),
    );
  }
  if (input.floor !== null) {
    propertyEvidenceIds.push(
      addEvidence({
        evidenceId: `evidence_${input.id}_floor`,
        entityType: "property",
        entityId: input.id,
        field: "physical.floor",
        value: input.floor,
        sourceId,
        evidenceText: `Synthetic normalized floor: ${input.floor}.`,
      }),
    );
  }
  if (["house", "townhouse", "land"].includes(input.propertyType)) {
    propertyEvidenceIds.push(
      addEvidence({
        evidenceId: `evidence_${input.id}_gas`,
        entityType: "property",
        entityId: input.id,
        field: "utilities.gas",
        value: gasStatus,
        sourceId: "src_expert_fixture",
        verificationStatus:
          gasStatus === "unknown"
            ? "unknown"
            : gasStatus === "available" || gasStatus === "planned"
              ? "claimed"
              : "confirmed",
        freshnessStatus: gasStatus === "unknown" ? "unknown" : "fresh",
        evidenceType: "manual_expert",
        evidenceText: `Synthetic normalized gas status: ${gasStatus}.`,
      }),
    );
  }
  if (input.category === "house" && input.index === 44) {
    propertyEvidenceIds.push(
      addEvidence({
        evidenceId: `evidence_${input.id}_road_access`,
        entityType: "property",
        entityId: input.id,
        field: "land.access_road.status",
        value: "seasonal_access_issue",
        sourceId: "src_expert_fixture",
        evidenceType: "manual_expert",
        evidenceText: "Synthetic manual note: seasonal road access issue.",
      }),
    );
  }
  if (input.category === "house" && input.index === 43) {
    propertyEvidenceIds.push(
      addEvidence({
        evidenceId: `evidence_${input.id}_document_status`,
        entityType: "property",
        entityId: input.id,
        field: "ownership.document_status",
        value: "unknown",
        sourceId: "src_expert_fixture",
        verificationStatus: "unknown",
        freshnessStatus: "unknown",
        evidenceType: "manual_expert",
        evidenceText:
          "Synthetic incomplete case: supporting ownership documents are unavailable.",
      }),
    );
  }
  fixturePropertyNotes[input.id] = {
    purpose: input.purpose,
    fixture_tags: [input.category, ...input.tags],
  };

  return propertySchema.parse({
    schema_version: schemaVersion,
    identity: {
      property_id: input.id,
      canonical_key:
        input.concrete === false ? null : `pilot:${input.category}:${input.id}`,
      cadastral_number: null,
      source_unit_ids:
        input.concrete === false ? ["layout_template"] : [`unit_${input.id}`],
    },
    property_type: input.propertyType,
    market_type: input.marketType,
    location: {
      address: {
        country_code: "RU",
        region: "Тестовая область",
        city: "Пилотск",
        locality: input.propertyType === "house" ? "Посёлок Сосновый" : null,
        district: ["Северный", "Центральный", "Речной"][input.index % 3],
        street: `Тестовая улица ${Math.floor(input.index / 4) + 1}`,
        house_number: input.missingHouseNumber ? null : `${10 + input.index}`,
        postal_code: null,
      },
      geo_point: {
        latitude: 54.19 + input.index * 0.001,
        longitude: 37.61 + input.index * 0.001,
      },
    },
    physical: {
      total_area_m2: input.area,
      living_area_m2:
        input.area === null ? null : Math.round(input.area * 0.62 * 10) / 10,
      kitchen_area_m2:
        input.propertyType === "land" || input.area === null
          ? null
          : Math.round(Math.min(input.area * 0.22, 18) * 10) / 10,
      rooms: input.rooms,
      bedrooms:
        input.propertyType === "house" || input.propertyType === "townhouse"
          ? input.rooms
          : null,
      floor: input.floor,
      balcony:
        input.area === null
          ? null
          : input.propertyType === "apartment" ||
              input.propertyType === "apartments"
            ? input.index % 2 === 0
            : null,
      bathrooms:
        input.propertyType === "land" || input.area === null
          ? null
          : input.area > 90
            ? 2
            : 1,
      layout_type:
        input.concrete === false
          ? "template_layout"
          : input.area === null
            ? null
            : `layout_${input.rooms ?? 0}`,
    },
    building: {
      name:
        input.category === "new_build" || input.category === "special"
          ? `ЖК Альфа, корпус ${1 + (input.index % 3)}`
          : input.propertyType === "land"
            ? null
            : `Дом ${10 + input.index}`,
      building_type:
        input.propertyType === "house" || input.propertyType === "townhouse"
          ? "individual"
          : input.propertyType === "land"
            ? null
            : "multi_unit",
      floors_total: input.floorsTotal,
      built_year: input.ready ? 2023 + (input.index % 3) : null,
      elevator: input.floorsTotal === null ? null : input.floorsTotal > 5,
      freight_elevator:
        input.floorsTotal === null ? null : input.floorsTotal > 12,
    },
    condition: {
      finishing_type: input.finishing,
      condition_description:
        input.finishing === "needs_renovation"
          ? "Synthetic case: renovation is required."
          : input.finishing === "unknown"
            ? null
            : "Synthetic normalized condition.",
      ready_for_living: input.ready,
    },
    land: {
      area_sotka: input.landArea ?? null,
      category: input.propertyType === "land" ? "settlement_land" : null,
      permitted_use:
        input.propertyType === "land" ? "individual_housing" : null,
    },
    utilities: {
      electricity:
        input.category === "special"
          ? "unknown"
          : input.propertyType === "land"
            ? "available"
            : "connected",
      water:
        input.category === "special"
          ? "unknown"
          : input.propertyType === "house" || input.propertyType === "townhouse"
            ? input.index % 4 === 0
              ? "unknown"
              : "connected"
            : input.propertyType === "land"
              ? "available"
              : "connected",
      gas: gasStatus,
      sewerage:
        input.propertyType === "land" || input.category === "special"
          ? "unknown"
          : "connected",
      heating:
        input.category === "special"
          ? "unknown"
          : input.propertyType === "land"
            ? "absent"
            : "connected",
      internet:
        input.propertyType === "land" || input.category === "special"
          ? "unknown"
          : "available",
    },
    timeline: {
      planned_commissioning_date:
        input.category === "new_build" && !input.ready ? "2027-09-30" : null,
      handover_date:
        input.category === "new_build" && !input.ready ? "2027-12-15" : null,
      move_in_possible_date: input.moveInDate,
    },
    ownership: {
      ownership_type:
        input.category === "new_build" || input.category === "special"
          ? "developer"
          : input.propertyType === "land"
            ? "unknown"
            : "private",
      encumbrance_status:
        input.category === "secondary" && input.index % 4 === 0
          ? "unknown"
          : "claimed_none",
      ownership_notes:
        input.category === "secondary" && input.index === 7
          ? "Seller move-out terms are intentionally unknown."
          : null,
    },
    metadata: {
      created_at: fixedNow,
      updated_at: fixedNow,
      evidence_refs: propertyEvidenceIds,
      tags: [],
    },
  });
};

const properties: Property[] = [];
const newBuildAreas = [
  38.2, 41.8, 44.2, 44.2, 57.4, 57.4, 63.1, 71.5, 74.8, 82.3, 36.9, 48.6, 66.2,
  91.4,
];
for (let index = 1; index <= 14; index += 1) {
  const id = `prop_nb_${String(index).padStart(3, "0")}`;
  properties.push(
    makeProperty({
      id,
      category: "new_build",
      index,
      propertyType: "apartment",
      marketType: "new_build",
      area: newBuildAreas[index - 1],
      rooms: index % 5 === 0 ? 3 : index % 3 === 0 ? 2 : 1,
      floor: index === 3 ? 7 : index === 4 ? 9 : 2 + (index % 15),
      floorsTotal: 18,
      ready: index <= 4,
      moveInDate:
        index <= 4 ? "2026-09-01" : index === 13 ? null : "2027-12-15",
      finishing:
        index % 3 === 0 ? "finished" : index % 3 === 1 ? "pre_finish" : "shell",
      tags: [
        index <= 4 ? "commissioned" : "under_construction",
        index === 1 || index === 2 ? "duplicate_cluster" : "single_offer",
        ...(index === 1
          ? ["highly_complete"]
          : index === 4
            ? ["partially_complete"]
            : []),
      ],
      purpose:
        index === 3 || index === 4
          ? "Same layout and area in different units; must remain separate."
          : "Concrete developer unit with controlled floor, finish and handover data.",
    }),
  );
}

const secondaryAreas = [
  46.5, 52.1, 59.8, 59.8, 42.7, 71.2, 64.4, 48.9, 55.6, 68.3, 39.5, 76.1,
];
for (let index = 1; index <= 12; index += 1) {
  const id = `prop_sec_${String(index).padStart(3, "0")}`;
  properties.push(
    makeProperty({
      id,
      category: "secondary",
      index: 20 + index,
      propertyType: "apartment",
      marketType: "secondary",
      area: secondaryAreas[index - 1],
      rooms: index % 4 === 0 ? 3 : index % 3 === 0 ? 2 : 1,
      floor: index === 3 ? 1 : index === 4 ? 9 : 2 + (index % 7),
      floorsTotal: 9,
      ready: index === 6 ? null : true,
      moveInDate: index === 8 ? null : "2026-10-01",
      finishing:
        index % 4 === 0
          ? "needs_renovation"
          : index % 3 === 0
            ? "renovated"
            : "finished",
      missingHouseNumber: index === 5,
      tags: [
        index === 3
          ? "first_floor"
          : index === 4
            ? "top_floor"
            : "middle_floor",
        index === 6 ? "removed_listing_case" : "active_listing_case",
      ],
      purpose:
        index === 5
          ? "Secondary apartment with intentionally incomplete address detail."
          : index === 8
            ? "Ready secondary apartment with uncertain seller move-out timeline."
            : "Secondary apartment covering owner/agency, condition and floor diversity.",
    }),
  );
}

const houseGas: Property["utilities"]["gas"][] = [
  "connected",
  "available",
  "unknown",
  "planned",
  "absent",
];
for (let index = 1; index <= 5; index += 1) {
  const id = `prop_house_${String(index).padStart(3, "0")}`;
  properties.push(
    makeProperty({
      id,
      category: "house",
      index: 40 + index,
      propertyType: "house",
      marketType: "suburban",
      area: 92 + index * 14,
      rooms: 3 + (index % 3),
      floor: null,
      floorsTotal: 1 + (index % 2),
      ready: index !== 2,
      moveInDate:
        index === 2 ? "2027-11-30" : index === 3 ? null : "2026-11-01",
      finishing:
        index === 2 ? "shell" : index === 5 ? "needs_renovation" : "finished",
      gas: houseGas[index - 1],
      landArea: 5 + index * 2,
      tags: [
        `gas_${houseGas[index - 1]}`,
        index === 4 ? "road_access_issue" : "road_access_known",
        ...(index === 3 ? ["incomplete_document_evidence"] : []),
      ],
      purpose:
        index === 4
          ? "House with large land, longer commute and a road access issue."
          : "House utility and readiness benchmark.",
    }),
  );
}

for (let index = 1; index <= 2; index += 1) {
  const id = `prop_th_${String(index).padStart(3, "0")}`;
  properties.push(
    makeProperty({
      id,
      category: "townhouse",
      index: 50 + index,
      propertyType: "townhouse",
      marketType: "suburban",
      area: 88 + index * 12,
      rooms: 3,
      floor: null,
      floorsTotal: 2,
      ready: index === 1,
      moveInDate: index === 1 ? "2026-10-15" : "2027-10-15",
      finishing: index === 1 ? "finished" : "pre_finish",
      gas: index === 1 ? "connected" : "available",
      landArea: 3.5 + index,
      tags: [index === 1 ? "duplicate_cluster" : "under_construction"],
      purpose: "Townhouse case for cross-type and duplicate handling.",
    }),
  );
}

for (let index = 1; index <= 2; index += 1) {
  const id = `prop_land_${String(index).padStart(3, "0")}`;
  properties.push(
    makeProperty({
      id,
      category: "land",
      index: 60 + index,
      propertyType: "land",
      marketType: "suburban",
      area: null,
      rooms: null,
      floor: null,
      floorsTotal: null,
      ready: null,
      moveInDate: null,
      finishing: "unknown",
      gas: index === 1 ? "available" : "unknown",
      landArea: index === 1 ? 8 : 12,
      tags: [index === 2 ? "sparse_property" : "land_edge_case"],
      purpose: "Land case where apartment-only fields are not applicable.",
    }),
  );
}

properties.push(
  makeProperty({
    id: "prop_special_template_001",
    category: "special",
    index: 70,
    propertyType: "apartment",
    marketType: "new_build",
    area: null,
    rooms: 1,
    floor: null,
    floorsTotal: 18,
    ready: false,
    moveInDate: null,
    finishing: "unknown",
    concrete: false,
    tags: ["inventory_template", "price_from", "intentionally_incomplete"],
    purpose:
      "Non-concrete inventory template; price_from must not become an exact unit price.",
  }),
);

const infrastructurePropertyIds = [
  "prop_nb_001",
  "prop_nb_005",
  "prop_sec_001",
  "prop_sec_004",
  "prop_house_001",
  "prop_house_004",
];
for (const [index, propertyId] of infrastructurePropertyIds.entries()) {
  const property = properties.find(
    (item) => item.identity.property_id === propertyId,
  );
  if (!property)
    throw new Error(`Missing infrastructure Property ${propertyId}`);
  const normalizedFields = [
    ["infrastructure.school.walk_time_min", 8 + index * 3],
    ["infrastructure.kindergarten.walk_time_min", 6 + index * 2],
    ["infrastructure.park.walk_time_min", 10 + index * 4],
    ["infrastructure.transport.walk_time_min", 5 + index * 2],
    ["mobility.user_destination.public_transport_time_min", 24 + index * 7],
  ] as const;
  for (const [field, value] of normalizedFields) {
    const evidenceId = addEvidence({
      evidenceId: `evidence_${propertyId}_${field.replaceAll(".", "_")}`,
      entityType: "property",
      entityId: propertyId,
      field,
      value,
      sourceId: "src_expert_fixture",
      evidenceType: "manual_expert",
      evidenceText: `Synthetic normalized measurement: ${value} minutes.`,
    });
    property.metadata.evidence_refs.push(evidenceId);
  }
}

const offerFinancingMap: Record<string, string[]> = {
  offer_nb_001_primary: ["finoffer_standard_no_zero"],
  offer_nb_001_agency: ["finoffer_family_zero_confirmed"],
  offer_nb_002_primary: ["finoffer_family_zero_claimed"],
  offer_nb_003_primary: ["finoffer_staged_rate"],
  offer_nb_004_primary: ["finoffer_family_zero_claimed"],
  offer_nb_005_primary: ["finoffer_family_zero_confirmed"],
  offer_nb_006_primary: ["finoffer_standard_no_zero"],
  offer_nb_007_primary: ["finoffer_standard_no_zero"],
  offer_nb_008_primary: ["finoffer_installment_balloon"],
  offer_sec_001_primary: ["finoffer_standard_no_zero"],
  offer_sec_002_primary: ["finoffer_standard_no_zero"],
  offer_house_001_primary: ["finoffer_standard_no_zero"],
};
const offerPromotionMap: Record<string, string[]> = {
  offer_nb_001_agency: ["promo_zero_down_price_increase"],
  offer_nb_002_primary: ["promo_zero_down_claimed"],
  offer_nb_005_primary: ["promo_discount_active"],
};

const priceConflictProperties = new Set([
  "prop_nb_001",
  "prop_nb_002",
  "prop_sec_001",
  "prop_house_001",
  "prop_th_001",
]);
const staleOfferIds = new Set([
  "offer_nb_009_primary",
  "offer_sec_006_primary",
  "offer_sec_009_primary",
  "offer_house_004_primary",
  "offer_land_002_primary",
]);
const agingOfferIds = new Set(["offer_sec_010_primary"]);

const priceForProperty = (property: Property, index: number): number => {
  if (property.identity.property_id === "prop_special_template_001")
    return 3_900_000;
  if (property.market_type === "new_build") return 4_350_000 + index * 175_000;
  if (property.market_type === "secondary")
    return 4_100_000 + (index - 14) * 190_000;
  if (property.property_type === "land") return 1_500_000 + index * 25_000;
  return 5_900_000 + (index - 26) * 280_000;
};

const availabilityFor = (offerId: string): Offer["availability"] => {
  if (offerId === "offer_nb_010_primary") return "reserved";
  if (offerId === "offer_nb_011_primary") return "sold";
  if (offerId === "offer_nb_012_primary") return "temporarily_unavailable";
  if (offerId === "offer_nb_013_primary" || offerId === "offer_sec_006_primary")
    return "unknown";
  if (offerId === "offer_special_template_001_primary") return "unknown";
  return "available";
};

const makeOffer = (input: {
  offerId: string;
  property: Property;
  price: number;
  sourceId: string;
  sellerType: Offer["seller"]["seller_type"];
  sellerName: string;
  additional?: boolean;
}): Offer => {
  const availability = availabilityFor(input.offerId);
  const isTemplate =
    input.property.identity.property_id === "prop_special_template_001";
  const stale = staleOfferIds.has(input.offerId);
  const aging = agingOfferIds.has(input.offerId);
  const removed = input.offerId === "offer_sec_006_primary";
  const conflict = priceConflictProperties.has(
    input.property.identity.property_id,
  );
  const verificationStatus: Offer["verification_status"] = conflict
    ? "conflicting"
    : stale
      ? "stale"
      : input.offerId === "offer_nb_013_primary"
        ? "unknown"
        : isTemplate || input.additional
          ? "claimed"
          : "confirmed";
  const freshnessStatus: Offer["freshness_status"] = removed
    ? "expired"
    : stale
      ? "stale"
      : input.offerId === "offer_nb_013_primary"
        ? "unknown"
        : aging
          ? "aging"
          : "fresh";
  const priceEvidence = addEvidence({
    evidenceId: `evidence_${input.offerId}_price`,
    entityType: "offer",
    entityId: input.offerId,
    field: "listing_price",
    value: money(input.price),
    sourceId: input.sourceId,
    verificationStatus,
    freshnessStatus,
    evidenceType: input.additional ? "secondary_source" : "primary_source",
    evidenceText: `Synthetic offer price: ${input.price} RUB.`,
  });
  const availabilityEvidence = addEvidence({
    evidenceId: `evidence_${input.offerId}_availability`,
    entityType: "offer",
    entityId: input.offerId,
    field: "availability",
    value: availability,
    sourceId: input.sourceId,
    verificationStatus: removed
      ? "stale"
      : isTemplate
        ? "unknown"
        : verificationStatus,
    freshnessStatus,
    evidenceType: input.additional ? "secondary_source" : "primary_source",
    evidenceText: removed
      ? "Synthetic listing was removed; removal does not prove that the property was sold."
      : `Synthetic availability status: ${availability}.`,
  });
  fixtureOfferNotes[input.offerId] = {
    purpose: removed
      ? "Removed listing represented as unknown availability, never inferred as sold."
      : conflict
        ? "Offer participates in unresolved price conflict ground truth."
        : isTemplate
          ? "Template price_from Offer; not an exact concrete unit."
          : "Scenario-driven commercial Offer.",
    fixture_tags: [
      input.additional ? "duplicate_offer" : "primary_offer",
      ...(removed ? ["listing_removed", "not_confirmed_sold"] : []),
      ...(conflict ? ["price_conflict"] : []),
      ...(stale ? ["stale_critical_fields"] : []),
    ],
  };
  return offerSchema.parse({
    schema_version: schemaVersion,
    offer_id: input.offerId,
    property_id: input.property.identity.property_id,
    seller: {
      seller_type: input.sellerType,
      seller_id: null,
      name: input.sellerName,
    },
    source_reference: sourceReference(input.sourceId, [
      priceEvidence,
      availabilityEvidence,
    ]),
    listing_price: money(input.price),
    price_from: isTemplate,
    availability,
    published_at: stale
      ? "2026-04-01T00:00:00.000Z"
      : "2026-08-01T00:00:00.000Z",
    updated_at: stale ? "2026-05-01T00:00:00.000Z" : fixedNow,
    expires_at: removed ? "2026-06-01T00:00:00.000Z" : null,
    mandatory_extras:
      input.offerId === "offer_nb_007_primary"
        ? [
            {
              name: "Mandatory storage room",
              cost: money(250_000),
              verification_status: "confirmed",
            },
          ]
        : [],
    commercial_terms: {
      reservation_terms:
        availability === "reserved"
          ? "Synthetic reservation through 2026-08-20."
          : null,
      payment_terms: null,
      notes: [
        ...(removed
          ? ["listing_removed", "removal_is_not_sale_confirmation"]
          : []),
        ...(input.offerId === "offer_nb_005_primary"
          ? ["old_price_preserved_in_promotion_evidence"]
          : []),
      ],
    },
    financing_offer_ids: offerFinancingMap[input.offerId] ?? [],
    promotion_ids: offerPromotionMap[input.offerId] ?? [],
    verification_status: verificationStatus,
    freshness_status: freshnessStatus,
    evidence_refs: [priceEvidence, availabilityEvidence],
  });
};

const offers: Offer[] = properties.map((property, index) => {
  const suffix = property.identity.property_id.replace("prop_", "");
  const offerId = `offer_${suffix}_primary`;
  const category =
    fixturePropertyNotes[property.identity.property_id].fixture_tags[0];
  const sourceId =
    category === "new_build" || category === "special"
      ? "src_dev_alpha"
      : category === "secondary"
        ? "src_market_beta"
        : category === "land"
          ? "src_user_fixture"
          : "src_agency_eta";
  const sellerType: Offer["seller"]["seller_type"] =
    category === "new_build" || category === "special"
      ? "developer"
      : category === "secondary"
        ? "owner"
        : "agency";
  return makeOffer({
    offerId,
    property,
    price: priceForProperty(property, index),
    sourceId,
    sellerType,
    sellerName:
      sellerType === "developer"
        ? "Developer Alpha"
        : sellerType === "owner"
          ? "Synthetic Owner"
          : "Agency Eta",
  });
});

const extraOfferSpecs = [
  ["prop_nb_001", "offer_nb_001_agency", "src_agency_eta", 5_180_000],
  ["prop_nb_002", "offer_nb_002_agency", "src_agency_eta", 4_980_000],
  ["prop_nb_003", "offer_nb_003_agency", "src_agency_eta", 4_920_000],
  ["prop_sec_001", "offer_sec_001_agency", "src_agency_eta", 4_690_000],
  ["prop_sec_002", "offer_sec_002_classified", "src_market_beta", 4_640_000],
  [
    "prop_house_001",
    "offer_house_001_classified",
    "src_market_beta",
    6_520_000,
  ],
  [
    "prop_house_002",
    "offer_house_002_classified",
    "src_market_beta",
    7_010_000,
  ],
  ["prop_th_001", "offer_th_001_classified", "src_market_beta", 7_480_000],
  ["prop_nb_005", "offer_nb_005_project", "src_project_delta", 5_460_000],
  ["prop_sec_004", "offer_sec_004_agency", "src_agency_eta", 5_120_000],
] as const;
for (const [propertyId, offerId, sourceId, price] of extraOfferSpecs) {
  const property = properties.find(
    (item) => item.identity.property_id === propertyId,
  );
  if (!property) throw new Error(`Missing Property ${propertyId}`);
  offers.push(
    makeOffer({
      offerId,
      property,
      price,
      sourceId,
      sellerType: sourceId === "src_agency_eta" ? "agency" : "other",
      sellerName:
        sourceId === "src_agency_eta" ? "Agency Eta" : "Marketplace Beta",
      additional: true,
    }),
  );
}

const programSource = sourceReference("src_government_test");
const financingPrograms: FinancingProgram[] = [
  {
    program_id: "finprog_family_a",
    program_type: "family_mortgage",
    provider: {
      provider_id: null,
      provider_type: "government",
      name: "Test Family Program A",
    },
    source: "src_government_test",
  },
  {
    program_id: "finprog_standard_b",
    program_type: "mortgage",
    provider: {
      provider_id: null,
      provider_type: "bank",
      name: "Test Standard Mortgage B",
    },
    source: "src_bank_gamma",
  },
  {
    program_id: "finprog_installment_c",
    program_type: "installment",
    provider: {
      provider_id: null,
      provider_type: "developer",
      name: "Test Installment C",
    },
    source: "src_dev_alpha",
  },
].map((item) =>
  financingProgramSchema.parse({
    schema_version: schemaVersion,
    program_id: item.program_id,
    program_type: item.program_type,
    provider: item.provider,
    rule_version: "synthetic-rules-v1",
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_until: "2027-12-31T23:59:59.000Z",
    borrower_rules: [],
    property_rules: [
      {
        rule_id: `rule_${item.program_id}_property_type`,
        field: "property_type",
        operator: "in",
        value:
          item.program_type === "installment"
            ? ["apartment"]
            : ["apartment", "house", "townhouse"],
        description:
          "Synthetic test-only rule; not a current real-world mortgage rule.",
      },
    ],
    financial_rules: [],
    source_references: [
      item.source === "src_government_test"
        ? programSource
        : sourceReference(item.source),
    ],
    verification_status: "confirmed",
    freshness_status: "fresh",
  }),
);

const financingOfferDefinitions = [
  {
    id: "finoffer_family_zero_confirmed",
    program: "finprog_family_a",
    zero: "available",
    verification: "confirmed",
    rate: "6.50",
    periods: [],
    after: null,
    impact: {
      kind: "increase",
      amount: money(300_000),
      percent: null,
      description: "Price increases for this zero-down scenario.",
    },
  },
  {
    id: "finoffer_family_zero_claimed",
    program: "finprog_family_a",
    zero: "claimed",
    verification: "claimed",
    rate: null,
    periods: [],
    after: null,
    impact: {
      kind: "unknown",
      amount: null,
      percent: null,
      description: "Applicability and price impact require confirmation.",
    },
  },
  {
    id: "finoffer_standard_no_zero",
    program: "finprog_standard_b",
    zero: "not_available",
    verification: "confirmed",
    rate: "13.20",
    periods: [],
    after: null,
    impact: { kind: "none", amount: null, percent: null, description: null },
  },
  {
    id: "finoffer_staged_rate",
    program: "finprog_family_a",
    zero: "not_available",
    verification: "confirmed",
    rate: null,
    periods: [
      {
        from_month: 1,
        to_month: 12,
        rate_percent: "0.10",
        conditions: ["Synthetic introductory period only."],
      },
      {
        from_month: 13,
        to_month: null,
        rate_percent: "12.00",
        conditions: ["Synthetic post-introductory rate."],
      },
    ],
    after: "12.00",
    impact: {
      kind: "increase",
      amount: money(180_000),
      percent: null,
      description: "Subsidy cost is included in this Offer only.",
    },
  },
  {
    id: "finoffer_installment_balloon",
    program: "finprog_installment_c",
    zero: "not_available",
    verification: "confirmed",
    rate: "0.00",
    periods: [],
    after: null,
    impact: {
      kind: "none",
      amount: null,
      percent: null,
      description: "Limited-duration installment with final balloon payment.",
    },
  },
] as const;
const financingOffers: FinancingOffer[] = financingOfferDefinitions.map(
  (definition) => {
    const evidenceId = addEvidence({
      evidenceId: `evidence_${definition.id}_terms`,
      entityType: "financing_offer",
      entityId: definition.id,
      field: "financing_terms",
      value: {
        zero_initial_payment: definition.zero,
        rate: definition.rate,
        periods: definition.periods,
      },
      sourceId:
        definition.program === "finprog_standard_b"
          ? "src_bank_gamma"
          : "src_dev_alpha",
      verificationStatus: definition.verification,
      evidenceText: `Synthetic terms for ${definition.id}; not a real current financial product.`,
    });
    return financingOfferSchema.parse({
      schema_version: schemaVersion,
      financing_offer_id: definition.id,
      program_id: definition.program,
      provider: {
        provider_id: null,
        provider_type:
          definition.program === "finprog_standard_b" ? "bank" : "developer",
        name:
          definition.program === "finprog_standard_b"
            ? "Bank Gamma"
            : "Developer Alpha",
      },
      rate_structure: {
        advertised_rate_percent: definition.rate,
        nominal_rate_percent:
          definition.periods.length === 0 ? definition.rate : null,
        rate_from: false,
        periods: definition.periods,
        after_introductory_period_rate_percent: definition.after,
        conditions: ["Synthetic test-only financing conditions."],
      },
      initial_payment: {
        amount:
          definition.zero === "available" || definition.zero === "claimed"
            ? money(0)
            : money(1_000_000),
        percent:
          definition.zero === "available" || definition.zero === "claimed"
            ? "0"
            : "20.00",
        zero_payment_status: definition.zero,
      },
      loan_amount: { minimum: money(500_000), maximum: money(12_000_000) },
      term: {
        minimum_months:
          definition.program === "finprog_installment_c" ? 12 : 60,
        maximum_months:
          definition.program === "finprog_installment_c" ? 24 : 360,
      },
      mandatory_services: [],
      price_impact: definition.impact,
      validity: { from: "2026-01-01", to: "2027-12-31" },
      source_reference: sourceReference(
        definition.program === "finprog_standard_b"
          ? "src_bank_gamma"
          : "src_dev_alpha",
        [evidenceId],
      ),
      verification_status: definition.verification,
      freshness_status: "fresh",
      evidence_refs: [evidenceId],
    });
  },
);

const oldPriceEvidence = addEvidence({
  evidenceId: "evidence_offer_nb_005_old_price",
  entityType: "offer",
  entityId: "offer_nb_005_primary",
  field: "listing_price.old_price",
  value: money(5_450_000),
  sourceId: "src_dev_alpha",
  evidenceText:
    "Synthetic previous price retained separately from the current discounted price.",
});

const promotions: Promotion[] = [
  promotionSchema.parse({
    schema_version: schemaVersion,
    promotion_id: "promo_zero_down_price_increase",
    title: "Synthetic zero-down with price increase",
    provider: {
      provider_id: null,
      provider_type: "developer",
      name: "Developer Alpha",
    },
    valid_from: "2026-08-01T00:00:00.000Z",
    valid_until: "2026-12-31T23:59:59.000Z",
    eligible_property_refs: ["prop_nb_001"],
    eligible_offer_refs: ["offer_nb_001_agency"],
    price_impact: {
      kind: "increase",
      amount: money(300_000),
      percent: null,
      description: "Only compatible with the higher-price agency Offer.",
    },
    financing_impact: {
      financing_offer_ids: ["finoffer_family_zero_confirmed"],
      description: "Confirmed for this synthetic Offer only.",
    },
    conditions: [
      "Do not combine with the lower price from offer_nb_001_primary.",
    ],
    source_reference: sourceReference("src_dev_alpha"),
    verification_status: "confirmed",
    freshness_status: "fresh",
    evidence_refs: [],
  }),
  promotionSchema.parse({
    schema_version: schemaVersion,
    promotion_id: "promo_zero_down_claimed",
    title: "Synthetic claimed zero-down banner",
    provider: {
      provider_id: null,
      provider_type: "developer",
      name: "Developer Alpha",
    },
    valid_from: "2026-08-01T00:00:00.000Z",
    valid_until: "2026-10-31T23:59:59.000Z",
    eligible_property_refs: ["prop_nb_002"],
    eligible_offer_refs: ["offer_nb_002_primary"],
    price_impact: {
      kind: "unknown",
      amount: null,
      percent: null,
      description: "Property applicability is unknown.",
    },
    financing_impact: {
      financing_offer_ids: ["finoffer_family_zero_claimed"],
      description: "Claimed, not confirmed for the unit.",
    },
    conditions: ["Requires property-specific confirmation."],
    source_reference: sourceReference("src_dev_alpha"),
    verification_status: "claimed",
    freshness_status: "fresh",
    evidence_refs: [],
  }),
  promotionSchema.parse({
    schema_version: schemaVersion,
    promotion_id: "promo_discount_active",
    title: "Synthetic discount from preserved old price",
    provider: {
      provider_id: null,
      provider_type: "developer",
      name: "Developer Alpha",
    },
    valid_from: "2026-08-01T00:00:00.000Z",
    valid_until: "2026-09-30T23:59:59.000Z",
    eligible_property_refs: ["prop_nb_005"],
    eligible_offer_refs: ["offer_nb_005_primary"],
    price_impact: {
      kind: "decrease",
      amount: money(200_000),
      percent: null,
      description:
        "Old price is retained in evidence; current discount is explicit.",
    },
    financing_impact: { financing_offer_ids: [], description: null },
    conditions: ["Synthetic fixed-date promotion."],
    source_reference: sourceReference("src_dev_alpha", [oldPriceEvidence]),
    verification_status: "confirmed",
    freshness_status: "fresh",
    evidence_refs: [oldPriceEvidence],
  }),
  promotionSchema.parse({
    schema_version: schemaVersion,
    promotion_id: "promo_expired_not_active",
    title: "Expired synthetic promotion",
    provider: {
      provider_id: null,
      provider_type: "developer",
      name: "Developer Alpha",
    },
    valid_from: "2025-01-01T00:00:00.000Z",
    valid_until: "2025-12-31T23:59:59.000Z",
    eligible_property_refs: [],
    eligible_offer_refs: [],
    price_impact: {
      kind: "decrease",
      amount: money(100_000),
      percent: null,
      description: "Expired and unused.",
    },
    financing_impact: { financing_offer_ids: [], description: null },
    conditions: ["Must never be used by an active PurchaseScenario."],
    source_reference: sourceReference("src_dev_alpha"),
    verification_status: "stale",
    freshness_status: "expired",
    evidence_refs: [],
  }),
];

const eligibilityDefinitions = [
  [
    "elig_nb_001_standard",
    "prop_nb_001",
    "offer_nb_001_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    "confirmed",
    "not_available",
    "confirmed",
  ],
  [
    "elig_nb_001_family",
    "prop_nb_001",
    "offer_nb_001_agency",
    "finprog_family_a",
    "finoffer_family_zero_confirmed",
    "confirmed",
    "available",
    "confirmed",
  ],
  [
    "elig_nb_002_family",
    "prop_nb_002",
    "offer_nb_002_primary",
    "finprog_family_a",
    "finoffer_family_zero_claimed",
    "claimed",
    "claimed",
    "claimed",
  ],
  [
    "elig_nb_003_staged",
    "prop_nb_003",
    "offer_nb_003_primary",
    "finprog_family_a",
    "finoffer_staged_rate",
    "confirmed",
    "not_available",
    "confirmed",
  ],
  [
    "elig_nb_004_unknown",
    "prop_nb_004",
    "offer_nb_004_primary",
    "finprog_family_a",
    "finoffer_family_zero_claimed",
    "unknown",
    "unknown",
    "unknown",
  ],
  [
    "elig_nb_005_family",
    "prop_nb_005",
    "offer_nb_005_primary",
    "finprog_family_a",
    "finoffer_family_zero_confirmed",
    "confirmed",
    "available",
    "confirmed",
  ],
  [
    "elig_nb_006_not",
    "prop_nb_006",
    "offer_nb_006_primary",
    "finprog_family_a",
    null,
    "not_eligible",
    "not_available",
    "confirmed",
  ],
  [
    "elig_nb_007_standard",
    "prop_nb_007",
    "offer_nb_007_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    "likely",
    "not_available",
    "unconfirmed",
  ],
  [
    "elig_nb_008_installment",
    "prop_nb_008",
    "offer_nb_008_primary",
    "finprog_installment_c",
    "finoffer_installment_balloon",
    "confirmed",
    "not_available",
    "confirmed",
  ],
  [
    "elig_sec_001_standard",
    "prop_sec_001",
    "offer_sec_001_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    "confirmed",
    "not_available",
    "confirmed",
  ],
  [
    "elig_sec_002_standard",
    "prop_sec_002",
    "offer_sec_002_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    "needs_confirmation",
    "not_available",
    "unconfirmed",
  ],
  [
    "elig_house_001_standard",
    "prop_house_001",
    "offer_house_001_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    "likely",
    "not_available",
    "unconfirmed",
  ],
] as const;
const eligibility: PropertyFinancingEligibility[] = eligibilityDefinitions.map(
  ([
    id,
    propertyId,
    offerId,
    programId,
    financingOfferId,
    status,
    zeroStatus,
    verification,
  ]) => {
    const evidenceId = addEvidence({
      evidenceId: `evidence_${id}_applicability`,
      entityType: "financing_eligibility",
      entityId: id,
      field: "eligibility_status",
      value: status,
      sourceId:
        status === "confirmed" || status === "not_eligible"
          ? "src_bank_gamma"
          : "src_dev_alpha",
      verificationStatus: verification,
      freshnessStatus: status === "unknown" ? "unknown" : "fresh",
      evidenceText: `Synthetic property eligibility status: ${status}.`,
    });
    return propertyFinancingEligibilitySchema.parse({
      schema_version: schemaVersion,
      eligibility_id: id,
      property_id: propertyId,
      offer_id: offerId,
      program_id: programId,
      financing_offer_id: financingOfferId,
      eligibility_status: status,
      initial_payment: {
        amount:
          zeroStatus === "available" || zeroStatus === "claimed"
            ? money(0)
            : zeroStatus === "unknown"
              ? null
              : money(1_000_000),
        percent:
          zeroStatus === "available" || zeroStatus === "claimed"
            ? "0"
            : zeroStatus === "unknown"
              ? null
              : "20.00",
        zero_payment_status: zeroStatus,
      },
      rate_structure: null,
      monthly_payment: null,
      applicability_evidence_refs: [evidenceId],
      checked_at: status === "unknown" ? null : fixedNow,
      source_reference: sourceReference(
        status === "confirmed" || status === "not_eligible"
          ? "src_bank_gamma"
          : "src_dev_alpha",
        [evidenceId],
      ),
      verification_status: verification,
      freshness_status: status === "unknown" ? "unknown" : "fresh",
    });
  },
);

const initialPaymentConflictEvidenceA = addEvidence({
  evidenceId: "evidence_elig_nb_002_initial_payment_a",
  entityType: "financing_eligibility",
  entityId: "elig_nb_002_family",
  field: "initial_payment",
  value: money(0),
  sourceId: "src_dev_alpha",
  verificationStatus: "conflicting",
  evidenceText: "Developer fixture claims zero initial payment.",
});
const initialPaymentConflictEvidenceB = addEvidence({
  evidenceId: "evidence_elig_nb_002_initial_payment_b",
  entityType: "financing_eligibility",
  entityId: "elig_nb_002_family",
  field: "initial_payment",
  value: money(950_000),
  sourceId: "src_bank_gamma",
  verificationStatus: "conflicting",
  evidenceText: "Bank fixture requires a non-zero initial payment.",
});

const eligibilityEvidence = (eligibilityId: string) =>
  `evidence_${eligibilityId}_applicability`;
const purchaseScenarios: PurchaseScenario[] = [
  [
    "scenario_nb_001_cash",
    "prop_nb_001",
    "offer_nb_001_primary",
    null,
    null,
    null,
    4_350_000,
    null,
    null,
    null,
    "confirmed",
    [],
  ],
  [
    "scenario_nb_001_zero",
    "prop_nb_001",
    "offer_nb_001_agency",
    "finprog_family_a",
    "finoffer_family_zero_confirmed",
    "promo_zero_down_price_increase",
    0,
    0,
    5_180_000,
    48_000,
    "confirmed",
    [eligibilityEvidence("elig_nb_001_family")],
  ],
  [
    "scenario_nb_002_claimed",
    "prop_nb_002",
    "offer_nb_002_primary",
    "finprog_family_a",
    "finoffer_family_zero_claimed",
    "promo_zero_down_claimed",
    0,
    0,
    4_525_000,
    null,
    "claimed",
    [eligibilityEvidence("elig_nb_002_family")],
  ],
  [
    "scenario_nb_003_staged",
    "prop_nb_003",
    "offer_nb_003_primary",
    "finprog_family_a",
    "finoffer_staged_rate",
    null,
    950_000,
    950_000,
    3_750_000,
    42_000,
    "confirmed",
    [eligibilityEvidence("elig_nb_003_staged")],
  ],
  [
    "scenario_nb_004_unknown",
    "prop_nb_004",
    "offer_nb_004_primary",
    "finprog_family_a",
    "finoffer_family_zero_claimed",
    null,
    null,
    null,
    null,
    null,
    "unknown",
    [eligibilityEvidence("elig_nb_004_unknown")],
  ],
  [
    "scenario_nb_005_family",
    "prop_nb_005",
    "offer_nb_005_primary",
    "finprog_family_a",
    "finoffer_family_zero_confirmed",
    "promo_discount_active",
    0,
    0,
    5_050_000,
    49_000,
    "confirmed",
    [eligibilityEvidence("elig_nb_005_family")],
  ],
  [
    "scenario_nb_007_standard",
    "prop_nb_007",
    "offer_nb_007_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    null,
    1_100_000,
    1_100_000,
    4_300_000,
    62_000,
    "unconfirmed",
    [eligibilityEvidence("elig_nb_007_standard")],
  ],
  [
    "scenario_nb_008_installment",
    "prop_nb_008",
    "offer_nb_008_primary",
    "finprog_installment_c",
    "finoffer_installment_balloon",
    null,
    900_000,
    900_000,
    null,
    75_000,
    "confirmed",
    [eligibilityEvidence("elig_nb_008_installment")],
  ],
  [
    "scenario_sec_001_cash",
    "prop_sec_001",
    "offer_sec_001_primary",
    null,
    null,
    null,
    4_290_000,
    null,
    null,
    null,
    "confirmed",
    [],
  ],
  [
    "scenario_sec_001_mortgage",
    "prop_sec_001",
    "offer_sec_001_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    null,
    900_000,
    900_000,
    3_390_000,
    51_000,
    "confirmed",
    [eligibilityEvidence("elig_sec_001_standard")],
  ],
  [
    "scenario_sec_002_mortgage",
    "prop_sec_002",
    "offer_sec_002_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    null,
    950_000,
    950_000,
    3_530_000,
    53_000,
    "unconfirmed",
    [eligibilityEvidence("elig_sec_002_standard")],
  ],
  [
    "scenario_house_001_cash",
    "prop_house_001",
    "offer_house_001_primary",
    null,
    null,
    null,
    6_180_000,
    null,
    null,
    null,
    "confirmed",
    [],
  ],
  [
    "scenario_house_001_mortgage",
    "prop_house_001",
    "offer_house_001_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    null,
    1_300_000,
    1_300_000,
    4_880_000,
    71_000,
    "unconfirmed",
    [eligibilityEvidence("elig_house_001_standard")],
  ],
  [
    "scenario_nb_001_standard",
    "prop_nb_001",
    "offer_nb_001_primary",
    "finprog_standard_b",
    "finoffer_standard_no_zero",
    null,
    900_000,
    900_000,
    3_450_000,
    55_000,
    "confirmed",
    [eligibilityEvidence("elig_nb_001_standard")],
  ],
].map(
  ([
    id,
    propertyId,
    offerId,
    programId,
    financingOfferId,
    promotionId,
    entryCash,
    initialPayment,
    loanAmount,
    monthlyPayment,
    status,
    compatibilityEvidence,
  ]) =>
    purchaseScenarioSchema.parse({
      schema_version: schemaVersion,
      scenario_id: id,
      property_id: propertyId,
      offer_id: offerId,
      financing_program_id: programId,
      financing_offer_id: financingOfferId,
      promotion_id: promotionId,
      entry_cash: entryCash === null ? null : money(entryCash as number),
      initial_payment:
        initialPayment === null ? null : money(initialPayment as number),
      loan_amount: loanAmount === null ? null : money(loanAmount as number),
      monthly_payment:
        monthlyPayment === null ? null : money(monthlyPayment as number),
      total_payment: null,
      mandatory_costs:
        id === "scenario_nb_008_installment"
          ? [
              {
                name: "Final balloon payment",
                amount: money(3_050_000),
                evidence_refs: ["evidence_finoffer_installment_balloon_terms"],
              },
            ]
          : [],
      estimated_total_entry_cost:
        entryCash === null ? null : money(entryCash as number),
      assumptions: [],
      terms_compatibility_status: status,
      compatibility_evidence_refs: compatibilityEvidence,
      verification_status: status,
      freshness_status: status === "unknown" ? "unknown" : "fresh",
      calculated_at: fixedNow,
    }),
);

const sourceConflicts: SourceConflict[] = [];
for (const propertyId of priceConflictProperties) {
  const conflictingOffers = offers.filter(
    (offer) => offer.property_id === propertyId,
  );
  sourceConflicts.push(
    sourceConflictSchema.parse({
      schema_version: schemaVersion,
      conflict_id: `conflict_${propertyId}_price`,
      entity_id: propertyId,
      field: "listing_price",
      evidence_ids: conflictingOffers.map(
        (offer) => `evidence_${offer.offer_id}_price`,
      ),
      severity: "significant",
      status: "open",
      resolved_value: null,
      resolution_reason: null,
      resolved_by: null,
      resolved_at: null,
    }),
  );
}

const addPropertyConflict = (
  conflictId: string,
  propertyId: string,
  field: string,
  leftValue: unknown,
  rightValue: unknown,
) => {
  const left = addEvidence({
    evidenceId: `evidence_${conflictId}_a`,
    entityType: "property",
    entityId: propertyId,
    field,
    value: leftValue,
    sourceId: "src_dev_alpha",
    verificationStatus: "conflicting",
    evidenceText: `Synthetic conflicting value A for ${field}.`,
  });
  const right = addEvidence({
    evidenceId: `evidence_${conflictId}_b`,
    entityType: "property",
    entityId: propertyId,
    field,
    value: rightValue,
    sourceId: "src_agency_eta",
    verificationStatus: "conflicting",
    evidenceType: "secondary_source",
    evidenceText: `Synthetic conflicting value B for ${field}.`,
  });
  sourceConflicts.push(
    sourceConflictSchema.parse({
      schema_version: schemaVersion,
      conflict_id: conflictId,
      entity_id: propertyId,
      field,
      evidence_ids: [left, right],
      severity: "significant",
      status: "open",
      resolved_value: null,
      resolution_reason: null,
      resolved_by: null,
      resolved_at: null,
    }),
  );
};
addPropertyConflict(
  "conflict_prop_nb_003_area",
  "prop_nb_003",
  "physical.total_area_m2",
  44.2,
  44.6,
);
addPropertyConflict(
  "conflict_prop_nb_007_handover",
  "prop_nb_007",
  "timeline.handover_date",
  "2027-12-15",
  "2028-03-31",
);
addPropertyConflict(
  "conflict_prop_sec_004_floor",
  "prop_sec_004",
  "physical.floor",
  9,
  8,
);
sourceConflicts.push(
  sourceConflictSchema.parse({
    schema_version: schemaVersion,
    conflict_id: "conflict_elig_nb_002_initial_payment",
    entity_id: "elig_nb_002_family",
    field: "initial_payment",
    evidence_ids: [
      initialPaymentConflictEvidenceA,
      initialPaymentConflictEvidenceB,
    ],
    severity: "critical",
    status: "open",
    resolved_value: null,
    resolution_reason: null,
    resolved_by: null,
    resolved_at: null,
  }),
);

const duplicateClusters: DuplicateCluster[] = [
  [
    "cluster_nb_001",
    "prop_nb_001",
    ["offer_nb_001_primary", "offer_nb_001_agency"],
    ["canonical unit", "unit number"],
  ],
  [
    "cluster_nb_002",
    "prop_nb_002",
    ["offer_nb_002_primary", "offer_nb_002_agency"],
    ["canonical unit", "unit number"],
  ],
  [
    "cluster_nb_003",
    "prop_nb_003",
    ["offer_nb_003_primary", "offer_nb_003_agency"],
    ["canonical unit", "unit number"],
  ],
  [
    "cluster_sec_001",
    "prop_sec_001",
    ["offer_sec_001_primary", "offer_sec_001_agency"],
    ["address", "floor", "area"],
  ],
  [
    "cluster_sec_002",
    "prop_sec_002",
    ["offer_sec_002_primary", "offer_sec_002_classified"],
    ["address", "floor", "area"],
  ],
  [
    "cluster_house_001",
    "prop_house_001",
    ["offer_house_001_primary", "offer_house_001_classified"],
    ["address", "geo point"],
  ],
  [
    "cluster_house_002",
    "prop_house_002",
    ["offer_house_002_primary", "offer_house_002_classified"],
    ["address", "geo point"],
  ],
  [
    "cluster_th_001",
    "prop_th_001",
    ["offer_th_001_primary", "offer_th_001_classified"],
    ["address", "geo point"],
  ],
].map(([clusterId, propertyId, offerIds, identifiers]) =>
  duplicateClusterSchema.parse({
    cluster_id: clusterId,
    property_id: propertyId,
    offer_ids: offerIds,
    expected_relation: "same_property",
    strong_identifiers: identifiers,
  }),
);

const falseDuplicatePairs: FalseDuplicatePair[] = [
  falseDuplicatePairSchema.parse({
    pair_id: "false_pair_nb_layout_001",
    property_ids: ["prop_nb_003", "prop_nb_004"],
    offer_ids: ["offer_nb_003_primary", "offer_nb_004_primary"],
    expected_relation: "different_property",
    similarity_trap:
      "Same development, layout and area; different unit numbers and floors.",
  }),
  falseDuplicatePairSchema.parse({
    pair_id: "false_pair_nb_layout_002",
    property_ids: ["prop_nb_005", "prop_nb_006"],
    offer_ids: ["offer_nb_005_primary", "offer_nb_006_primary"],
    expected_relation: "different_property",
    similarity_trap: "Same development and area; distinct physical units.",
  }),
  falseDuplicatePairSchema.parse({
    pair_id: "false_pair_secondary_001",
    property_ids: ["prop_sec_003", "prop_sec_004"],
    offer_ids: ["offer_sec_003_primary", "offer_sec_004_primary"],
    expected_relation: "different_property",
    similarity_trap:
      "Similar area and room count at one synthetic street; different floor and house.",
  }),
];

const comparisonGroups: ComparisonGroup[] = [
  comparisonGroupSchema.parse({
    group_id: "comparison_new_vs_secondary",
    property_ids: ["prop_nb_005", "prop_sec_001"],
    tradeoff_dimensions: [
      "move-in timeline",
      "finishing",
      "financing confidence",
    ],
    known_differences: [
      "The secondary unit is ready sooner; the new build has confirmed synthetic family financing.",
    ],
    unknowns: ["Future renovation cost for the new-build unit."],
    winner: null,
  }),
  comparisonGroupSchema.parse({
    group_id: "comparison_apartment_vs_house",
    property_ids: ["prop_sec_002", "prop_house_001"],
    tradeoff_dimensions: ["area", "land", "commute", "maintenance"],
    known_differences: [
      "The house has more area and land; the apartment has shorter normalized travel time.",
    ],
    unknowns: ["Long-term house maintenance cost."],
    winner: null,
  }),
  comparisonGroupSchema.parse({
    group_id: "comparison_cheap_uncertain",
    property_ids: ["prop_special_template_001", "prop_nb_001"],
    tradeoff_dimensions: [
      "price certainty",
      "availability",
      "unit specificity",
    ],
    known_differences: [
      "The template has a lower price_from but is not a concrete unit.",
    ],
    unknowns: ["Exact template price", "Exact template availability"],
    winner: null,
  }),
];

const confidenceCases: ConfidenceCase[] = [
  confidenceCaseSchema.parse({
    case_id: "confidence_high_high",
    profile: "high_match_potential_high_confidence",
    property_id: "prop_nb_001",
    offer_ids: ["offer_nb_001_primary"],
    evidence_ids: [
      "evidence_offer_nb_001_primary_price",
      "evidence_offer_nb_001_primary_availability",
    ],
    rationale: "Critical commercial fields are fresh and directly evidenced.",
  }),
  confidenceCaseSchema.parse({
    case_id: "confidence_high_low",
    profile: "high_match_potential_low_confidence",
    property_id: "prop_nb_004",
    offer_ids: ["offer_nb_004_primary"],
    evidence_ids: [eligibilityEvidence("elig_nb_004_unknown")],
    rationale:
      "Physical fit can be high while required financing applicability remains unknown.",
  }),
  confidenceCaseSchema.parse({
    case_id: "confidence_medium_high",
    profile: "medium_match_potential_high_confidence",
    property_id: "prop_sec_003",
    offer_ids: ["offer_sec_003_primary"],
    evidence_ids: ["evidence_offer_sec_003_primary_price"],
    rationale: "Fresh data with a confirmed first-floor tradeoff.",
  }),
  confidenceCaseSchema.parse({
    case_id: "confidence_hard_unknown",
    profile: "hard_critical_field_unknown",
    property_id: "prop_house_003",
    offer_ids: ["offer_house_003_primary"],
    evidence_ids: ["evidence_prop_house_003_timeline"],
    rationale: "Required gas and move-in facts are intentionally unknown.",
  }),
];

const financingCompatibility: FinancingCompatibility[] = [
  financingCompatibilitySchema.parse({
    case_id: "fincompat_no_frankenstein_nb_001",
    property_id: "prop_nb_001",
    allowed_scenario_ids: [
      "scenario_nb_001_cash",
      "scenario_nb_001_standard",
      "scenario_nb_001_zero",
    ],
    forbidden_combinations: [
      {
        price_offer_id: "offer_nb_001_primary",
        financing_offer_id: "finoffer_family_zero_confirmed",
        reason:
          "The lower primary Offer price cannot be combined with zero-down terms attached only to the higher agency Offer.",
      },
    ],
  }),
];

const criterion = (input: {
  id: string;
  category: "finance" | "property" | "timeline" | "infrastructure" | "house";
  field: string;
  operator: "lte" | "gte" | "neq" | "boolean" | "within_time" | "before";
  target: unknown;
  priority: "must" | "preferred" | "exclude";
  applicable: Property["property_type"][];
  critical?: boolean;
}) =>
  criterionSchema.parse({
    schema_version: schemaVersion,
    criterion_id: input.id,
    category: input.category,
    field: input.field,
    operator: input.operator,
    target: input.target,
    unit: null,
    priority: input.priority,
    weight: input.priority === "preferred" ? 4 : null,
    tolerance: null,
    fit_function:
      input.priority === "preferred" ? "linear_preference_v1" : null,
    criterion_group_id: null,
    applicable_property_types: input.applicable,
    source_requirement: ["primary"],
    freshness_requirement: "fresh",
    critical_if_unknown: input.critical ?? input.priority !== "preferred",
    user_expression: `Synthetic request criterion: ${input.field}.`,
  });

const baseRequest = (id: string): UserRequest =>
  userRequestSchema.parse({
    schema_version: schemaVersion,
    user_request_id: id,
    intent: "find",
    goal: {
      purpose: "own_residence",
      description: "Synthetic pilot benchmark request.",
    },
    location: {
      country_codes: ["RU"],
      regions: ["Тестовая область"],
      cities: ["Пилотск"],
      preferred_districts: [],
      excluded_districts: [],
      destination_addresses: [],
    },
    property: {
      allowed_property_types: ["apartment"],
      allowed_market_types: ["new_build", "secondary"],
      rooms_min: null,
      rooms_max: null,
    },
    budget: {
      purchase_price: { minimum: null, maximum: null },
      total_budget: null,
      renovation_budget: null,
    },
    financing: {
      purchase_methods: ["cash", "mortgage"],
      required_program_types: [],
      initial_payment_max: null,
      monthly_payment_max: null,
      financing_period: { from: null, to: null },
    },
    timeline: { purchase_by: null, move_in_by: null, ready_now_required: null },
    household: {
      adults_count: 2,
      children_count: null,
      pets_count: null,
      notes: null,
    },
    lifestyle: { commute_modes: ["public_transport"], notes: [] },
    infrastructure: [],
    property_features: [],
    must_have: [],
    nice_to_have: [],
    avoid: [],
    unknowns: [],
    source_links: [],
    clarifications: [],
    confidence: { extraction_confidence: 1, status: "high" },
    result_limit: 7,
  });

const requestA = baseRequest("request_pilot_a");
requestA.budget.purchase_price.maximum = money(5_000_000);
requestA.financing.purchase_methods = ["mortgage"];
requestA.financing.required_program_types = ["family_mortgage"];
requestA.must_have.push(
  criterion({
    id: "criterion_a_budget",
    category: "finance",
    field: "listing_price",
    operator: "lte",
    target: money(5_000_000),
    priority: "must",
    applicable: ["apartment"],
  }),
  criterion({
    id: "criterion_a_family",
    category: "finance",
    field: "family_mortgage",
    operator: "boolean",
    target: true,
    priority: "must",
    applicable: ["apartment"],
  }),
  criterion({
    id: "criterion_a_first_floor",
    category: "property",
    field: "physical.floor",
    operator: "neq",
    target: 1,
    priority: "exclude",
    applicable: ["apartment"],
  }),
);
requestA.nice_to_have.push(
  criterion({
    id: "criterion_a_zero",
    category: "finance",
    field: "zero_initial_payment",
    operator: "boolean",
    target: true,
    priority: "preferred",
    applicable: ["apartment"],
    critical: false,
  }),
);

const requestB = baseRequest("request_pilot_b");
requestB.goal = {
  purpose: "relocation",
  description: "Relocation with a strict move-in horizon.",
};
requestB.financing.monthly_payment_max = money(80_000);
requestB.timeline.move_in_by = "2027-08-15";
requestB.must_have.push(
  criterion({
    id: "criterion_b_payment",
    category: "finance",
    field: "monthly_payment",
    operator: "lte",
    target: money(80_000),
    priority: "must",
    applicable: ["apartment", "house"],
  }),
  criterion({
    id: "criterion_b_movein",
    category: "timeline",
    field: "timeline.move_in_possible_date",
    operator: "before",
    target: "2027-08-15",
    priority: "must",
    applicable: ["apartment", "house"],
  }),
);
requestB.infrastructure.push(
  criterion({
    id: "criterion_b_school",
    category: "infrastructure",
    field: "infrastructure.school.walk_time_min",
    operator: "within_time",
    target: 15,
    priority: "preferred",
    applicable: ["apartment", "house"],
    critical: false,
  }),
);

const requestC = baseRequest("request_pilot_c");
requestC.property.allowed_property_types = ["apartment", "house"];
requestC.property.allowed_market_types = ["new_build", "secondary", "suburban"];
requestC.must_have.push(
  criterion({
    id: "criterion_c_area",
    category: "property",
    field: "physical.total_area_m2",
    operator: "gte",
    target: 70,
    priority: "must",
    applicable: ["apartment", "house"],
  }),
  criterion({
    id: "criterion_c_commute",
    category: "infrastructure",
    field: "mobility.user_destination.public_transport_time_min",
    operator: "within_time",
    target: 40,
    priority: "must",
    applicable: ["apartment", "house"],
  }),
);

const requestD = baseRequest("request_pilot_d");
requestD.property.allowed_market_types = ["secondary"];
requestD.timeline.ready_now_required = true;
requestD.must_have.push(
  criterion({
    id: "criterion_d_ready",
    category: "timeline",
    field: "condition.ready_for_living",
    operator: "boolean",
    target: true,
    priority: "must",
    applicable: ["apartment"],
  }),
);
requestD.nice_to_have.push(
  criterion({
    id: "criterion_d_renovation",
    category: "property",
    field: "condition.finishing_type",
    operator: "neq",
    target: "needs_renovation",
    priority: "preferred",
    applicable: ["apartment"],
    critical: false,
  }),
);

const requestE = baseRequest("request_pilot_e");
requestE.property.allowed_property_types = ["house"];
requestE.property.allowed_market_types = ["suburban"];
requestE.must_have.push(
  criterion({
    id: "criterion_e_gas",
    category: "house",
    field: "utilities.gas",
    operator: "boolean",
    target: "connected",
    priority: "must",
    applicable: ["house"],
  }),
  criterion({
    id: "criterion_e_land",
    category: "house",
    field: "land.area_sotka",
    operator: "gte",
    target: 6,
    priority: "must",
    applicable: ["house"],
  }),
);
const userRequests = [requestA, requestB, requestC, requestD, requestE].map(
  (item) => userRequestSchema.parse(item),
);

const benchmarkManifest: BenchmarkManifest = benchmarkManifestSchema.parse({
  dataset_id: "pilot_dataset_v1",
  dataset_version: "1.0.0",
  cases: [
    {
      id: "case_budget_hard_fail",
      purpose: "Strict price budget hard fail.",
      property_ids: ["prop_nb_014"],
      offer_ids: ["offer_nb_014_primary"],
      relevant_user_request_ids: ["request_pilot_a"],
      expected_invariants: ["Offer price is over the strict budget."],
    },
    {
      id: "case_first_floor_hard_fail",
      purpose: "Excluded first floor hard fail.",
      property_ids: ["prop_sec_003"],
      offer_ids: ["offer_sec_003_primary"],
      relevant_user_request_ids: ["request_pilot_a"],
      expected_invariants: ["Property floor is exactly 1."],
    },
    {
      id: "case_movein_hard_fail",
      purpose: "Move-in after strict deadline.",
      property_ids: ["prop_nb_007"],
      offer_ids: ["offer_nb_007_primary"],
      relevant_user_request_ids: ["request_pilot_b"],
      expected_invariants: ["Move-in date is after the request deadline."],
    },
    {
      id: "case_utility_hard_fail",
      purpose: "Required gas is confirmed absent.",
      property_ids: ["prop_house_005"],
      offer_ids: ["offer_house_005_primary"],
      relevant_user_request_ids: ["request_pilot_e"],
      expected_invariants: ["Gas status is absent, not unknown."],
    },
    {
      id: "case_financing_hard_fail",
      purpose: "Required program is not eligible.",
      property_ids: ["prop_nb_006"],
      offer_ids: ["offer_nb_006_primary"],
      relevant_user_request_ids: ["request_pilot_a"],
      expected_invariants: ["Family program eligibility is not_eligible."],
    },
    {
      id: "case_family_unknown",
      purpose: "Critical family mortgage applicability unknown.",
      property_ids: ["prop_nb_004"],
      offer_ids: ["offer_nb_004_primary"],
      relevant_user_request_ids: ["request_pilot_a"],
      expected_invariants: [
        "Unknown must criterion must not pass or hard-fail without evidence.",
      ],
    },
    {
      id: "case_price_from_unknown",
      purpose: "Exact price unknown for template inventory.",
      property_ids: ["prop_special_template_001"],
      offer_ids: ["offer_special_template_001_primary"],
      relevant_user_request_ids: ["request_pilot_a"],
      expected_invariants: ["price_from is not an exact concrete-unit price."],
    },
    {
      id: "case_availability_unknown",
      purpose: "Availability is unknown.",
      property_ids: ["prop_nb_013"],
      offer_ids: ["offer_nb_013_primary"],
      relevant_user_request_ids: ["request_pilot_a"],
      expected_invariants: [
        "Unknown availability is not converted to available or sold.",
      ],
    },
    {
      id: "case_gas_unknown",
      purpose: "Required house gas status unknown.",
      property_ids: ["prop_house_003"],
      offer_ids: ["offer_house_003_primary"],
      relevant_user_request_ids: ["request_pilot_e"],
      expected_invariants: ["Unknown gas is a critical unknown, not false."],
    },
    {
      id: "case_not_applicable_land",
      purpose: "Apartment elevator criterion is not applicable to land.",
      property_ids: ["prop_land_001"],
      offer_ids: ["offer_land_001_primary"],
      relevant_user_request_ids: [],
      expected_invariants: [
        "Land has null building elevator and must support not_applicable evaluation later.",
      ],
    },
    {
      id: "case_frankenstein_guardrail",
      purpose:
        "Prevent mixing lower price and zero-down from different Offers.",
      property_ids: ["prop_nb_001"],
      offer_ids: ["offer_nb_001_primary", "offer_nb_001_agency"],
      relevant_user_request_ids: ["request_pilot_a"],
      expected_invariants: [
        "Every PurchaseScenario is anchored to one Offer.",
        "Lower primary price cannot use agency-only zero-down terms.",
      ],
    },
    {
      id: "case_removed_not_sold",
      purpose: "Removed listing must not imply sold.",
      property_ids: ["prop_sec_006"],
      offer_ids: ["offer_sec_006_primary"],
      relevant_user_request_ids: [],
      expected_invariants: [
        "Availability remains unknown and freshness is expired.",
      ],
    },
    {
      id: "case_area_conflict",
      purpose: "Physical area conflict remains unresolved.",
      property_ids: ["prop_nb_003"],
      offer_ids: ["offer_nb_003_primary"],
      relevant_user_request_ids: ["request_pilot_c"],
      expected_invariants: ["Both area evidence values remain available."],
    },
    {
      id: "case_handover_conflict",
      purpose: "Handover date conflict remains unresolved.",
      property_ids: ["prop_nb_007"],
      offer_ids: ["offer_nb_007_primary"],
      relevant_user_request_ids: ["request_pilot_b"],
      expected_invariants: ["Both handover dates remain available."],
    },
    {
      id: "case_initial_payment_conflict",
      purpose: "Initial payment conflict remains unresolved.",
      property_ids: ["prop_nb_002"],
      offer_ids: ["offer_nb_002_primary"],
      relevant_user_request_ids: ["request_pilot_a"],
      expected_invariants: [
        "Zero and non-zero initial payment evidence coexist.",
      ],
    },
  ],
});

const fixtureNotes: FixtureNotes = fixtureNotesSchema.parse({
  properties: fixturePropertyNotes,
  offers: fixtureOfferNotes,
});
const metadata: PilotDatasetMetadata = pilotDatasetMetadataSchema.parse({
  dataset_id: "pilot_dataset_v1",
  dataset_version: "1.0.0",
  dataset_type: "synthetic_pilot",
  created_at: fixedNow,
  schema_version: schemaVersion,
  geography: {
    country_code: "RU",
    region: "Тестовая область",
    cities: ["Пилотск"],
  },
  property_count: properties.length,
  offer_count: offers.length,
  notes: [
    "All people, places, providers, prices and financing rules are synthetic and test-only.",
    "The dataset is a scenario benchmark, not a representation of a current real-estate market.",
    "No live network collection or scraped commercial content is included.",
  ],
});

const validateGeneratedEntities = () => {
  z.array(propertySchema).parse(properties);
  z.array(offerSchema).parse(offers);
  z.array(financingProgramSchema).parse(financingPrograms);
  z.array(financingOfferSchema).parse(financingOffers);
  z.array(promotionSchema).parse(promotions);
  z.array(propertyFinancingEligibilitySchema).parse(eligibility);
  z.array(purchaseScenarioSchema).parse(purchaseScenarios);
  z.array(sourceSchema).parse(sources);
  z.array(fieldEvidenceSchema).parse(evidence);
  z.array(sourceConflictSchema).parse(sourceConflicts);
  z.array(duplicateClusterSchema).parse(duplicateClusters);
  z.array(falseDuplicatePairSchema).parse(falseDuplicatePairs);
  z.array(comparisonGroupSchema).parse(comparisonGroups);
  z.array(confidenceCaseSchema).parse(confidenceCases);
  z.array(financingCompatibilitySchema).parse(financingCompatibility);
  z.array(userRequestSchema).parse(userRequests);
};
validateGeneratedEntities();

const outputs = new Map<string, unknown>([
  ["metadata.json", metadata],
  ["properties.json", properties],
  ["offers.json", offers],
  ["financing-programs.json", financingPrograms],
  ["financing-offers.json", financingOffers],
  ["promotions.json", promotions],
  ["property-financing-eligibility.json", eligibility],
  ["purchase-scenarios.json", purchaseScenarios],
  ["sources.json", sources],
  ["field-evidence.json", evidence],
  ["source-conflicts.json", sourceConflicts],
  ["ground-truth/duplicate-clusters.json", duplicateClusters],
  ["ground-truth/false-duplicate-pairs.json", falseDuplicatePairs],
  ["ground-truth/comparison-groups.json", comparisonGroups],
  ["ground-truth/confidence-cases.json", confidenceCases],
  ["ground-truth/financing-compatibility.json", financingCompatibility],
  ["ground-truth/fixture-notes.json", fixtureNotes],
  ["benchmark-manifest.json", benchmarkManifest],
  ...userRequests.map(
    (request) =>
      [`user-requests/${request.user_request_id}.json`, request] as const,
  ),
]);

const staleFiles: string[] = [];
for (const [relativePath, payload] of outputs) {
  const outputPath = path.join(outputDirectory, relativePath);
  const formatted = await prettier.format(JSON.stringify(payload), {
    filepath: outputPath,
  });
  const contents = formatted.endsWith("\n") ? formatted : `${formatted}\n`;
  if (checkOnly) {
    const existing = await readFile(outputPath, "utf8").catch(() => null);
    if (existing !== contents) staleFiles.push(relativePath);
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, contents, "utf8");
  }
}

if (staleFiles.length > 0) {
  throw new Error(
    `Pilot fixtures are stale or missing: ${staleFiles.join(", ")}`,
  );
}

if (!checkOnly) {
  console.log(
    `Generated pilot dataset ${metadata.dataset_version}: ${properties.length} properties, ${offers.length} offers, ${evidence.length} evidence records.`,
  );
}
