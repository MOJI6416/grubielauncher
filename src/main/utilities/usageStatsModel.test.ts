import { describe, expect, it } from "vitest";
import { USAGE_MAX_PER_DAY } from "@/shared/usageFeatures";
import {
  addUse,
  dropStaleDays,
  finishedDays,
  localDay,
  normalizeUsageDays,
} from "./usageStatsModel";

describe("usage stats model", () => {
  it("formats the local calendar day", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("counts only known features and keeps days apart", () => {
    let days = addUse({}, "screen.home", "2026-11-18");
    days = addUse(days, "screen.home", "2026-11-18");
    days = addUse(days, "feature.chunkEditor", "2026-11-19");
    days = addUse(days, "screen.unknown", "2026-11-19");

    expect(days).toEqual({
      "2026-11-18": { "screen.home": 2 },
      "2026-11-19": { "feature.chunkEditor": 1 },
    });
  });

  it("stops counting a feature at the daily cap", () => {
    const capped = { "2026-11-18": { "screen.home": USAGE_MAX_PER_DAY } };
    expect(addUse(capped, "screen.home", "2026-11-18")).toBe(capped);
  });

  it("sends only finished days that are not too old", () => {
    const days = {
      "2026-10-01": { "screen.home": 1 },
      "2026-11-17": { "screen.home": 1 },
      "2026-11-18": { "screen.news": 2 },
      "2026-11-19": { "screen.home": 3 },
    };

    expect(finishedDays(days, "2026-11-19")).toEqual([
      "2026-11-17",
      "2026-11-18",
    ]);
    expect(Object.keys(dropStaleDays(days, "2026-11-19"))).toEqual([
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ]);
  });

  it("drops anything in the stored file that is not a count of a known feature", () => {
    expect(
      normalizeUsageDays({
        "2026-11-18": {
          "screen.home": 3,
          "screen.news": -1,
          "screen.people": 1.5,
          nickname: 1,
        },
        "not-a-day": { "screen.home": 1 },
        "2026-11-19": "x",
        "2026-11-20": { "screen.home": 99999 },
      }),
    ).toEqual({
      "2026-11-18": { "screen.home": 3 },
      "2026-11-20": { "screen.home": USAGE_MAX_PER_DAY },
    });
    expect(normalizeUsageDays(null)).toEqual({});
  });
});
