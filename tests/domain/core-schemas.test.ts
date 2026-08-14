import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  criterionEvaluationResultSchema,
  criterionSchema,
  dataQualitySchema,
  expertRequestSchema,
  expertResultSchema,
  fieldEvidenceSchema,
  financingOfferSchema,
  financingProgramSchema,
  matchResultSchema,
  offerSchema,
  promotionSchema,
  propertyFinancingEligibilitySchema,
  propertySchema,
  purchaseScenarioSchema,
  sourceConflictSchema,
  sourceSchema,
  sourceSnapshotSchema,
  userRequestSchema,
  validateMatchResult,
  validateProperty,
  validateUserRequest,
} from "../../src/domain";

const fixture = (relativePath: string): unknown =>
  JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), "data/examples", relativePath),
      "utf8",
    ),
  );

const validFixtures: readonly {
  name: string;
  schema: z.ZodType;
  file: string;
}[] = [
  {
    name: "UserRequest",
    schema: userRequestSchema,
    file: "user-request/structured.json",
  },
  {
    name: "new-build Property",
    schema: propertySchema,
    file: "property/new-build-apartment.json",
  },
  {
    name: "house Property",
    schema: propertySchema,
    file: "property/house.json",
  },
  {
    name: "secondary Property",
    schema: propertySchema,
    file: "property/secondary-apartment-property.json",
  },
  {
    name: "secondary Offer",
    schema: offerSchema,
    file: "property/secondary-apartment-offer.json",
  },
  {
    name: "same-property Offer",
    schema: offerSchema,
    file: "property/second-offer-same-property.json",
  },
  {
    name: "price-from Offer",
    schema: offerSchema,
    file: "property/price-from-offer.json",
  },
  {
    name: "FinancingProgram",
    schema: financingProgramSchema,
    file: "financing/family-mortgage-program-claimed.json",
  },
  {
    name: "FinancingOffer",
    schema: financingOfferSchema,
    file: "financing/zero-down-offer-claimed.json",
  },
  {
    name: "PropertyFinancingEligibility",
    schema: propertyFinancingEligibilitySchema,
    file: "financing/property-eligibility-claimed.json",
  },
  {
    name: "PurchaseScenario",
    schema: purchaseScenarioSchema,
    file: "financing/purchase-scenario.json",
  },
  {
    name: "expired Promotion",
    schema: promotionSchema,
    file: "financing/expired-promotion.json",
  },
  {
    name: "Source",
    schema: sourceSchema,
    file: "source/developer-source.json",
  },
  {
    name: "SourceSnapshot",
    schema: sourceSnapshotSchema,
    file: "source/developer-snapshot.json",
  },
  {
    name: "confirmed FieldEvidence",
    schema: fieldEvidenceSchema,
    file: "source/confirmed-price-evidence.json",
  },
  {
    name: "conflicting FieldEvidence A",
    schema: fieldEvidenceSchema,
    file: "source/conflicting-price-evidence-a.json",
  },
  {
    name: "conflicting FieldEvidence B",
    schema: fieldEvidenceSchema,
    file: "source/conflicting-price-evidence-b.json",
  },
  {
    name: "price SourceConflict",
    schema: sourceConflictSchema,
    file: "source/conflicting-price.json",
  },
  {
    name: "initial-payment SourceConflict",
    schema: sourceConflictSchema,
    file: "source/conflicting-initial-payment.json",
  },
  {
    name: "unknown must Criterion",
    schema: criterionSchema,
    file: "matching/criterion-unknown-must.json",
  },
  {
    name: "unknown CriterionEvaluationResult",
    schema: criterionEvaluationResultSchema,
    file: "matching/criterion-evaluation-unknown-must.json",
  },
  {
    name: "DataQuality",
    schema: dataQualitySchema,
    file: "matching/data-quality-critical-unknown.json",
  },
  {
    name: "MatchResult",
    schema: matchResultSchema,
    file: "matching/match-result-critical-unknown.json",
  },
  {
    name: "ExpertRequest",
    schema: expertRequestSchema,
    file: "expert/information-verification-request.json",
  },
  {
    name: "ExpertResult",
    schema: expertResultSchema,
    file: "expert/information-verification-result.json",
  },
];

describe("TASK-002 valid fixtures", () => {
  it.each(validFixtures)("validates $name", ({ schema, file }) => {
    expect(schema.safeParse(fixture(file)).success).toBe(true);
  });
});

describe("TASK-002 invalid payloads", () => {
  it("rejects an invalid UserRequest priority", () => {
    const source = userRequestSchema.parse(
      fixture("user-request/structured.json"),
    );
    const invalid = {
      ...source,
      must_have: [{ ...source.must_have[0], priority: "required" }],
    };

    expect(validateUserRequest(invalid).success).toBe(false);
  });

  it("rejects a Property without identity", () => {
    const source = propertySchema.parse(
      fixture("property/new-build-apartment.json"),
    );
    const invalid: Record<string, unknown> = { ...source };
    delete invalid.identity;

    expect(validateProperty(invalid).success).toBe(false);
  });

  it("rejects commercial Offer fields on a physical Property", () => {
    const source = propertySchema.parse(
      fixture("property/new-build-apartment.json"),
    );

    expect(
      propertySchema.safeParse({ ...source, listing_price: "4500000.00" })
        .success,
    ).toBe(false);
  });

  it("rejects an invalid FieldEvidence verification status", () => {
    const source = fieldEvidenceSchema.parse(
      fixture("source/confirmed-price-evidence.json"),
    );

    expect(
      fieldEvidenceSchema.safeParse({
        ...source,
        verification_status: "verified",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed PurchaseScenario reference structure", () => {
    const source = purchaseScenarioSchema.parse(
      fixture("financing/purchase-scenario.json"),
    );
    const invalid: Record<string, unknown> = { ...source };
    delete invalid.offer_id;

    expect(purchaseScenarioSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a MatchResult score above 100", () => {
    const source = matchResultSchema.parse(
      fixture("matching/match-result-critical-unknown.json"),
    );

    expect(validateMatchResult({ ...source, match_score: 101 }).success).toBe(
      false,
    );
  });

  it("rejects an invalid ExpertRequest specialist", () => {
    const source = expertRequestSchema.parse(
      fixture("expert/information-verification-request.json"),
    );

    expect(
      expertRequestSchema.safeParse({
        ...source,
        required_specialist: "generalist",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid currency representation", () => {
    const source = offerSchema.parse(
      fixture("property/secondary-apartment-offer.json"),
    );

    expect(
      offerSchema.safeParse({
        ...source,
        listing_price: { amount: "6250000.00", currency: "rub" },
      }).success,
    ).toBe(false);
    expect(
      offerSchema.safeParse({
        ...source,
        listing_price: { amount: 6250000.0, currency: "RUB" },
      }).success,
    ).toBe(false);
  });
});

describe("TASK-002 domain invariants", () => {
  it("keeps two Offers linked to one physical Property", () => {
    const property = propertySchema.parse(
      fixture("property/secondary-apartment-property.json"),
    );
    const firstOffer = offerSchema.parse(
      fixture("property/secondary-apartment-offer.json"),
    );
    const secondOffer = offerSchema.parse(
      fixture("property/second-offer-same-property.json"),
    );

    expect(firstOffer.property_id).toBe(property.identity.property_id);
    expect(secondOffer.property_id).toBe(property.identity.property_id);
    expect(firstOffer.offer_id).not.toBe(secondOffer.offer_id);
  });

  it("preserves unknown values as null instead of coercing them to false", () => {
    const property = propertySchema.parse(
      fixture("property/secondary-apartment-property.json"),
    );
    const evaluation = criterionEvaluationResultSchema.parse(
      fixture("matching/criterion-evaluation-unknown-must.json"),
    );
    const request = userRequestSchema.parse(
      fixture("user-request/structured.json"),
    );

    expect(property.physical.balcony).toBeNull();
    expect(evaluation.actual).toBeNull();
    expect(evaluation.fit).toBeNull();
    expect(request.timeline.ready_now_required).toBeNull();
  });

  it("preserves a staged financing rate instead of collapsing it", () => {
    const financingOffer = financingOfferSchema.parse(
      fixture("financing/zero-down-offer-claimed.json"),
    );

    expect(financingOffer.rate_structure.periods).toHaveLength(2);
    expect(
      financingOffer.rate_structure.after_introductory_period_rate_percent,
    ).toBe("8.0");
  });

  it("validates again after JSON serialization and parsing", () => {
    const original = fixture("matching/match-result-critical-unknown.json");
    const firstValidation = validateMatchResult(original);
    expect(firstValidation.success).toBe(true);

    if (!firstValidation.success) {
      throw new Error("Fixture unexpectedly failed initial validation");
    }

    const roundTripped: unknown = JSON.parse(
      JSON.stringify(firstValidation.data),
    );
    expect(validateMatchResult(roundTripped).success).toBe(true);
  });
});
