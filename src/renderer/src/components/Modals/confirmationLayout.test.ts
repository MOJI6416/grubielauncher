import { describe, expect, it } from "vitest";
import {
  orderButtons,
  primaryButtonIndex,
  resolveTone,
} from "./confirmationLayout";

describe("resolveTone", () => {
  it("takes the loudest tone from content and buttons together", () => {
    expect(resolveTone([{ color: "warning" }], [{ color: "danger" }])).toBe(
      "danger",
    );
    expect(resolveTone([{ color: "warning" }], [{}])).toBe("warning");
    expect(resolveTone([{}], [{ color: "success" }])).toBe("success");
  });

  it("catches a destructive dialog whose text carries no tone", () => {
    expect(
      resolveTone([{}], [{ color: "secondary" }, { color: "danger" }]),
    ).toBe("danger");
  });

  it("falls back to neutral", () => {
    expect(resolveTone([], [])).toBe("neutral");
    expect(resolveTone([{}], [{ color: "default" }])).toBe("neutral");
    expect(resolveTone([{}], [{ color: "primary" }])).toBe("neutral");
  });
});

describe("primaryButtonIndex", () => {
  it("picks the first confirming button whatever its position", () => {
    expect(
      primaryButtonIndex([{ color: "danger" }, { color: "default" }]),
    ).toBe(0);
    expect(
      primaryButtonIndex([{ color: "secondary" }, { color: "danger" }]),
    ).toBe(1);
    expect(
      primaryButtonIndex([{ color: "success" }, { color: undefined }]),
    ).toBe(0);
  });

  it("falls back to the last button when nothing is marked", () => {
    expect(primaryButtonIndex([{}, {}, {}])).toBe(2);
  });

  it("reports nothing for an empty list", () => {
    expect(primaryButtonIndex([])).toBe(-1);
  });
});

describe("orderButtons", () => {
  const labelled = <T extends { text: string; color?: any }>(list: T[]) =>
    orderButtons(list).map((slot) => [slot.button.text, slot.variant]);

  it("moves the confirming action to the end", () => {
    expect(
      labelled([
        { text: "Удалить", color: "danger" },
        { text: "Отмена", color: "default" },
      ]),
    ).toEqual([
      ["Отмена", "secondary"],
      ["Удалить", "destructive"],
    ]);
  });

  it("keeps an already correct order", () => {
    expect(
      labelled([
        { text: "Отмена", color: "secondary" },
        { text: "Открыть", color: "danger" },
      ]),
    ).toEqual([
      ["Отмена", "secondary"],
      ["Открыть", "destructive"],
    ]);
  });

  it("leaves exactly one filled accent when several buttons are uncoloured", () => {
    const slots = orderButtons([
      { text: "Обновить", color: "success" as const },
      { text: "Запустить без обновления" },
    ]);

    expect(slots.map((slot) => slot.variant)).toEqual(["secondary", "default"]);
    expect(slots.filter((slot) => slot.isPrimary)).toHaveLength(1);
  });

  it("preserves the relative order of the dismissive buttons", () => {
    expect(
      labelled([
        { text: "A" },
        { text: "B" },
        { text: "Готово", color: "primary" },
      ]),
    ).toEqual([
      ["A", "secondary"],
      ["B", "secondary"],
      ["Готово", "default"],
    ]);
  });

  it("returns nothing for an empty list", () => {
    expect(orderButtons([])).toEqual([]);
  });
});
