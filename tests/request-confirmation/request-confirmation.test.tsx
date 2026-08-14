// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { userRequestSchema } from "../../src/domain/user-request/schema";
import {
  RequestConfirmation,
  RequestConfirmationClient,
} from "../../src/request-confirmation/components";
import { requestConfirmationResultSchema } from "../../src/request-confirmation/contracts";
import {
  parseUserRequest,
  userRequestParserInputSchema,
  type UserRequestParserResult,
} from "../../src/user-request-parser";

const fixture = async (name: string): Promise<UserRequestParserResult> => {
  const input = userRequestParserInputSchema.parse(
    JSON.parse(
      readFileSync(
        path.resolve(
          process.cwd(),
          "data/examples/user-request-parser",
          `${name}.json`,
        ),
        "utf8",
      ),
    ),
  );
  const outcome = await parseUserRequest(input);
  if (!outcome.success) throw new Error(outcome.error.message);
  return outcome.result;
};

let clearRequest: UserRequestParserResult;
let crossType: UserRequestParserResult;
let relocation: UserRequestParserResult;
let fuzzySchool: UserRequestParserResult;
let contradiction: UserRequestParserResult;
let softFloor: UserRequestParserResult;
let hardFloor: UserRequestParserResult;
let neutralFloor: UserRequestParserResult;

beforeAll(async () => {
  [
    clearRequest,
    crossType,
    relocation,
    fuzzySchool,
    contradiction,
    softFloor,
    hardFloor,
    neutralFloor,
  ] = await Promise.all([
    fixture("a-clear-apartment"),
    fixture("c-cross-type"),
    fixture("b-relocation"),
    fixture("f-fuzzy-school"),
    fixture("i-contradictory-location"),
    fixture("d-soft-floor"),
    fixture("e-hard-floor"),
    fixture("j-neutral-floor"),
  ]);
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("RequestConfirmation", () => {
  it("renders must and preferred criteria with human labels", () => {
    render(<RequestConfirmation parserResult={clearRequest} />);

    expect(screen.getByText("Максимальная цена")).toBeTruthy();
    expect(screen.getByText("Ипотечная программа")).toBeTruthy();
    expect(screen.getByText("Без первоначального взноса")).toBeTruthy();
    expect(screen.getAllByText("Обязательно").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Желательно").length).toBeGreaterThan(0);
    expect(screen.queryByText("budget.purchase_price.maximum")).toBeNull();
  });

  it("distinguishes avoid, exclude, and neutral priorities", () => {
    const { rerender } = render(
      <RequestConfirmation parserResult={softFloor} />,
    );
    expect(
      within(
        screen.getByTestId("criterion-property.floor.is_first"),
      ).getAllByText("Лучше не").length,
    ).toBeGreaterThan(0);

    rerender(<RequestConfirmation key="hard" parserResult={hardFloor} />);
    expect(
      within(
        screen.getByTestId("criterion-property.floor.is_first"),
      ).getAllByText("Исключить").length,
    ).toBeGreaterThan(0);

    rerender(<RequestConfirmation key="neutral" parserResult={neutralFloor} />);
    expect(
      within(
        screen.getByTestId("criterion-property.floor.is_first"),
      ).getAllByText("Неважно / можно гибко").length,
    ).toBeGreaterThan(0);
  });

  it("shows all values in a cross-type request without collapsing them", () => {
    render(<RequestConfirmation parserResult={crossType} />);

    const propertyType = screen.getByTestId(
      "criterion-property.allowed_property_types",
    );
    expect(within(propertyType).getByText(/Квартира, Дом/)).toBeTruthy();
  });

  it("keeps an unknown city explicit and does not insert a pilot city", () => {
    render(<RequestConfirmation parserResult={relocation} />);

    expect(screen.getAllByText(/Город пока не выбран/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("Тула")).toBeNull();
  });

  it("edits a numeric money value using an unformatted domain number", async () => {
    const user = userEvent.setup();
    render(<RequestConfirmation parserResult={clearRequest} />);
    const budget = screen.getByTestId(
      "criterion-budget.purchase_price.maximum",
    );

    await user.click(within(budget).getByRole("button", { name: "Изменить" }));
    const input = within(budget).getByLabelText("Сумма в рублях");
    await user.clear(input);
    await user.type(input, "6000000");
    await user.click(within(budget).getByRole("button", { name: "Сохранить" }));

    expect(within(budget).getByText(/6\s*000\s*000/)).toBeTruthy();
  });

  it("changes priority in the structured criterion", async () => {
    const user = userEvent.setup();
    render(<RequestConfirmation parserResult={clearRequest} />);
    const zeroDown = screen.getByTestId(
      "criterion-financing.zero_initial_payment",
    );

    await user.selectOptions(
      within(zeroDown).getByLabelText("Приоритет"),
      "must",
    );

    expect(within(zeroDown).getByText("Обязательно")).toBeTruthy();
  });

  it("removes an incorrectly extracted criterion", async () => {
    const user = userEvent.setup();
    render(<RequestConfirmation parserResult={clearRequest} />);
    const zeroDown = screen.getByTestId(
      "criterion-financing.zero_initial_payment",
    );

    await user.click(within(zeroDown).getByRole("button", { name: "Удалить" }));

    expect(
      screen.queryByTestId("criterion-financing.zero_initial_payment"),
    ).toBeNull();
  });

  it("answers a clarification and updates the fuzzy criterion", async () => {
    const user = userEvent.setup();
    render(<RequestConfirmation parserResult={fuzzySchool} />);

    await user.type(screen.getByLabelText("Максимум минут"), "15");
    await user.click(screen.getByRole("button", { name: "Ответить" }));

    expect(screen.queryByLabelText("Максимум минут")).toBeNull();
    expect(screen.getByText(/до 15 минут/)).toBeTruthy();
  });

  it("shows a blocking contradiction and disables confirmation", () => {
    render(<RequestConfirmation parserResult={contradiction} />);

    expect(screen.getByText("Условия противоречат друг другу")).toBeTruthy();
    const confirm = screen.getByRole("button", {
      name: "Подтвердить и подобрать варианты",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("allows confirmation with a non-blocking fuzzy unknown", () => {
    render(<RequestConfirmation parserResult={fuzzySchool} />);

    const confirm = screen.getByRole("button", {
      name: "Подтвердить и подобрать варианты",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
  });

  it("shows a human validation error for an invalid range", async () => {
    const user = userEvent.setup();
    render(<RequestConfirmation parserResult={clearRequest} />);

    await user.click(screen.getByRole("button", { name: "Добавить условие" }));
    await user.selectOptions(
      screen.getByLabelText("Условие"),
      "property.area_sqm",
    );
    await user.type(screen.getByLabelText("Минимум"), "80");
    await user.type(screen.getByLabelText("Максимум"), "60");
    await user.click(screen.getByRole("button", { name: "Добавить" }));

    expect(
      screen.getAllByText(
        "Минимальная площадь не может быть больше максимальной.",
      ).length,
    ).toBeGreaterThan(0);
    const confirm = screen.getByRole("button", {
      name: "Подтвердить и подобрать варианты",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("runs parser fixture → edits → confirmation and emits a valid UserRequest", async () => {
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    render(
      <RequestConfirmation
        parserResult={clearRequest}
        onConfirmed={onConfirmed}
      />,
    );

    const zeroDown = screen.getByTestId(
      "criterion-financing.zero_initial_payment",
    );
    await user.selectOptions(
      within(zeroDown).getByLabelText("Приоритет"),
      "must",
    );

    const budget = screen.getByTestId(
      "criterion-budget.purchase_price.maximum",
    );
    await user.click(within(budget).getByRole("button", { name: "Изменить" }));
    const input = within(budget).getByLabelText("Сумма в рублях");
    await user.clear(input);
    await user.type(input, "6200000");
    await user.click(within(budget).getByRole("button", { name: "Сохранить" }));
    await user.click(
      screen.getByRole("button", { name: "Подтвердить и подобрать варианты" }),
    );

    expect(onConfirmed).toHaveBeenCalledTimes(1);
    const result: unknown = onConfirmed.mock.calls[0]?.[0];
    const validated = requestConfirmationResultSchema.parse(result);
    expect(
      userRequestSchema.safeParse(validated.confirmed_request).success,
    ).toBe(true);
    expect(validated.original_raw_text).toBe(clearRequest.raw_text);
    expect(
      validated.confirmed_request.budget.purchase_price.maximum?.amount,
    ).toBe("6200000.00");
    expect(
      validated.confirmed_request.must_have.find(
        (criterion) => criterion.field === "financing.zero_initial_payment",
      )?.priority,
    ).toBe("must");
    expect(screen.getByText("Запрос подтверждён")).toBeTruthy();
  });

  it("renders a controlled direct-entry state when parser result is missing", () => {
    render(<RequestConfirmationClient initialResult={null} />);

    expect(
      screen.getByText("Сначала опишите, какую недвижимость вы ищете."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Вернуться к запросу" }),
    ).toBeTruthy();
  });
});
