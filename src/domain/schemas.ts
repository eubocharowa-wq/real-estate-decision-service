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

export interface TopLevelSchemaDefinition {
  readonly file_name: string;
  readonly id: string;
  readonly schema: z.ZodType;
}

const schemaId = (name: string) =>
  `https://real-estate-decision-service.local/schemas/1.0/${name}.schema.json`;

export const topLevelSchemas = [
  {
    file_name: "user-request.schema.json",
    id: schemaId("user-request"),
    schema: userRequestSchema,
  },
  {
    file_name: "property.schema.json",
    id: schemaId("property"),
    schema: propertySchema,
  },
  {
    file_name: "offer.schema.json",
    id: schemaId("offer"),
    schema: offerSchema,
  },
  {
    file_name: "financing-program.schema.json",
    id: schemaId("financing-program"),
    schema: financingProgramSchema,
  },
  {
    file_name: "financing-offer.schema.json",
    id: schemaId("financing-offer"),
    schema: financingOfferSchema,
  },
  {
    file_name: "promotion.schema.json",
    id: schemaId("promotion"),
    schema: promotionSchema,
  },
  {
    file_name: "property-financing-eligibility.schema.json",
    id: schemaId("property-financing-eligibility"),
    schema: propertyFinancingEligibilitySchema,
  },
  {
    file_name: "purchase-scenario.schema.json",
    id: schemaId("purchase-scenario"),
    schema: purchaseScenarioSchema,
  },
  {
    file_name: "source.schema.json",
    id: schemaId("source"),
    schema: sourceSchema,
  },
  {
    file_name: "source-snapshot.schema.json",
    id: schemaId("source-snapshot"),
    schema: sourceSnapshotSchema,
  },
  {
    file_name: "field-evidence.schema.json",
    id: schemaId("field-evidence"),
    schema: fieldEvidenceSchema,
  },
  {
    file_name: "source-conflict.schema.json",
    id: schemaId("source-conflict"),
    schema: sourceConflictSchema,
  },
  {
    file_name: "criterion.schema.json",
    id: schemaId("criterion"),
    schema: criterionSchema,
  },
  {
    file_name: "criterion-evaluation-result.schema.json",
    id: schemaId("criterion-evaluation-result"),
    schema: criterionEvaluationResultSchema,
  },
  {
    file_name: "match-result.schema.json",
    id: schemaId("match-result"),
    schema: matchResultSchema,
  },
  {
    file_name: "data-quality.schema.json",
    id: schemaId("data-quality"),
    schema: dataQualitySchema,
  },
  {
    file_name: "expert-request.schema.json",
    id: schemaId("expert-request"),
    schema: expertRequestSchema,
  },
  {
    file_name: "expert-result.schema.json",
    id: schemaId("expert-result"),
    schema: expertResultSchema,
  },
] as const satisfies readonly TopLevelSchemaDefinition[];
