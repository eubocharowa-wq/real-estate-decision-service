import type { z } from "zod";

import { expertRequestSchema, expertResultSchema } from "./expert/schema";
import {
  financingOfferSchema,
  financingProgramSchema,
  promotionSchema,
  propertyFinancingEligibilitySchema,
  purchaseScenarioSchema,
} from "./financing/schema";
import {
  criterionEvaluationResultSchema,
  criterionSchema,
  dataQualitySchema,
  matchResultSchema,
} from "./matching/schema";
import { offerSchema, propertySchema } from "./property/schema";
import {
  fieldEvidenceSchema,
  sourceConflictSchema,
  sourceSchema,
  sourceSnapshotSchema,
} from "./source/schema";
import { userRequestSchema } from "./user-request/schema";

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly PropertyKey[];
}

export type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] };

export const createValidator =
  <TSchema extends z.ZodType>(schema: TSchema) =>
  (payload: unknown): ValidationResult<z.infer<TSchema>> => {
    const result = schema.safeParse(payload);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return {
      success: false,
      issues: result.error.issues.map(({ code, message, path }) => ({
        code,
        message,
        path,
      })),
    };
  };

export const validateUserRequest = createValidator(userRequestSchema);
export const validateProperty = createValidator(propertySchema);
export const validateOffer = createValidator(offerSchema);
export const validateFinancingProgram = createValidator(financingProgramSchema);
export const validateFinancingOffer = createValidator(financingOfferSchema);
export const validatePromotion = createValidator(promotionSchema);
export const validatePropertyFinancingEligibility = createValidator(
  propertyFinancingEligibilitySchema,
);
export const validatePurchaseScenario = createValidator(purchaseScenarioSchema);
export const validateSource = createValidator(sourceSchema);
export const validateSourceSnapshot = createValidator(sourceSnapshotSchema);
export const validateFieldEvidence = createValidator(fieldEvidenceSchema);
export const validateSourceConflict = createValidator(sourceConflictSchema);
export const validateCriterion = createValidator(criterionSchema);
export const validateCriterionEvaluationResult = createValidator(
  criterionEvaluationResultSchema,
);
export const validateDataQuality = createValidator(dataQualitySchema);
export const validateMatchResult = createValidator(matchResultSchema);
export const validateExpertRequest = createValidator(expertRequestSchema);
export const validateExpertResult = createValidator(expertResultSchema);
