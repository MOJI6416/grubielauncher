import { describe, expect, it } from "vitest";
import {
  highlightParts,
  searchSettings,
  toRussianLayout,
  type SettingsSearchEntry,
} from "./search";

const entries: SettingsSearchEntry[] = [
  {
    id: "memory",
    section: "game",
    title: "Память для игры",
    description: "Сколько оперативной памяти получит Java",
    keywords: "ram xmx озу",
  },
  {
    id: "downloadSource",
    section: "downloads",
    title: "Источник загрузки",
    description: "Официальные серверы или зеркало Grubie",
    keywords: "mirror зеркало",
  },
  {
    id: "voicePtt",
    section: "voice",
    title: "Режим рации",
    description: "Микрофон включается, пока зажата клавиша",
    keywords: "ptt push to talk",
  },
];

describe("searchSettings", () => {
  it("returns everything for an empty query", () => {
    const result = searchSettings(entries, "   ");

    expect(result.total).toBe(3);
    expect(result.sections).toEqual([]);
    expect(result.matchedIds.has("voicePtt")).toBe(true);
  });

  it("matches titles, descriptions and keywords", () => {
    expect([...searchSettings(entries, "память").matchedIds]).toEqual(["memory"]);
    expect([...searchSettings(entries, "java").matchedIds]).toEqual(["memory"]);
    expect([...searchSettings(entries, "xmx").matchedIds]).toEqual(["memory"]);
  });

  it("requires every token to match", () => {
    expect(searchSettings(entries, "зеркало серверы").total).toBe(1);
    expect(searchSettings(entries, "зеркало микрофон").total).toBe(0);
  });

  it("ignores case and ё", () => {
    expect(searchSettings(entries, "ЗЕРКАЛО").total).toBe(1);
    expect(
      searchSettings(
        [{ ...entries[0], title: "Ёмкость" }],
        "емкость",
      ).total,
    ).toBe(1);
  });

  it("recovers from a wrong keyboard layout", () => {
    expect([...searchSettings(entries, "gfvznm").matchedIds]).toEqual(["memory"]);
  });

  it("reports matched sections in catalog order of appearance", () => {
    const result = searchSettings(entries, "и");

    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.countBySection.game).toBe(1);
  });

  it("matches by entry id so deep links keep working", () => {
    expect([...searchSettings(entries, "downloadSource").matchedIds]).toEqual([
      "downloadSource",
    ]);
  });
});

describe("toRussianLayout", () => {
  it("maps latin keys onto the russian layout", () => {
    expect(toRussianLayout("gfvznm")).toBe("память");
  });

  it("leaves unknown characters alone", () => {
    expect(toRussianLayout("1 2")).toBe("1 2");
  });
});

describe("highlightParts", () => {
  it("splits the text around every hit", () => {
    expect(highlightParts("Память для игры", "память")).toEqual([
      { text: "Память", hit: true },
      { text: " для игры", hit: false },
    ]);
  });

  it("returns the whole string when nothing matches", () => {
    expect(highlightParts("Память", "зеркало")).toEqual([
      { text: "Память", hit: false },
    ]);
  });

  it("returns the whole string for an empty query", () => {
    expect(highlightParts("Память", "")).toEqual([
      { text: "Память", hit: false },
    ]);
  });

  it("handles several hits", () => {
    expect(highlightParts("ram и ещё ram", "ram")).toEqual([
      { text: "ram", hit: true },
      { text: " и ещё ", hit: false },
      { text: "ram", hit: true },
    ]);
  });
});
