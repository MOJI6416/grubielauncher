import { describe, expect, it } from "vitest";
import {
  groupBySection,
  matchRanges,
  parsePaletteQuery,
  rankCommands,
  scoreCommand,
  type Rankable,
} from "./commands";

const command = (
  id: string,
  title: string,
  section: Rankable["section"] = "actions",
  keywords?: string,
): Rankable => ({ id, title, section, keywords });

describe("parsePaletteQuery", () => {
  it("treats plain text as a search over everything", () => {
    expect(parsePaletteQuery("fabric")).toEqual({
      mode: "all",
      query: "fabric",
    });
  });

  it("reads the action prefix", () => {
    expect(parsePaletteQuery("> open")).toEqual({
      mode: "actions",
      query: "open",
    });
  });

  it("reads the instance prefix", () => {
    expect(parsePaletteQuery("@fab")).toEqual({
      mode: "instances",
      query: "fab",
    });
  });

  it("reads the settings prefix", () => {
    expect(parsePaletteQuery("#voice").mode).toBe("settings");
  });

  it("reads the help prefix", () => {
    expect(parsePaletteQuery("?")).toEqual({ mode: "help", query: "" });
  });
});

describe("scoreCommand", () => {
  it("scores an exact title above a prefix match", () => {
    const exact = scoreCommand(command("a", "Play"), "play") ?? 0;
    const prefix = scoreCommand(command("b", "Playtime"), "play") ?? 0;

    expect(exact).toBeGreaterThan(prefix);
  });

  it("scores a word start above a mid-word match", () => {
    const wordStart = scoreCommand(command("a", "New instance"), "inst") ?? 0;
    const inside = scoreCommand(command("b", "Uninstall mods"), "inst") ?? 0;

    expect(wordStart).toBeGreaterThan(inside);
  });

  it("matches by subsequence when nothing else does", () => {
    expect(scoreCommand(command("a", "Open the game folder"), "otgf")).not.toBe(
      null,
    );
  });

  it("uses keywords when the title does not match", () => {
    expect(scoreCommand(command("a", "Мои сборки", "actions", "instances"), "instances")).not.toBe(null);
  });

  it("returns nothing for a query that cannot match", () => {
    expect(scoreCommand(command("a", "Play"), "zzzz")).toBeNull();
  });

  it("returns a neutral score for an empty query", () => {
    expect(scoreCommand(command("a", "Play"), "")).toBe(0);
  });
});

describe("rankCommands", () => {
  const commands = [
    command("home", "Играть", "navigate"),
    command("settings", "Настройки", "navigate"),
    command("new", "Новая сборка", "actions"),
    command("fabric", "Fabric 26.2", "instances"),
    command("vanilla", "Vanilla 26.2", "instances"),
  ];

  it("keeps the declared order when nothing is typed", () => {
    expect(rankCommands(commands, "").map((entry) => entry.id)).toEqual([
      "home",
      "settings",
      "new",
      "fabric",
      "vanilla",
    ]);
  });

  it("lifts a frequently used command when nothing is typed", () => {
    const ranked = rankCommands(commands, "", { fabric: 5 });

    expect(ranked[0].id).toBe("fabric");
  });

  it("filters to instances under the @ prefix", () => {
    expect(rankCommands(commands, "@").map((entry) => entry.id)).toEqual([
      "fabric",
      "vanilla",
    ]);
  });

  it("returns nothing for the help prefix", () => {
    expect(rankCommands(commands, "?")).toEqual([]);
  });

  it("sinks disabled commands below matching ones", () => {
    const ranked = rankCommands(
      [
        { ...command("a", "Играть", "navigate"), disabled: true },
        command("b", "Играть в Fabric", "instances"),
      ],
      "играть",
    );

    expect(ranked.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("honours the limit", () => {
    expect(rankCommands(commands, "", {}, 2)).toHaveLength(2);
  });
});

describe("groupBySection", () => {
  it("orders sections by their best ranked item", () => {
    const groups = groupBySection([
      command("a", "Fabric", "instances"),
      command("b", "Играть", "navigate"),
      command("c", "Vanilla", "instances"),
    ]);

    expect(groups.map((group) => group.section)).toEqual([
      "instances",
      "navigate",
    ]);
    expect(groups[0].commands.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("keeps a section together even when its items are split by rank", () => {
    const groups = groupBySection([
      command("a", "Логи", "actions"),
      command("b", "Люди", "navigate"),
      command("c", "Логи сервера", "actions"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].commands.map((entry) => entry.id)).toEqual(["a", "c"]);
  });
});

describe("matchRanges", () => {
  it("highlights a direct substring", () => {
    expect(matchRanges("Новая сборка", "сбор")).toEqual([[6, 10]]);
  });

  it("highlights scattered characters of a fuzzy match", () => {
    expect(matchRanges("Open folder", "opf")).toEqual([
      [0, 2],
      [5, 6],
    ]);
  });

  it("highlights nothing when the query does not match", () => {
    expect(matchRanges("Play", "zzz")).toEqual([]);
  });
});

describe("subsequence noise", () => {
  it("does not match an instance name scattered across another name", () => {
    expect(
      scoreCommand(command("a", "Fabulously Optimized"), "alulom"),
    ).toBeNull();
  });

  it("still matches a contiguous fragment", () => {
    expect(scoreCommand(command("a", "Fabulously Optimized"), "bulo")).not.toBe(
      null,
    );
  });
});
