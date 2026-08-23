import type { Metadata } from "next";

import { ExpertRequestForm } from "../../../src/expert/components";
import { buildExpertRequestPreview } from "../../../src/expert";

export const metadata: Metadata = {
  title: "Экспертная проверка · REDS",
  description:
    "Создание контекстной экспертной задачи по конкретному неизвестному, конфликту или выбору финалистов.",
};

interface ExpertRequestPageProps {
  readonly searchParams: Promise<
    Readonly<Record<string, string | readonly string[] | undefined>>
  >;
}

const first = (value: string | readonly string[] | undefined): string | null =>
  typeof value === "string" ? value : (value?.[0] ?? null);

const count = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const list = (
  value: string | readonly string[] | undefined,
): readonly string[] => {
  const values = typeof value === "string" ? [value] : (value ?? []);
  return values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
};

export default async function ExpertRequestPage({
  searchParams,
}: ExpertRequestPageProps) {
  const query = await searchParams;
  const preview = buildExpertRequestPreview({
    type: first(query.type),
    property: first(query.property),
    properties: first(query.properties),
    userRequest: first(query.request),
    comparison: first(query.comparison),
    field: first(query.field),
    check: first(query.check),
    unknownCount: count(first(query.unknowns)),
    documentRefs: list(query.documents),
    onsiteScope: first(query.onsite_scope),
    knownRisks: list(query.known_risks),
    itemsToCheck: list(query.items_to_check),
  });
  return <ExpertRequestForm preview={preview} />;
}
