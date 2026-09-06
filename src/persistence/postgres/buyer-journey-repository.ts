import { sql } from "kysely";

import type {
  BuyerJourney,
  CanonicalDecisionOverlay,
  ComparisonState,
  ConfirmedRequestRecord,
  DecisionUpdate,
  MatchingBundle,
  MatchingBundleEntry,
} from "../../buyer-journey/contracts";
import type { BuyerJourneyRepository } from "../../buyer-journey/repository";
import { fieldEvidenceSchema, type FieldEvidence } from "../../domain";
import {
  parseNormalizedUserUrlCandidate,
  type NormalizedUserUrlCandidate,
} from "../../user-url-ingestion";
import {
  userRequestParserResultSchema,
  type UserRequestParserResult,
} from "../../user-request-parser";
import type { PostgresContext } from "./context";
import {
  buyerJourneyDocumentSchema,
  canonicalOverlayDocumentSchema,
  comparisonDocumentSchema,
  comparisonItemSchema,
  confirmedRequestDocumentSchema,
  dataQualityEngineResultSchema,
  decisionMetricSnapshotSchema,
  decisionUpdateDocumentSchema,
  matchingBundleDocumentSchema,
  matchingEngineResultSchema,
  parseStored,
} from "./documents";
import { withMappedErrors } from "./errors";

/**
 * PostgreSQL BuyerJourneyRepository.
 *
 * Aggregates are stored as a jsonb `document` plus the typed columns the
 * schema constrains and queries on. Child collections (bundle entries,
 * comparison items, decision metrics) are rows rather than nested JSON so the
 * database can enforce their constraints; the parent document therefore omits
 * them and they are reassembled on read.
 */
export class PostgresBuyerJourneyRepository implements BuyerJourneyRepository {
  constructor(private readonly context: PostgresContext) {}

  private get db() {
    return this.context.executor;
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return withMappedErrors(() => this.context.transaction(work));
  }

  saveJourney(journey: BuyerJourney): Promise<void> {
    return withMappedErrors(async () => {
      const row = {
        journey_id: journey.journey_id,
        schema_version: journey.schema_version,
        session_id: journey.session_id,
        raw_request_text: journey.raw_request_text,
        parsed_request_ref: journey.parsed_request_ref,
        confirmed_user_request_id: journey.confirmed_user_request_id,
        confirmed_user_request_version: journey.confirmed_user_request_version,
        current_stage: journey.current_stage,
        shortlist_status: journey.shortlist_state.status,
        shortlist_matching_bundle_id:
          journey.shortlist_state.matching_bundle_id,
        selected_property_id: journey.selected_property_id,
        selected_offer_id: journey.selected_offer_id,
        selected_purchase_scenario_id: journey.selected_purchase_scenario_id,
        comparison_id: journey.comparison_id,
        active_expert_request_id: journey.active_expert_request_id,
        latest_decision_update_id: journey.latest_decision_update_id,
        recoverable_error: journey.recoverable_error,
        last_recompute_at: journey.last_recompute_at,
        document: journey,
        created_at: journey.created_at,
        updated_at: journey.updated_at,
      };
      await this.db
        .insertInto("buyer_journeys")
        .values(row)
        .onConflict((conflict) =>
          conflict.column("journey_id").doUpdateSet({
            parsed_request_ref: row.parsed_request_ref,
            confirmed_user_request_id: row.confirmed_user_request_id,
            confirmed_user_request_version: row.confirmed_user_request_version,
            current_stage: row.current_stage,
            shortlist_status: row.shortlist_status,
            shortlist_matching_bundle_id: row.shortlist_matching_bundle_id,
            selected_property_id: row.selected_property_id,
            selected_offer_id: row.selected_offer_id,
            selected_purchase_scenario_id: row.selected_purchase_scenario_id,
            comparison_id: row.comparison_id,
            active_expert_request_id: row.active_expert_request_id,
            latest_decision_update_id: row.latest_decision_update_id,
            recoverable_error: row.recoverable_error,
            last_recompute_at: row.last_recompute_at,
            document: row.document,
            updated_at: row.updated_at,
          }),
        )
        .execute();
    });
  }

  getJourney(journeyId: string): Promise<BuyerJourney | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("buyer_journeys")
        .select("document")
        .where("journey_id", "=", journeyId)
        .executeTakeFirst();
      if (!row) return null;
      return parseStored(
        buyerJourneyDocumentSchema,
        row.document,
        `buyer_journeys:${journeyId}`,
      ) as BuyerJourney;
    });
  }

  saveParsedRequest(
    ref: string,
    result: UserRequestParserResult,
  ): Promise<void> {
    return withMappedErrors(async () => {
      await this.db
        .insertInto("parsed_requests")
        .values({
          parsed_request_ref: ref,
          journey_id: null,
          parser_version: result.parser_version,
          document: result,
        })
        .onConflict((conflict) =>
          conflict.column("parsed_request_ref").doUpdateSet({
            parser_version: result.parser_version,
            document: result,
          }),
        )
        .execute();
    });
  }

  getParsedRequest(ref: string): Promise<UserRequestParserResult | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("parsed_requests")
        .select("document")
        .where("parsed_request_ref", "=", ref)
        .executeTakeFirst();
      if (!row) return null;
      return parseStored(
        userRequestParserResultSchema,
        row.document,
        `parsed_requests:${ref}`,
      );
    });
  }

  saveConfirmedRequest(record: ConfirmedRequestRecord): Promise<void> {
    return withMappedErrors(async () => {
      await this.db
        .insertInto("confirmed_requests")
        .values({
          user_request_id: record.user_request_id,
          user_request_version: record.user_request_version,
          record_version: record.record_version,
          supersedes_version: record.supersedes_version,
          confirmed_at: record.confirmed_at,
          document: record,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["user_request_id", "user_request_version"])
            .doUpdateSet({
              record_version: record.record_version,
              supersedes_version: record.supersedes_version,
              confirmed_at: record.confirmed_at,
              document: record,
            }),
        )
        .execute();
    });
  }

  getConfirmedRequest(
    userRequestId: string,
    userRequestVersion: number,
  ): Promise<ConfirmedRequestRecord | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("confirmed_requests")
        .select("document")
        .where("user_request_id", "=", userRequestId)
        .where("user_request_version", "=", userRequestVersion)
        .executeTakeFirst();
      if (!row) return null;
      return parseStored(
        confirmedRequestDocumentSchema,
        row.document,
        `confirmed_requests:${userRequestId}:${userRequestVersion}`,
      ) as ConfirmedRequestRecord;
    });
  }

  saveMatchingBundle(bundle: MatchingBundle): Promise<void> {
    return withMappedErrors(async () => {
      // Parent and children move together, so an interrupted write cannot
      // leave a bundle without its entries.
      await this.context.transaction(async () => {
        const { entries, ...header } = bundle;
        await this.db
          .insertInto("matching_bundles")
          .values({
            matching_bundle_id: bundle.matching_bundle_id,
            schema_version: bundle.schema_version,
            user_request_id: bundle.user_request_id,
            user_request_version: bundle.user_request_version,
            generated_at: bundle.generated_at,
            matching_algorithm_version: bundle.matching_algorithm_version,
            confidence_algorithm_version: bundle.confidence_algorithm_version,
            criteria_registry_version: bundle.criteria_registry_version,
            dataset_id: bundle.dataset_snapshot.dataset_id,
            dataset_version: bundle.dataset_snapshot.dataset_version,
            dataset_type: bundle.dataset_snapshot.dataset_type,
            partial: bundle.partial,
            stale: bundle.stale,
            supersedes_bundle_id: bundle.supersedes_bundle_id,
            document: header,
          })
          .onConflict((conflict) =>
            conflict.column("matching_bundle_id").doUpdateSet({
              stale: bundle.stale,
              partial: bundle.partial,
              document: header,
            }),
          )
          .execute();

        await this.db
          .deleteFrom("matching_bundle_entries")
          .where("matching_bundle_id", "=", bundle.matching_bundle_id)
          .execute();
        if (entries.length === 0) return;
        await this.db
          .insertInto("matching_bundle_entries")
          .values(
            entries.map((entry) => ({
              matching_bundle_id: bundle.matching_bundle_id,
              property_id: entry.property_id,
              selected_offer_id: entry.selected_offer_id,
              selected_purchase_scenario_id:
                entry.selected_purchase_scenario_id,
              origin: entry.origin,
              eligibility_status: entry.match.match_result.eligibility_status,
              match_result_id: entry.match.match_result.match_result_id,
              match_score: entry.match.match_result.match_score,
              data_quality_id:
                entry.data_quality?.data_quality.data_quality_id ?? null,
              data_confidence_score:
                entry.data_quality?.data_quality.data_confidence_score ?? null,
              data_completeness_score:
                entry.data_quality?.data_quality.data_completeness_score ??
                null,
              critical_unknown_count:
                entry.data_quality?.critical_unknowns.length ?? 0,
              match_document: entry.match,
              data_quality_document: entry.data_quality,
            })),
          )
          .execute();
      });
    });
  }

  getMatchingBundle(bundleId: string): Promise<MatchingBundle | null> {
    return withMappedErrors(async () => {
      const header = await this.db
        .selectFrom("matching_bundles")
        .select(["document", "stale"])
        .where("matching_bundle_id", "=", bundleId)
        .executeTakeFirst();
      if (!header) return null;
      const parsedHeader = parseStored(
        matchingBundleDocumentSchema,
        header.document,
        `matching_bundles:${bundleId}`,
      );
      const entryRows = await this.db
        .selectFrom("matching_bundle_entries")
        .select([
          "property_id",
          "selected_offer_id",
          "selected_purchase_scenario_id",
          "origin",
          "match_document",
          "data_quality_document",
        ])
        .where("matching_bundle_id", "=", bundleId)
        .orderBy("property_id")
        .execute();

      const entries: MatchingBundleEntry[] = entryRows.map((row) => ({
        property_id: row.property_id,
        selected_offer_id: row.selected_offer_id,
        selected_purchase_scenario_id: row.selected_purchase_scenario_id,
        origin: row.origin as MatchingBundleEntry["origin"],
        match: parseStored(
          matchingEngineResultSchema,
          row.match_document,
          `matching_bundle_entries:${bundleId}:${row.property_id}:match`,
        ) as unknown as MatchingBundleEntry["match"],
        data_quality:
          row.data_quality_document === null
            ? null
            : (parseStored(
                dataQualityEngineResultSchema,
                row.data_quality_document,
                `matching_bundle_entries:${bundleId}:${row.property_id}:data_quality`,
              ) as unknown as NonNullable<MatchingBundleEntry["data_quality"]>),
      }));

      // `stale` is a column so it can be flipped without rewriting the
      // document; the column is the truth when the two disagree.
      return {
        ...parsedHeader,
        stale: header.stale,
        entries,
      } as MatchingBundle;
    });
  }

  markMatchingBundleStale(bundleId: string): Promise<void> {
    return withMappedErrors(async () => {
      await this.db
        .updateTable("matching_bundles")
        .set({
          stale: true,
          document: sql`jsonb_set(document, '{stale}', 'true'::jsonb)`,
        })
        .where("matching_bundle_id", "=", bundleId)
        .execute();
    });
  }

  saveComparison(comparison: ComparisonState): Promise<void> {
    return withMappedErrors(async () => {
      await this.context.transaction(async () => {
        const { items, ...header } = comparison;
        await this.db
          .insertInto("comparisons")
          .values({
            comparison_id: comparison.comparison_id,
            schema_version: comparison.schema_version,
            journey_id: comparison.journey_id,
            user_request_id: comparison.user_request_id,
            user_request_version: comparison.user_request_version,
            version: comparison.version,
            status: comparison.status,
            document: header,
            created_at: comparison.created_at,
            updated_at: comparison.updated_at,
          })
          .onConflict((conflict) =>
            conflict.column("comparison_id").doUpdateSet({
              version: comparison.version,
              status: comparison.status,
              document: header,
              updated_at: comparison.updated_at,
            }),
          )
          .execute();

        await this.db
          .deleteFrom("comparison_items")
          .where("comparison_id", "=", comparison.comparison_id)
          .execute();
        if (items.length === 0) return;
        await this.db
          .insertInto("comparison_items")
          .values(
            items.map((item, index) => ({
              comparison_id: comparison.comparison_id,
              property_id: item.property_id,
              offer_id: item.offer_id,
              purchase_scenario_id: item.purchase_scenario_id,
              matching_bundle_id: item.matching_bundle_id,
              position: index,
            })),
          )
          .execute();
      });
    });
  }

  getComparison(comparisonId: string): Promise<ComparisonState | null> {
    return withMappedErrors(async () => {
      const header = await this.db
        .selectFrom("comparisons")
        .select(["document", "status"])
        .where("comparison_id", "=", comparisonId)
        .executeTakeFirst();
      if (!header) return null;
      const parsedHeader = parseStored(
        comparisonDocumentSchema,
        header.document,
        `comparisons:${comparisonId}`,
      );
      const itemRows = await this.db
        .selectFrom("comparison_items")
        .select([
          "property_id",
          "offer_id",
          "purchase_scenario_id",
          "matching_bundle_id",
        ])
        .where("comparison_id", "=", comparisonId)
        .orderBy("position")
        .execute();
      return {
        ...parsedHeader,
        status: header.status as ComparisonState["status"],
        items: itemRows.map((row) =>
          parseStored(
            comparisonItemSchema,
            row,
            `comparison_items:${comparisonId}:${row.property_id}`,
          ),
        ),
      } as ComparisonState;
    });
  }

  saveDecisionUpdate(update: DecisionUpdate): Promise<void> {
    return withMappedErrors(async () => {
      await this.context.transaction(async () => {
        const { previous_results, new_results, ...header } = update;
        await this.db
          .insertInto("decision_updates")
          .values({
            update_id: update.update_id,
            schema_version: update.schema_version,
            journey_id: update.journey_id,
            trigger_type: update.trigger_type,
            trigger_ref: update.trigger_ref,
            previous_matching_bundle_id: update.previous_matching_bundle_id,
            new_matching_bundle_id: update.new_matching_bundle_id,
            status: update.status,
            error_code: update.error_code,
            document: header,
            created_at: update.created_at,
          })
          .onConflict((conflict) =>
            conflict.column("update_id").doUpdateSet({
              status: update.status,
              error_code: update.error_code,
              document: header,
            }),
          )
          .execute();

        await this.db
          .deleteFrom("decision_metric_snapshots")
          .where("update_id", "=", update.update_id)
          .execute();
        const rows = [
          ...previous_results.map((metric) => ({ phase: "previous", metric })),
          ...new_results.map((metric) => ({ phase: "new", metric })),
        ];
        if (rows.length === 0) return;
        await this.db
          .insertInto("decision_metric_snapshots")
          .values(
            rows.map(({ phase, metric }) => ({
              update_id: update.update_id,
              phase,
              property_id: metric.property_id,
              match_result_id: metric.match_result_id,
              match_result_ref: metric.match_result_ref,
              match_score: metric.match_score,
              eligibility_status: metric.eligibility_status,
              data_quality_id: metric.data_quality_id,
              data_quality_ref: metric.data_quality_ref,
              data_confidence_score: metric.data_confidence_score,
              data_completeness_score: metric.data_completeness_score,
              critical_unknowns: [...metric.critical_unknowns],
            })),
          )
          .execute();
      });
    });
  }

  getDecisionUpdate(updateId: string): Promise<DecisionUpdate | null> {
    return withMappedErrors(async () => {
      const header = await this.db
        .selectFrom("decision_updates")
        .select("document")
        .where("update_id", "=", updateId)
        .executeTakeFirst();
      if (!header) return null;
      const parsedHeader = parseStored(
        decisionUpdateDocumentSchema,
        header.document,
        `decision_updates:${updateId}`,
      );
      const metrics = await this.db
        .selectFrom("decision_metric_snapshots")
        .selectAll()
        .where("update_id", "=", updateId)
        .orderBy("property_id")
        .execute();

      const byPhase = (phase: string) =>
        metrics
          .filter((row) => row.phase === phase)
          .map((row) =>
            parseStored(
              decisionMetricSnapshotSchema,
              {
                property_id: row.property_id,
                match_result_id: row.match_result_id,
                match_result_ref: row.match_result_ref,
                match_score: Number(row.match_score),
                eligibility_status: row.eligibility_status,
                data_quality_id: row.data_quality_id,
                data_quality_ref: row.data_quality_ref,
                data_confidence_score:
                  row.data_confidence_score === null
                    ? null
                    : Number(row.data_confidence_score),
                data_completeness_score:
                  row.data_completeness_score === null
                    ? null
                    : Number(row.data_completeness_score),
                critical_unknowns: row.critical_unknowns,
              },
              `decision_metric_snapshots:${updateId}:${row.property_id}`,
            ),
          );

      return {
        ...parsedHeader,
        previous_results: byPhase("previous"),
        new_results: byPhase("new"),
      } as DecisionUpdate;
    });
  }

  saveImportedCandidate(candidate: NormalizedUserUrlCandidate): Promise<void> {
    return withMappedErrors(async () => {
      await this.db
        .insertInto("imported_candidates")
        .values({
          ingestion_id: candidate.ingestionId,
          property_id: candidate.propertyCandidate.identity.property_id,
          offer_id: candidate.offerCandidate.offer_id,
          source_id: candidate.source.source_id,
          source_mode: candidate.sourceMode,
          matching_readiness: candidate.matchingReadiness.status,
          document: candidate,
        })
        .onConflict((conflict) =>
          conflict.column("ingestion_id").doUpdateSet({ document: candidate }),
        )
        .execute();
    });
  }

  getImportedCandidate(
    ingestionId: string,
  ): Promise<NormalizedUserUrlCandidate | null> {
    return withMappedErrors(async () => {
      const row = await this.db
        .selectFrom("imported_candidates")
        .select("document")
        .where("ingestion_id", "=", ingestionId)
        .executeTakeFirst();
      if (!row) return null;
      const candidate = parseNormalizedUserUrlCandidate(row.document);
      if (!candidate)
        throw new Error(
          `CORRUPTED_STORED_DOCUMENT:imported_candidates:${ingestionId}`,
        );
      return candidate;
    });
  }

  listImportedCandidates(
    journeyId: string,
  ): Promise<readonly NormalizedUserUrlCandidate[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("journey_imported_candidates")
        .innerJoin(
          "imported_candidates",
          "imported_candidates.ingestion_id",
          "journey_imported_candidates.ingestion_id",
        )
        .select(["imported_candidates.ingestion_id", "document"])
        .where("journey_imported_candidates.journey_id", "=", journeyId)
        .orderBy("journey_imported_candidates.attached_at")
        .orderBy("imported_candidates.ingestion_id")
        .execute();
      return rows.map((row) => {
        const candidate = parseNormalizedUserUrlCandidate(row.document);
        if (!candidate)
          throw new Error(
            `CORRUPTED_STORED_DOCUMENT:imported_candidates:${row.ingestion_id}`,
          );
        return candidate;
      });
    });
  }

  attachImportedCandidate(
    journeyId: string,
    ingestionId: string,
  ): Promise<void> {
    return withMappedErrors(async () => {
      // The foreign key does the existence check the in-memory repository does
      // by hand, and the error mapping turns it back into the same code.
      await this.db
        .insertInto("journey_imported_candidates")
        .values({ journey_id: journeyId, ingestion_id: ingestionId })
        .onConflict((conflict) =>
          conflict.columns(["journey_id", "ingestion_id"]).doNothing(),
        )
        .execute();
    });
  }

  appendEvidence(evidence: FieldEvidence): Promise<void> {
    return withMappedErrors(async () => {
      // Evidence is append-only and idempotent: re-appending the identical
      // record is a no-op, a different record under the same id is a conflict.
      const existing = await this.db
        .selectFrom("field_evidence")
        .select("document")
        .where("evidence_id", "=", evidence.evidence_id)
        .executeTakeFirst();
      if (existing) {
        if (stableStringify(existing.document) !== stableStringify(evidence))
          throw new Error("EVIDENCE_ID_CONFLICT");
        return;
      }
      await this.db
        .insertInto("field_evidence")
        .values({
          evidence_id: evidence.evidence_id,
          schema_version: evidence.schema_version,
          entity_type: evidence.entity_type,
          entity_id: evidence.entity_id,
          field: evidence.field,
          value: evidence.value,
          raw_value: evidence.raw_value,
          source_id: evidence.source_id,
          snapshot_id: evidence.snapshot_id,
          source_url: evidence.source_url,
          collected_at: evidence.collected_at,
          verification_status: evidence.verification_status,
          freshness_status: evidence.freshness_status,
          extraction_confidence: evidence.extraction_confidence,
          evidence_type: evidence.evidence_type,
          evidence_text: evidence.evidence_text,
          evidence_reference: evidence.evidence_reference,
          document: evidence,
        })
        .execute();
    });
  }

  listEvidence(): Promise<readonly FieldEvidence[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("field_evidence")
        .select(["evidence_id", "document"])
        .orderBy("evidence_id")
        .execute();
      return rows.map((row) =>
        parseStored(
          fieldEvidenceSchema,
          row.document,
          `field_evidence:${row.evidence_id}`,
        ),
      );
    });
  }

  saveCanonicalOverlay(overlay: CanonicalDecisionOverlay): Promise<void> {
    return withMappedErrors(async () => {
      const existing = await this.db
        .selectFrom("canonical_decision_overlays")
        .selectAll()
        .where("overlay_id", "=", overlay.overlay_id)
        .executeTakeFirst();
      if (existing) {
        const stored = {
          overlay_id: existing.overlay_id,
          entity_type: existing.entity_type,
          entity_id: existing.entity_id,
          field: existing.field,
          value: existing.value,
          verification_status: existing.verification_status,
          evidence_id: existing.evidence_id,
          created_at: toIsoString(existing.created_at),
        };
        if (stableStringify(stored) !== stableStringify(overlay))
          throw new Error("CANONICAL_OVERLAY_ID_CONFLICT");
        return;
      }
      await this.db
        .insertInto("canonical_decision_overlays")
        .values({
          overlay_id: overlay.overlay_id,
          entity_type: overlay.entity_type,
          entity_id: overlay.entity_id,
          field: overlay.field,
          value: overlay.value,
          verification_status: overlay.verification_status,
          evidence_id: overlay.evidence_id,
          created_at: overlay.created_at,
        })
        .execute();
    });
  }

  listCanonicalOverlays(): Promise<readonly CanonicalDecisionOverlay[]> {
    return withMappedErrors(async () => {
      const rows = await this.db
        .selectFrom("canonical_decision_overlays")
        .selectAll()
        .orderBy("created_at")
        .orderBy("overlay_id")
        .execute();
      return rows.map((row) =>
        parseStored(
          canonicalOverlayDocumentSchema,
          {
            overlay_id: row.overlay_id,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            field: row.field,
            value: row.value,
            verification_status: row.verification_status,
            evidence_id: row.evidence_id,
            created_at: toIsoString(row.created_at),
          },
          `canonical_decision_overlays:${row.overlay_id}`,
        ),
      ) as readonly CanonicalDecisionOverlay[];
    });
  }
}

/**
 * jsonb stores object keys in its own order, so a byte comparison of
 * JSON.stringify would report a difference where there is none. Keys are
 * sorted before comparing.
 */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
};

/** Timestamps come back as Date; the domain speaks ISO strings. */
export const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;
