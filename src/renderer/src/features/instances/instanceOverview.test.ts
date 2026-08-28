import { describe, expect, it } from "vitest";
import { IVersionSession } from "@/types/VersionStatistics";
import {
  InstanceChangeInput,
  collectChangeKinds,
  collectInstanceChanges,
  dailyPlaytime,
  isFreshInstance,
  isScreenshotFile,
  recentSessions,
  sameChangeKinds,
  sameOverrides,
  sameQuickServer,
  screenshotLabel,
  shortenPath,
  sortScreenshots,
} from "./instanceOverview";

function session(
  startedAt: string,
  durationSec = 60,
): IVersionSession {
  return {
    id: startedAt,
    startedAt,
    endedAt: startedAt,
    durationSec,
    exitCode: 0,
    crashed: false,
  };
}

describe("collectChangeKinds", () => {
  it("returns kinds in a stable display order", () => {
    expect(
      collectChangeKinds({
        settings: true,
        name: true,
        content: true,
      }),
    ).toEqual(["name", "content", "settings"]);
  });

  it("ignores false and missing flags", () => {
    expect(collectChangeKinds({ name: false })).toEqual([]);
    expect(collectChangeKinds({})).toEqual([]);
  });
});

describe("sameChangeKinds", () => {
  it("compares by content, not by identity", () => {
    expect(sameChangeKinds(["name"], ["name"])).toBe(true);
    expect(sameChangeKinds([], [])).toBe(true);
  });

  it("detects added, removed and reordered kinds", () => {
    expect(sameChangeKinds(["name"], ["name", "content"])).toBe(false);
    expect(sameChangeKinds(["name", "content"], ["name"])).toBe(false);
    expect(sameChangeKinds(["name", "content"], ["content", "name"])).toBe(
      false,
    );
  });
});

describe("collectInstanceChanges", () => {
  const unchanged: InstanceChangeInput = {
    draftName: "Pack",
    currentName: "Pack",
    draftArguments: { game: "", jvm: "" },
    currentArguments: undefined,
    draftQuickServer: undefined,
    currentQuickServer: undefined,
    draftOverrides: undefined,
    currentOverrides: undefined,
    isLogoChanged: false,
    content: { mods: false, servers: false },
  };

  it("reports nothing when the draft matches the instance", () => {
    expect(collectInstanceChanges(unchanged)).toEqual([]);
  });

  it("ignores surrounding whitespace in the name", () => {
    expect(
      collectInstanceChanges({ ...unchanged, draftName: "  Pack  " }),
    ).toEqual([]);
    expect(collectInstanceChanges({ ...unchanged, draftName: "Pack 2" })).toEqual(
      ["name"],
    );
  });

  it("treats missing arguments as empty strings", () => {
    expect(
      collectInstanceChanges({
        ...unchanged,
        draftArguments: { game: "", jvm: "" },
        currentArguments: undefined,
      }),
    ).toEqual([]);

    expect(
      collectInstanceChanges({
        ...unchanged,
        draftArguments: { game: "", jvm: "-Xmx4G" },
        currentArguments: undefined,
      }),
    ).toEqual(["arguments"]);

    expect(
      collectInstanceChanges({
        ...unchanged,
        draftArguments: { game: "--demo", jvm: "" },
        currentArguments: { game: "", jvm: "" },
      }),
    ).toEqual(["arguments"]);
  });

  it("forgets an override that was switched on and back off", () => {
    expect(
      collectInstanceChanges({
        ...unchanged,
        draftOverrides: undefined,
        currentOverrides: undefined,
      }),
    ).toEqual([]);

    expect(
      collectInstanceChanges({
        ...unchanged,
        draftOverrides: { optimizedJvm: true },
        currentOverrides: undefined,
      }),
    ).toEqual(["settings"]);

    expect(
      collectInstanceChanges({
        ...unchanged,
        draftOverrides: { xmx: 4096 },
        currentOverrides: { xmx: 4096 },
      }),
    ).toEqual([]);
  });

  it("treats an empty quick server as no quick server", () => {
    expect(
      collectInstanceChanges({
        ...unchanged,
        draftQuickServer: "  ",
        currentQuickServer: undefined,
      }),
    ).toEqual([]);

    expect(
      collectInstanceChanges({
        ...unchanged,
        draftQuickServer: "play.example.com",
        currentQuickServer: undefined,
      }),
    ).toEqual(["quickServer"]);
  });

  it("passes the already compared content flags through", () => {
    expect(
      collectInstanceChanges({
        ...unchanged,
        content: { mods: true, servers: true },
      }),
    ).toEqual(["content", "servers"]);
  });

  it("keeps the display order when everything changed", () => {
    expect(
      collectInstanceChanges({
        draftName: "Other",
        currentName: "Pack",
        draftArguments: { game: "--demo", jvm: "-Xmx4G" },
        currentArguments: { game: "", jvm: "" },
        draftQuickServer: "play.example.com",
        currentQuickServer: undefined,
        draftOverrides: { xmx: 8192 },
        currentOverrides: undefined,
        isLogoChanged: true,
        content: { mods: true, servers: true },
      }),
    ).toEqual([
      "name",
      "content",
      "servers",
      "arguments",
      "logo",
      "quickServer",
      "settings",
    ]);
  });
});

describe("isFreshInstance", () => {
  const empty = {
    screenshots: 0,
    contentCount: 0,
    launches: 0,
    worlds: 0,
  };

  it("treats an untouched instance as fresh", () => {
    expect(isFreshInstance(empty)).toBe(true);
  });

  it("waits for the screenshot scan before deciding", () => {
    expect(isFreshInstance({ ...empty, screenshots: null })).toBe(false);
  });

  it("stops being fresh once any content appears", () => {
    expect(isFreshInstance({ ...empty, screenshots: 1 })).toBe(false);
    expect(isFreshInstance({ ...empty, contentCount: 1 })).toBe(false);
    expect(isFreshInstance({ ...empty, launches: 1 })).toBe(false);
    expect(isFreshInstance({ ...empty, worlds: 1 })).toBe(false);
  });

  it("ignores a missing world count", () => {
    expect(
      isFreshInstance({ screenshots: 0, contentCount: 0, launches: 0 }),
    ).toBe(true);
  });
});

describe("sortScreenshots", () => {
  it("keeps only images and sorts newest first", () => {
    expect(
      sortScreenshots([
        "2026-08-01_10.00.00.png",
        "notes.txt",
        "2026-08-03_09.00.00.png",
        "2026-08-02_23.59.59.jpg",
      ]),
    ).toEqual([
      "2026-08-03_09.00.00.png",
      "2026-08-02_23.59.59.jpg",
      "2026-08-01_10.00.00.png",
    ]);
  });

  it("recognizes image extensions case-insensitively", () => {
    expect(isScreenshotFile("a.PNG")).toBe(true);
    expect(isScreenshotFile("a.webp")).toBe(true);
    expect(isScreenshotFile("a.zip")).toBe(false);
    expect(isScreenshotFile("png")).toBe(false);
  });
});

describe("screenshotLabel", () => {
  it("formats a minecraft screenshot name", () => {
    expect(screenshotLabel("2026-08-16_21.05.44.png")).toBe(
      "16.08.2026 21:05",
    );
  });

  it("falls back to the raw name", () => {
    expect(screenshotLabel("cover.png")).toBe("cover.png");
  });
});

describe("dailyPlaytime", () => {
  it("buckets sessions into the requested window", () => {
    const now = new Date(2026, 7, 16, 12, 0, 0);
    const buckets = dailyPlaytime(
      [
        session(new Date(2026, 7, 16, 8, 0, 0).toISOString(), 120),
        session(new Date(2026, 7, 16, 9, 0, 0).toISOString(), 60),
        session(new Date(2026, 7, 14, 9, 0, 0).toISOString(), 30),
        session(new Date(2026, 6, 1, 9, 0, 0).toISOString(), 999),
      ],
      3,
      now,
    );

    expect(buckets).toEqual([
      { day: "2026-08-14", seconds: 30 },
      { day: "2026-08-15", seconds: 0 },
      { day: "2026-08-16", seconds: 180 },
    ]);
  });

  it("ignores invalid dates and negative durations", () => {
    const now = new Date(2026, 7, 16, 12, 0, 0);
    const buckets = dailyPlaytime(
      [
        session("not-a-date", 100),
        session(new Date(2026, 7, 16, 1, 0, 0).toISOString(), -5),
      ],
      1,
      now,
    );

    expect(buckets).toEqual([{ day: "2026-08-16", seconds: 0 }]);
  });
});

describe("recentSessions", () => {
  it("sorts newest first and limits", () => {
    const list = recentSessions(
      [
        session("2026-08-01T10:00:00.000Z"),
        session("bad"),
        session("2026-08-03T10:00:00.000Z"),
        session("2026-08-02T10:00:00.000Z"),
      ],
      2,
    );

    expect(list.map((entry) => entry.startedAt)).toEqual([
      "2026-08-03T10:00:00.000Z",
      "2026-08-02T10:00:00.000Z",
    ]);
  });
});

describe("path helpers", () => {
  it("shortens long paths to the last segments", () => {
    expect(shortenPath("C:\\a\\b\\c\\d\\e", 3)).toBe("…\\c\\d\\e");
    expect(shortenPath("C:\\a\\b", 3)).toBe("C:\\a\\b");
  });

  it("keeps the separator the path itself uses", () => {
    expect(shortenPath("/home/user/.grubielauncher/versions/Pack", 3)).toBe(
      "…/.grubielauncher/versions/Pack",
    );
  });
});

describe("sameOverrides", () => {
  it("treats an absent override and an explicit undefined as equal", () => {
    expect(sameOverrides(undefined, {})).toBe(true);
    expect(sameOverrides({ xmx: undefined }, undefined)).toBe(true);
  });

  it("sees a real difference", () => {
    expect(sameOverrides({ xmx: 4096 }, { xmx: 8192 })).toBe(false);
    expect(sameOverrides({ highPriority: false }, undefined)).toBe(false);
  });
});

describe("sameQuickServer", () => {
  it("ignores whitespace and the missing value", () => {
    expect(sameQuickServer(undefined, "")).toBe(true);
    expect(sameQuickServer(" play.example.com ", "play.example.com")).toBe(true);
    expect(sameQuickServer("play.example.com", undefined)).toBe(false);
  });
});
