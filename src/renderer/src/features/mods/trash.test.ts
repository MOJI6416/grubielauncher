import { describe, expect, it } from "vitest";
import {
  isTrashEntryExpired,
  parseTrashEntry,
  sortTrashEntries,
} from "./trash";

describe("parseTrashEntry", () => {
  it("strips the quarantine prefix and keeps the original name", () => {
    const entry = parseTrashEntry("1787416907416-a1b2c3d4-OldFavourite-1.4.2.jar");

    expect(entry).toEqual({
      raw: "1787416907416-a1b2c3d4-OldFavourite-1.4.2.jar",
      name: "OldFavourite-1.4.2.jar",
      deletedAt: 1787416907416,
    });
  });

  it("brings a disabled file back enabled", () => {
    const entry = parseTrashEntry("1787416907416-a1b2c3d4-Muted.jar.disabled");

    expect(entry?.name).toBe("Muted.jar");
  });

  it("skips quarantined folders and other non-archives", () => {
    expect(parseTrashEntry("1787416907416-a1b2c3d4-New World")).toBeNull();
    expect(parseTrashEntry("1787416907416-a1b2c3d4-options.txt")).toBeNull();
  });

  it("keeps names that were not written by the launcher", () => {
    const entry = parseTrashEntry("leftover.jar");

    expect(entry).toEqual({
      raw: "leftover.jar",
      name: "leftover.jar",
      deletedAt: null,
    });
  });

  it("does not mistake a hyphenated file name for a prefix", () => {
    const entry = parseTrashEntry("some-mod-1.2.3.jar");

    expect(entry?.name).toBe("some-mod-1.2.3.jar");
    expect(entry?.deletedAt).toBeNull();
  });

  it("ignores empty names", () => {
    expect(parseTrashEntry("")).toBeNull();
  });
});

describe("sortTrashEntries", () => {
  it("puts the most recently deleted first and dateless entries last", () => {
    const sorted = sortTrashEntries([
      { raw: "a", name: "a.jar", deletedAt: 100 },
      { raw: "b", name: "b.jar", deletedAt: null },
      { raw: "c", name: "c.jar", deletedAt: 300 },
    ]);

    expect(sorted.map((entry) => entry.name)).toEqual([
      "c.jar",
      "a.jar",
      "b.jar",
    ]);
  });
});

describe("isTrashEntryExpired", () => {
  const now = 1787416907416;

  it("keeps an entry that is still inside the retention window", () => {
    const entry = parseTrashEntry(`${now - 13 * 24 * 3600 * 1000}-a1b2c3d4-Mod.jar`);
    expect(entry && isTrashEntryExpired(entry, now)).toBe(false);
  });

  it("drops an entry the cleanup would already have removed", () => {
    const entry = parseTrashEntry(`${now - 15 * 24 * 3600 * 1000}-a1b2c3d4-Mod.jar`);
    expect(entry && isTrashEntryExpired(entry, now)).toBe(true);
  });

  it("keeps an entry with no timestamp in the name", () => {
    const entry = parseTrashEntry("leftover.jar");
    expect(entry && isTrashEntryExpired(entry, now)).toBe(false);
  });
});
