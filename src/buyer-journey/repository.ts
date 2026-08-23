import type { FieldEvidence } from "../domain";
import type { NormalizedUserUrlCandidate } from "../user-url-ingestion";
import type { UserRequestParserResult } from "../user-request-parser";
import type {
  BuyerJourney,
  CanonicalDecisionOverlay,
  ComparisonState,
  ConfirmedRequestRecord,
  DecisionUpdate,
  MatchingBundle,
} from "./contracts";

export interface BuyerJourneyRepository {
  saveJourney(journey: BuyerJourney): void;
  getJourney(journeyId: string): BuyerJourney | null;
  saveParsedRequest(ref: string, result: UserRequestParserResult): void;
  getParsedRequest(ref: string): UserRequestParserResult | null;
  saveConfirmedRequest(record: ConfirmedRequestRecord): void;
  getConfirmedRequest(
    userRequestId: string,
    userRequestVersion: number,
  ): ConfirmedRequestRecord | null;
  saveMatchingBundle(bundle: MatchingBundle): void;
  getMatchingBundle(bundleId: string): MatchingBundle | null;
  markMatchingBundleStale(bundleId: string): void;
  saveComparison(comparison: ComparisonState): void;
  getComparison(comparisonId: string): ComparisonState | null;
  saveDecisionUpdate(update: DecisionUpdate): void;
  getDecisionUpdate(updateId: string): DecisionUpdate | null;
  saveImportedCandidate(candidate: NormalizedUserUrlCandidate): void;
  getImportedCandidate(ingestionId: string): NormalizedUserUrlCandidate | null;
  listImportedCandidates(
    journeyId: string,
  ): readonly NormalizedUserUrlCandidate[];
  attachImportedCandidate(journeyId: string, ingestionId: string): void;
  appendEvidence(evidence: FieldEvidence): void;
  listEvidence(): readonly FieldEvidence[];
  saveCanonicalOverlay(overlay: CanonicalDecisionOverlay): void;
  listCanonicalOverlays(): readonly CanonicalDecisionOverlay[];
}

const clone = <T>(value: T): T => structuredClone(value);
const confirmedKey = (id: string, version: number) => `${id}:${version}`;

export class InMemoryBuyerJourneyRepository implements BuyerJourneyRepository {
  private readonly journeys = new Map<string, BuyerJourney>();
  private readonly parsed = new Map<string, UserRequestParserResult>();
  private readonly confirmed = new Map<string, ConfirmedRequestRecord>();
  private readonly bundles = new Map<string, MatchingBundle>();
  private readonly comparisons = new Map<string, ComparisonState>();
  private readonly updates = new Map<string, DecisionUpdate>();
  private readonly imported = new Map<string, NormalizedUserUrlCandidate>();
  private readonly importsByJourney = new Map<string, Set<string>>();
  private readonly evidence = new Map<string, FieldEvidence>();
  private readonly overlays = new Map<string, CanonicalDecisionOverlay>();

  saveJourney(journey: BuyerJourney): void {
    this.journeys.set(journey.journey_id, clone(journey));
  }

  getJourney(journeyId: string): BuyerJourney | null {
    const value = this.journeys.get(journeyId);
    return value ? clone(value) : null;
  }

  saveParsedRequest(ref: string, result: UserRequestParserResult): void {
    this.parsed.set(ref, clone(result));
  }

  getParsedRequest(ref: string): UserRequestParserResult | null {
    const value = this.parsed.get(ref);
    return value ? clone(value) : null;
  }

  saveConfirmedRequest(record: ConfirmedRequestRecord): void {
    this.confirmed.set(
      confirmedKey(record.user_request_id, record.user_request_version),
      clone(record),
    );
  }

  getConfirmedRequest(
    userRequestId: string,
    userRequestVersion: number,
  ): ConfirmedRequestRecord | null {
    const value = this.confirmed.get(
      confirmedKey(userRequestId, userRequestVersion),
    );
    return value ? clone(value) : null;
  }

  saveMatchingBundle(bundle: MatchingBundle): void {
    this.bundles.set(bundle.matching_bundle_id, clone(bundle));
  }

  getMatchingBundle(bundleId: string): MatchingBundle | null {
    const value = this.bundles.get(bundleId);
    return value ? clone(value) : null;
  }

  markMatchingBundleStale(bundleId: string): void {
    const current = this.bundles.get(bundleId);
    if (current) this.bundles.set(bundleId, { ...clone(current), stale: true });
  }

  saveComparison(comparison: ComparisonState): void {
    this.comparisons.set(comparison.comparison_id, clone(comparison));
  }

  getComparison(comparisonId: string): ComparisonState | null {
    const value = this.comparisons.get(comparisonId);
    return value ? clone(value) : null;
  }

  saveDecisionUpdate(update: DecisionUpdate): void {
    this.updates.set(update.update_id, clone(update));
  }

  getDecisionUpdate(updateId: string): DecisionUpdate | null {
    const value = this.updates.get(updateId);
    return value ? clone(value) : null;
  }

  saveImportedCandidate(candidate: NormalizedUserUrlCandidate): void {
    this.imported.set(candidate.ingestionId, clone(candidate));
  }

  getImportedCandidate(ingestionId: string): NormalizedUserUrlCandidate | null {
    const value = this.imported.get(ingestionId);
    return value ? clone(value) : null;
  }

  listImportedCandidates(
    journeyId: string,
  ): readonly NormalizedUserUrlCandidate[] {
    return [...(this.importsByJourney.get(journeyId) ?? [])]
      .map((id) => this.imported.get(id))
      .filter((item): item is NormalizedUserUrlCandidate => Boolean(item))
      .map(clone);
  }

  attachImportedCandidate(journeyId: string, ingestionId: string): void {
    if (!this.imported.has(ingestionId))
      throw new Error("IMPORTED_CANDIDATE_NOT_FOUND");
    const ids = this.importsByJourney.get(journeyId) ?? new Set<string>();
    ids.add(ingestionId);
    this.importsByJourney.set(journeyId, ids);
  }

  appendEvidence(evidence: FieldEvidence): void {
    const current = this.evidence.get(evidence.evidence_id);
    if (current && JSON.stringify(current) !== JSON.stringify(evidence))
      throw new Error("EVIDENCE_ID_CONFLICT");
    this.evidence.set(evidence.evidence_id, clone(evidence));
  }

  listEvidence(): readonly FieldEvidence[] {
    return [...this.evidence.values()].map(clone);
  }

  saveCanonicalOverlay(overlay: CanonicalDecisionOverlay): void {
    const current = this.overlays.get(overlay.overlay_id);
    if (current && JSON.stringify(current) !== JSON.stringify(overlay))
      throw new Error("CANONICAL_OVERLAY_ID_CONFLICT");
    this.overlays.set(overlay.overlay_id, clone(overlay));
  }

  listCanonicalOverlays(): readonly CanonicalDecisionOverlay[] {
    return [...this.overlays.values()].map(clone);
  }
}
