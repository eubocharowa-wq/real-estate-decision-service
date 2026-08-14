import { z } from "zod";

import {
  entityIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
} from "../domain/common/schema";
import { userRequestSchema } from "../domain/user-request/schema";
import { parserUnknownSchema } from "../user-request-parser/contracts";

export const confirmationChangeSchema = z.strictObject({
  change_id: entityIdSchema,
  type: z.enum([
    "criterion_value_changed",
    "priority_changed",
    "criterion_removed",
    "criterion_added",
    "clarification_answered",
  ]),
  criterion_id: entityIdSchema.nullable(),
  field: nonEmptyStringSchema,
  previous_value: z.json().nullable(),
  next_value: z.json().nullable(),
  changed_at: isoDateTimeSchema,
});

export const answeredClarificationSchema = z.strictObject({
  clarification_id: entityIdSchema,
  field: nonEmptyStringSchema,
  answer: z.json(),
  answered_at: isoDateTimeSchema,
});

export const requestConfirmationResultSchema = z
  .strictObject({
    schema_version: schemaVersionSchema,
    request_status: z.literal("confirmed"),
    original_raw_text: nonEmptyStringSchema,
    confirmed_request: userRequestSchema,
    unresolved_nonblocking_unknowns: z.array(parserUnknownSchema),
    answered_clarifications: z.array(answeredClarificationSchema),
    user_changes: z.array(confirmationChangeSchema),
    confirmed_at: isoDateTimeSchema,
  })
  .meta({ title: "RequestConfirmationResult" });

export type ConfirmationChange = z.infer<typeof confirmationChangeSchema>;
export type AnsweredClarification = z.infer<typeof answeredClarificationSchema>;
export type RequestConfirmationResult = z.infer<
  typeof requestConfirmationResultSchema
>;
