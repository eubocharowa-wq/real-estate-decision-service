import type {
  FieldEvidence,
  Offer,
  Property,
  SourceConflict,
} from "../../domain";
import { sourceConflictSchema } from "../../domain";
import { VNESHSTROI_SOURCE_ID } from "./config";
import type {
  CanonicalState,
  DuplicateDecision,
  DuplicateHook,
  TransientNormalizedCandidate,
} from "./contracts";

export const SOURCE_ADAPTER_DUPLICATE_HOOK_VERSION =
  "source-adapter-duplicate-hook-v1";

const equalValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const evidenceFor = (
  evidence: readonly FieldEvidence[],
  refs: readonly string[],
  field: string,
): FieldEvidence | null =>
  evidence.find(
    (item) => refs.includes(item.evidence_id) && item.field === field,
  ) ?? null;

const conflict = ({
  entityId,
  field,
  oldEvidence,
  newEvidence,
  severity,
}: {
  readonly entityId: string;
  readonly field: string;
  readonly oldEvidence: FieldEvidence | null;
  readonly newEvidence: FieldEvidence | null;
  readonly severity: SourceConflict["severity"];
}): SourceConflict | null => {
  if (!oldEvidence || !newEvidence) return null;
  return sourceConflictSchema.parse({
    schema_version: "1.0",
    conflict_id: `conflict_${entityId}_${field.replaceAll(".", "_")}`,
    entity_id: entityId,
    field,
    evidence_ids: [oldEvidence.evidence_id, newEvidence.evidence_id],
    severity,
    status: "open",
    resolved_value: null,
    resolution_reason: null,
    resolved_by: null,
    resolved_at: null,
  });
};

const propertyComparisons: ReadonlyArray<{
  readonly field: string;
  readonly current: (property: Property) => unknown;
  readonly proposed: (property: Property) => unknown;
}> = [
  {
    field: "physical.rooms",
    current: (property) => property.physical.rooms,
    proposed: (property) => property.physical.rooms,
  },
  {
    field: "physical.floor",
    current: (property) => property.physical.floor,
    proposed: (property) => property.physical.floor,
  },
  {
    field: "physical.total_area_m2",
    current: (property) => property.physical.total_area_m2,
    proposed: (property) => property.physical.total_area_m2,
  },
  {
    field: "timeline.handover_date",
    current: (property) => property.timeline.handover_date,
    proposed: (property) => property.timeline.handover_date,
  },
];

const offerComparisons: ReadonlyArray<{
  readonly field: string;
  readonly current: (offer: Offer) => unknown;
  readonly proposed: (offer: Offer) => unknown;
  readonly severity: SourceConflict["severity"];
}> = [
  {
    field: "listing_price",
    current: (offer) => offer.listing_price,
    proposed: (offer) => offer.listing_price,
    severity: "critical",
  },
  {
    field: "availability",
    current: (offer) => offer.availability,
    proposed: (offer) => offer.availability,
    severity: "critical",
  },
];

export class DeterministicSourceDuplicateHook implements DuplicateHook {
  readonly version = SOURCE_ADAPTER_DUPLICATE_HOOK_VERSION;

  evaluate(
    candidate: TransientNormalizedCandidate,
    state: CanonicalState,
  ): {
    readonly decision: DuplicateDecision;
    readonly conflicts: readonly SourceConflict[];
  } {
    const identityKey = candidate.property.identity.source_unit_ids[0];
    const existingProperty = state.properties.find((property) =>
      property.identity.source_unit_ids.includes(identityKey),
    );
    if (!existingProperty)
      return {
        decision: {
          status: "new_property",
          propertyId: candidate.property.identity.property_id,
          offerId: candidate.offer.offer_id,
          identityKey,
          reasonCodes: ["NO_STRONG_IDENTITY_MATCH"],
          hookVersion: this.version,
        },
        conflicts: [],
      };

    const existingOffer = state.offers.find(
      (offer) =>
        offer.property_id === existingProperty.identity.property_id &&
        offer.source_reference.source_id === VNESHSTROI_SOURCE_ID &&
        offer.source_reference.source_url ===
          candidate.offer.source_reference.source_url,
    );
    const reasonCodes = ["STABLE_SOURCE_UNIT_ID_MATCH"];
    const decision: DuplicateDecision = {
      status: existingOffer
        ? "reuse_property_update_offer"
        : "reuse_property_new_offer",
      propertyId: existingProperty.identity.property_id,
      offerId: existingOffer?.offer_id ?? candidate.offer.offer_id,
      identityKey,
      reasonCodes,
      hookVersion: this.version,
    };
    const conflicts: SourceConflict[] = [];
    for (const comparison of propertyComparisons) {
      const oldValue = comparison.current(existingProperty);
      const newValue = comparison.proposed(candidate.property);
      if (
        oldValue === null ||
        newValue === null ||
        equalValue(oldValue, newValue)
      )
        continue;
      const next = conflict({
        entityId: existingProperty.identity.property_id,
        field: comparison.field,
        oldEvidence: evidenceFor(
          state.evidence,
          existingProperty.metadata.evidence_refs,
          comparison.field,
        ),
        newEvidence: evidenceFor(
          candidate.evidence,
          candidate.property.metadata.evidence_refs,
          comparison.field,
        ),
        severity: "significant",
      });
      if (next) conflicts.push(next);
      else reasonCodes.push("CONFLICT_EVIDENCE_INCOMPLETE");
    }
    if (existingOffer) {
      for (const comparison of offerComparisons) {
        const oldValue = comparison.current(existingOffer);
        const newValue = comparison.proposed(candidate.offer);
        if (
          oldValue === null ||
          newValue === null ||
          oldValue === "unknown" ||
          newValue === "unknown" ||
          equalValue(oldValue, newValue)
        )
          continue;
        const next = conflict({
          entityId: existingOffer.offer_id,
          field: comparison.field,
          oldEvidence: evidenceFor(
            state.evidence,
            existingOffer.evidence_refs,
            comparison.field,
          ),
          newEvidence: evidenceFor(
            candidate.evidence,
            candidate.offer.evidence_refs,
            comparison.field,
          ),
          severity: comparison.severity,
        });
        if (next) conflicts.push(next);
        else reasonCodes.push("CONFLICT_EVIDENCE_INCOMPLETE");
      }
      if (
        (existingOffer.listing_price && !candidate.offer.listing_price) ||
        (existingOffer.availability !== "unknown" &&
          candidate.offer.availability === "unknown")
      )
        reasonCodes.push("LOWER_CONFIDENCE_UPDATE_REQUIRES_REVIEW");
    }
    return {
      decision: {
        ...decision,
        reasonCodes: [...new Set(reasonCodes)],
      },
      conflicts,
    };
  }
}
