import type { Metadata } from "next";

import {
  ExpertWorkbench,
  getRealExpertWorkbenchRuntime,
} from "../../../../src/expert-workbench";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Рабочая задача эксперта · Основание",
  description: "Проверка сохранённого decision context без скрытого refresh.",
};

export default async function ExpertWorkbenchPage({
  params,
}: {
  readonly params: Promise<{ readonly requestId: string }>;
}) {
  const { requestId } = await params;
  const runtime = getRealExpertWorkbenchRuntime();
  if (runtime.actor.actor_type !== "expert")
    return (
      <main className="expert-empty" role="alert">
        <h1>Рабочая задача недоступна</h1>
        <p>Trusted expert actor не настроен для этого окружения.</p>
      </main>
    );
  let input;
  try {
    input = await runtime.application.openWorkbench(runtime.actor, requestId);
  } catch (error) {
    const denied =
      error instanceof Error && error.message.includes("ACCESS_DENIED");
    return (
      <main className="expert-empty" role="alert">
        <h1>{denied ? "Нет доступа к задаче" : "Задача не найдена"}</h1>
        <p>
          {denied
            ? "Permission boundary отклонил доступ текущего специалиста."
            : "Проверьте идентификатор экспертной задачи."}
        </p>
      </main>
    );
  }
  return <ExpertWorkbench input={input} />;
}
