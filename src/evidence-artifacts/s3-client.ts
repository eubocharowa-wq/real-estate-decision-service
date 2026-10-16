import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";

const endpointSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, context) => {
    try {
      const endpoint = new URL(value);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username !== "" ||
        endpoint.password !== "" ||
        endpoint.pathname !== "/" ||
        endpoint.search !== "" ||
        endpoint.hash !== ""
      )
        throw new Error("invalid endpoint");
      return endpoint.origin;
    } catch {
      context.addIssue({
        code: "custom",
        message: "Expected a canonical HTTPS S3 endpoint origin",
      });
      return z.NEVER;
    }
  });

const s3ConfigSchema = z.strictObject({
  endpoint: endpointSchema,
  region: z.string().trim().min(1).max(128),
  bucket: z
    .string()
    .trim()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().min(1),
});

export interface S3EvidenceArtifactConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export type S3EvidenceArtifactCommand =
  | PutObjectCommand
  | HeadObjectCommand
  | GetObjectCommand
  | DeleteObjectCommand
  | ListObjectsV2Command;

export interface S3EvidenceArtifactClient {
  send(command: S3EvidenceArtifactCommand): Promise<unknown>;
}

export const parseS3EvidenceArtifactConfig = (
  input: S3EvidenceArtifactConfig,
): S3EvidenceArtifactConfig => {
  const parsed = s3ConfigSchema.safeParse(input);
  if (!parsed.success) throw new Error("EVIDENCE_ARTIFACT_S3_CONFIG_INVALID");
  return Object.freeze(parsed.data);
};

export const createS3EvidenceArtifactClient = (
  input: S3EvidenceArtifactConfig,
): S3EvidenceArtifactClient => {
  const config = parseS3EvidenceArtifactConfig(input);
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return Object.freeze({
    send: (command: S3EvidenceArtifactCommand): Promise<unknown> =>
      client.send(command as never) as Promise<unknown>,
  });
};

interface S3ProviderError {
  readonly name?: unknown;
  readonly $metadata?: { readonly httpStatusCode?: unknown };
}

const providerError = (error: unknown): S3ProviderError =>
  typeof error === "object" && error !== null ? (error as S3ProviderError) : {};

export const isS3NotFoundError = (error: unknown): boolean => {
  const candidate = providerError(error);
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
};

export const isS3ConflictError = (error: unknown): boolean => {
  const candidate = providerError(error);
  return (
    candidate.name === "PreconditionFailed" ||
    candidate.name === "ConditionalRequestConflict" ||
    candidate.$metadata?.httpStatusCode === 409 ||
    candidate.$metadata?.httpStatusCode === 412
  );
};
