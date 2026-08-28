import { describe, expect, it } from "vitest";
import {
  AchievementProgressInput,
  buildAchievementRows,
  displayMetric,
  filterAchievements,
  ownAchievementTotals,
  pickAlmostThere,
  pickShowcase,
  rarityFromPercent,
  rarityFromPoints,
  remainingToGoal,
  sortAchievements,
  summarizeAchievements,
  tallyByCategory,
} from "./achievementRows";

const nameOf = (id: string) => NAMES[id] ?? id;

const NAMES: Record<string, string> = {
  mine_1k: "Камнетёс",
  dragon: "Драконоборец",
  worlds_5: "Мультивселенная",
  skin_first: "Дебют",
};

function progress(
  overrides: Partial<AchievementProgressInput["def"]> & { id: string },
  state: Partial<Omit<AchievementProgressInput, "def">> = {},
): AchievementProgressInput {
  return {
    def: {
      category: "mining",
      points: 10,
      goal: 100,
      unit: "count",
      ...overrides,
    },
    value: 0,
    unlocked: false,
    ratio: 0,
    ...state,
  };
}

describe("buildAchievementRows", () => {
  it("takes rarity from the global reach when it is known", () => {
    const rows = buildAchievementRows(
      [progress({ id: "dragon", points: 70 })],
      new Map([["dragon", 0.8]]),
    );

    expect(rows[0].percent).toBe(0.8);
    expect(rows[0].rarity).toBe("legendary");
  });

  it("falls back to points when the reach is unavailable", () => {
    const rows = buildAchievementRows(
      [progress({ id: "mine_1k", points: 10 })],
      null,
    );

    expect(rows[0].percent).toBeNull();
    expect(rows[0].rarity).toBe("common");
  });

  it("does not let a cheap achievement look rare just because it is cheap", () => {
    const rows = buildAchievementRows(
      [progress({ id: "mine_1k", points: 10 })],
      new Map([["mine_1k", 62]]),
    );

    expect(rows[0].rarity).toBe("common");
  });

  it("clamps a broken ratio into 0..1", () => {
    const rows = buildAchievementRows(
      [
        progress({ id: "a" }, { ratio: 4 }),
        progress({ id: "b" }, { ratio: -1 }),
        progress({ id: "c" }, { ratio: Number.NaN }),
      ],
      null,
    );

    expect(rows.map((row) => row.ratio)).toEqual([1, 0, 0]);
  });

  it("marks granted achievements", () => {
    const rows = buildAchievementRows(
      [progress({ id: "skin_first", granted: true, goal: undefined, unit: undefined })],
      null,
    );

    expect(rows[0].granted).toBe(true);
    expect(rows[0].unit).toBeNull();
    expect(rows[0].goal).toBe(0);
  });
});

describe("rarity thresholds", () => {
  it("buckets the global share", () => {
    expect(rarityFromPercent(0.4)).toBe("legendary");
    expect(rarityFromPercent(1)).toBe("legendary");
    expect(rarityFromPercent(3.5)).toBe("epic");
    expect(rarityFromPercent(12)).toBe("rare");
    expect(rarityFromPercent(70)).toBe("common");
  });

  it("buckets the points fallback", () => {
    expect(rarityFromPoints(90)).toBe("legendary");
    expect(rarityFromPoints(45)).toBe("epic");
    expect(rarityFromPoints(25)).toBe("rare");
    expect(rarityFromPoints(24)).toBe("common");
  });
});

describe("filterAchievements", () => {
  const rows = buildAchievementRows(
    [
      progress({ id: "mine_1k" }, { unlocked: true, ratio: 1 }),
      progress({ id: "dragon", category: "combat" }, { ratio: 0.5 }),
      progress({ id: "worlds_5", category: "exploration" }),
    ],
    null,
  );

  it("filters by category", () => {
    expect(
      filterAchievements(
        rows,
        { category: "combat", status: "all", query: "" },
        nameOf,
      ).map((row) => row.id),
    ).toEqual(["dragon"]);
  });

  it("filters by status", () => {
    expect(
      filterAchievements(
        rows,
        { category: "all", status: "locked", query: "" },
        nameOf,
      ).map((row) => row.id),
    ).toEqual(["dragon", "worlds_5"]);
  });

  it("searches by the localized name, case insensitively", () => {
    expect(
      filterAchievements(
        rows,
        { category: "all", status: "all", query: "  ДРАКОН " },
        nameOf,
      ).map((row) => row.id),
    ).toEqual(["dragon"]);
  });
});

describe("sortAchievements", () => {
  const rows = buildAchievementRows(
    [
      progress({ id: "mine_1k", points: 10 }, { unlocked: true, ratio: 1 }),
      progress({ id: "dragon", points: 70 }, { ratio: 0.9 }),
      progress({ id: "worlds_5", points: 15 }, { ratio: 0.2 }),
      progress({ id: "skin_first", points: 20 }, { ratio: 0 }),
    ],
    new Map([
      ["mine_1k", 60],
      ["dragon", 2],
      ["worlds_5", 30],
      ["skin_first", 45],
    ]),
  );

  it("puts the closest goals first and the finished ones last", () => {
    expect(
      sortAchievements(rows, "progress", nameOf).map((row) => row.id),
    ).toEqual(["dragon", "worlds_5", "skin_first", "mine_1k"]);
  });

  it("sorts by the rarest first", () => {
    expect(
      sortAchievements(rows, "rarity", nameOf).map((row) => row.id),
    ).toEqual(["dragon", "worlds_5", "skin_first", "mine_1k"]);
  });

  it("sorts by points", () => {
    expect(
      sortAchievements(rows, "points", nameOf).map((row) => row.id),
    ).toEqual(["dragon", "skin_first", "worlds_5", "mine_1k"]);
  });

  it("sorts by the localized name", () => {
    expect(sortAchievements(rows, "name", nameOf).map((row) => row.id)).toEqual([
      "skin_first",
      "dragon",
      "mine_1k",
      "worlds_5",
    ]);
  });

  it("does not mutate the input", () => {
    const before = rows.map((row) => row.id);
    sortAchievements(rows, "points", nameOf);
    expect(rows.map((row) => row.id)).toEqual(before);
  });
});

describe("summarizeAchievements", () => {
  it("counts unlocked, points and completion", () => {
    const rows = buildAchievementRows(
      [
        progress({ id: "a", points: 10 }, { unlocked: true }),
        progress({ id: "b", points: 30 }, { unlocked: true }),
        progress({ id: "c", points: 60 }),
      ],
      null,
    );

    expect(summarizeAchievements(rows)).toEqual({
      unlocked: 2,
      total: 3,
      points: 40,
      totalPoints: 100,
      completion: 67,
    });
  });

  it("survives an empty catalog", () => {
    expect(summarizeAchievements([])).toEqual({
      unlocked: 0,
      total: 0,
      points: 0,
      totalPoints: 0,
      completion: 0,
    });
  });
});

describe("tallyByCategory", () => {
  it("keeps the requested order and reports empty categories", () => {
    const rows = buildAchievementRows(
      [
        progress({ id: "a", category: "mining" }, { unlocked: true }),
        progress({ id: "b", category: "mining" }),
        progress({ id: "c", category: "combat" }, { unlocked: true }),
      ],
      null,
    );

    expect(tallyByCategory(rows, ["combat", "mining", "craft"])).toEqual([
      { category: "combat", unlocked: 1, total: 1 },
      { category: "mining", unlocked: 1, total: 2 },
      { category: "craft", unlocked: 0, total: 0 },
    ]);
  });
});

describe("pickShowcase", () => {
  it("shows the rarest unlocked achievements only", () => {
    const rows = buildAchievementRows(
      [
        progress({ id: "common", points: 10 }, { unlocked: true }),
        progress({ id: "rare", points: 70 }, { unlocked: true }),
        progress({ id: "locked", points: 90 }),
      ],
      new Map([
        ["common", 55],
        ["rare", 1.2],
        ["locked", 0.1],
      ]),
    );

    expect(pickShowcase(rows, 5).map((row) => row.id)).toEqual([
      "rare",
      "common",
    ]);
  });

  it("respects the limit", () => {
    const rows = buildAchievementRows(
      Array.from({ length: 9 }, (_, index) =>
        progress({ id: `a${index}`, points: index }, { unlocked: true }),
      ),
      null,
    );

    expect(pickShowcase(rows, 6)).toHaveLength(6);
  });
});

describe("pickAlmostThere", () => {
  it("keeps locked metric goals and drops finished and granted ones", () => {
    const rows = buildAchievementRows(
      [
        progress({ id: "started" }, { ratio: 0.75 }),
        progress({ id: "untouched" }, { ratio: 0 }),
        progress({ id: "done" }, { unlocked: true, ratio: 1 }),
        progress({ id: "granted", granted: true }, { ratio: 0.5 }),
        progress({ id: "noGoal", goal: 0 }, { ratio: 0 }),
      ],
      null,
    );

    expect(pickAlmostThere(rows).map((row) => row.id)).toEqual([
      "started",
      "untouched",
    ]);
  });

  it("fills the free slots with goals that have no progress yet", () => {
    const rows = buildAchievementRows(
      [
        progress({ id: "untouched-cheap", points: 10 }, { ratio: 0 }),
        progress({ id: "started" }, { ratio: 0.4 }),
        progress({ id: "untouched-costly", points: 90 }, { ratio: 0 }),
      ],
      null,
    );

    expect(pickAlmostThere(rows, 3).map((row) => row.id)).toEqual([
      "started",
      "untouched-costly",
      "untouched-cheap",
    ]);
  });

  it("orders by how close the goal is", () => {
    const rows = buildAchievementRows(
      [
        progress({ id: "far" }, { ratio: 0.1 }),
        progress({ id: "near" }, { ratio: 0.95 }),
        progress({ id: "mid" }, { ratio: 0.5 }),
      ],
      null,
    );

    expect(pickAlmostThere(rows, 2).map((row) => row.id)).toEqual([
      "near",
      "mid",
    ]);
  });
});

describe("metric display", () => {
  it("converts raw metrics into readable units", () => {
    expect(displayMetric(1_234_567, "km")).toBe(12.3);
    expect(displayMetric(144_000, "ticksHours")).toBe(2);
    expect(displayMetric(7_200, "secondsHours")).toBe(2);
    expect(displayMetric(1_999.7, "count")).toBe(1999);
    expect(displayMetric(42, null)).toBe(42);
  });

  it("reports what is left in display units", () => {
    const [row] = buildAchievementRows(
      [
        progress(
          { id: "explore", goal: 1_000_000, unit: "km" },
          { value: 400_000, ratio: 0.4 },
        ),
      ],
      null,
    );

    expect(remainingToGoal(row)).toBe(6);
  });

  it("reports nothing left for unlocked and granted rows", () => {
    const rows = buildAchievementRows(
      [
        progress({ id: "done" }, { unlocked: true, value: 100, ratio: 1 }),
        progress({ id: "granted", granted: true }),
      ],
      null,
    );

    expect(rows.map(remainingToGoal)).toEqual([0, 0]);
  });
});

describe("ownAchievementTotals", () => {
  const catalogPoints = (ids: readonly string[]) => ids.length * 5;

  it("prefers the larger of server points and locally unlocked points", () => {
    const rows = buildAchievementRows(
      [
        progress({ id: "a", points: 60 }, { unlocked: true }),
        progress({ id: "b", points: 40 }, { unlocked: true }),
        progress({ id: "c", points: 30 }),
      ],
      null,
    );

    expect(ownAchievementTotals(70, ["a"], rows, catalogPoints).points).toBe(
      100,
    );
    expect(ownAchievementTotals(500, ["a"], rows, catalogPoints).points).toBe(
      500,
    );
  });

  it("falls back to the catalog sum when the server sent no points", () => {
    expect(ownAchievementTotals(undefined, ["a", "b"], [], catalogPoints).points).toBe(10);
    expect(ownAchievementTotals(-1, ["a", "b"], [], catalogPoints).points).toBe(10);
  });

  it("lists only the catalog achievements unlocked locally", () => {
    const rows = buildAchievementRows(
      [progress({ id: "a" }, { unlocked: true }), progress({ id: "b" })],
      null,
    );

    expect(
      ownAchievementTotals(0, ["a", "legacy"], rows, catalogPoints).catalogIds,
    ).toEqual(["a"]);
  });
});
