// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExpertRequestForm } from "../../src/expert/components";
import { buildExpertRequestPreview } from "../../src/expert";

afterEach(() => cleanup());

describe("TASK-016 user-facing expert request UI", () => {
  it("shows the four required questions and a human-readable context preview", () => {
    const preview = buildExpertRequestPreview({
      type: "choice_assistance",
      property: null,
      properties: "property_a,property_b,property_c",
      userRequest: "request_a",
      comparison: "comparison_a",
      field: null,
      check: null,
      unknownCount: 2,
      documentRefs: [],
      onsiteScope: null,
    });
    render(<ExpertRequestForm preview={preview} onSubmit={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Что нужно проверить?" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Почему это важно?" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Какие объекты будут переданы эксперту?",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ваш вопрос" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Передадим эксперту" }),
    ).toBeTruthy();
    expect(screen.queryByText("FieldEvidence[]")).toBeNull();
    expect(screen.queryByText("CriterionEvaluationResult[]")).toBeNull();
  });

  it("preserves the user question in the submitted payload", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const preview = buildExpertRequestPreview({
      type: null,
      property: "property_a",
      properties: null,
      userRequest: "request_a",
      comparison: null,
      field: "financing.family_mortgage",
      check: "confirm_family_mortgage",
      unknownCount: 1,
      documentRefs: [],
      onsiteScope: null,
    });
    render(<ExpertRequestForm preview={preview} onSubmit={onSubmit} />);
    const question =
      "Подтвердите, действует ли семейная ипотека для этого предложения.";
    await user.type(
      screen.getByLabelText("Сформулируйте вопрос своими словами"),
      question,
    );
    await user.click(
      screen.getByRole("button", { name: "Передать на экспертную проверку" }),
    );
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        userQuestion: question,
        triggerType: "financing_uncertainty",
        propertyIds: ["property_a"],
      }),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Контекстный запрос создан",
    );
  });
});
