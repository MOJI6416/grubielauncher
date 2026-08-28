import { describe, expect, it } from "vitest";
import { IErrorLogEntry } from "@renderer/stores/atoms";
import { errorLogToText, groupErrorLog } from "./errorLog";

const entry = (
  id: string,
  title: string,
  time: number,
  details?: string,
): IErrorLogEntry => ({ id, title, time, details });

describe("groupErrorLog", () => {
  it("collapses repeated neighbours into one row with a count", () => {
    const groups = groupErrorLog([
      entry("3", "Не удалось скачать мод", 300, "mirror"),
      entry("2", "Не удалось скачать мод", 200, "mirror"),
      entry("1", "Игра упала", 100),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].count).toBe(2);
    expect(groups[0].time).toBe(300);
    expect(groups[1].count).toBe(1);
  });

  it("keeps entries apart when the details differ", () => {
    const groups = groupErrorLog([
      entry("2", "Ошибка", 200, "a"),
      entry("1", "Ошибка", 100, "b"),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("returns nothing for an empty log", () => {
    expect(groupErrorLog([])).toEqual([]);
  });
});

describe("errorLogToText", () => {
  it("writes the count and the details", () => {
    const text = errorLogToText(
      groupErrorLog([
        entry("2", "Ошибка", Date.parse("2026-08-15T20:00:00Z"), "detail"),
        entry("1", "Ошибка", Date.parse("2026-08-15T19:00:00Z"), "detail"),
      ]),
    );

    expect(text).toContain("Ошибка (x2)");
    expect(text).toContain("detail");
  });
});
