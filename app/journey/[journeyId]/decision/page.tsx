import Link from "next/link";

import { JourneyDecisionUpdateView } from "../../../../src/buyer-journey/components";
import { getBuyerJourneyRuntime } from "../../../../src/buyer-journey/runtime";

export const dynamic = "force-dynamic";

const loadDecision = async (journeyId: string) => {
  try {
    const application = getBuyerJourneyRuntime();
    return {
      journey: await application.getJourney(journeyId),
      update: (await application.getJourneySnapshot(journeyId)).decision_update,
    };
  } catch {
    return null;
  }
};

export default async function UpdatedDecisionPage({
  params,
}: {
  readonly params: Promise<{ readonly journeyId: string }>;
}) {
  const { journeyId } = await params;
  const state = await loadDecision(journeyId);
  if (!state)
    return (
      <main className="empty-state">
        <p className="eyebrow">Путь выбора не найден</p>
        <h1>Сначала опишите задачу</h1>
        <p>Мы не подставляем чужой или устаревший контекст решения.</p>
        <Link className="button button-primary" href="/">
          Описать задачу
        </Link>
      </main>
    );
  if (!state.update)
    return (
      <main className="empty-state">
        <p className="eyebrow">Обновлённое решение</p>
        <h1>Пересчёт ещё не завершён</h1>
        <p>
          Текущий подбор остаётся доступен. После проверки здесь появятся только
          реальные изменения.
        </p>
        <Link className="button button-primary" href="/shortlist">
          Вернуться к подбору
        </Link>
      </main>
    );
  return (
    <JourneyDecisionUpdateView journey={state.journey} update={state.update} />
  );
}
