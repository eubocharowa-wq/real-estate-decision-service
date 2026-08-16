import type {
  FieldEvidence,
  FinancingProgram,
  Offer,
  Property,
  Source,
} from "../domain";
import type { DataQualityBand, RecommendedCheck } from "../matching";
import {
  AVAILABILITY_PRESENTATION,
  CONFIDENCE_PRESENTATION,
  FINANCING_PROGRAM_PRESENTATION,
  FRESHNESS_PRESENTATION,
  PROPERTY_TYPE_PRESENTATION,
  getCriterionFieldLabel,
} from "../shortlist/presentation-registry";

export {
  AVAILABILITY_PRESENTATION,
  CONFIDENCE_PRESENTATION,
  FINANCING_PROGRAM_PRESENTATION,
  FRESHNESS_PRESENTATION,
  PROPERTY_TYPE_PRESENTATION,
  getCriterionFieldLabel,
};

export const VERIFICATION_PRESENTATION = Object.freeze({
  confirmed: {
    label: "Подтверждено",
    description: "Значение подтверждено доступным evidence.",
  },
  claimed: {
    label: "Заявлено источником",
    description: "Источник заявляет условие, но оно ещё не подтверждено.",
  },
  unconfirmed: {
    label: "Не подтверждено",
    description: "Для значения недостаточно подтверждающих данных.",
  },
  conflicting: {
    label: "Есть расхождение",
    description: "Доступные evidence противоречат друг другу.",
  },
  stale: {
    label: "Данные устарели",
    description: "Значение могло измениться с момента проверки.",
  },
  unknown: {
    label: "Нет данных",
    description: "Значение отсутствует или его статус неизвестен.",
  },
} satisfies Record<
  FieldEvidence["verification_status"],
  { readonly label: string; readonly description: string }
>);

export const DETAIL_FRESHNESS_PRESENTATION = Object.freeze({
  fresh: {
    label: "Актуальные данные",
    description: "Срок актуальности данных не истёк.",
  },
  aging: {
    label: "Скоро потребуется обновление",
    description: "Данные приближаются к сроку повторной проверки.",
  },
  stale: {
    label: "Данные могли измениться",
    description: "Данные устарели и требуют повторной проверки.",
  },
  expired: {
    label: "Срок актуальности истёк",
    description: "На это значение нельзя полагаться без обновления.",
  },
  unknown: {
    label: "Дата проверки неизвестна",
    description: "Неизвестно, когда значение проверяли последний раз.",
  },
} satisfies Record<
  FieldEvidence["freshness_status"],
  { readonly label: string; readonly description: string }
>);

export const COMPLETENESS_PRESENTATION = Object.freeze({
  high: "Почти все важные данные заполнены",
  medium: "Часть важных данных требует уточнения",
  low: "Многих важных данных не хватает",
  critical: "Критически важных данных недостаточно",
  pending: "Полнота данных ещё не рассчитана",
} satisfies Record<DataQualityBand | "pending", string>);

export const CRITERION_STATUS_PRESENTATION = Object.freeze({
  matched: "Соответствует",
  partially_matched: "Частично соответствует",
  not_matched: "Не соответствует предпочтению",
  unknown: "Нет данных",
  conflicting: "Есть расхождение",
  not_applicable: "Не относится к этому типу объекта",
  hard_failed: "Не соответствует обязательному условию",
} as const);

export const SOURCE_TYPE_PRESENTATION = Object.freeze({
  developer_site: "Официальный сайт застройщика",
  project_site: "Сайт проекта",
  classified: "Площадка объявлений",
  agency_site: "Сайт агентства",
  bank_site: "Сайт банка",
  government: "Государственный источник",
  registry: "Реестр",
  map_service: "Картографический сервис",
  poi_provider: "Поставщик данных об инфраструктуре",
  user_link: "Ссылка пользователя",
  manual_expert: "Экспертная проверка",
  partner_feed: "Партнёрский фид",
  api: "API-источник",
  other: "Другой источник",
} satisfies Record<Source["source_type"], string>);

export const FINANCING_PROGRAM_LABELS: Readonly<
  Record<FinancingProgram["program_type"], string>
> = FINANCING_PROGRAM_PRESENTATION;

export const AVAILABILITY_LABELS: Readonly<
  Record<Offer["availability"], string>
> = AVAILABILITY_PRESENTATION;

export const PROPERTY_LABELS: Readonly<
  Record<Property["property_type"], string>
> = PROPERTY_TYPE_PRESENTATION;

export const CHECK_PRESENTATION = Object.freeze({
  REFRESH_PRICE: "Уточнить актуальную цену",
  VERIFY_AVAILABILITY: "Подтвердить наличие",
  VERIFY_FINANCING_APPLICABILITY: "Проверить применимость программы",
  VERIFY_INITIAL_PAYMENT: "Проверить первоначальный взнос",
  RESOLVE_SOURCE_CONFLICT: "Разобраться в расхождении источников",
  VERIFY_HANDOVER_DATE: "Уточнить срок передачи",
  VERIFY_GAS_CONNECTION: "Проверить подключение газа",
  VERIFY_FIELD: "Проверить это условие",
} satisfies Record<RecommendedCheck["code"], string>);

export const FINISHING_PRESENTATION = Object.freeze({
  shell: "Без отделки",
  pre_finish: "Предчистовая",
  finished: "С отделкой",
  renovated: "С ремонтом",
  needs_renovation: "Требуется ремонт",
  unknown: "Не подтверждено",
} satisfies Record<Property["condition"]["finishing_type"], string>);

export const UTILITY_PRESENTATION = Object.freeze({
  connected: "Подключено",
  available: "Доступно подключение",
  planned: "Планируется",
  absent: "Нет",
  unknown: "Не подтверждено",
} satisfies Record<Property["utilities"]["gas"], string>);
