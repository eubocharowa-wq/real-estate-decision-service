import { FixtureUserUrlAdapter } from "./adapters/fixture-adapter";
import type { UserUrlIngestionAdapter } from "./adapters/types";
import {
  normalizeUserUrlCandidate,
  manualFieldsFromRaw,
} from "./normalization";
import { RegistrySourcePolicyResolver } from "./policy";
import type { SourcePolicyResolver } from "./policy";
import { identifyUserUrlSource } from "./source-identification";
import type {
  ManualConfirmationFields,
  UserUrlConfirmationOutcome,
  UserUrlIngestionAuditEvent,
  UserUrlIngestionPreview,
} from "./types";
import { validateUserUrl } from "./url-validation";

export interface UserUrlIngestionDependencies {
  readonly policyResolver?: SourcePolicyResolver;
  readonly adapters?: readonly UserUrlIngestionAdapter[];
  readonly now?: () => Date;
  readonly audit?: (event: UserUrlIngestionAuditEvent) => void;
}

const token = (value: string): string => {
  let hash = 0;
  for (const char of value) hash = Math.imul(31, hash) + char.charCodeAt(0);
  return (hash >>> 0).toString(36);
};

const emptyFields = (): ManualConfirmationFields => ({
  title: "",
  propertyType: "apartment",
  marketType: "unknown",
  city: "",
  locationText: "",
  priceAmount: null,
  priceExplicitUnknown: true,
  priceFrom: false,
  rooms: null,
  areaM2: null,
  floor: null,
  availability: "unknown",
  sellerName: "",
  sourceName: "Пользовательская ссылка",
});

const manualRawResult = (
  preview: UserUrlIngestionPreview,
  fields: ManualConfirmationFields,
  now: string,
) => {
  if (!preview.canonicalUrl) return null;
  const values = {
    title: fields.title,
    property_type: fields.propertyType,
    market_type: fields.marketType,
    city: fields.city,
    location_text: fields.locationText,
    rooms: fields.rooms,
    area_m2: fields.areaM2,
    floor: fields.floor,
    price: fields.priceAmount,
    seller_name: fields.sellerName || null,
    availability: fields.availability,
    published_at: null,
    updated_at: null,
    gas: null,
    financing_claim: null,
  } as const;
  return {
    schemaVersion: "1.0" as const,
    ingestionId: preview.ingestionId,
    sourceId: `user_link_manual_${token(preview.canonicalUrl)}`,
    originalUrl: preview.originalUrl,
    sourceUrl: preview.canonicalUrl,
    finalUrl: preview.canonicalUrl,
    collectedAt: now,
    status: "partial" as const,
    externalListingId: null,
    duplicateOfPropertyId: null,
    rawFields: Object.entries(values).map(([field, value]) => ({
      field: field as keyof typeof values,
      rawValue: value,
      parsedValue: value,
      evidenceText: "Значение введено пользователем вручную.",
      extractionConfidence: 0,
      semantics: "fact" as const,
    })),
    extractionConfidence: 0,
    warnings: ["Автоматическое извлечение не выполнялось."],
    missingFields: (Object.entries(values) as [keyof typeof values, unknown][])
      .filter(([, value]) => value === null || value === "")
      .map(([field]) => field),
    adapterVersion: "manual-entry-v1",
  };
};

export class UserUrlIngestionOrchestrator {
  private readonly policyResolver: SourcePolicyResolver;
  private readonly adapters: readonly UserUrlIngestionAdapter[];
  private readonly now: () => Date;
  private readonly audit?: (event: UserUrlIngestionAuditEvent) => void;

  constructor(dependencies: UserUrlIngestionDependencies = {}) {
    this.policyResolver =
      dependencies.policyResolver ?? new RegistrySourcePolicyResolver();
    this.adapters = dependencies.adapters ?? [new FixtureUserUrlAdapter()];
    this.now = dependencies.now ?? (() => new Date());
    this.audit = dependencies.audit;
  }

  async preview(input: string): Promise<UserUrlIngestionPreview> {
    const started = Date.now();
    const ingestionId = `ingestion_${token(`${input}:${this.now().toISOString()}`)}`;
    const events: UserUrlIngestionAuditEvent[] = [];
    const emit = (event: UserUrlIngestionAuditEvent) => {
      events.push(event);
      this.audit?.(event);
    };
    emit({
      ingestionId,
      sourceId: null,
      event: "received",
      status: "received",
      policyReason: null,
      adapter: null,
      durationMs: 0,
      errorCode: null,
    });
    const validation = validateUserUrl(input);
    if (!validation.success)
      return {
        schemaVersion: "1.0",
        ingestionId,
        status: "failed",
        originalUrl: input,
        canonicalUrl: null,
        sourceIdentification: null,
        policyDecision: null,
        rawResult: null,
        editableFields: emptyFields(),
        warnings: [],
        userMessage: validation.error.message,
        errorCode: validation.error.code,
        auditEvents: events,
      };
    const identification = identifyUserUrlSource(validation.value);
    const policy = this.policyResolver.resolve(identification);
    if (!policy.canAutomate) {
      emit({
        ingestionId,
        sourceId: policy.sourceId,
        event: "policy_denied",
        status:
          policy.mode === "blocked" || policy.mode === "unsupported"
            ? "blocked"
            : "needs_confirmation",
        policyReason: policy.reasonCode,
        adapter: null,
        durationMs: Date.now() - started,
        errorCode:
          policy.mode === "blocked"
            ? "SOURCE_BLOCKED"
            : "AUTOMATION_NOT_ALLOWED",
      });
      return {
        schemaVersion: "1.0",
        ingestionId,
        status: "needs_confirmation",
        originalUrl: input,
        canonicalUrl: validation.value.canonicalUrl,
        sourceIdentification: identification,
        policyDecision: policy,
        rawResult: null,
        editableFields: emptyFields(),
        warnings: [
          "Автоматическое извлечение запрещено; доступен только ручной ввод.",
        ],
        userMessage:
          policy.mode === "blocked"
            ? "Не можем автоматически извлечь данные с этого источника. Добавьте основные параметры вручную."
            : "Автоматический разбор не поддерживается. Добавьте основные параметры вручную.",
        errorCode:
          policy.mode === "blocked"
            ? "SOURCE_BLOCKED"
            : "AUTOMATION_NOT_ALLOWED",
        auditEvents: events,
      };
    }
    const adapter = this.adapters.find((candidate) =>
      candidate.supports({
        ingestionId,
        url: validation.value,
        policy,
        now: this.now().toISOString(),
      }),
    );
    if (!adapter) {
      emit({
        ingestionId,
        sourceId: policy.sourceId,
        event: "policy_denied",
        status: "needs_confirmation",
        policyReason: policy.reasonCode,
        adapter: null,
        durationMs: Date.now() - started,
        errorCode: "AUTOMATION_NOT_ALLOWED",
      });
      return {
        schemaVersion: "1.0",
        ingestionId,
        status: "needs_confirmation",
        originalUrl: input,
        canonicalUrl: validation.value.canonicalUrl,
        sourceIdentification: identification,
        policyDecision: policy,
        rawResult: null,
        editableFields: emptyFields(),
        warnings: ["Данные не извлекались автоматически."],
        userMessage:
          "Источник требует ручного ввода или разрешённого партнёрского метода.",
        errorCode: "AUTOMATION_NOT_ALLOWED",
        auditEvents: events,
      };
    }
    emit({
      ingestionId,
      sourceId: policy.sourceId,
      event: "adapter_started",
      status: "extracting",
      policyReason: policy.reasonCode,
      adapter: adapter.name,
      durationMs: 0,
      errorCode: null,
    });
    try {
      const raw = await adapter.collect({
        ingestionId,
        url: validation.value,
        policy,
        now: this.now().toISOString(),
      });
      emit({
        ingestionId,
        sourceId: policy.sourceId,
        event: "adapter_finished",
        status: raw.status === "partial" ? "partial" : "needs_confirmation",
        policyReason: policy.reasonCode,
        adapter: adapter.name,
        durationMs: Date.now() - started,
        errorCode: null,
      });
      return {
        schemaVersion: "1.0",
        ingestionId,
        status: "needs_confirmation",
        originalUrl: input,
        canonicalUrl: validation.value.canonicalUrl,
        sourceIdentification: identification,
        policyDecision: policy,
        rawResult: raw,
        editableFields: manualFieldsFromRaw(raw),
        warnings: raw.warnings,
        userMessage:
          "Проверьте извлечённые значения. Они считаются заявленными, а не подтверждёнными.",
        errorCode: null,
        auditEvents: events,
      };
    } catch {
      return {
        schemaVersion: "1.0",
        ingestionId,
        status: "failed",
        originalUrl: input,
        canonicalUrl: validation.value.canonicalUrl,
        sourceIdentification: identification,
        policyDecision: policy,
        rawResult: null,
        editableFields: emptyFields(),
        warnings: [],
        userMessage: "Не удалось разобрать fixture-ссылку.",
        errorCode: "EXTRACTION_FAILED",
        auditEvents: events,
      };
    }
  }

  confirm(
    preview: UserUrlIngestionPreview,
    fields: ManualConfirmationFields,
  ): UserUrlConfirmationOutcome {
    const events = [...preview.auditEvents];
    if (!preview.policyDecision || !preview.canonicalUrl) {
      const failed: UserUrlIngestionAuditEvent = {
        ingestionId: preview.ingestionId,
        sourceId: preview.policyDecision?.sourceId ?? null,
        event: "normalization_failed",
        status: "failed",
        policyReason: preview.policyDecision?.reasonCode ?? null,
        adapter: null,
        durationMs: 0,
        errorCode: "INSUFFICIENT_DATA",
      };
      events.push(failed);
      this.audit?.(failed);
      return {
        success: false,
        error: {
          code: "INSUFFICIENT_DATA",
          message: "Нет данных политики для нормализации.",
          missingFields: ["policy_decision"],
        },
        auditEvents: events,
      };
    }
    const validation = validateUserUrl(preview.canonicalUrl);
    if (!validation.success)
      return {
        success: false,
        error: {
          code: validation.error.code,
          message: validation.error.message,
          missingFields: [],
        },
        auditEvents: events,
      };
    const raw =
      preview.rawResult ??
      manualRawResult(preview, fields, this.now().toISOString());
    if (!raw)
      return {
        success: false,
        error: {
          code: "INSUFFICIENT_DATA",
          message: "Недостаточно данных для ручного добавления.",
          missingFields: ["original_url"],
        },
        auditEvents: events,
      };
    const candidate = normalizeUserUrlCandidate({
      raw,
      url: validation.value,
      policy: preview.policyDecision,
      fields,
    });
    if (candidate.matchingReadiness.status === "not_ready") {
      const failed: UserUrlIngestionAuditEvent = {
        ingestionId: preview.ingestionId,
        sourceId: preview.policyDecision.sourceId,
        event: "normalization_failed",
        status: "failed",
        policyReason: preview.policyDecision.reasonCode,
        adapter: raw.adapterVersion,
        durationMs: 0,
        errorCode: "INSUFFICIENT_DATA",
      };
      events.push(failed);
      this.audit?.(failed);
      return {
        success: false,
        error: {
          code: "INSUFFICIENT_DATA",
          message: "Не заполнены минимальные поля для сравнения.",
          missingFields: candidate.matchingReadiness.missingFields,
        },
        auditEvents: events,
      };
    }
    const ready: UserUrlIngestionAuditEvent = {
      ingestionId: preview.ingestionId,
      sourceId: preview.policyDecision.sourceId,
      event: "candidate_ready",
      status:
        candidate.duplicateDecision.status === "same_property"
          ? "duplicate_candidate"
          : "ready_for_comparison",
      policyReason: preview.policyDecision.reasonCode,
      adapter: raw.adapterVersion,
      durationMs: 0,
      errorCode: null,
    };
    events.push(ready);
    this.audit?.(ready);
    return { success: true, candidate, auditEvents: events };
  }
}
