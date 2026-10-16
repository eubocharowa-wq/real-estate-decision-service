import type { PilotApplicationMode } from "../pilot-hardening/config";
import {
  InMemoryEvidenceArtifactBlobStore,
  type EvidenceArtifactBlobCapabilities,
  type EvidenceArtifactBlobStore,
} from "./blob-store";
import type { EvidenceArtifactBlobInventory } from "./orphan-reconciliation";
import { S3EvidenceArtifactBlobInventory } from "./s3-blob-inventory";
import { S3EvidenceArtifactBlobStore } from "./s3-blob-store";
import {
  createS3EvidenceArtifactClient,
  type S3EvidenceArtifactClient,
  type S3EvidenceArtifactConfig,
} from "./s3-client";
import { VercelPrivateEvidenceArtifactBlobInventory } from "./vercel-private-blob-inventory";
import { VercelPrivateEvidenceArtifactBlobStore } from "./vercel-private-blob-store";

export type EvidenceArtifactRuntimeMode = PilotApplicationMode | "test";

export interface EvidenceArtifactBlobRuntime {
  readonly mode: EvidenceArtifactRuntimeMode;
  readonly capabilities: EvidenceArtifactBlobCapabilities;
  readonly blobStore: EvidenceArtifactBlobStore;
  readonly inventory: EvidenceArtifactBlobInventory | null;
}

export interface EvidenceArtifactBlobRuntimeEnvironment {
  readonly [key: string]: string | undefined;
  readonly NODE_ENV?: string;
  readonly REDS_APPLICATION_MODE?: string;
  readonly REDS_EVIDENCE_BLOB_PROVIDER?: string;
  readonly REDS_EVIDENCE_S3_ENDPOINT?: string;
  readonly REDS_EVIDENCE_S3_REGION?: string;
  readonly REDS_EVIDENCE_S3_BUCKET?: string;
  readonly REDS_EVIDENCE_S3_DATA_RESIDENCY?: string;
  readonly REDS_EVIDENCE_S3_ACCESS_KEY_ID?: string;
  readonly REDS_EVIDENCE_S3_SECRET_ACCESS_KEY?: string;
}

export interface EvidenceArtifactBlobRuntimeTestSeams {
  readonly s3Client?: S3EvidenceArtifactClient;
  readonly vercelBlobStore?: EvidenceArtifactBlobStore;
  readonly vercelInventory?: EvidenceArtifactBlobInventory;
}

const resolveMode = (
  environment: EvidenceArtifactBlobRuntimeEnvironment,
): EvidenceArtifactRuntimeMode => {
  if (environment.NODE_ENV === "test") return "test";
  const mode = environment.REDS_APPLICATION_MODE?.trim() || "demo";
  if (mode === "demo" || mode === "pilot" || mode === "production") return mode;
  throw new Error("EVIDENCE_ARTIFACT_APPLICATION_MODE_INVALID");
};

const s3ConfigFromEnvironment = (
  environment: EvidenceArtifactBlobRuntimeEnvironment,
): S3EvidenceArtifactConfig => {
  const dataResidency = environment.REDS_EVIDENCE_S3_DATA_RESIDENCY;
  if (dataResidency !== "RU" && dataResidency !== "NON_RU")
    throw new Error("EVIDENCE_ARTIFACT_S3_CONFIG_INVALID");
  return {
    endpoint: environment.REDS_EVIDENCE_S3_ENDPOINT ?? "",
    region: environment.REDS_EVIDENCE_S3_REGION ?? "",
    bucket: environment.REDS_EVIDENCE_S3_BUCKET ?? "",
    dataResidency,
    accessKeyId: environment.REDS_EVIDENCE_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: environment.REDS_EVIDENCE_S3_SECRET_ACCESS_KEY ?? "",
  };
};

export const resolveEvidenceArtifactBlobRuntime = (
  environment: EvidenceArtifactBlobRuntimeEnvironment = process.env,
  seams: EvidenceArtifactBlobRuntimeTestSeams = {},
): EvidenceArtifactBlobRuntime => {
  const mode = resolveMode(environment);
  const configuredProvider = environment.REDS_EVIDENCE_BLOB_PROVIDER?.trim();
  const provider =
    configuredProvider ||
    (mode === "demo" || mode === "test" ? "memory" : null);

  if (provider === null)
    throw new Error("EVIDENCE_ARTIFACT_BLOB_PROVIDER_REQUIRED");
  if (provider !== "s3" && provider !== "vercel" && provider !== "memory")
    throw new Error("EVIDENCE_ARTIFACT_BLOB_PROVIDER_INVALID");
  if (provider === "memory" && (mode === "pilot" || mode === "production"))
    throw new Error("EVIDENCE_ARTIFACT_BLOB_PROVIDER_DENIED");

  if (provider === "memory") {
    const blobStore = new InMemoryEvidenceArtifactBlobStore();
    return Object.freeze({
      mode,
      capabilities: blobStore.capabilities,
      blobStore,
      inventory: null,
    });
  }

  if (provider === "vercel") {
    const blobStore =
      seams.vercelBlobStore ?? new VercelPrivateEvidenceArtifactBlobStore();
    if (
      blobStore.capabilities.provider !== "vercel" ||
      blobStore.capabilities.dataResidency !== "NON_RU"
    )
      throw new Error("EVIDENCE_ARTIFACT_BLOB_CAPABILITY_MISMATCH");
    return Object.freeze({
      mode,
      capabilities: blobStore.capabilities,
      blobStore,
      inventory:
        seams.vercelInventory ??
        new VercelPrivateEvidenceArtifactBlobInventory(),
    });
  }

  const config = s3ConfigFromEnvironment(environment);
  const client = seams.s3Client ?? createS3EvidenceArtifactClient(config);
  const blobStore = new S3EvidenceArtifactBlobStore(config, client);
  return Object.freeze({
    mode,
    capabilities: blobStore.capabilities,
    blobStore,
    inventory: new S3EvidenceArtifactBlobInventory(config, client),
  });
};
