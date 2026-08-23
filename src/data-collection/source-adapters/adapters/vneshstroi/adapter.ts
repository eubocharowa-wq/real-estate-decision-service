import {
  SOURCE_ADAPTER_HTTP_CONFIG,
  VNESHSTROI_ADAPTER_VERSION,
  VNESHSTROI_PARSER_VERSION,
  VNESHSTROI_SOURCE_ID,
  VNESHSTROI_SUPPORTED_FIELDS,
  type VneshstroiSupportedField,
} from "../../config";
import type {
  CollectionErrorCode,
  CollectionTask,
  HttpCollectionResponse,
  HttpCollector,
  RawCollectionResult,
  SourceAdapter,
  SourceAdapterContext,
} from "../../contracts";
import { rawCollectionResultSchema } from "../../contracts";
import { HttpTransportError } from "../../http";
import {
  extractVneshstroiFields,
  parseVneshstroiUnitPayload,
  VneshstroiSourceChangedError,
} from "./parser";

const supportedFields = new Set<string>(VNESHSTROI_SUPPORTED_FIELDS);

const terminalResult = ({
  task,
  context,
  collectorVersion,
  sourceUrl,
  response = null,
  status,
  errorCode,
  warnings,
}: {
  readonly task: CollectionTask;
  readonly context: SourceAdapterContext;
  readonly collectorVersion: string;
  readonly sourceUrl: string;
  readonly response?: HttpCollectionResponse | null;
  readonly status: RawCollectionResult["status"];
  readonly errorCode: CollectionErrorCode;
  readonly warnings: readonly string[];
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
    adapter_version: VNESHSTROI_ADAPTER_VERSION,
    parser_version: VNESHSTROI_PARSER_VERSION,
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

const challengeDetected = (html: string): boolean =>
  /(?:captcha|cloudflare challenge|verify you are human|access denied)/iu.test(
    html,
  );

const transportErrorCode = (error: HttpTransportError): CollectionErrorCode =>
  error.code === "TIMEOUT" ? "TIMEOUT" : "FETCH_FAILED";

export class VneshstroiHttpAdapter implements SourceAdapter {
  readonly sourceId = VNESHSTROI_SOURCE_ID;
  readonly method = "http" as const;
  readonly version = VNESHSTROI_ADAPTER_VERSION;

  constructor(private readonly collector: HttpCollector) {}

  canHandle(task: CollectionTask): boolean {
    return task.source_id === this.sourceId && task.mode === "collect";
  }

  async collect(
    task: CollectionTask,
    context: SourceAdapterContext,
  ): Promise<RawCollectionResult> {
    const sourceUrl =
      context.plan.validatedTargetUrls[0] ?? task.target_urls[0];
    if (
      !this.canHandle(task) ||
      !context.plan.allowed ||
      context.plan.sourceId !== this.sourceId ||
      context.plan.preferredMethod !== this.method ||
      context.plan.validatedTargetUrls.length !== 1 ||
      sourceUrl === undefined
    )
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl: task.target_urls[0],
        status: "blocked",
        errorCode: "POLICY_DENIED",
        warnings: ["Adapter invocation did not contain an allowed HTTP plan."],
      });

    const unsupported = context.plan.validatedRequestedFields.filter(
      (field) => !supportedFields.has(field),
    );
    if (unsupported.length > 0)
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        status: "failed",
        errorCode: "VALIDATION_FAILED",
        warnings: [`Unsupported adapter fields: ${unsupported.join(", ")}`],
      });

    let response: HttpCollectionResponse;
    try {
      response = await this.collector.get(sourceUrl);
    } catch (error) {
      const transportError =
        error instanceof HttpTransportError
          ? error
          : new HttpTransportError(
              "FETCH_FAILED",
              error instanceof Error ? error.message : "Collection failed.",
            );
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        status: "failed",
        errorCode: transportErrorCode(transportError),
        warnings: [transportError.message],
      });
    }

    if (response.status === 401 || response.status === 403)
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        response,
        status: "blocked",
        errorCode: "AUTH_REQUIRED",
        warnings: [
          "The source requires access or challenge handling; stopped.",
        ],
      });
    if (response.status === 404 || response.status === 410)
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        response,
        status: "unavailable",
        errorCode: "FETCH_FAILED",
        warnings: [
          "The unit page is unavailable; this is not interpreted as sold.",
        ],
      });
    if (response.status === 429)
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        response,
        status: "failed",
        errorCode: "RATE_LIMITED",
        warnings: ["The source rate-limited the single PoC attempt."],
      });
    if (response.finalUrl !== sourceUrl)
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        response,
        status: "failed",
        errorCode: "FETCH_FAILED",
        warnings: [
          "The collector returned a URL outside the explicit policy target.",
        ],
      });
    if (response.status < 200 || response.status >= 300)
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        response,
        status: "failed",
        errorCode: "FETCH_FAILED",
        warnings: [`Unexpected HTTP status ${response.status}.`],
      });
    if (!contentTypeAllowed(response.contentType))
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        response,
        status: "failed",
        errorCode: "UNEXPECTED_CONTENT_TYPE",
        warnings: ["Only an HTML unit response is allowed."],
      });
    if (challengeDetected(response.body))
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        response,
        status: "blocked",
        errorCode: "AUTH_REQUIRED",
        warnings: ["A challenge page was detected; no bypass was attempted."],
      });

    try {
      const payload = parseVneshstroiUnitPayload(response.body);
      const urlUnitId = new URL(sourceUrl).pathname.match(
        /^\/kvartiry\/([0-9]+)\/?$/u,
      )?.[1];
      if (!urlUnitId || payload.external_unit_id !== urlUnitId)
        throw new VneshstroiSourceChangedError(
          "The payload unit identity does not match the explicit URL.",
        );
      const requestedFields = context.plan
        .validatedRequestedFields as readonly VneshstroiSupportedField[];
      const extracted = extractVneshstroiFields(payload, requestedFields);
      return rawCollectionResultSchema.parse({
        schema_version: "1.0",
        collection_run_id: context.collectionRunId,
        task_id: task.task_id,
        source_id: task.source_id,
        source_url: sourceUrl,
        canonical_url: response.finalUrl,
        collected_at: context.observedAt,
        http_status: response.status,
        content_type: response.contentType,
        raw_payload_reference: null,
        external_record_id: payload.external_unit_id,
        extracted_fields: extracted.fields,
        missing_fields: extracted.missingFields,
        warnings: extracted.missingFields.map(
          (field) => `Requested field is unavailable: ${field}`,
        ),
        adapter_version: VNESHSTROI_ADAPTER_VERSION,
        parser_version: VNESHSTROI_PARSER_VERSION,
        collector_version: this.collector.version,
        status: extracted.missingFields.length > 0 ? "partial" : "success",
        error_code: null,
      });
    } catch (error) {
      if (error instanceof VneshstroiSourceChangedError)
        return terminalResult({
          task,
          context,
          collectorVersion: this.collector.version,
          sourceUrl,
          response,
          status: "source_changed",
          errorCode: "SOURCE_CHANGED",
          warnings: [error.message],
        });
      return terminalResult({
        task,
        context,
        collectorVersion: this.collector.version,
        sourceUrl,
        response,
        status: "failed",
        errorCode: "PARSE_FAILED",
        warnings: [
          error instanceof Error ? error.message : "Unit parsing failed.",
        ],
      });
    }
  }
}
