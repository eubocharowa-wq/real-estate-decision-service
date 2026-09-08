import { describe, expect, it } from "vitest";

import {
  parseArea,
  parseAreaBreakdown,
  parseAvailability,
  parseFloor,
  parseFloorPosition,
  parseIsoDate,
  parsePrice,
  parseRooms,
  SourceValueError,
} from "../../src/data-collection/source-adapters";

/**
 * Real listings do not use the one canonical shape the synthetic fixtures do.
 * These cases are the formats a Russian source actually publishes.
 */
describe("area", () => {
  it("reads the total/living/kitchen form without losing the components", () => {
    expect(parseAreaBreakdown("38.2/23.7/8.4")).toEqual({
      total: 38.2,
      living: 23.7,
      kitchen: 8.4,
    });
    expect(parseAreaBreakdown("38,2 м² / 23,7 / 8,4").total).toBe(38.2);
    expect(parseArea("38.2/23.7/8.4")).toBe(38.2);
  });

  it("still reads a plain area and keeps the components unknown", () => {
    expect(parseAreaBreakdown("38,2 м²")).toEqual({
      total: 38.2,
      living: null,
      kitchen: null,
    });
    expect(parseAreaBreakdown("41 кв.м").total).toBe(41);
  });

  it("refuses a breakdown that contradicts itself", () => {
    expect(() => parseAreaBreakdown("38.2/50.0")).toThrow(SourceValueError);
    expect(() => parseAreaBreakdown("38.2/20/10/5")).toThrow(SourceValueError);
    expect(() => parseAreaBreakdown("0")).toThrow(SourceValueError);
  });
});

describe("floor", () => {
  it("reads the floor together with the building height", () => {
    expect(parseFloorPosition("5/17")).toEqual({ floor: 5, floorsTotal: 17 });
    expect(parseFloorPosition("5 из 17")).toEqual({
      floor: 5,
      floorsTotal: 17,
    });
    expect(parseFloorPosition("5 из 17 этажей").floorsTotal).toBe(17);
  });

  it("still reads a bare floor and a basement level", () => {
    expect(parseFloorPosition("3")).toEqual({ floor: 3, floorsTotal: null });
    expect(parseFloorPosition("3 этаж").floor).toBe(3);
    expect(parseFloor("-1")).toBe(-1);
  });

  it("refuses a floor above the building it is in", () => {
    expect(() => parseFloorPosition("21/17")).toThrow(SourceValueError);
    expect(() => parseFloorPosition("мансарда")).toThrow(SourceValueError);
  });
});

describe("price", () => {
  it("reads scaled amounts exactly, without floating point", () => {
    expect(parsePrice("4,5 млн", "exact").amount).toBe("4500000");
    expect(parsePrice("4.5 млн ₽", "exact").amount).toBe("4500000");
    expect(parsePrice("1,234 млн", "exact").amount).toBe("1234000");
    expect(parsePrice("850 тыс.", "exact").amount).toBe("850000");
    expect(parsePrice("4 500 000 ₽", "exact").amount).toBe("4500000");
  });

  it("keeps the lower-bound marker tied to the declared semantics", () => {
    expect(parsePrice("от 4,5 млн", "lower_bound")).toEqual({
      amount: "4500000",
      priceFrom: true,
    });
    expect(() => parsePrice("от 4,5 млн", "exact")).toThrow(SourceValueError);
    expect(() => parsePrice("4500000", "lower_bound")).toThrow(
      SourceValueError,
    );
  });

  it("refuses text that is not an amount", () => {
    expect(() => parsePrice("Цена по запросу", "exact")).toThrow(
      SourceValueError,
    );
  });
});

describe("availability", () => {
  it("reports a recognised status", () => {
    expect(parseAvailability("В продаже")).toEqual({
      recognized: true,
      value: "available",
    });
    expect(parseAvailability("Продана").value).toBe("sold");
  });

  it("signals an unrecognised value instead of passing it off as unknown", () => {
    const parsed = parseAvailability("Снята с публикации");
    expect(parsed).toEqual({
      recognized: false,
      value: "unknown",
      sourceText: "Снята с публикации",
    });
    // The distinction the caller needs: nothing was said vs something was
    // said that this adapter version cannot read.
    expect(parsed.recognized).toBe(false);
  });

  it("still refuses an empty value", () => {
    expect(() => parseAvailability("  ")).toThrow(SourceValueError);
  });
});

describe("rooms and dates", () => {
  it("keeps the existing accepted shapes", () => {
    expect(parseRooms("студия")).toBe(0);
    expect(parseRooms("2-комнатная")).toBe(2);
    expect(parseIsoDate("timeline.handover_date", "2026-09-01")).toBe(
      "2026-09-01",
    );
    expect(() =>
      parseIsoDate("timeline.handover_date", "IV квартал 2026"),
    ).toThrow(SourceValueError);
  });
});
