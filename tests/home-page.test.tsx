import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "../app/(public)/page";

describe("HomePage", () => {
  it("presents the value proposition and routes into the selection flow", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain(
      "Помогаем выбрать недвижимость, а не листать объявления",
    );
    expect(html).toContain("Чем это отличается от каталога объявлений");
    expect(html).toContain('href="/selection"');
    expect(html).toContain('href="/how-it-works"');
    expect(html).toContain('href="/expert-review"');
  });

  it("does not duplicate the request entry that lives on /selection", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).not.toContain("Опишите, какую недвижимость вы ищете");
    expect(html).not.toContain("<textarea");
  });
});
