import { describe, expect, it } from "vitest";

import {
  buildPilotPropertyDetailInput,
  buildPropertyDetailView,
} from "../../src/property-detail";
import { detailView, propertyDetailDataset } from "./fixtures";

describe("TASK-010 pure property detail view model", () => {
  it("uses the ten required pilot cases without combining entities", () => {
    const cases = [
      detailView({ propertyId: "prop_nb_001", requestId: "request_pilot_a" }),
      detailView({ propertyId: "prop_nb_004", requestId: "request_pilot_a" }),
      detailView({
        propertyId: "prop_nb_001",
        offerId: "offer_nb_001_primary",
      }),
      detailView({
        propertyId: "prop_special_template_001",
        offerId: "offer_special_template_001_primary",
      }),
      detailView({
        propertyId: "prop_nb_005",
        offerId: "offer_nb_005_primary",
      }),
      detailView({
        propertyId: "prop_nb_002",
        requestId: "request_pilot_b",
        offerId: "offer_nb_002_primary",
        scenarioId: "scenario_nb_002_claimed",
      }),
      detailView({
        propertyId: "prop_nb_003",
        requestId: "request_pilot_b",
        offerId: "offer_nb_003_primary",
        scenarioId: "scenario_nb_003_staged",
      }),
      detailView({
        propertyId: "prop_house_003",
        requestId: "request_pilot_c",
      }),
      detailView({
        propertyId: "prop_sec_006",
        offerId: "offer_sec_006_primary",
      }),
      detailView({
        propertyId: "prop_nb_001",
        requestId: "request_pilot_c",
        offerId: "offer_nb_001_primary",
      }),
    ];

    expect(cases).toHaveLength(10);
    expect(cases[2]?.conflicts[0]?.values.length).toBeGreaterThanOrEqual(2);
    expect(cases[3]?.price.kind).toBe("from");
    expect(cases[4]?.alternativeOffers.length).toBeGreaterThan(0);
    expect(cases[5]?.financing.claimedNotice).toMatch(/заявлено/i);
    expect(cases[6]?.financing.rates).toHaveLength(2);
    expect(
      cases[7]?.facts.find((fact) => fact.label === "Газ")?.semantics,
    ).toBe("unknown");
    expect(cases[8]?.availability.label).toBe("Статус уточняется");
    expect(cases[8]?.availability.label).not.toBe("Продано");
    expect(cases[9]?.matchSummary?.hardFail).toBe(true);
  });

  it("keeps unknown, false, and not_applicable semantics distinct", () => {
    const unknown = detailView({
      propertyId: "prop_house_003",
      requestId: "request_pilot_c",
    });
    const explicitFalse = detailView({
      propertyId: "prop_house_005",
      requestId: "request_pilot_c",
    });
    const notApplicable = detailView({
      propertyId: "prop_nb_001",
      requestId: "request_pilot_e",
    });

    expect(unknown.facts.find((fact) => fact.label === "Газ")).toMatchObject({
      value: "Не подтверждено",
      semantics: "unknown",
    });
    expect(
      explicitFalse.facts.find((fact) => fact.label === "Газ"),
    ).toMatchObject({ value: "Нет", semantics: "false" });
    expect(
      notApplicable.criterionResults.some(
        (fact) => fact.semantics === "not_applicable",
      ),
    ).toBe(true);
  });

  it("orders request-relevant facts before generic facts", () => {
    const view = detailView({
      propertyId: "prop_house_003",
      requestId: "request_pilot_e",
    });
    expect(view.facts.slice(0, 2).every((fact) => fact.requestRelevant)).toBe(
      true,
    );
  });

  it("rejects a scenario that belongs to another Offer", () => {
    const adapted = buildPilotPropertyDetailInput({
      propertyId: "prop_nb_001",
      offerId: "offer_nb_001_primary",
      scenarioId: "scenario_nb_001_zero",
    });
    expect(adapted).toMatchObject({
      success: false,
      error: { code: "SCENARIO_NOT_FOUND" },
    });
  });

  it("does not invent personalization without a UserRequest", () => {
    const view = detailView({ propertyId: "prop_nb_003" });
    expect(view.personalized).toBe(false);
    expect(view.matchSummary).toBeNull();
    expect(view.strengths).toEqual([]);
    expect(view.compromises).toEqual([]);
    expect(view.dataQuality.confidenceBand).toBe("pending");
  });

  it("returns controlled not-found and validates broken references", () => {
    expect(
      buildPilotPropertyDetailInput({ propertyId: "missing_property" }),
    ).toMatchObject({
      success: false,
      error: { code: "PROPERTY_NOT_FOUND" },
    });

    const adapted = buildPilotPropertyDetailInput({
      propertyId: "prop_nb_003",
    });
    if (!adapted.success) throw new Error(adapted.error.message);
    const malformed = buildPropertyDetailView({
      ...adapted.input,
      offers: [propertyDetailDataset.offers[0]!],
    });
    expect(malformed).toMatchObject({
      success: false,
      error: { code: "BROKEN_REFERENCE" },
    });
  });
});
