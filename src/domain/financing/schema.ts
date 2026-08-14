import { z } from "zod";

import {
  dateRangeSchema,
  entityIdSchema,
  freshnessStatusSchema,
  isoDateTimeSchema,
  moneySchema,
  nonEmptyStringSchema,
  percentageStringSchema,
  schemaVersionSchema,
  sourceReferenceSchema,
  verificationStatusSchema,
} from "../common/schema";
import { criterionOperatorSchema } from "../matching/schema";

const providerSchema = z.strictObject({
  provider_id: entityIdSchema.nullable(),
  provider_type: z.enum([
    "bank",
    "developer",
    "government",
    "partner",
    "other",
  ]),
  name: nonEmptyStringSchema,
});

const financingRuleSchema = z.strictObject({
  rule_id: entityIdSchema,
  field: nonEmptyStringSchema,
  operator: criterionOperatorSchema,
  value: z.json(),
  description: nonEmptyStringSchema.nullable(),
});

export const financingProgramSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    program_id: entityIdSchema,
    program_type: z.enum([
      "mortgage",
      "family_mortgage",
      "subsidized_mortgage",
      "installment",
      "cash_program",
      "other",
    ]),
    provider: providerSchema,
    rule_version: nonEmptyStringSchema,
    effective_from: isoDateTimeSchema.nullable(),
    effective_until: isoDateTimeSchema.nullable(),
    borrower_rules: z.array(financingRuleSchema),
    property_rules: z.array(financingRuleSchema),
    financial_rules: z.array(financingRuleSchema),
    source_references: z.array(sourceReferenceSchema),
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
  })
  .meta({ title: "FinancingProgram" });

export const ratePeriodSchema = z.strictObject({
  from_month: z.number().int().positive(),
  to_month: z.number().int().positive().nullable(),
  rate_percent: percentageStringSchema,
  conditions: z.array(nonEmptyStringSchema),
});

export const rateStructureSchema = z
  .strictObject({
    advertised_rate_percent: percentageStringSchema.nullable(),
    nominal_rate_percent: percentageStringSchema.nullable(),
    rate_from: z.boolean().nullable(),
    periods: z.array(ratePeriodSchema),
    after_introductory_period_rate_percent: percentageStringSchema.nullable(),
    conditions: z.array(nonEmptyStringSchema),
  })
  .meta({
    title: "RateStructure",
    description:
      "Represents advertised, nominal and period-specific rates without collapsing staged rates into one number.",
  });

const paymentRequirementSchema = z.strictObject({
  amount: moneySchema.nullable(),
  percent: percentageStringSchema.nullable(),
  zero_payment_status: z.enum([
    "available",
    "claimed",
    "not_available",
    "unknown",
  ]),
});

const amountRangeSchema = z.strictObject({
  minimum: moneySchema.nullable(),
  maximum: moneySchema.nullable(),
});

const termRangeSchema = z.strictObject({
  minimum_months: z.number().int().positive().nullable(),
  maximum_months: z.number().int().positive().nullable(),
});

const priceImpactSchema = z.strictObject({
  kind: z.enum(["none", "increase", "decrease", "unknown"]),
  amount: moneySchema.nullable(),
  percent: percentageStringSchema.nullable(),
  description: nonEmptyStringSchema.nullable(),
});

export const financingOfferSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    financing_offer_id: entityIdSchema,
    program_id: entityIdSchema,
    provider: providerSchema,
    rate_structure: rateStructureSchema,
    initial_payment: paymentRequirementSchema,
    loan_amount: amountRangeSchema,
    term: termRangeSchema,
    mandatory_services: z.array(
      z.strictObject({
        name: nonEmptyStringSchema,
        cost: moneySchema.nullable(),
        required: z.boolean(),
      }),
    ),
    price_impact: priceImpactSchema,
    validity: dateRangeSchema,
    source_reference: sourceReferenceSchema,
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
    evidence_refs: z.array(entityIdSchema),
  })
  .meta({ title: "FinancingOffer" });

export const promotionSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    promotion_id: entityIdSchema,
    title: nonEmptyStringSchema,
    provider: providerSchema,
    valid_from: isoDateTimeSchema.nullable(),
    valid_until: isoDateTimeSchema.nullable(),
    eligible_property_refs: z.array(entityIdSchema),
    eligible_offer_refs: z.array(entityIdSchema),
    price_impact: priceImpactSchema,
    financing_impact: z.strictObject({
      financing_offer_ids: z.array(entityIdSchema),
      description: nonEmptyStringSchema.nullable(),
    }),
    conditions: z.array(nonEmptyStringSchema),
    source_reference: sourceReferenceSchema,
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
    evidence_refs: z.array(entityIdSchema),
  })
  .meta({ title: "Promotion" });

export const financingEligibilityStatusSchema = z.enum([
  "confirmed",
  "likely",
  "claimed",
  "not_eligible",
  "needs_confirmation",
  "unknown",
]);

export const propertyFinancingEligibilitySchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    eligibility_id: entityIdSchema,
    property_id: entityIdSchema,
    offer_id: entityIdSchema.nullable(),
    program_id: entityIdSchema.nullable(),
    financing_offer_id: entityIdSchema.nullable(),
    eligibility_status: financingEligibilityStatusSchema,
    initial_payment: paymentRequirementSchema,
    rate_structure: rateStructureSchema.nullable(),
    monthly_payment: moneySchema.nullable(),
    applicability_evidence_refs: z.array(entityIdSchema),
    checked_at: isoDateTimeSchema.nullable(),
    source_reference: sourceReferenceSchema,
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
  })
  .meta({ title: "PropertyFinancingEligibility" });

export const purchaseScenarioSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    scenario_id: entityIdSchema,
    property_id: entityIdSchema,
    offer_id: entityIdSchema,
    financing_program_id: entityIdSchema.nullable(),
    financing_offer_id: entityIdSchema.nullable(),
    promotion_id: entityIdSchema.nullable(),
    entry_cash: moneySchema.nullable(),
    initial_payment: moneySchema.nullable(),
    loan_amount: moneySchema.nullable(),
    monthly_payment: moneySchema.nullable(),
    total_payment: moneySchema.nullable(),
    mandatory_costs: z.array(
      z.strictObject({
        name: nonEmptyStringSchema,
        amount: moneySchema,
        evidence_refs: z.array(entityIdSchema),
      }),
    ),
    estimated_total_entry_cost: moneySchema.nullable(),
    assumptions: z.array(
      z.strictObject({
        assumption: nonEmptyStringSchema,
        verification_status: verificationStatusSchema,
        evidence_refs: z.array(entityIdSchema),
      }),
    ),
    terms_compatibility_status: z.enum([
      "confirmed",
      "claimed",
      "unconfirmed",
      "conflicting",
      "unknown",
    ]),
    compatibility_evidence_refs: z.array(entityIdSchema),
    verification_status: verificationStatusSchema,
    freshness_status: freshnessStatusSchema,
    calculated_at: isoDateTimeSchema,
  })
  .meta({
    title: "PurchaseScenario",
    description:
      "A scenario is anchored to one Offer; compatibility must be evidenced and terms from unrelated offers must not be combined.",
  });

export type FinancingProgram = z.infer<typeof financingProgramSchema>;
export type FinancingOffer = z.infer<typeof financingOfferSchema>;
export type Promotion = z.infer<typeof promotionSchema>;
export type PropertyFinancingEligibility = z.infer<
  typeof propertyFinancingEligibilitySchema
>;
export type PurchaseScenario = z.infer<typeof purchaseScenarioSchema>;
