import { describe, expect, it } from "vitest";
import {
  activeSeasonalEvent,
  isEventActive,
  sameActiveEvent,
  type SeasonalEvent,
} from "./calendar";

const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour);

describe("activeSeasonalEvent", () => {
  it("is quiet outside every event", () => {
    expect(activeSeasonalEvent(at(2026, 10, 19, 23))).toBeNull();
    expect(activeSeasonalEvent(at(2026, 11, 4, 0))).toBeNull();
    expect(activeSeasonalEvent(at(2026, 7, 1))).toBeNull();
  });

  it("covers Halloween from October 20 to November 3 inclusive", () => {
    expect(activeSeasonalEvent(at(2026, 10, 20, 0))?.id).toBe("halloween");
    expect(activeSeasonalEvent(at(2026, 11, 3, 23))?.id).toBe("halloween");
  });

  it("marks October 31 as the peak", () => {
    expect(activeSeasonalEvent(at(2026, 10, 31))?.isPeak).toBe(true);
    expect(activeSeasonalEvent(at(2026, 10, 30))?.isPeak).toBe(false);
    expect(activeSeasonalEvent(at(2026, 11, 1))?.isPeak).toBe(false);
  });

  it("reports the last day in the current year", () => {
    expect(activeSeasonalEvent(at(2027, 10, 25))?.endsOn).toEqual(
      new Date(2027, 10, 3),
    );
  });
});

describe("events across the new year", () => {
  const winter: SeasonalEvent = {
    id: "halloween",
    start: { month: 12, day: 20 },
    end: { month: 1, day: 7 },
    peak: { month: 12, day: 31 },
  };

  it("stays active on both sides of January 1", () => {
    expect(isEventActive(winter, at(2026, 12, 20))).toBe(true);
    expect(isEventActive(winter, at(2027, 1, 7))).toBe(true);
    expect(isEventActive(winter, at(2026, 12, 19))).toBe(false);
    expect(isEventActive(winter, at(2027, 1, 8))).toBe(false);
  });

  it("ends in the next year when started in December", () => {
    expect(activeSeasonalEvent(at(2026, 12, 25), [winter])?.endsOn).toEqual(
      new Date(2027, 0, 7),
    );
    expect(activeSeasonalEvent(at(2027, 1, 2), [winter])?.endsOn).toEqual(
      new Date(2027, 0, 7),
    );
  });
});

describe("sameActiveEvent", () => {
  it("treats a new day of the same event as unchanged", () => {
    expect(
      sameActiveEvent(
        activeSeasonalEvent(at(2026, 10, 21)),
        activeSeasonalEvent(at(2026, 10, 22)),
      ),
    ).toBe(true);
  });

  it("notices the peak and the end", () => {
    expect(
      sameActiveEvent(
        activeSeasonalEvent(at(2026, 10, 30)),
        activeSeasonalEvent(at(2026, 10, 31)),
      ),
    ).toBe(false);
    expect(sameActiveEvent(activeSeasonalEvent(at(2026, 11, 3)), null)).toBe(
      false,
    );
  });
});
