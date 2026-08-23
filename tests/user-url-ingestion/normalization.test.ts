import { describe, expect, it } from "vitest";

import {
  buildUserUrlPropertyDetailInput,
  UserUrlIngestionOrchestrator,
} from "../../src/user-url-ingestion";
import { loadPilotDataset } from "../../src/pilot-dataset";

const orchestrator = () =>
  new UserUrlIngestionOrchestrator({
    now: () => new Date("2026-08-17T08:00:00.000Z"),
  });

describe("fixture ingestion and normalization", () => {
  it("keeps raw, normalized Property, Offer and claimed evidence separate", async () => {
    const service = orchestrator();
    const preview = await service.preview(
      "https://fixture.example/listing/apartment",
    );
    expect(preview.rawResult?.status).toBe("complete");
    const outcome = service.confirm(preview, preview.editableFields);
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(outcome.candidate.propertyCandidate.identity.property_id).not.toBe(
      outcome.candidate.offerCandidate.offer_id,
    );
    expect(outcome.candidate.offerCandidate.property_id).toBe(
      outcome.candidate.propertyCandidate.identity.property_id,
    );
    expect(
      outcome.candidate.evidence.every(
        (item) => item.verification_status !== "confirmed",
      ),
    ).toBe(true);
    expect(outcome.candidate.originalUrl).toBe(
      "https://fixture.example/listing/apartment",
    );
    expect(outcome.candidate.matchingReadiness.status).toBe("ready");
  });

  it("preserves source extraction and adds separate unconfirmed user evidence for an edit", async () => {
    const service = orchestrator();
    const preview = await service.preview(
      "https://fixture.example/listing/apartment",
    );
    const outcome = service.confirm(preview, {
      ...preview.editableFields,
      priceAmount: "8700000",
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    const priceEvidence = outcome.candidate.evidence.filter((item) =>
      item.field.endsWith("listing_price"),
    );
    expect(priceEvidence.map((item) => item.evidence_type)).toEqual([
      "extraction",
      "user_provided",
    ]);
    expect(priceEvidence.map((item) => item.verification_status)).toEqual([
      "claimed",
      "unconfirmed",
    ]);
    expect(outcome.candidate.offerCandidate.verification_status).toBe(
      "unconfirmed",
    );
  });

  it("treats partial extraction as ready with explicit unknown price", async () => {
    const service = orchestrator();
    const preview = await service.preview(
      "https://fixture.example/listing/partial",
    );
    expect(preview.rawResult?.status).toBe("partial");
    const incomplete = service.confirm(preview, preview.editableFields);
    expect(incomplete).toMatchObject({
      success: false,
      error: { code: "INSUFFICIENT_DATA", missingFields: ["location"] },
    });
    const outcome = service.confirm(preview, {
      ...preview.editableFields,
      locationText: "Район введён пользователем",
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(outcome.candidate.matchingReadiness.status).toBe(
      "ready_with_unknowns",
    );
    expect(outcome.candidate.offerCandidate.listing_price).toBeNull();
  });

  it("preserves price_from semantics", async () => {
    const service = orchestrator();
    const preview = await service.preview(
      "https://fixture.example/listing/price-from",
    );
    const outcome = service.confirm(preview, preview.editableFields);
    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.candidate.offerCandidate.price_from).toBe(true);
      expect(outcome.candidate.offerCandidate.listing_price?.amount).toBe(
        "6900000",
      );
    }
  });

  it("preserves financing and gas as claims, not confirmed facts or scenarios", async () => {
    const service = orchestrator();
    const financing = await service.preview(
      "https://fixture.example/listing/financing",
    );
    const financeOutcome = service.confirm(financing, financing.editableFields);
    expect(financeOutcome.success).toBe(true);
    if (financeOutcome.success) {
      expect(financeOutcome.candidate.financingClaims).toEqual([
        "Семейная ипотека от 3,5%",
      ]);
      expect(
        financeOutcome.candidate.offerCandidate.financing_offer_ids,
      ).toEqual([]);
    }
    const house = await service.preview(
      "https://fixture.example/listing/house",
    );
    const houseOutcome = service.confirm(house, house.editableFields);
    expect(houseOutcome.success).toBe(true);
    if (houseOutcome.success) {
      expect(houseOutcome.candidate.propertyCandidate.utilities.gas).toBe(
        "unknown",
      );
      expect(
        houseOutcome.candidate.evidence.find(
          (item) => item.field === "utilities.gas",
        )?.verification_status,
      ).toBe("claimed");
    }
  });

  it("links a strong duplicate to the physical property but preserves a new Offer", async () => {
    const service = orchestrator();
    const preview = await service.preview(
      "https://fixture.example/listing/duplicate-new-offer",
    );
    const outcome = service.confirm(preview, preview.editableFields);
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(outcome.candidate.duplicateDecision).toMatchObject({
      status: "same_property",
      existingPropertyId: "prop_sec_001",
      preserveAsNewOffer: true,
    });
    expect(outcome.candidate.offerCandidate.offer_id).toMatch(
      /^candidate_offer_/,
    );
    const dataset = loadPilotDataset();
    const request = dataset.userRequests[0];
    if (!request) throw new Error("request fixture missing");
    const detail = buildUserUrlPropertyDetailInput({
      candidate: outcome.candidate,
      userRequest: request,
    });
    expect(detail?.property).toEqual(
      dataset.properties.find(
        (property) => property.identity.property_id === "prop_sec_001",
      ),
    );
    expect(detail?.selectedOffer?.offer_id).toMatch(/^candidate_offer_/);
  });
});
