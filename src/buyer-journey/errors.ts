import type { JourneyErrorCode } from "./contracts";

export class BuyerJourneyError extends Error {
  constructor(
    readonly code: JourneyErrorCode,
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
    this.name = "BuyerJourneyError";
  }
}

export interface JourneyErrorPresentation {
  readonly title: string;
  readonly message: string;
  readonly action_label: string;
  readonly action_href: string;
}

export const JOURNEY_ERROR_PRESENTATION: Readonly<
  Record<JourneyErrorCode, JourneyErrorPresentation>
> = Object.freeze({
  MISSING_JOURNEY_CONTEXT: {
    title: "Сначала опишите задачу",
    message: "Активный путь выбора не найден. Начните с описания условий.",
    action_label: "Описать задачу",
    action_href: "/",
  },
  INVALID_TRANSITION: {
    title: "Этот шаг пока недоступен",
    message: "Вернитесь к предыдущему шагу и завершите его.",
    action_label: "Вернуться к подбору",
    action_href: "/shortlist",
  },
  STALE_REQUEST_VERSION: {
    title: "Условия изменились",
    message: "Старые оценки скрыты, пока подбор не будет пересчитан.",
    action_label: "Пересчитать подбор",
    action_href: "/request/confirm",
  },
  MATCH_RECOMPUTE_FAILED: {
    title: "Не удалось пересчитать соответствие",
    message: "Проверка сохранена. Повторите пересчёт или вернитесь к условиям.",
    action_label: "Вернуться к условиям",
    action_href: "/request/confirm",
  },
  CONFIDENCE_RECOMPUTE_FAILED: {
    title: "Не удалось обновить надёжность данных",
    message: "Новые evidence сохранены, но оценку данных нужно пересчитать.",
    action_label: "Вернуться к подбору",
    action_href: "/shortlist",
  },
  EXPERT_CONTEXT_STALE: {
    title: "Контекст эксперта устарел",
    message: "Условия изменились. Создайте проверку из актуального решения.",
    action_label: "Открыть сравнение",
    action_href: "/comparison",
  },
  INGESTION_FAILED: {
    title: "Не удалось добавить вариант",
    message: "Проверьте ссылку или добавьте основные параметры вручную.",
    action_label: "Добавить вручную",
    action_href: "/add-url",
  },
  REFRESH_PENDING: {
    title: "Обновление ожидает выполнения",
    message: "Текущий результат остаётся доступен с отметкой свежести.",
    action_label: "Вернуться к решению",
    action_href: "/shortlist",
  },
  SOURCE_POLICY_BLOCKED: {
    title: "Автоматическое обновление запрещено",
    message: "Основной подбор доступен; данные можно проверить вручную.",
    action_label: "Продолжить с текущими данными",
    action_href: "/shortlist",
  },
  FEATURE_DISABLED: {
    title: "Функция временно выключена",
    message:
      "Текущий результат и история сохранены. Продолжите без автоматического действия.",
    action_label: "Вернуться к решению",
    action_href: "/shortlist",
  },
  ENTITY_NOT_FOUND: {
    title: "Объект не найден",
    message: "Он мог быть удалён из текущего набора данных.",
    action_label: "Вернуться к подбору",
    action_href: "/shortlist",
  },
  // Raised when the storage layer itself is unreachable, so the journey state
  // could neither be read nor written. The wording is the owner's to write.
  STORAGE_UNAVAILABLE: {
    title: "Данные временно недоступны",
    message: "{{ТРЕБУЕТСЯ ТЕКСТ: сообщение при недоступном хранилище}}",
    action_label: "Повторить",
    action_href: "/shortlist",
  },
});

export const presentJourneyError = (
  code: JourneyErrorCode,
): JourneyErrorPresentation => JOURNEY_ERROR_PRESENTATION[code];
