import type { Metadata } from "next";

import { ExpertResultRuntimeClient } from "../../../../src/expert-workbench";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Результат экспертной проверки · Основание",
  description: "Структурированный результат проверки и его влияние на решение.",
};

export default async function ExpertResultPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly requestId: string }>;
  readonly searchParams: Promise<{ readonly journeyId?: string }>;
}) {
  const { requestId } = await params;
  const { journeyId } = await searchParams;
  return (
    <ExpertResultRuntimeClient requestId={requestId} journeyId={journeyId} />
  );
}
