import { describe, expect, it } from "vitest";
import {
  buildShareTrail,
  classifyBlockedSharePath,
  countSelectedInsideFolder,
  createForbiddenPathSet,
  filterSelectableSharePaths,
  getShareParentPath,
  getShareRelativePath,
  isForbiddenSharePath,
  matchesShareQuery,
  selectShareFolderPath,
  selectSharePaths,
  shareRootLabel,
  toggleSelectedSharePath,
  unselectShareFolderPath,
} from "./selectPaths";

describe("select paths helpers", () => {
  it("marks generated launcher/game paths as forbidden", () => {
    const forbidden = createForbiddenPathSet("1.21.1", "fabric");

    expect(isForbiddenSharePath("fabric.jar", forbidden)).toBe(true);
    expect(isForbiddenSharePath("1.21.1.json", forbidden)).toBe(true);
    expect(isForbiddenSharePath("servers.dat", forbidden)).toBe(true);
    expect(isForbiddenSharePath("server/plugins/example.jar", forbidden)).toBe(
      true,
    );
    expect(isForbiddenSharePath("custom/readme.txt", forbidden)).toBe(false);
  });

  it("filters hidden and forbidden paths before saving selection", () => {
    const forbidden = createForbiddenPathSet("1.21.1", "fabric");

    expect(
      filterSelectableSharePaths(
        ["custom/config.toml", ".internal", "logs/latest.log", ""],
        forbidden,
      ),
    ).toEqual(["custom/config.toml"]);
  });

  it("selects only allowed paths in bulk selection", () => {
    const forbidden = createForbiddenPathSet("1.21.1", "fabric");

    expect(
      selectSharePaths(
        ["custom/readme.txt"],
        ["config", "servers.dat", "logs/latest.log"],
        forbidden,
      ),
    ).toEqual(["custom/readme.txt", "config"]);
  });

  it("preserves nested relative paths while browsing folders", () => {
    expect(getShareRelativePath("", "server.properties")).toBe(
      "server.properties",
    );
    expect(getShareRelativePath("config/mod", "settings.toml")).toBe(
      "config/mod/settings.toml",
    );
  });

  it("keeps file selections relative and removes parent folders when selecting child files", () => {
    const forbidden = createForbiddenPathSet("1.21.1", "fabric");

    expect(
      toggleSelectedSharePath(
        ["config"],
        "config/mod/settings.toml",
        forbidden,
      ),
    ).toEqual(["config/mod/settings.toml"]);
  });

  it("folder selection replaces child selections and unselect removes descendants", () => {
    const selected = selectShareFolderPath(
      ["config/mod/a.toml", "readme.md"],
      "config",
    );

    expect(selected).toEqual(["readme.md", "config"]);
    expect(unselectShareFolderPath(selected, "config")).toEqual(["readme.md"]);
  });
});

describe("blocked path reasons", () => {
  const forbidden = createForbiddenPathSet("1.21.1", "fabric");

  it("tells personal files apart from launcher-managed ones", () => {
    expect(classifyBlockedSharePath("sessions.json", forbidden)).toBe("private");
    expect(classifyBlockedSharePath("logs", forbidden)).toBe("private");
    expect(classifyBlockedSharePath("servers.dat", forbidden)).toBe("private");
    expect(classifyBlockedSharePath("screenshots", forbidden)).toBe("private");
    expect(classifyBlockedSharePath("crash-reports", forbidden)).toBe(
      "private",
    );
  });

  it("marks runtime folders as service data", () => {
    expect(classifyBlockedSharePath("natives", forbidden)).toBe("runtime");
    expect(classifyBlockedSharePath("downloads", forbidden)).toBe("runtime");
    expect(classifyBlockedSharePath("temp", forbidden)).toBe("runtime");
  });

  it("marks everything the launcher publishes on its own as managed", () => {
    expect(classifyBlockedSharePath("mods", forbidden)).toBe("managed");
    expect(classifyBlockedSharePath("resourcepacks", forbidden)).toBe(
      "managed",
    );
    expect(classifyBlockedSharePath("options.txt", forbidden)).toBe("managed");
    expect(classifyBlockedSharePath("fabric.jar", forbidden)).toBe("managed");
    expect(classifyBlockedSharePath("1.21.1.json", forbidden)).toBe("managed");
    expect(classifyBlockedSharePath("server", forbidden)).toBe("managed");
  });

  it("keeps personal reasons inside the nested server root", () => {
    expect(classifyBlockedSharePath("server/logs", forbidden)).toBe("private");
    expect(classifyBlockedSharePath("server/ops.json", forbidden)).toBe(
      "private",
    );
  });

  it("hands worlds to their own publish tick instead of the file picker", () => {
    expect(classifyBlockedSharePath("saves", forbidden)).toBe("world");
    expect(classifyBlockedSharePath("saves/My World", forbidden)).toBe("world");
    expect(classifyBlockedSharePath("saves/My World/region", forbidden)).toBe(
      "world",
    );
  });

  it("returns nothing for paths the player may pick", () => {
    expect(classifyBlockedSharePath("config", forbidden)).toBeNull();
    expect(classifyBlockedSharePath("config/saves", forbidden)).toBeNull();
    expect(classifyBlockedSharePath("config/sessions.json", forbidden)).toBeNull();
  });
});

describe("browser navigation helpers", () => {
  it("names the root crumb after the instance folder", () => {
    expect(shareRootLabel("C:\\games\\.grubielauncher\\versions\\My Pack")).toBe(
      "My Pack",
    );
    expect(shareRootLabel("/home/user/versions/My Pack/")).toBe("My Pack");
    expect(shareRootLabel("")).toBe("");
  });

  it("keeps every crumb while the path is short", () => {
    expect(buildShareTrail(["config", "mod"])).toEqual({
      collapsed: null,
      items: [
        { label: "config", path: "config" },
        { label: "mod", path: "config/mod" },
      ],
    });
  });

  it("collapses the middle of a deep path into one jump", () => {
    const trail = buildShareTrail([
      "config",
      "modpack_defaults",
      "config",
      "crash_assistant",
    ]);

    expect(trail.collapsed).toEqual({
      label: "modpack_defaults",
      path: "config/modpack_defaults",
    });
    expect(trail.items.map((item) => item.label)).toEqual([
      "config",
      "crash_assistant",
    ]);
    expect(trail.items[1].path).toBe(
      "config/modpack_defaults/config/crash_assistant",
    );
  });

  it("walks one level up", () => {
    expect(getShareParentPath("config/mod/inner")).toBe("config/mod");
    expect(getShareParentPath("config")).toBe("");
    expect(getShareParentPath("")).toBe("");
  });

  it("counts selections hidden inside a folder", () => {
    const selected = ["config/a.toml", "config/deep/b.toml", "saves/World"];

    expect(countSelectedInsideFolder(selected, "config")).toBe(2);
    expect(countSelectedInsideFolder(selected, "saves")).toBe(1);
    expect(countSelectedInsideFolder(selected, "kubejs")).toBe(0);
  });

  it("filters folder entries case-insensitively", () => {
    expect(matchesShareQuery("ModMenu.json", "menu")).toBe(true);
    expect(matchesShareQuery("ModMenu.json", "  ")).toBe(true);
    expect(matchesShareQuery("ModMenu.json", "sodium")).toBe(false);
  });
});
