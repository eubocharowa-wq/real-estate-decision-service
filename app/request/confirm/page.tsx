import type { Metadata } from "next";

import { RequestConfirmationClient } from "../../../src/request-confirmation/components";

export const metadata: Metadata = {
  title: "Подтверждение запроса — Основание",
  description: "Проверьте и уточните условия перед подбором недвижимости.",
};

export default function RequestConfirmationPage() {
  return <RequestConfirmationClient />;
}
