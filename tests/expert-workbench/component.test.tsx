// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXPERT_FIXTURE_ACTORS,
  EXPERT_FIXTURE_OWNER_ACTOR,
  ExpertQueue,
  ExpertResultReview,
  ExpertWorkbench,
  buildExpertResultReviewView,
  createExpertWorkbenchFixtureRuntime,
} from "../../src/expert-workbench";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

const editableWorkbench = async () => {
  const runtime = await createExpertWorkbenchFixtureRuntime();
  const actor = EXPERT_FIXTURE_ACTORS.real_estate_expert;
  const requestId = runtime.scenarioRequestIds.queue_first!;
  await runtime.application.claimRequest(actor, requestId);
  runtime.application.transition({
    actor,
    requestId,
    status: "in_progress",
    reasonCode: "COMPONENT_TEST_STARTED",
  });
  return {
    runtime,
    actor,
    requestId,
    input: runtime.application.openWorkbench(actor, requestId),
  };
};

const renderScenarioResult = async (scenario: string) => {
  const runtime = await createExpertWorkbenchFixtureRuntime();
  const requestId = runtime.scenarioRequestIds[scenario]!;
  const input = runtime.application.openResultReview(
    EXPERT_FIXTURE_OWNER_ACTOR,
    requestId,
  );
  const escalation = runtime.application.buildTechnicalEscalationHref(input);
  const view = buildExpertResultReviewView(input, escalation);
  render(<ExpertResultReview view={view} />);
  return { runtime, input, view };
};

describe("TASK-017 Expert Queue and Workbench UI", () => {
  it("renders the semantic queue order, status and open links", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const view = runtime.application.listActiveQueue(
      EXPERT_FIXTURE_ACTORS.real_estate_expert,
    );
    render(<ExpertQueue view={view} />);
    const queue = screen.getByRole("list", { name: "Активные задачи" });
    const cards = within(queue).getAllByRole("listitem");
    expect(cards).toHaveLength(4);
    expect(cards[0]?.textContent).toContain("Критический");
    expect(cards[1]?.textContent).toContain("Высокий");
    expect(cards[2]?.textContent).toContain("Обычный");
    expect(cards[3]?.textContent).toContain("Низкий");
    expect(
      within(queue).getAllByRole("link", { name: "Открыть задачу" }),
    ).toHaveLength(4);
    expect(document.body.textContent).not.toContain("Проверка завершена");
  });

  it("keeps the user question prominent and renders saved decision context", async () => {
    const { input } = await editableWorkbench();
    render(<ExpertWorkbench input={input} onAction={vi.fn()} />);
    const questionSection = screen
      .getByRole("heading", { name: "Вопрос пользователя" })
      .closest("section");
    expect(questionSection?.textContent).toContain(
      input.contextPackage.user_question,
    );
    expect(
      screen.getByRole("heading", { name: "Контекст решения" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Обязательно" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Критичные неизвестные" }),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("Match Score");
    expect(document.body.textContent).toContain("Data Confidence");
  });

  it("captures typed check status, method and existing evidence refs", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { input } = await editableWorkbench();
    const subject = input.currentResultDraft.check_items[0]!.subject;
    render(<ExpertWorkbench input={input} onAction={onAction} />);
    await user.selectOptions(
      screen.getByLabelText(`Статус: ${subject}`),
      "checked_confirmed",
    );
    await user.selectOptions(
      screen.getByLabelText(`Способ: ${subject}`),
      "source_review",
    );
    const evidence = input.contextPackage.source_evidence_refs[0]!;
    await user.type(screen.getByLabelText(`Evidence: ${subject}`), evidence);
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "update_check",
          item: expect.objectContaining({ evidence_refs: [evidence] }),
        }),
      ),
    );
  });

  it("adds a structured finding and exposes waiting transition actions", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { input } = await editableWorkbench();
    render(<ExpertWorkbench input={input} onAction={onAction} />);
    await user.type(
      screen.getByLabelText("Конкретный вывод"),
      "Цена требует повторного подтверждения.",
    );
    await user.click(screen.getByRole("button", { name: "Добавить finding" }));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "add_finding",
          finding: expect.objectContaining({
            statement: "Цена требует повторного подтверждения.",
          }),
        }),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Запросить данные у пользователя" }),
    );
    expect(onAction).toHaveBeenCalledWith({
      type: "transition",
      status: "waiting_for_user",
      reasonCode: "EXPERT_REQUESTED_USER_INFO",
    });
  });

  it("blocks completion until every required check has an explicit valid outcome", async () => {
    const { input } = await editableWorkbench();
    render(<ExpertWorkbench input={input} onAction={vi.fn()} />);
    expect(
      (
        screen.getByRole("button", {
          name: "Завершить проверку",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(document.body.textContent).toContain(
      "Match Score вручную не редактируется",
    );
  });

  it("renders specialist notes and structured finding relationship controls", async () => {
    const { input } = await editableWorkbench();
    render(<ExpertWorkbench input={input} onAction={vi.fn()} />);
    const subject = input.currentResultDraft.check_items[0]!.subject;
    expect(screen.getByLabelText(`Заметка: ${subject}`)).toBeTruthy();
    expect(screen.getByLabelText("Связанная сущность")).toBeTruthy();
    expect(screen.getByLabelText("Связанное поле finding")).toBeTruthy();
    expect(
      screen.getByLabelText("Влияние на verification status"),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Что подтвердилось" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Что осталось неизвестным" }),
    ).toBeTruthy();
  });

  it("renders all explicit choice-assistance outcomes", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId = runtime.scenarioRequestIds.choice_assistance_conditional!;
    const request = runtime.repository.get(requestId)!;
    const input = runtime.application.openWorkbench(
      EXPERT_FIXTURE_ACTORS[request.required_specialist],
      requestId,
    );
    render(
      <ExpertWorkbench
        input={{ ...input, canEdit: true }}
        onAction={vi.fn()}
      />,
    );
    const outcome = screen.getByLabelText("Результат сравнения");
    for (const label of [
      "Есть явный вариант",
      "Выбор зависит от условия",
      "Явного победителя нет",
      "Недостаточно данных",
      "Нет варианта без нарушения обязательных условий",
    ])
      expect(within(outcome).getByRole("option", { name: label })).toBeTruthy();
  });
});

describe("TASK-017 user Result Review UI", () => {
  it("shows confirmed facts and keeps Match separate from Data Confidence", async () => {
    await renderScenarioResult("financing_verification_completed");
    expect(screen.getByRole("heading", { name: "Подтверждено" })).toBeTruthy();
    expect(document.body.textContent).toContain("financing.family_mortgage");
    const impact = screen
      .getByRole("heading", { name: "Результат и пересчёт" })
      .closest("section")!;
    expect(
      within(impact).getByRole("heading", { name: "Match Score" }),
    ).toBeTruthy();
    expect(
      within(impact).getByRole("heading", { name: "Data Confidence" }),
    ).toBeTruthy();
    expect(impact.textContent).toContain("нового пересчёта пока нет");
  });

  it("shows explicitly unconfirmed facts", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId =
      runtime.scenarioRequestIds.financing_verification_completed!;
    const input = runtime.application.openResultReview(
      EXPERT_FIXTURE_OWNER_ACTOR,
      requestId,
    );
    const result = input.result!;
    const view = buildExpertResultReviewView(
      {
        ...input,
        result: {
          ...result,
          confirmed: [],
          unconfirmed: [
            {
              entity_id: input.request.property_ids[0]!,
              field: "financing.family_mortgage",
              outcome: "unconfirmed",
              reason: "Условие не подтверждено банком",
              evidence_refs: [],
            },
          ],
        },
      },
      null,
    );
    render(<ExpertResultReview view={view} />);
    const section = screen
      .getByRole("heading", { name: "Не подтвердилось" })
      .closest("section")!;
    expect(section.textContent).toContain("Условие не подтверждено банком");
  });

  it("shows a controlled recompute failure without inventing score changes", async () => {
    const runtime = await createExpertWorkbenchFixtureRuntime();
    const requestId =
      runtime.scenarioRequestIds.financing_verification_completed!;
    const input = runtime.application.openResultReview(
      EXPERT_FIXTURE_OWNER_ACTOR,
      requestId,
    );
    const view = buildExpertResultReviewView(
      {
        ...input,
        recompute: {
          ...input.recompute,
          status: "failed",
          new_match_score: null,
          new_data_confidence_score: null,
          message: "Проверка сохранена, но пересчёт данных пока не выполнен.",
        },
      },
      null,
    );
    render(<ExpertResultReview view={view} />);
    expect(screen.getByRole("status").textContent).toContain(
      "пересчёт данных пока не выполнен",
    );
    expect(document.body.textContent).toContain("нового пересчёта пока нет");
  });

  it("shows unresolved conflicts instead of choosing a silent winner", async () => {
    await renderScenarioResult("price_conflict_unresolved");
    const section = screen
      .getByRole("heading", { name: "Неразрешённые расхождения" })
      .closest("section")!;
    expect(section.textContent).toContain("listing_price");
    expect(section.textContent).toContain("ещё не разрешено");
  });

  it("renders conditional and near-tie choice outcomes honestly", async () => {
    await renderScenarioResult("choice_assistance_conditional");
    expect(
      screen.getByRole("heading", { name: "Выбор зависит от условия" }),
    ).toBeTruthy();
    expect(document.body.textContent).toContain(
      "Если подтвердится финансовое условие",
    );
    cleanup();
    await renderScenarioResult("choice_assistance_near_tie");
    expect(
      screen.getByRole("heading", { name: "Явного победителя нет" }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("Ведущий вариант:");
  });

  it("preserves document and onsite legal boundaries", async () => {
    const documentScenario = await renderScenarioResult(
      "document_review_important",
    );
    expect(screen.getByRole("note").textContent).toContain(
      "не заменяет официальное юридическое заключение",
    );
    expect(
      screen.getByRole("heading", { name: "Проверенные документы" }),
    ).toBeTruthy();
    expect(document.body.textContent).toContain(
      documentScenario.input.contextPackage.document_refs[0],
    );
    cleanup();
    await renderScenarioResult("onsite_unable_to_check");
    expect(screen.getByRole("note").textContent).toContain(
      "не является инженерно-техническим обследованием",
    );
    expect(document.body.textContent).toContain(
      "Доступ к объекту не был предоставлен",
    );
  });

  it("offers only a prefilled technical escalation, without scheduling", async () => {
    await renderScenarioResult("technical_escalation");
    const link = screen.getByRole("link", {
      name: "Передать техническому специалисту",
    });
    expect(link.getAttribute("href")).toContain("type=onsite_check");
    expect(link.getAttribute("href")).toContain(
      "onsite_scope=structural_engineering",
    );
    expect(document.body.textContent?.toLowerCase()).not.toContain("calendar");
  });
});
