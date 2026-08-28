import { describe, expect, it } from "vitest";
import {
  buildContinueTargets,
  continueAllTab,
  continueCacheKey,
  continueListTab,
  isContinueCacheKeyFor,
  sanitizeServerIcon,
  sanitizeWorldIcon,
  stripFormatting,
} from "./continueTargets";

describe("icon sanitizers", () => {
  it("keeps only world icons the renderer can load", () => {
    expect(sanitizeWorldIcon("file:///c:/saves/icon.png")).toBe(
      "file:///c:/saves/icon.png",
    );
    expect(sanitizeWorldIcon("data:image/png;base64,AAA")).toBe(
      "data:image/png;base64,AAA",
    );
    expect(sanitizeWorldIcon("saves/icon.png")).toBeUndefined();
    expect(sanitizeWorldIcon("  ")).toBeUndefined();
    expect(sanitizeWorldIcon(undefined)).toBeUndefined();
  });

  it("drops server favicons that are not usable base64", () => {
    const base64 = "A".repeat(64);
    expect(sanitizeServerIcon(base64)).toBe(base64);
    expect(sanitizeServerIcon("data:image/png;base64,AA")).toBe(
      "data:image/png;base64,AA",
    );
    expect(sanitizeServerIcon("AAA")).toBeUndefined();
    expect(sanitizeServerIcon("not base64 at all ***")).toBeUndefined();
    expect(sanitizeServerIcon(undefined)).toBeUndefined();
  });
});

describe("stripFormatting", () => {
  it("removes Minecraft colour codes", () => {
    expect(stripFormatting("§aGreen §lserver")).toBe("Green server");
    expect(stripFormatting("§2")).toBe("");
    expect(stripFormatting("Plain")).toBe("Plain");
  });
});

const worlds = [
  { name: "Old world", folderName: "old", lastPlayed: 10 },
  { name: "Fresh world", folderName: "fresh", lastPlayed: 90 },
  { name: "", folderName: "unnamed", lastPlayed: 50 },
];

const servers = [
  { name: "Public", ip: "play.example.com" },
  { name: "Home", ip: "192.168.0.2" },
];

describe("buildContinueTargets", () => {
  it("sorts worlds by the last time they were played", () => {
    const targets = buildContinueTargets({ worlds, servers: [] });

    expect(targets.map((target) => target.name)).toEqual([
      "Fresh world",
      "unnamed",
      "Old world",
    ]);
  });

  it("puts the auto connect server first and the rest after the worlds", () => {
    const targets = buildContinueTargets({
      worlds,
      servers,
      quickServer: "192.168.0.2",
      limit: 5,
    });

    expect(targets.map((target) => target.id)).toEqual([
      "server:192.168.0.2",
      "world:fresh",
      "world:unnamed",
      "world:old",
      "server:play.example.com",
    ]);
  });

  it("matches the auto connect server case insensitively", () => {
    const [first] = buildContinueTargets({
      servers,
      quickServer: " PLAY.Example.com ",
    });

    expect(first).toMatchObject({ kind: "server", quick: true });
  });

  it("respects the limit", () => {
    expect(buildContinueTargets({ worlds, servers, limit: 2 })).toHaveLength(2);
    expect(buildContinueTargets({ worlds, servers, limit: 0 })).toEqual([]);
  });

  it("drops entries the launcher cannot start", () => {
    expect(
      buildContinueTargets({ worlds, servers, allowWorlds: false }),
    ).toHaveLength(2);
    expect(
      buildContinueTargets({ worlds, servers, allowServers: false }),
    ).toHaveLength(3);
    expect(
      buildContinueTargets({
        worlds: [{ name: "Broken", folderName: "" }],
        servers: [{ name: "Broken", ip: "" }],
      }),
    ).toEqual([]);
  });

  it("falls back to the folder name when the world name is only a colour code", () => {
    const [target] = buildContinueTargets({
      worlds: [{ name: "§2", folderName: "raw-folder" }],
    });

    expect(target.name).toBe("raw-folder");
  });

  it("keeps the flags a card needs to render", () => {
    const [target] = buildContinueTargets({
      worlds: [
        {
          name: "Hardcore",
          folderName: "hc",
          hardcore: true,
          gameMode: "survival",
          versionName: "1.21.1",
        },
      ],
    });

    expect(target).toEqual({
      kind: "world",
      id: "world:hc",
      name: "Hardcore",
      folderName: "hc",
      icon: undefined,
      lastPlayed: 0,
      hardcore: true,
      gameMode: "survival",
      versionName: "1.21.1",
    });
  });
});

describe("continue cache key", () => {
  const path = "C:\\games\\versions\\Fabric 26.2";

  it("keeps the same instance apart for two accounts", () => {
    expect(continueCacheKey("acc-1", path)).not.toBe(
      continueCacheKey("acc-2", path),
    );
  });

  it("matches every account entry of one instance", () => {
    expect(isContinueCacheKeyFor(continueCacheKey("acc-1", path), path)).toBe(
      true,
    );
    expect(isContinueCacheKeyFor(continueCacheKey("acc-2", path), path)).toBe(
      true,
    );
  });

  it("does not match an instance whose path is a suffix of another", () => {
    const other = "C:\\games\\versions\\Other Fabric 26.2";

    expect(isContinueCacheKeyFor(continueCacheKey("acc-1", other), path)).toBe(
      false,
    );
  });
});

describe("continue destinations", () => {
  const withSaves = { worlds: true, servers: true };

  it("keeps the worlds shortcut alive when saves exist but no world is left", () => {
    expect(continueListTab("world", { worlds: true, servers: false })).toBe(
      "worlds",
    );
    expect(continueAllTab({ worlds: 0, servers: 0 }, withSaves)).toBeNull();
  });

  it("has no destination when the instance has no saves folder", () => {
    expect(
      continueListTab("world", { worlds: false, servers: true }),
    ).toBeNull();
  });

  it("has no destination for servers without a server manager", () => {
    expect(
      continueListTab("server", { worlds: true, servers: false }),
    ).toBeNull();
    expect(
      continueAllTab(
        { worlds: 0, servers: 2 },
        { worlds: true, servers: false },
      ),
    ).toBeNull();
  });

  it("sends the all link to the list that actually has entries", () => {
    expect(continueAllTab({ worlds: 3, servers: 1 }, withSaves)).toBe("worlds");
    expect(continueAllTab({ worlds: 0, servers: 1 }, withSaves)).toBe(
      "servers",
    );
  });
});
