import { describe, expect, it } from "vitest";
import type { IServer } from "@/types/ServersList";
import {
  applyServers,
  captureServers,
  restoreServers,
  serverMarks,
  withoutSharedServers,
} from "./serverMerge";
import { addedLines, captureHistory, HISTORY_LIMIT } from "./historyMerge";
import {
  applyPackList,
  capturePacks,
  enabledPlayerPacks,
  restorePackList,
} from "./packList";
import { getOption, parseOptionsText } from "./optionsText";

const server = (
  name: string,
  ip: string,
  extra: Partial<IServer> = {},
): IServer => ({
  name,
  ip,
  acceptTextures: null,
  ...extra,
});

const HYPIXEL = server("Hypixel", "mc.hypixel.net");
const LOCAL = server("Pack server", "play.pack.net");
const FRIEND = server("Мир друга", "jt-abc--world.join.grubielauncher.com");

describe("servers", () => {
  it("keeps the instance's own servers local on the first sync of a new instance", () => {
    const state = captureServers(
      [LOCAL],
      null,
      { profile: [HYPIXEL], local: [] },
      "first",
    );
    expect(state).toEqual({ profile: [HYPIXEL], local: ["play.pack.net"] });
    expect(applyServers([LOCAL], state)).toEqual([HYPIXEL, LOCAL]);
  });

  it("adds every server of an adopted instance to the shared list", () => {
    const state = captureServers(
      [LOCAL],
      null,
      { profile: [HYPIXEL], local: [] },
      "adopt",
    );
    expect(state.profile.map((item) => item.ip)).toEqual([
      "mc.hypixel.net",
      "play.pack.net",
    ]);
  });

  it("shares servers added and edits made in a session, drops removed ones", () => {
    const added = server("Mine", "mine.example:25570");
    const start = {
      profile: [HYPIXEL, server("Old", "old.example")],
      local: ["play.pack.net"],
    };
    const applied = applyServers([LOCAL], start);
    const baseline = serverMarks(applied);

    const after = [server("Hypixel EU", "mc.hypixel.net"), LOCAL, added];
    const state = captureServers(after, baseline, start, "session");
    expect(state.profile.map((item) => item.name)).toEqual([
      "Hypixel EU",
      "Mine",
    ]);
    expect(state.local).toEqual(["play.pack.net"]);
  });

  it("does not bring back a server another instance removed", () => {
    const start = { profile: [HYPIXEL], local: [] };
    const baseline = serverMarks(applyServers([], start));
    const elsewhere = { profile: [], local: [] };
    const state = captureServers([HYPIXEL], baseline, elsewhere, "session");
    expect(state.profile).toEqual([]);
  });

  it("never shares friend worlds or hidden entries", () => {
    const hidden = server("Quick", "quick.example", { hidden: 1 });
    const start = { profile: [HYPIXEL], local: [] };
    const baseline = serverMarks(applyServers([], start));
    const state = captureServers(
      [FRIEND, HYPIXEL, hidden],
      baseline,
      start,
      "session",
    );
    expect(state.profile).toEqual([HYPIXEL]);
    expect(applyServers([FRIEND, hidden], state)).toEqual([
      FRIEND,
      hidden,
      HYPIXEL,
    ]);
  });

  it("treats the default port as the same server", () => {
    const start = { profile: [HYPIXEL], local: [] };
    const baseline = serverMarks(applyServers([], start));
    const state = captureServers(
      [server("Hypixel", "MC.Hypixel.net:25565")],
      baseline,
      start,
      "session",
    );
    expect(state.profile).toHaveLength(1);
  });

  it("restores the backup list and keeps a pending friend entry", () => {
    expect(restoreServers([FRIEND, HYPIXEL], [LOCAL])).toEqual([FRIEND, LOCAL]);
  });
});

describe("servers of a published build", () => {
  it("keeps the build's own servers and drops the ones from the profile", () => {
    const mine = server("Mine", "mine.example");
    const own = withoutSharedServers(
      [FRIEND, HYPIXEL, mine, LOCAL],
      [HYPIXEL, mine],
      new Set(["mc.hypixel.net", "play.pack.net"]),
    );
    expect(own).toEqual([FRIEND, HYPIXEL, LOCAL]);
  });

  it("leaves the list alone when nothing is shared", () => {
    expect(withoutSharedServers([HYPIXEL, LOCAL], [], new Set())).toEqual([
      HYPIXEL,
      LOCAL,
    ]);
  });
});

describe("command history", () => {
  it("finds lines added after the game trimmed the oldest", () => {
    const before = Array.from(
      { length: HISTORY_LIMIT },
      (_, index) => `/c ${index}`,
    );
    const after = [...before.slice(2), "/tp 0 64 0", "/time set day"];
    expect(addedLines(before, after)).toEqual(["/tp 0 64 0", "/time set day"]);
  });

  it("appends a session's commands to the shared history", () => {
    const shared = captureHistory(
      ["/a", "/b", "/gamemode creative"],
      ["/a", "/b"],
      ["/a", "/b", "/x"],
      "session",
    );
    expect(shared).toEqual(["/a", "/b", "/x", "/gamemode creative"]);
  });

  it("keeps the shared history on the first sync of a new instance", () => {
    expect(captureHistory(["/pack"], null, ["/a"], "first")).toEqual(["/a"]);
  });

  it("merges an adopted instance's history before the shared one", () => {
    expect(captureHistory(["/old", "/a"], null, ["/a", "/b"], "adopt")).toEqual(
      ["/old", "/a", "/b"],
    );
  });
});

describe("resource packs", () => {
  const modern = [
    "version:3465",
    'resourcePacks:["vanilla","fabric","file/grubie-i18n-ai-ru_ru.zip","file/Pack.zip","file/Faithful.zip"]',
    'incompatibleResourcePacks:["file/Faithful.zip"]',
    "lang:ru_ru",
  ].join("\n");

  it("lists the player's packs without built-ins and our translation packs", () => {
    expect(enabledPlayerPacks(modern, "1.20.1")).toEqual([
      "Pack.zip",
      "Faithful.zip",
    ]);
    expect(
      enabledPlayerPacks('resourcePacks:["Faithful.zip"]', "1.12.2"),
    ).toEqual(["Faithful.zip"]);
  });

  it("replaces shared packs in place and clears them from the incompatible list", () => {
    const { text } = applyPackList(
      modern,
      "1.20.1",
      ["Faithful.zip", "Stay True.zip"],
      new Set(["Faithful.zip", "Stay True.zip", "Old.zip"]),
    );
    const doc = parseOptionsText(text);
    expect(JSON.parse(getOption(doc, "resourcePacks")!)).toEqual([
      "vanilla",
      "fabric",
      "file/grubie-i18n-ai-ru_ru.zip",
      "file/Pack.zip",
      "file/Faithful.zip",
      "file/Stay True.zip",
    ]);
    expect(getOption(doc, "incompatibleResourcePacks")).toBe("[]");
  });

  it("writes 1.12 entries without the file prefix", () => {
    const { text } = applyPackList(
      "resourcePacks:[]\nincompatibleResourcePacks:[]",
      "1.12.2",
      ["Faithful.zip"],
      new Set(["Faithful.zip"]),
    );
    expect(getOption(parseOptionsText(text), "resourcePacks")).toBe(
      '["Faithful.zip"]',
    );
  });

  it("keeps packs meant for other versions when the player edits the list", () => {
    const state = capturePacks(
      ["Pack.zip", "Faithful.zip", "New.zip"],
      ["Pack.zip", "Faithful.zip"],
      ["Faithful.zip"],
      { profile: ["Faithful 1.12.zip", "Faithful.zip"], local: ["Pack.zip"] },
      "session",
      () => true,
    );
    expect(state).toEqual({
      profile: ["Faithful 1.12.zip", "Faithful.zip", "New.zip"],
      local: ["Pack.zip"],
    });
  });

  it("removes a pack the player turned off", () => {
    const state = capturePacks(
      [],
      ["Faithful.zip"],
      ["Faithful.zip"],
      { profile: ["Faithful.zip"], local: [] },
      "session",
      () => true,
    );
    expect(state.profile).toEqual([]);
  });

  it("keeps folder packs local", () => {
    const state = capturePacks(
      ["Folder"],
      [],
      [],
      { profile: [], local: [] },
      "session",
      (name) => name.endsWith(".zip"),
    );
    expect(state).toEqual({ profile: [], local: ["Folder"] });
  });

  it("restores the instance's own selection", () => {
    const shared =
      'resourcePacks:["vanilla","file/Faithful.zip"]\nincompatibleResourcePacks:[]';
    const own =
      'resourcePacks:["vanilla","file/Mine.zip"]\nincompatibleResourcePacks:[]';
    const { text } = restorePackList(
      shared,
      own,
      "1.20.1",
      ["Faithful.zip"],
      () => true,
    );
    expect(getOption(parseOptionsText(text), "resourcePacks")).toBe(
      '["vanilla","file/Mine.zip"]',
    );
  });
});
