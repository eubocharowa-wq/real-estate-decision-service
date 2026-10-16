import type { EvidenceArtifact } from "../domain/evidence-artifact/schema";
import { requestOwnerSchema, type RequestOwner } from "../expert/contracts";
import { canAccessSessionDocumentReference } from "../expert/opaque-reference-access";

const ACCESS_CONTEXT_BRAND = Symbol("evidence-artifact-access-context");

export type EvidenceArtifactAccessContext =
  | {
      readonly kind: "owner";
      readonly owner: RequestOwner;
      readonly [ACCESS_CONTEXT_BRAND]: true;
    }
  | {
      readonly kind: "trusted_internal";
      readonly principalType: "system" | "operator";
      readonly principalRef: string;
      readonly [ACCESS_CONTEXT_BRAND]: true;
    };

export interface EvidenceArtifactAccessDecision {
  readonly decision: "allow" | "deny";
  readonly reason:
    | "owner_reference_matches"
    | "trusted_internal"
    | "invalid_access_context"
    | "owner_reference_mismatch"
    | "access_scope_denied";
}

export interface EvidenceArtifactAccessPolicy {
  evaluate(input: {
    readonly artifact: EvidenceArtifact;
    readonly context: unknown;
  }): EvidenceArtifactAccessDecision;
}

const issueContext = <T extends object>(
  context: T,
): T & {
  readonly [ACCESS_CONTEXT_BRAND]: true;
} => {
  Object.defineProperty(context, ACCESS_CONTEXT_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(context) as T & {
    readonly [ACCESS_CONTEXT_BRAND]: true;
  };
};

export const createEvidenceArtifactOwnerContext = (
  ownerInput: RequestOwner,
): EvidenceArtifactAccessContext =>
  issueContext({
    kind: "owner" as const,
    owner: requestOwnerSchema.parse(ownerInput),
  });

export const createTrustedInternalEvidenceArtifactContext = (input: {
  readonly principalType: "system" | "operator";
  readonly principalRef: string;
}): EvidenceArtifactAccessContext => {
  const principalRef = input.principalRef.trim();
  if (!principalRef) throw new Error("INVALID_EVIDENCE_ARTIFACT_PRINCIPAL");
  return issueContext({
    kind: "trusted_internal" as const,
    principalType: input.principalType,
    principalRef,
  });
};

const isIssuedContext = (
  context: unknown,
): context is EvidenceArtifactAccessContext =>
  typeof context === "object" &&
  context !== null &&
  ACCESS_CONTEXT_BRAND in context &&
  (context as { readonly [ACCESS_CONTEXT_BRAND]?: unknown })[
    ACCESS_CONTEXT_BRAND
  ] === true;

export class DefaultEvidenceArtifactAccessPolicy implements EvidenceArtifactAccessPolicy {
  evaluate(input: {
    readonly artifact: EvidenceArtifact;
    readonly context: unknown;
  }): EvidenceArtifactAccessDecision {
    if (!isIssuedContext(input.context))
      return { decision: "deny", reason: "invalid_access_context" };

    if (input.artifact.access_scope === "private_owner") {
      if (
        input.context.kind === "owner" &&
        input.artifact.source_reference !== null &&
        canAccessSessionDocumentReference({
          owner: input.context.owner,
          documentRef: input.artifact.source_reference,
        })
      )
        return { decision: "allow", reason: "owner_reference_matches" };
      return { decision: "deny", reason: "owner_reference_mismatch" };
    }

    if (
      input.artifact.access_scope === "restricted_internal" &&
      input.context.kind === "trusted_internal"
    )
      return { decision: "allow", reason: "trusted_internal" };

    return { decision: "deny", reason: "access_scope_denied" };
  }
}
