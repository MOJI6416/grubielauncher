import { describe, expect, it } from "vitest";
import {
  getDayLabel,
  isSameDay,
  shouldGroupMessage,
  shouldShowDaySeparator,
} from "./chatTimeline";

const at = (iso: string) => new Date(iso);

describe("isSameDay", () => {
  it("separates midnight neighbours", () => {
    expect(
      isSameDay(at("2026-08-14T23:59:00"), at("2026-08-15T00:01:00")),
    ).toBe(false);
  });

  it("keeps the same calendar day together", () => {
    expect(
      isSameDay(at("2026-08-15T00:01:00"), at("2026-08-15T23:59:00")),
    ).toBe(true);
  });
});

describe("shouldShowDaySeparator", () => {
  it("always shows before the first message", () => {
    expect(shouldShowDaySeparator("2026-08-15T10:00:00")).toBe(true);
    expect(shouldShowDaySeparator("2026-08-15T10:00:00", null)).toBe(true);
  });

  it("shows when the day changes", () => {
    expect(
      shouldShowDaySeparator("2026-08-15T00:10:00", "2026-08-14T23:50:00"),
    ).toBe(true);
  });

  it("stays hidden inside one day", () => {
    expect(
      shouldShowDaySeparator("2026-08-15T18:00:00", "2026-08-15T09:00:00"),
    ).toBe(false);
  });

  it("never breaks the list on an unparsable time", () => {
    expect(shouldShowDaySeparator("nonsense", "2026-08-15T09:00:00")).toBe(
      false,
    );
  });
});

describe("getDayLabel", () => {
  const now = at("2026-08-15T12:00:00");

  it("names today and yesterday", () => {
    expect(getDayLabel("2026-08-15T08:00:00", now)).toEqual({ kind: "today" });
    expect(getDayLabel("2026-08-14T08:00:00", now)).toEqual({
      kind: "yesterday",
    });
  });

  it("crosses a month boundary backwards", () => {
    expect(getDayLabel("2026-07-31T23:00:00", at("2026-08-01T01:00:00"))).toEqual(
      { kind: "yesterday" },
    );
  });

  it("falls back to a date for anything older", () => {
    const label = getDayLabel("2026-08-01T08:00:00", now);
    expect(label.kind).toBe("date");
  });
});

describe("shouldGroupMessage", () => {
  const base = { sender: "a", time: "2026-08-15T10:00:00" };

  it("groups the same author inside the window", () => {
    expect(
      shouldGroupMessage({ sender: "a", time: "2026-08-15T10:04:00" }, base),
    ).toBe(true);
  });

  it("breaks after the window", () => {
    expect(
      shouldGroupMessage({ sender: "a", time: "2026-08-15T10:06:00" }, base),
    ).toBe(false);
  });

  it("breaks on a different author", () => {
    expect(
      shouldGroupMessage({ sender: "b", time: "2026-08-15T10:01:00" }, base),
    ).toBe(false);
  });

  it("breaks after a system message", () => {
    expect(
      shouldGroupMessage(
        { sender: "a", time: "2026-08-15T10:01:00" },
        { ...base, isSystem: true },
      ),
    ).toBe(false);
  });

  it("breaks when the message quotes another one", () => {
    expect(
      shouldGroupMessage(
        { sender: "a", time: "2026-08-15T10:01:00", hasReply: true },
        base,
      ),
    ).toBe(false);
  });

  it("breaks across midnight even inside the window", () => {
    expect(
      shouldGroupMessage(
        { sender: "a", time: "2026-08-15T00:01:00" },
        { sender: "a", time: "2026-08-14T23:59:00" },
      ),
    ).toBe(false);
  });

  it("has nothing to group with at the top of the list", () => {
    expect(shouldGroupMessage(base)).toBe(false);
  });
});
