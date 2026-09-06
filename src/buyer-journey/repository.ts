import type { FieldEvidence } from "../domain";
import {
  runInMemoryTransaction,
  type TransactionalRepository,
} from "../persistence";
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

export interface BuyerJourneyRepository extends TransactionalRepository {
  saveJourney(journey: BuyerJourney): Promise<void>;
  getJourney(journeyId: string): Promise<BuyerJourney | null>;
  saveParsedRequest(
    ref: string,
    result: UserRequestParserResult,
  ): Promise<void>;
  getParsedRequest(ref: string): Promise<UserRequestParserResult | null>;
  saveConfirmedRequest(record: ConfirmedRequestRecord): Promise<void>;
  getConfirmedRequest(
    userRequestId: string,
    userRequestVersion: number,
  ): Promise<ConfirmedRequestRecord | null>;
  saveMatchingBundle(bundle: MatchingBundle): Promise<void>;
  getMatchingBundle(bundleId: string): Promise<MatchingBundle | null>;
  markMatchingBundleStale(bundleId: string): Promise<void>;
  saveComparison(comparison: ComparisonState): Promise<void>;
  getComparison(comparisonId: string): Promise<ComparisonState | null>;
  saveDecisionUpdate(update: DecisionUpdate): Promise<void>;
  getDecisionUpdate(updateId: string): Promise<DecisionUpdate | null>;
  saveImportedCandidate(candidate: NormalizedUserUrlCandidate): Promise<void>;
  getImportedCandidate(
    ingestionId: string,
  ): Promise<NormalizedUserUrlCandidate | null>;
  listImportedCandidates(
    journeyId: string,
  ): Promise<readonly NormalizedUserUrlCandidate[]>;
  attachImportedCandidate(
    journeyId: string,
    ingestionId: string,
  ): Promise<void>;
  appendEvidence(evidence: FieldEvidence): Promise<void>;
  listEvidence(): Promise<readonly FieldEvidence[]>;
  saveCanonicalOverlay(overlay: CanonicalDecisionOverlay): Promise<void>;
  listCanonicalOverlays(): Promise<readonly CanonicalDecisionOverlay[]>;
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

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return runInMemoryTransaction(work);
  }

  async saveJourney(journey: BuyerJourney): Promise<void> {
    this.journeys.set(journey.journey_id, clone(journey));
  }

  async getJourney(journeyId: string): Promise<BuyerJourney | null> {
    const value = this.journeys.get(journeyId);
    return value ? clone(value) : null;
  }

  async saveParsedRequest(
    ref: string,
    result: UserRequestParserResult,
  ): Promise<void> {
    this.parsed.set(ref, clone(result));
  }

  async getParsedRequest(ref: string): Promise<UserRequestParserResult | null> {
    const value = this.parsed.get(ref);
    return value ? clone(value) : null;
  }

  async saveConfirmedRequest(record: ConfirmedRequestRecord): Promise<void> {
    this.confirmed.set(
      confirmedKey(record.user_request_id, record.user_request_version),
      clone(record),
    );
  }

  async getConfirmedRequest(
    userRequestId: string,
    userRequestVersion: number,
  ): Promise<ConfirmedRequestRecord | null> {
    const value = this.confirmed.get(
      confirmedKey(userRequestId, userRequestVersion),
    );
    return value ? clone(value) : null;
  }

  async saveMatchingBundle(bundle: MatchingBundle): Promise<void> {
    this.bundles.set(bundle.matching_bundle_id, clone(bundle));
  }

  async getMatchingBundle(bundleId: string): Promise<MatchingBundle | null> {
    const value = this.bundles.get(bundleId);
    return value ? clone(value) : null;
  }

  async markMatchingBundleStale(bundleId: string): Promise<void> {
    const current = this.bundles.get(bundleId);
    if (current) this.bundles.set(bundleId, { ...clone(current), stale: true });
  }

  async saveComparison(comparison: ComparisonState): Promise<void> {
    this.comparisons.set(comparison.comparison_id, clone(comparison));
  }

  async getComparison(comparisonId: string): Promise<ComparisonState | null> {
    const value = this.comparisons.get(comparisonId);
    return value ? clone(value) : null;
  }

  async saveDecisionUpdate(update: DecisionUpdate): Promise<void> {
    this.updates.set(update.update_id, clone(update));
  }

  async getDecisionUpdate(updateId: string): Promise<DecisionUpdate | null> {
    const value = this.updates.get(updateId);
    return value ? clone(value) : null;
  }

  async saveImportedCandidate(
    candidate: NormalizedUserUrlCandidate,
  ): Promise<void> {
    this.imported.set(candidate.ingestionId, clone(candidate));
  }

  async getImportedCandidate(
    ingestionId: string,
  ): Promise<NormalizedUserUrlCandidate | null> {
    const value = this.imported.get(ingestionId);
    return value ? clone(value) : null;
  }

  async listImportedCandidates(
    journeyId: string,
  ): Promise<readonly NormalizedUserUrlCandidate[]> {
    return [...(this.importsByJourney.get(journeyId) ?? [])]
      .map((id) => this.imported.get(id))
      .filter((item): item is NormalizedUserUrlCandidate => Boolean(item))
      .map(clone);
  }

  async attachImportedCandidate(
    journeyId: string,
    ingestionId: string,
  ): Promise<void> {
    if (!this.imported.has(ingestionId))
      throw new Error("IMPORTED_CANDIDATE_NOT_FOUND");
    const ids = this.importsByJourney.get(journeyId) ?? new Set<string>();
    ids.add(ingestionId);
    this.importsByJourney.set(journeyId, ids);
  }

  async appendEvidence(evidence: FieldEvidence): Promise<void> {
    const current = this.evidence.get(evidence.evidence_id);
    if (current && JSON.stringify(current) !== JSON.stringify(evidence))
      throw new Error("EVIDENCE_ID_CONFLICT");
    this.evidence.set(evidence.evidence_id, clone(evidence));
  }

  async listEvidence(): Promise<readonly FieldEvidence[]> {
    return [...this.evidence.values()].map(clone);
  }

  async saveCanonicalOverlay(overlay: CanonicalDecisionOverlay): Promise<void> {
    const current = this.overlays.get(overlay.overlay_id);
    if (current && JSON.stringify(current) !== JSON.stringify(overlay))
      throw new Error("CANONICAL_OVERLAY_ID_CONFLICT");
    this.overlays.set(overlay.overlay_id, clone(overlay));
  }

  async listCanonicalOverlays(): Promise<readonly CanonicalDecisionOverlay[]> {
    return [...this.overlays.values()].map(clone);
  }
}
