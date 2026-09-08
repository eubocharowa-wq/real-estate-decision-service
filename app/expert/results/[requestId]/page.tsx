import type { Metadata } from "next";

import {
  EXPERT_FIXTURE_OWNER_ACTOR,
  ExpertResultReview,
  buildExpertResultReviewView,
  getExpertWorkbenchFixtureRuntime,
} from "../../../../src/expert-workbench";
import { PilotFeedbackForm } from "../../../../src/pilot-hardening/components";

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
  const runtime = await getExpertWorkbenchFixtureRuntime();
  let view;
  try {
    const input = await runtime.application.openResultReview(
      EXPERT_FIXTURE_OWNER_ACTOR,
      requestId,
    );
    view = buildExpertResultReviewView(
      input,
      runtime.application.buildTechnicalEscalationHref(input),
    );
  } catch (error) {
    const denied =
      error instanceof Error && error.message.includes("ACCESS_DENIED");
    return (
      <main className="expert-empty" role="alert">
        <h1>{denied ? "Нет доступа к результату" : "Результат не найден"}</h1>
        <p>Проверка ещё не завершена или недоступна текущему владельцу.</p>
      </main>
    );
  }
  return (
    <>
      <ExpertResultReview view={view} />
      {journeyId ? (
        <PilotFeedbackForm journeyId={journeyId} stage="expert_result" />
      ) : null}
    </>
  );
}
