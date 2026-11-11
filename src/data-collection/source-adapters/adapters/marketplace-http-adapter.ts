import { SOURCE_ADAPTER_HTTP_CONFIG } from "../config";
import type {
  CollectionErrorCode,
  CollectionTask,
  HttpCollectionResponse,
  HttpCollector,
  RawCollectionField,
  RawCollectionResult,
  SourceAdapter,
  SourceAdapterContext,
} from "../contracts";
import { rawCollectionResultSchema } from "../contracts";
import { HttpTransportError } from "../http";
import type {
  MarketplaceGuardSourceId,
  MarketplaceRequestGuard,
  MarketplaceStopReason,
} from "../marketplace-request-guard";

export interface MarketplaceObservation {
  readonly field: string;
  readonly rawValue: RawCollectionField["raw_value"];
  readonly value: RawCollectionField["raw_value"];
  readonly statePath: string;
}

export interface MarketplaceParsedCard {
  readonly facts: {
    readonly listingId: string;
    readonly canonicalUrl: string;
  };
  readonly observations: readonly MarketplaceObservation[];
  readonly warnings: readonly string[];
}

export interface MarketplaceHttpAdapterConfig {
  readonly sourceId: MarketplaceGuardSourceId;
  readonly adapterVersion: string;
  readonly parserVersion: string;
  readonly supportedFields: readonly string[];
  readonly parse: (input: {
    readonly html: string;
    readonly sourceUrl: string;
  }) => MarketplaceParsedCard;
}

const normalizedRawValue = (
  observation: MarketplaceObservation,
): RawCollectionField["raw_value"] => {
  if (observation.field === "listing_price") {
    const value = observation.value;
    if (
      typeof value === "object" &&
      value !== null &&
      "amount" in value &&
      typeof value.amount === "string"
    )
      return value.amount;
  }
  if (
    observation.field === "physical.rooms" ||
    observation.field === "physical.floor" ||
    observation.field === "physical.total_area_m2"
  )
    return String(observation.value);
  return observation.value;
};

const terminalResult = ({
  task,
  context,
  collectorVersion,
  sourceUrl,
  response = null,
  status,
  errorCode,
  warnings,
  config,
}: {
  readonly task: CollectionTask;
  readonly context: SourceAdapterContext;
  readonly collectorVersion: string;
  readonly sourceUrl: string;
  readonly response?: HttpCollectionResponse | null;
  readonly status: RawCollectionResult["status"];
  readonly errorCode: CollectionErrorCode;
  readonly warnings: readonly string[];
  readonly config: MarketplaceHttpAdapterConfig;
}): RawCollectionResult =>
  rawCollectionResultSchema.parse({
    schema_version: "1.0",
    collection_run_id: context.collectionRunId,
    task_id: task.task_id,
    source_id: task.source_id,
    source_url: sourceUrl,
    canonical_url: sourceUrl,
    collected_at: context.observedAt,
    http_status: response?.status ?? null,
    content_type: response?.contentType ?? null,
    raw_payload_reference: null,
    external_record_id: null,
    extracted_fields: [],
    missing_fields: [...task.requested_fields],
    warnings: [...warnings],
    adapter_version: config.adapterVersion,
    parser_version: config.parserVersion,
    collector_version: collectorVersion,
    status,
    error_code: errorCode,
  });

const contentTypeAllowed = (contentType: string | null): boolean =>
  Boolean(
    contentType &&
    SOURCE_ADAPTER_HTTP_CONFIG.allowedContentTypes.some((allowed) =>
      contentType.toLowerCase().startsWith(allowed),
    ),
  );

const challengeDetected = (html: string): boolean => {
  // Listing hydration can coexist with an interstitial challenge, so its
  // presence is never treated as proof that collection is allowed. Ignore
  // passive code strings to avoid stopping on ordinary application bundles,
  // then require either visible challenge wording or explicit challenge UI.
  const visibleMarkup = html.replace(
    /<(?:script|style|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript)>/giu,
    " ",
  );
  const visibleText = visibleMarkup.replace(/<[^>]+>/gu, " ");
  const explicitChallengeText =
    /(?:verify\s+(?:that\s+)?you\s+are\s+(?:a\s+)?human|cloudflare\s+challenge|access\s+denied|доступ\s+ограничен|(?:solve|complete|enter)\s+(?:the\s+)?captcha)/iu.test(
      visibleText,
    );
  const explicitChallengeUi =
    /<(?:form|div|section|iframe|input)\b[^>]*(?:id|class|name|src|action|data-sitekey)\s*=\s*["'][^"']*(?:captcha|recaptcha|hcaptcha|cf-chl|challenge-platform)[^"']*["'][^>]*>/iu.test(
      visibleMarkup,
    );
  return explicitChallengeText || explicitChallengeUi;
};

const transportErrorCode = (error: HttpTransportError): CollectionErrorCode =>
  error.code === "TIMEOUT" ? "TIMEOUT" : "FETCH_FAILED";

/**
 * One-card HTML adapter shared by classified sources. It has no authority to
 * select a source or URL: an allowed Collection Plan must reach it first.
 */
export class MarketplaceHttpAdapter implements SourceAdapter {
  readonly method = "http" as const;
  readonly sourceId: string;
  readonly version: string;
  private readonly supportedFields: ReadonlySet<string>;

  constructor(
    private readonly config: MarketplaceHttpAdapterConfig,
    private readonly collector: HttpCollector,
    private readonly requestGuard: MarketplaceRequestGuard,
  ) {
    this.sourceId = config.sourceId;
    this.version = config.adapterVersion;
    this.supportedFields = new Set(config.supportedFields);
  }

  canHandle(task: CollectionTask): boolean {
    return task.source_id === this.sourceId && task.mode === "collect";
  }

  async collect(
    task: CollectionTask,
    context: SourceAdapterContext,
  ): Promise<RawCollectionResult> {
    const sourceUrl =
      context.plan.validatedTargetUrls[0] ?? task.target_urls[0];
    const blocked = (warnings: readonly string[]) =>
      terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl: sourceUrl ?? task.target_urls[0]!,
        status: "blocked",
        errorCode: "POLICY_DENIED",
        warnings,
        config: this.config,
      });
    if (
      !sourceUrl ||
      !this.canHandle(task) ||
      !context.plan.allowed ||
      context.plan.sourceId !== this.sourceId ||
      context.plan.preferredMethod !== this.method ||
      context.plan.validatedTargetUrls.length !== 1
    )
      return blocked(["No request was made because the HTTP plan was denied."]);

    const unsupported = context.plan.validatedRequestedFields.filter(
      (field) => !this.supportedFields.has(field),
    );
    if (unsupported.length)
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        status: "failed",
        errorCode: "VALIDATION_FAILED",
        warnings: [`Unsupported adapter fields: ${unsupported.join(", ")}`],
        config: this.config,
      });

    const guardDecision = await this.requestGuard.beforeRequest(
      this.config.sourceId,
    );
    if (!guardDecision.allowed) {
      const stoppedForAuth =
        guardDecision.stopReason === "access_denied" ||
        guardDecision.stopReason === "challenge";
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        status: "blocked",
        errorCode: stoppedForAuth ? "AUTH_REQUIRED" : "RATE_LIMITED",
        warnings: [
          guardDecision.reason === "guard_unavailable"
            ? "The shared request guard is unavailable; no request was made."
            : guardDecision.reason === "source_stopped"
              ? "Collection for this source was stopped after a terminal response."
              : "The per-source request limit was reached; no request was made.",
        ],
        config: this.config,
      });
    }

    let terminalStopAttempted = false;
    try {
      let response: HttpCollectionResponse;
      try {
        response = await this.collector.get(sourceUrl);
      } catch (error) {
        const transport =
          error instanceof HttpTransportError
            ? error
            : new HttpTransportError("FETCH_FAILED", "HTTP collection failed.");
        return terminalResult({
          task,
          context,
          collectorVersion: this.collector.version,
          sourceUrl,
          status: "failed",
          errorCode: transportErrorCode(transport),
          warnings: [transport.message],
          config: this.config,
        });
      }

      const terminal = (
        status: RawCollectionResult["status"],
        errorCode: CollectionErrorCode,
        warning: string,
      ) =>
        terminalResult({
          task,
          context,
          collectorVersion: this.collector.version,
          sourceUrl,
          response,
          status,
          errorCode,
          warnings: [warning],
          config: this.config,
        });
      const terminalAndStop = async (
        stopReason: MarketplaceStopReason,
        errorCode: CollectionErrorCode,
        warning: string,
      ): Promise<RawCollectionResult> => {
        terminalStopAttempted = true;
        let sharedStopRecorded = true;
        try {
          await this.requestGuard.stopSource(this.config.sourceId, stopReason);
        } catch {
          sharedStopRecorded = false;
        }
        return terminal(
          "blocked",
          errorCode,
          sharedStopRecorded
            ? warning
            : `${warning} Shared stop-state persistence was unavailable.`,
        );
      };
      if (response.status === 401 || response.status === 403)
        return terminalAndStop(
          "access_denied",
          "AUTH_REQUIRED",
          "Access was denied; no authentication or challenge bypass was attempted.",
        );
      if (response.status === 429)
        return terminalAndStop(
          "rate_limited",
          "RATE_LIMITED",
          "The source rate-limited the single request; collection stopped.",
        );
      if (response.status === 404 || response.status === 410)
        return terminal(
          "unavailable",
          "FETCH_FAILED",
          "The card is unavailable; this is not interpreted as sold.",
        );
      if (response.finalUrl !== sourceUrl)
        return terminal(
          "blocked",
          "FETCH_FAILED",
          "The response URL differs from the policy-validated target.",
        );
      if (response.status < 200 || response.status >= 300)
        return terminal(
          "failed",
          "FETCH_FAILED",
          `Unexpected HTTP status ${response.status}.`,
        );
      if (!contentTypeAllowed(response.contentType))
        return terminal(
          "failed",
          "UNEXPECTED_CONTENT_TYPE",
          "Only an HTML card response is accepted.",
        );
      if (challengeDetected(response.body))
        return terminalAndStop(
          "challenge",
          "AUTH_REQUIRED",
          "A challenge page was detected; no bypass was attempted.",
        );

      try {
        const parsed = this.config.parse({ html: response.body, sourceUrl });
        const requested = new Set(context.plan.validatedRequestedFields);
        const extracted = parsed.observations.filter(
          (item) => requested.has(item.field) && item.value !== null,
        );
        const extractedFields = new Set(extracted.map((item) => item.field));
        return rawCollectionResultSchema.parse({
          schema_version: "1.0",
          collection_run_id: context.collectionRunId,
          task_id: task.task_id,
          source_id: task.source_id,
          source_url: sourceUrl,
          canonical_url: parsed.facts.canonicalUrl,
          collected_at: context.observedAt,
          http_status: response.status,
          content_type: response.contentType,
          raw_payload_reference: null,
          external_record_id: parsed.facts.listingId,
          extracted_fields: extracted.map((item) => ({
            field: item.field,
            // Only the allow-listed normalized fact crosses this boundary. The
            // complete page state and listing prose are deliberately discarded.
            raw_value: normalizedRawValue(item),
            semantics: "source_claim",
            extraction_confidence: 0.98,
            evidence_reference: item.statePath,
          })),
          missing_fields: context.plan.validatedRequestedFields.filter(
            (field) => !extractedFields.has(field),
          ),
          warnings: [...parsed.warnings],
          adapter_version: this.config.adapterVersion,
          parser_version: this.config.parserVersion,
          collector_version: this.collector.version,
          status:
            extracted.length === context.plan.validatedRequestedFields.length
              ? "success"
              : "partial",
          error_code: null,
        });
      } catch (error) {
        return terminal(
          "source_changed",
          "SOURCE_CHANGED",
          error instanceof Error ? error.message : "Card structure changed.",
        );
      }
    } finally {
      if (!terminalStopAttempted) {
        try {
          await this.requestGuard.completeRequest(this.config.sourceId);
        } catch {
          // The guard retains a local fail-closed state, while the shared
          // store keeps outcome_pending=true for every other instance.
        }
      }
    }
  }
}
