import { z } from "zod";

import type { RegistrySourceIdentification } from "./contracts";
import {
  sourceRegistryConfigSchema,
  type SourceRegistryConfig,
  type SourceRegistryEntry,
} from "./schema";

const forbiddenSecretKeys = new Set([
  "api_key",
  "apikey",
  "password",
  "token",
  "cookie",
  "secret",
  "client_secret",
]);

const findForbiddenSecretKey = (
  value: unknown,
  path = "registry",
): string | null => {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findForbiddenSecretKey(item, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenSecretKeys.has(key.toLowerCase())) return `${path}.${key}`;
    const found = findForbiddenSecretKey(item, `${path}.${key}`);
    if (found) return found;
  }
  return null;
};

export const normalizeRegistryHostname = (hostname: string): string => {
  const input = hostname.trim().replace(/\.$/, "");
  const parsed = new URL(`https://${input}`);
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !parsed.hostname
  )
    throw new Error(`Invalid source domain: ${hostname}`);
  return parsed.hostname.toLowerCase();
};

const allProductionGatesPassed = (entry: SourceRegistryEntry): boolean =>
  Object.values(entry.production_gate).every(Boolean);

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
  return value;
};

export const validateSourceRegistryConfig = (
  input: unknown,
): SourceRegistryConfig => {
  const parsed = sourceRegistryConfigSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid source registry: ${z.prettifyError(parsed.error)}`,
    );
  const config = parsed.data;
  const ids = new Set<string>();
  const owners = new Map<
    string,
    { sourceId: string; sharedRule: string | null }
  >();
  for (const entry of config.sources) {
    if (ids.has(entry.source_id))
      throw new Error(`Duplicate source_id: ${entry.source_id}`);
    ids.add(entry.source_id);
    for (const domain of entry.domains) {
      const hostname = normalizeRegistryHostname(domain.hostname);
      const owner = owners.get(hostname);
      if (
        owner &&
        owner.sourceId !== entry.source_id &&
        (!owner.sharedRule || owner.sharedRule !== domain.shared_ownership_rule)
      )
        throw new Error(
          `Duplicate domain ownership without explicit rule: ${hostname}`,
        );
      owners.set(hostname, {
        sourceId: entry.source_id,
        sharedRule: domain.shared_ownership_rule,
      });
    }
    const hasProductionApprovalSignal =
      entry.environment_approval.production.status === "approved" ||
      entry.approval_lifecycle === "production_approved" ||
      entry.production_gate.production_approved;
    if (
      hasProductionApprovalSignal &&
      (entry.environment_approval.production.status !== "approved" ||
        entry.approval_lifecycle !== "production_approved" ||
        !allProductionGatesPassed(entry))
    )
      throw new Error(
        `Production approval is incomplete for source: ${entry.source_id}`,
      );
  }
  const secretPath = findForbiddenSecretKey(config);
  if (secretPath)
    throw new Error(
      `Source registry must contain credential references, not secrets: ${secretPath}`,
    );
  return config;
};

interface DomainCandidate {
  readonly entry: SourceRegistryEntry;
  readonly domain: string;
  readonly matchType: "exact" | "subdomain";
}

export class SourceRegistry {
  readonly config: SourceRegistryConfig;
  private readonly sourceById: ReadonlyMap<string, SourceRegistryEntry>;

  constructor(input: unknown) {
    this.config = deepFreeze(validateSourceRegistryConfig(input));
    this.sourceById = new Map(
      this.config.sources.map((entry) => [entry.source_id, entry]),
    );
  }

  list(): readonly SourceRegistryEntry[] {
    return this.config.sources;
  }

  get(sourceId: string | null): SourceRegistryEntry | null {
    return sourceId ? (this.sourceById.get(sourceId) ?? null) : null;
  }

  identify(input: string | URL): RegistrySourceIdentification {
    let hostname: string;
    try {
      const url = input instanceof URL ? input : new URL(input);
      hostname = normalizeRegistryHostname(url.hostname);
    } catch {
      return {
        status: "invalid_url",
        hostname: null,
        sourceId: null,
        sourceType: "other",
        matchType: "unknown",
        matchedDomain: null,
        registryVersion: this.config.registry_version,
      };
    }
    const candidates: DomainCandidate[] = [];
    for (const entry of this.config.sources) {
      for (const rule of entry.domains) {
        const domain = normalizeRegistryHostname(rule.hostname);
        if (hostname === domain)
          candidates.push({ entry, domain, matchType: "exact" });
        else if (rule.include_subdomains && hostname.endsWith(`.${domain}`))
          candidates.push({ entry, domain, matchType: "subdomain" });
      }
    }
    candidates.sort(
      (left, right) =>
        Number(right.matchType === "exact") -
          Number(left.matchType === "exact") ||
        right.domain.length - left.domain.length ||
        left.entry.source_id.localeCompare(right.entry.source_id),
    );
    const matched = candidates[0];
    return matched
      ? {
          status: "known",
          hostname,
          sourceId: matched.entry.source_id,
          sourceType: matched.entry.source_type,
          matchType: matched.matchType,
          matchedDomain: matched.domain,
          registryVersion: this.config.registry_version,
        }
      : {
          status: "unknown",
          hostname,
          sourceId: null,
          sourceType: "other",
          matchType: "unknown",
          matchedDomain: null,
          registryVersion: this.config.registry_version,
        };
  }
}
