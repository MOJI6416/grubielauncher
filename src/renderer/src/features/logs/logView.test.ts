import { describe, expect, it } from "vitest";
import { parseLogText } from "./logParse";
import {
  ALL_LEVELS,
  buildView,
  countLevels,
  firstProblem,
  highlight,
  nextProblem,
  problemPositions,
  stepMatch,
} from "./logView";

const entries = parseLogText(
  [
    "[10:00:01] [main/INFO]: Loading Minecraft",
    "[10:00:02] [main/DEBUG]: Mixin ready",
    "[10:00:03] [main/WARN]: Error rendering overlay",
    "[10:00:04] [main/ERROR]: Failed to load mod sodium",
    "\tat net.fabricmc.Knot.launch(Knot.java:72)",
    "[10:00:05] [main/ERROR]: Mixin apply for mod sodium failed",
  ].join("\n"),
);

describe("countLevels", () => {
  it("counts every level plus the total", () => {
    expect(countLevels(entries)).toEqual({
      all: 5,
      fatal: 0,
      error: 2,
      warn: 1,
      info: 1,
      debug: 1,
    });
  });
});

describe("buildView", () => {
  it("keeps everything when all levels are selected", () => {
    const view = buildView(entries, {
      levels: ALL_LEVELS,
      search: "",
      onlyMatches: false,
    });

    expect(view.entries).toHaveLength(5);
    expect(view.matches).toEqual([]);
  });

  it("filters by level", () => {
    const view = buildView(entries, {
      levels: ["error"],
      search: "",
      onlyMatches: false,
    });

    expect(view.entries.map((entry) => entry.level)).toEqual(["error", "error"]);
  });

  it("returns match positions relative to the visible list", () => {
    const view = buildView(entries, {
      levels: ALL_LEVELS,
      search: "sodium",
      onlyMatches: false,
    });

    expect(view.entries).toHaveLength(5);
    expect(view.matches).toEqual([3, 4]);
  });

  it("searches inside folded stack traces", () => {
    const view = buildView(entries, {
      levels: ALL_LEVELS,
      search: "Knot.java",
      onlyMatches: true,
    });

    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].text).toBe("Failed to load mod sodium");
  });

  it("drops non matching lines when only matches is on", () => {
    const view = buildView(entries, {
      levels: ALL_LEVELS,
      search: "sodium",
      onlyMatches: true,
    });

    expect(view.entries).toHaveLength(2);
    expect(view.matches).toEqual([0, 1]);
  });
});

describe("stepMatch", () => {
  it("wraps around in both directions", () => {
    expect(stepMatch(3, -1, 1)).toBe(0);
    expect(stepMatch(3, -1, -1)).toBe(2);
    expect(stepMatch(3, 2, 1)).toBe(0);
    expect(stepMatch(3, 0, -1)).toBe(2);
    expect(stepMatch(0, 0, 1)).toBe(-1);
  });
});

describe("highlight", () => {
  it("splits a line into matched and unmatched parts", () => {
    expect(highlight("mod sodium failed", "sodium")).toEqual([
      { text: "mod ", hit: false },
      { text: "sodium", hit: true },
      { text: " failed", hit: false },
    ]);
  });

  it("returns the whole line when there is no query", () => {
    expect(highlight("plain", "  ")).toEqual([{ text: "plain", hit: false }]);
  });
});

describe("nextProblem", () => {
  const positions = problemPositions(entries);

  it("lists the failing rows", () => {
    expect(positions).toEqual([3, 4]);
  });

  it("walks forward and backward with a wrap", () => {
    expect(nextProblem(positions, -1, 1)).toBe(3);
    expect(nextProblem(positions, 3, 1)).toBe(4);
    expect(nextProblem(positions, 4, 1)).toBe(3);
    expect(nextProblem(positions, 4, -1)).toBe(3);
    expect(nextProblem(positions, 0, -1)).toBe(4);
    expect(nextProblem([], 0, 1)).toBe(-1);
  });
});

describe("firstProblem", () => {
  it("skips known noise and returns the first real failure", () => {
    expect(firstProblem(entries)?.text).toBe("Failed to load mod sodium");
  });

  it("returns null when nothing failed", () => {
    expect(firstProblem(parseLogText("[10:00:01] [main/INFO]: fine"))).toBeNull();
  });
});
