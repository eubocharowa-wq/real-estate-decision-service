import type {
  ExpertCheckStatus,
  ExpertFindingCategory,
  ExpertFindingSeverity,
  ExpertNextAction,
  ExpertVerificationEffect,
  ExpertVerificationMethod,
} from "./contracts";
import type {
  ExpertRequestType,
  ExpertWorkflowStatus,
  SpecialistType,
} from "../expert";

export const expertRequestTypeLabels: Readonly<
  Record<ExpertRequestType, string>
> = Object.freeze({
  information_verification: "Проверка информации",
  document_review: "Разбор документа",
  choice_assistance: "Помощь с выбором",
  property_analysis: "Разбор объекта",
  consultation: "Консультация",
  onsite_check: "Проверка на месте",
  transaction_question: "Вопрос по сделке",
});

export const specialistTypeLabels: Readonly<Record<SpecialistType, string>> =
  Object.freeze({
    real_estate_expert: "Эксперт по недвижимости",
    lawyer: "Юрист",
    mortgage_specialist: "Ипотечный специалист",
    property_inspector: "Специалист по осмотру",
    technical_specialist: "Технический специалист",
  });

export const findingSeverityLabels: Readonly<
  Record<ExpertFindingSeverity, string>
> = Object.freeze({
  info: "Информация",
  attention: "Требует внимания",
  important: "Важно",
  critical: "Критично",
});

export const findingCategoryLabels: Readonly<
  Record<ExpertFindingCategory, string>
> = Object.freeze({
  fact: "Факт",
  financing: "Финансирование",
  document: "Документ",
  property_condition: "Состояние объекта",
  infrastructure: "Инфраструктура",
  transaction: "Сделка",
  risk: "Риск",
  conflict: "Расхождение",
  other: "Другое",
});

export const verificationEffectLabels: Readonly<
  Record<ExpertVerificationEffect, string>
> = Object.freeze({
  confirmed: "Подтверждает факт",
  unconfirmed: "Не подтверждает факт",
  unable_to_verify: "Оставляет неизвестным",
  conflicting: "Фиксирует расхождение",
  none: "Не меняет verification status",
});

export const checkStatusLabels: Readonly<Record<ExpertCheckStatus, string>> =
  Object.freeze({
    checked_confirmed: "Проверено: подтверждено",
    checked_not_confirmed: "Проверено: не подтвердилось",
    checked_conflicting: "Проверено: осталось расхождение",
    unable_to_check: "Не удалось проверить",
    not_required: "Проверка не требуется",
  });

export const resultStatusLabels = Object.freeze({
  completed: "Проверка завершена",
  partially_completed: "Проверка завершена частично",
  unable_to_verify: "Не удалось завершить проверку",
  waiting_for_user: "Нужны данные пользователя",
  waiting_for_external_info: "Ожидается внешний ответ",
});

export const nextActionLabels: Readonly<Record<ExpertNextAction, string>> =
  Object.freeze({
    verify_again: "Проверить ещё раз",
    request_document: "Запросить документ",
    request_bank_confirmation: "Запросить подтверждение банка",
    request_developer_confirmation: "Запросить подтверждение застройщика",
    technical_inspection: "Передать техническому специалисту",
    onsite_check: "Запросить визуальную проверку на месте",
    compare_again: "Вернуться к сравнению",
    recalculate_match: "Пересчитать соответствие",
    no_action: "Дополнительные действия не нужны",
  });

export const verificationMethodLabels: Readonly<
  Record<ExpertVerificationMethod, string>
> = Object.freeze({
  source_review: "Проверка источника",
  document_review: "Проверка документа",
  bank_confirmation: "Подтверждение банка",
  developer_confirmation: "Подтверждение застройщика",
  seller_confirmation: "Подтверждение продавца",
  registry_check: "Проверка реестра",
  visual_onsite: "Визуальная проверка на месте",
  measurement: "Измерение",
  expert_analysis: "Экспертный анализ",
  other: "Другой способ",
});

export const workflowStatusLabels: Readonly<
  Record<ExpertWorkflowStatus, string>
> = Object.freeze({
  draft: "Черновик",
  submitted: "Отправлен",
  queued: "В очереди",
  assigned: "Назначен",
  in_progress: "В работе",
  waiting_for_user: "Ждём данные пользователя",
  waiting_for_external_info: "Ждём внешний ответ",
  completed: "Завершён",
  cancelled: "Отменён",
  unable_to_complete: "Не удалось завершить",
});

export const priorityLabels = Object.freeze({
  critical: "Критический",
  high: "Высокий",
  normal: "Обычный",
  low: "Низкий",
});

export const choiceStatusLabels = Object.freeze({
  clear: "Есть явный вариант",
  conditional: "Выбор зависит от условия",
  near_tie: "Явного победителя нет",
  insufficient_data: "Недостаточно данных",
  no_valid_option: "Нет варианта без нарушения обязательных условий",
});
