import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseUserRequest,
  parserErrorSchema,
  userRequestParserInputSchema,
  userRequestParserResultSchema,
  type UserRequestParserInput,
  type UserRequestParserResult,
} from "../../src/user-request-parser";

const fixture = (name: string): UserRequestParserInput =>
  userRequestParserInputSchema.parse(
    JSON.parse(
      readFileSync(
        path.resolve(
          process.cwd(),
          "data/examples/user-request-parser",
          `${name}.json`,
        ),
        "utf8",
      ),
    ),
  );

const parseFixture = async (name: string): Promise<UserRequestParserResult> => {
  const outcome = await parseUserRequest(fixture(name));
  expect(outcome.success).toBe(true);
  if (!outcome.success) throw new Error(outcome.error.message);
  return outcome.result;
};

const criterionFor = (result: UserRequestParserResult, field: string) => {
  const request = result.parsed_request;
  return [
    ...request.infrastructure,
    ...request.property_features,
    ...request.must_have,
    ...request.nice_to_have,
    ...request.avoid,
  ].find((criterion) => criterion.field === field);
};

describe("UserRequest parser TASK-003 contract", () => {
  it("extracts explicit fields and a user-requested limit", async () => {
    const result = await parseFixture("a-clear-apartment");

    expect(result.parsed_request.intent).toBe("find");
    expect(result.parsed_request.location.cities).toEqual(["Туле"]);
    expect(result.parsed_request.property.allowed_property_types).toEqual([
      "apartment",
    ]);
    expect(result.parsed_request.budget.purchase_price.maximum).toEqual({
      amount: "5000000.00",
      currency: "RUB",
    });
    expect(result.user_requested_limit).toBe(5);
    expect(result.parsed_request.result_limit).toBe(5);
    expect(result.system_default_limit).toBe(7);
  });

  it("preserves must priority markers", async () => {
    const result = await parseFixture("a-clear-apartment");

    expect(
      criterionFor(result, "budget.purchase_price.maximum")?.priority,
    ).toBe("must");
    expect(criterionFor(result, "financing.program_type")).toMatchObject({
      target: "family_mortgage",
      priority: "must",
    });
  });

  it("preserves preferred priority markers without escalation", async () => {
    const result = await parseFixture("a-clear-apartment");

    expect(
      criterionFor(result, "financing.zero_initial_payment")?.priority,
    ).toBe("preferred");
  });

  it("maps a conditional first-floor objection to avoid", async () => {
    const result = await parseFixture("d-soft-floor");

    expect(criterionFor(result, "property.floor.is_first")).toMatchObject({
      priority: "avoid",
      target: false,
    });
  });

  it("maps an absolute first-floor rejection to exclude", async () => {
    const result = await parseFixture("e-hard-floor");

    expect(criterionFor(result, "property.floor.is_first")?.priority).toBe(
      "exclude",
    );
  });

  it("maps explicitly irrelevant floor to neutral", async () => {
    const result = await parseFixture("j-neutral-floor");

    expect(criterionFor(result, "property.floor.is_first")).toMatchObject({
      priority: "neutral",
      target: "any",
    });
  });

  it("keeps relevant unspecified fields unknown", async () => {
    const result = await parseFixture("b-relocation");

    expect(result.parsed_request.location.cities).toEqual([]);
    expect(result.parsed_request.property.allowed_property_types).toEqual([]);
    expect(result.unknowns).toContainEqual(
      expect.objectContaining({
        field: "location.city",
        reason: "not_specified",
      }),
    );
  });

  it("preserves a cross-type request", async () => {
    const result = await parseFixture("c-cross-type");

    expect(result.parsed_request.property.allowed_property_types).toEqual(
      expect.arrayContaining(["apartment", "house"]),
    );
    expect(result.parsed_request.property.property_type_flexible).toBe(true);
    expect(criterionFor(result, "property.area_sqm")).toMatchObject({
      target: 70,
      priority: "must",
    });
  });

  it("preserves unknown target location and relative move-in semantics", async () => {
    const result = await parseFixture("b-relocation");

    expect(result.parsed_request.goal.purpose).toBe("relocation");
    expect(result.parsed_request.intent).toBe("location_discovery");
    expect(result.parsed_request.location.regions).toEqual(["юг"]);
    expect(result.parsed_request.location.cities).toEqual([]);
    expect(result.parsed_request.timeline.move_in_by).toBe("2027-01-15");
    expect(result.parsed_request.household.children_count).toBe(2);
    expect(result.parsed_request.budget.own_funds?.amount).toBe("5000000.00");
    expect(result.parsed_request.financing.monthly_payment_max?.amount).toBe(
      "80000.00",
    );
    expect(result.parsed_request.financing.required_program_types).toEqual([]);
  });

  it("detects explicit location inclusion/exclusion contradiction", async () => {
    const result = await parseFixture("i-contradictory-location");

    expect(result.contradictions).toContainEqual(
      expect.objectContaining({
        type: "location_inclusion_exclusion",
        blocking: true,
      }),
    );
    expect(result.confirmation_view.can_confirm).toBe(false);
  });

  it("does not flag zero-down plus own funds as a contradiction", async () => {
    const outcome = await parseUserRequest({
      schema_version: "1.0",
      raw_text: "Без первоначального взноса обязательно. Есть 1 млн своих.",
      locale: "ru-RU",
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) throw new Error(outcome.error.message);

    expect(outcome.result.contradictions).toEqual([]);
    expect(
      criterionFor(outcome.result, "financing.zero_initial_payment")?.priority,
    ).toBe("must");
  });

  it("keeps fuzzy school proximity without an invented threshold", async () => {
    const result = await parseFixture("f-fuzzy-school");
    const school = criterionFor(result, "infrastructure.school_proximity");

    expect(school).toMatchObject({
      operator: "custom",
      target: "nearby",
      priority: "preferred",
    });
    expect(school?.target).not.toBeTypeOf("number");
    expect(result.clarification_candidates).toContainEqual(
      expect.objectContaining({ field: "infrastructure.school_proximity" }),
    );
  });

  it("keeps an ambiguous all-in budget separate from property price", async () => {
    const result = await parseFixture("g-total-budget-ambiguity");

    expect(result.parsed_request.budget.total_budget?.amount).toBe(
      "6000000.00",
    );
    expect(result.parsed_request.budget.purchase_price.maximum).toBeNull();
    expect(result.parsed_request.budget.renovation_budget).toBeNull();
    expect(result.parsed_request.budget.budget_context).toBe("ambiguous");
    expect(result.clarification_candidates).toContainEqual(
      expect.objectContaining({ field: "budget.context" }),
    );
  });

  it("requests missing comparison inputs instead of starting search", async () => {
    const result = await parseFixture("h-compare-options");

    expect(result.parsed_request.intent).toBe("compare");
    expect(result.parsed_request.source_links).toEqual([]);
    expect(result.clarification_candidates[0]?.field).toBe("source_links");
  });

  it("returns a controlled error for an empty request", async () => {
    const outcome = await parseUserRequest({
      schema_version: "1.0",
      raw_text: "   ",
      locale: "ru-RU",
    });

    expect(outcome).toMatchObject({
      success: false,
      error: { type: "empty_request", recoverable: true },
    });
    if (!outcome.success)
      expect(parserErrorSchema.safeParse(outcome.error).success).toBe(true);
  });

  it("runtime-validates every parser result", async () => {
    for (const name of [
      "a-clear-apartment",
      "b-relocation",
      "c-cross-type",
      "d-soft-floor",
      "e-hard-floor",
      "f-fuzzy-school",
      "g-total-budget-ambiguity",
      "h-compare-options",
      "i-contradictory-location",
      "j-neutral-floor",
    ]) {
      expect(
        userRequestParserResultSchema.safeParse(await parseFixture(name))
          .success,
      ).toBe(true);
    }
  });

  it("selects no more than three material clarifications", async () => {
    const result = await parseFixture("c-cross-type");

    expect(result.clarification_candidates.length).toBeGreaterThan(0);
    expect(result.clarification_candidates.length).toBeLessThanOrEqual(3);
    expect(result.clarification_candidates[0]?.field).toBe(
      "location.travel_destination",
    );
  });

  it("builds identical confirmation grouping for identical input", async () => {
    const input = fixture("a-clear-apartment");
    const first = await parseUserRequest(input);
    const second = await parseUserRequest(input);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) throw new Error("Parser failed");
    expect(first.result.confirmation_view).toEqual(
      second.result.confirmation_view,
    );
    expect(first.result.parsed_request.user_request_id).toBe(
      second.result.parsed_request.user_request_id,
    );
  });

  it("rejects invalid input structure and unsupported language", async () => {
    const invalid = await parseUserRequest({
      raw_text: "Квартира",
      locale: "ru-RU",
    });
    const unsupported = await parseUserRequest({
      schema_version: "1.0",
      raw_text: "Find an apartment",
      locale: "en-US",
    });

    expect(invalid).toMatchObject({
      success: false,
      error: { type: "invalid_structure" },
    });
    expect(unsupported).toMatchObject({
      success: false,
      error: { type: "unsupported_language" },
    });
  });
});
