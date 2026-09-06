import type { Metadata } from "next";

import {
  EXPERT_FIXTURE_ACTORS,
  ExpertQueue,
  getExpertWorkbenchFixtureRuntime,
} from "../../../src/expert-workbench";

export const metadata: Metadata = {
  title: "Экспертные задачи · REDS",
  description: "Активная очередь контекстных экспертных задач.",
};

export default async function ExpertRequestsPage() {
  const runtime = await getExpertWorkbenchFixtureRuntime();
  const view = await runtime.application.listActiveQueue(
    EXPERT_FIXTURE_ACTORS.real_estate_expert,
  );
  return <ExpertQueue view={view} />;
}
