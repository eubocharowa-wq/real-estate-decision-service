import { describe, expect, it } from "vitest";

import {
  createPilotRuntimeConfig,
  validatePilotCandidate,
} from "../../src/pilot-hardening";
import { createSyntheticPilotCandidate } from "./helpers";

describe("validatePilotCandidate", () => {
  it("accepts an explicitly synthetic, evidence-bearing demo candidate", () => {
    const candidate = createSyntheticPilotCandidate();
    const result = validatePilotCandidate(candidate, {
      runtimeConfig: createPilotRuntimeConfig({ mode: "demo" }),
      now: "2026-08-24T00:00:00.000Z",
    });
    expect(result.valid).toBe(true);
    expect(result.origin).toBe("synthetic");
  });

  it("prevents synthetic data from masquerading in pilot mode", () => {
    const candidate = {
      ...createSyntheticPilotCandidate(),
      environment: "pilot" as const,
    };
    const result = validatePilotCandidate(candidate, {
      runtimeConfig: createPilotRuntimeConfig({ mode: "pilot" }),
      now: "2026-08-24T00:00:00.000Z",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ORIGIN_NOT_ALLOWED_IN_APPLICATION_MODE");
    expect(result.errors).toContain("SYNTHETIC_DATA_OUTSIDE_DEMO");
  });

  it("enforces Property/Offer references and evidence", () => {
    const candidate = createSyntheticPilotCandidate();
    const result = validatePilotCandidate({
      ...candidate,
      offer: { ...candidate.offer, property_id: "prop_wrong" },
      evidence: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("OFFER_PROPERTY_REFERENCE_MISMATCH");
    expect(result.errors).toContain("FIELD_EVIDENCE_REQUIRED");
  });

  it("does not turn a lower-bound price into an exact confirmed price", () => {
    const candidate = createSyntheticPilotCandidate();
    const evidence = candidate.evidence.map((item) =>
      item.entity_id === candidate.offer.offer_id &&
      item.field === "listing_price"
        ? { ...item, verification_status: "confirmed" as const }
        : item,
    );
    const result = validatePilotCandidate({
      ...candidate,
      offer: { ...candidate.offer, price_from: true },
      evidence,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "LOWER_BOUND_PRICE_CANNOT_BE_EXACT_CONFIRMED_PRICE",
    );
  });

  it("keeps unknown availability explicit", () => {
    const candidate = createSyntheticPilotCandidate();
    const result = validatePilotCandidate({
      ...candidate,
      offer: { ...candidate.offer, availability: "unknown" },
    });
    expect(result.warnings).toContain("AVAILABILITY_UNKNOWN");
    expect(result.errors).not.toContain("AVAILABILITY_EVIDENCE_REQUIRED");
  });
});
