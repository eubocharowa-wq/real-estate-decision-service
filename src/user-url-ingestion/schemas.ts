import { z } from "zod";

import { offerAvailabilitySchema } from "../domain/property/schema";
import { marketTypeSchema, propertyTypeSchema } from "../domain/common/schema";

export const manualConfirmationFieldsSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    propertyType: propertyTypeSchema,
    marketType: marketTypeSchema,
    city: z.string().trim().min(1).max(120),
    locationText: z.string().trim().min(1).max(300),
    priceAmount: z
      .string()
      .regex(/^(0|[1-9]\d*)(\.\d+)?$/)
      .nullable(),
    priceExplicitUnknown: z.boolean(),
    priceFrom: z.boolean(),
    rooms: z.number().int().nonnegative().nullable(),
    areaM2: z.number().positive().nullable(),
    floor: z.number().int().nullable(),
    availability: offerAvailabilitySchema,
    sellerName: z.string().trim().max(200),
    sourceName: z.string().trim().min(1).max(200),
  })
  .superRefine((value, context) => {
    if (value.priceAmount === null && !value.priceExplicitUnknown)
      context.addIssue({
        code: "custom",
        path: ["priceExplicitUnknown"],
        message: "Подтвердите, что цена неизвестна, или укажите цену.",
      });
  });

export const ingestionPreviewRequestSchema = z.strictObject({
  action: z.literal("preview"),
  url: z.string().max(2_048),
});

export const ingestionConfirmRequestSchema = z.strictObject({
  action: z.literal("confirm"),
  preview: z.unknown(),
  fields: manualConfirmationFieldsSchema,
});

export const userUrlIngestionRequestSchema = z.discriminatedUnion("action", [
  ingestionPreviewRequestSchema,
  ingestionConfirmRequestSchema,
]);

export type ManualConfirmationInput = z.infer<
  typeof manualConfirmationFieldsSchema
>;
