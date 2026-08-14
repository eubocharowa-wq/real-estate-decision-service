import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "../app/page";

describe("HomePage", () => {
  it("renders the scaffold copy", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("Real Estate Decision Service");
    expect(html).toContain("Помогаем выбрать недвижимость под ваши условия.");
  });
});
