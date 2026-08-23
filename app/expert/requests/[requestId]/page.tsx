import type { Metadata } from "next";

import {
  EXPERT_FIXTURE_ACTORS,
  ExpertWorkbench,
  getExpertWorkbenchFixtureRuntime,
} from "../../../../src/expert-workbench";

export const metadata: Metadata = {
  title: "Рабочая задача эксперта · REDS",
  description: "Проверка сохранённого decision context без скрытого refresh.",
};

export default async function ExpertWorkbenchPage({
  params,
}: {
  readonly params: Promise<{ readonly requestId: string }>;
}) {
  const { requestId } = await params;
  const runtime = await getExpertWorkbenchFixtureRuntime();
  let input;
  try {
    input = runtime.application.openWorkbench(
      EXPERT_FIXTURE_ACTORS.real_estate_expert,
      requestId,
    );
  } catch (error) {
    const denied =
      error instanceof Error && error.message.includes("ACCESS_DENIED");
    return (
      <main className="expert-empty" role="alert">
        <h1>{denied ? "Нет доступа к задаче" : "Задача не найдена"}</h1>
        <p>
          {denied
            ? "Permission boundary отклонил доступ текущего fixture-специалиста."
            : "Проверьте идентификатор экспертной задачи."}
        </p>
      </main>
    );
  }
  return <ExpertWorkbench input={input} />;
}
