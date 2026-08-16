import type { Metadata } from "next";

import { ComparisonClient } from "../../src/comparison/components";

export const metadata: Metadata = {
  title: "Сравнение финалистов · REDS",
  description:
    "Сравнение 2–4 объектов по условиям пользователя, сценариям покупки и надёжности данных.",
};

interface ComparisonPageProps {
  readonly searchParams: Promise<{
    readonly property?: string | readonly string[];
    readonly offer?: string | readonly string[];
    readonly scenario?: string | readonly string[];
  }>;
}

const first = (value: string | readonly string[] | undefined): string | null =>
  typeof value === "string" ? value : (value?.[0] ?? null);

export default async function ComparisonPage({
  searchParams,
}: ComparisonPageProps) {
  const query = await searchParams;
  const propertyId = first(query.property);
  return (
    <ComparisonClient
      requestedItem={
        propertyId
          ? {
              propertyId,
              offerId: first(query.offer),
              scenarioId: first(query.scenario),
            }
          : null
      }
    />
  );
}
