import type { Metadata } from "next";
import { UserUrlIngestionClient } from "../../src/user-url-ingestion/components";

export const metadata: Metadata = {
  title: "Добавить объект по ссылке · REDS",
  description:
    "Безопасное добавление пользовательской ссылки с подтверждением данных.",
};

export default function AddUrlPage() {
  return <UserUrlIngestionClient />;
}
