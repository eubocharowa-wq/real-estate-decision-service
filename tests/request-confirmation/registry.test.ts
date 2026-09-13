import { describe, expect, it } from "vitest";

import { formatCriterionValue } from "../../src/request-confirmation";

describe("formatCriterionValue — room count declension", () => {
  it.each([
    [0, "0 комнат"],
    [1, "1 комната"],
    [2, "2 комнаты"],
    [3, "3 комнаты"],
    [4, "4 комнаты"],
    [5, "5 комнат"],
    [10, "10 комнат"],
    [11, "11 комнат"],
    [12, "12 комнат"],
    [13, "13 комнат"],
    [14, "14 комнат"],
    [21, "21 комната"],
    [22, "22 комнаты"],
    [25, "25 комнат"],
    [100, "100 комнат"],
    [101, "101 комната"],
  ])(
    "property.rooms with value %i renders %s, not the raw 'rooms' unit",
    (value, expected) => {
      const text = formatCriterionValue("property.rooms", value);
      expect(text).toBe(expected);
      expect(text).not.toContain("rooms");
    },
  );

  it("declines property.rooms_min the same way", () => {
    expect(formatCriterionValue("property.rooms_min", 1)).toBe("1 комната");
    expect(formatCriterionValue("property.rooms_min", 2)).toBe("2 комнаты");
    expect(formatCriterionValue("property.rooms_min", 5)).toBe("5 комнат");
  });

  it("leaves other numeric units untouched", () => {
    expect(formatCriterionValue("property.floor", 3)).toBe("3 этаж");
    expect(formatCriterionValue("house.land_area", 6)).toBe("6 соток");
  });
});
