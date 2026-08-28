import { describe, expect, it, vi } from "vitest";

vi.mock("@renderer/i18n", () => ({
  default: { resolvedLanguage: "en", language: "en" },
}));

const { formatRelative } = await import("./date");

const at = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) => new Date(year, month - 1, day, hour, minute, 0, 0);

describe("formatRelative", () => {
  it("keeps hours inside the last day", () => {
    expect(formatRelative(at(2026, 8, 27, 14), at(2026, 8, 28, 10).getTime()))
      .toBe("20 hr. ago");
  });

  it("says yesterday only for the previous calendar day", () => {
    expect(formatRelative(at(2026, 8, 27, 17), at(2026, 8, 28, 23).getTime()))
      .toBe("yesterday");
  });

  it("does not call the day before yesterday yesterday", () => {
    expect(formatRelative(at(2026, 8, 26, 18), at(2026, 8, 28, 2).getTime()))
      .toBe("2 days ago");
    expect(formatRelative(at(2026, 8, 26, 23), at(2026, 8, 28, 1).getTime()))
      .toBe("2 days ago");
  });

  it("counts calendar months, not 30-day blocks", () => {
    expect(formatRelative(at(2026, 7, 24, 10), at(2026, 8, 28, 10).getTime()))
      .toBe("last mo.");
    expect(formatRelative(at(2025, 9, 28, 10), at(2026, 8, 28, 10).getTime()))
      .toBe("11 mo. ago");
  });

  it("stays on days inside the same calendar month", () => {
    expect(formatRelative(at(2026, 5, 1, 10), at(2026, 5, 31, 10).getTime()))
      .toBe("30 days ago");
  });

  it("counts calendar years", () => {
    expect(formatRelative(at(2025, 1, 5, 10), at(2026, 8, 28, 10).getTime()))
      .toBe("last yr.");
  });

  it("handles the future and invalid input", () => {
    expect(formatRelative(at(2026, 8, 30, 10), at(2026, 8, 28, 10).getTime()))
      .toBe("in 2 days");
    expect(formatRelative(new Date(Number.NaN))).toBe("");
  });
});
