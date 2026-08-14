import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import HomePage from "../app/page";

describe("HomePage", () => {
  it("renders the natural-language request entry", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("Опишите, какую недвижимость вы ищете");
    expect(html).toContain("Исходная формулировка сохранится без изменений.");
  });
});
