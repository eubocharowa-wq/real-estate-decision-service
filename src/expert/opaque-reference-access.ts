import type { RequestOwner } from "./contracts";

const DOCUMENT_REFERENCE_PREFIX = "document_ref" as const;

/**
 * Minimal no-storage access boundary for an already-issued opaque reference.
 * The reference carries only its session/anonymous owner namespace and an
 * opaque token; document content is neither accepted nor resolved here.
 */
export const canAccessSessionDocumentReference = (input: {
  readonly owner: RequestOwner;
  readonly documentRef: string;
}): boolean => {
  const prefix = `${DOCUMENT_REFERENCE_PREFIX}:${input.owner.owner_type}:${input.owner.owner_id}:`;
  if (!input.documentRef.startsWith(prefix)) return false;
  const opaqueToken = input.documentRef.slice(prefix.length);
  return /^[a-z][a-z0-9_-]*$/.test(opaqueToken);
};

export const createSessionDocumentReference = (
  owner: RequestOwner,
  opaqueToken: string,
): string => {
  if (!/^[a-z][a-z0-9_-]*$/.test(opaqueToken))
    throw new Error("INVALID_OPAQUE_DOCUMENT_TOKEN");
  return `${DOCUMENT_REFERENCE_PREFIX}:${owner.owner_type}:${owner.owner_id}:${opaqueToken}`;
};
