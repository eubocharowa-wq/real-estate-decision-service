import type { Offer } from "../../domain";
import type { RetentionPolicy, SourceEnvironment } from "../source-registry";
import type { SourceAdapterMethod } from "./contracts";

/**
 * Everything about a collected source that is not the parsing of its pages.
 *
 * The pipeline used to name one source directly: the normalization function,
 * the seller, the attribution label and the policy contract were all written
 * for ВНЕШСТРОЙ. A second source cannot be added while any of that is a
 * literal, so each source now declares itself here and the pipeline stays
 * source-agnostic.
 */
export interface SourceCollectionContract {
  /** The method the adapter implements and the plan must select. */
  readonly method: SourceAdapterMethod;
  /** Environments the source may be collected in at all. */
  readonly environments: readonly SourceEnvironment[];
  /** Approval conditions the resolved plan must carry. */
  readonly requiredConditions: readonly string[];
  /** Upper bound on validated targets; a scoped PoC allows exactly one. */
  readonly maximumTargetUrls: number;
  /**
   * The retention the plan must resolve to, field for field. Declaring it per
   * source keeps the assertion exact instead of assuming every source is
   * transient-only.
   */
  readonly retention: RetentionPolicy;
}

export interface SourceNormalizationProfile {
  readonly sourceId: string;
  readonly adapterVersion: string;
  readonly normalizationVersion: string;
  /** Shown next to any fact from this source; must match the policy label. */
  readonly attributionLabel: string;
  readonly seller: Offer["seller"];
  readonly collectionContract: SourceCollectionContract;
}

export class SourceProfileRegistry {
  private readonly profiles: ReadonlyMap<string, SourceNormalizationProfile>;

  constructor(profiles: readonly SourceNormalizationProfile[]) {
    const ids = profiles.map((profile) => profile.sourceId);
    if (new Set(ids).size !== ids.length)
      throw new Error("Duplicate source normalization profile.");
    this.profiles = new Map(
      profiles.map((profile) => [profile.sourceId, profile]),
    );
  }

  get(sourceId: string): SourceNormalizationProfile | null {
    return this.profiles.get(sourceId) ?? null;
  }
}
