import type { Metadata } from "next";

import { PropertyDetailClient } from "../../../src/property-detail/components";

export const metadata: Metadata = {
  title: "Разбор объекта · REDS",
  description:
    "Факты, персональное соответствие, сценарий покупки, неопределённость и источники.",
};

interface PropertyPageProps {
  readonly params: Promise<{ readonly propertyId: string }>;
  readonly searchParams: Promise<{
    readonly offer?: string | readonly string[];
    readonly scenario?: string | readonly string[];
    readonly from?: string | readonly string[];
  }>;
}

const first = (value: string | readonly string[] | undefined): string | null =>
  typeof value === "string" ? value : (value?.[0] ?? null);

export default async function PropertyPage({
  params,
  searchParams,
}: PropertyPageProps) {
  const [{ propertyId }, query] = await Promise.all([params, searchParams]);
  return (
    <PropertyDetailClient
      propertyId={propertyId}
      offerId={first(query.offer)}
      scenarioId={first(query.scenario)}
      returnToComparison={first(query.from) === "comparison"}
    />
  );
}
