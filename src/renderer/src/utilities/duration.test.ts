import { describe, expect, it, vi } from "vitest";

vi.mock("@renderer/i18n", () => ({
  default: { t: (key: string) => key, language: "ru", resolvedLanguage: "ru" },
}));

const { formatClock, formatDurationWith } = await import("./duration");

const labels = { h: "ч", m: "мин", s: "с" };

describe("formatDurationWith", () => {
  it("returns the empty label for nothing played", () => {
    expect(formatDurationWith(0, labels)).toBe("—");
    expect(formatDurationWith(undefined, labels)).toBe("—");
    expect(formatDurationWith(-5, labels)).toBe("—");
    expect(formatDurationWith(0, labels, { empty: "" })).toBe("");
  });

  it("keeps very short sessions readable", () => {
    expect(formatDurationWith(20, labels)).toBe("< 1 мин");
    expect(formatDurationWith(20, labels, { withSeconds: true })).toBe("20 с");
  });

  it("writes hours and minutes the compact way", () => {
    expect(formatDurationWith(76 * 3600 + 10 * 60, labels)).toBe("76 ч 10 мин");
    expect(formatDurationWith(45 * 60 + 12, labels)).toBe("45 мин");
    expect(
      formatDurationWith(45 * 60 + 12, labels, { withSeconds: true }),
    ).toBe("45 мин 12 с");
    expect(formatDurationWith(2 * 3600, labels)).toBe("2 ч");
  });

  it("drops minutes past a hundred hours and groups by locale", () => {
    expect(formatDurationWith(120 * 3600 + 30 * 60, labels)).toBe("120 ч");
    expect(formatDurationWith(1234 * 3600, labels, { locale: "en" })).toBe(
      "1,234 ч",
    );
  });
});

describe("formatClock", () => {
  it("formats under an hour without hours", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(-1000)).toBe("0:00");
  });

  it("adds hours past the hour mark", () => {
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });
});
