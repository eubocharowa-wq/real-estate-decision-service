import type { Metadata } from "next";

import {
  ExpertQueue,
  getRealExpertWorkbenchRuntime,
} from "../../../src/expert-workbench";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Экспертные задачи · Основание",
  description: "Активная очередь контекстных экспертных задач.",
};

export default async function ExpertRequestsPage() {
  const runtime = getRealExpertWorkbenchRuntime();
  if (runtime.actor.actor_type !== "expert")
    return (
      <main className="expert-empty" role="alert">
        <h1>Рабочая очередь недоступна</h1>
        <p>Trusted expert actor не настроен для этого окружения.</p>
      </main>
    );
  const view = await runtime.application.listActiveQueue(runtime.actor);
  return <ExpertQueue view={view} />;
}
