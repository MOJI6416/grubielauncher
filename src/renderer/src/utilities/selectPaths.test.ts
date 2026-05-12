import { describe, expect, it } from "vitest";
import {
  createForbiddenPathSet,
  filterSelectableSharePaths,
  getShareRelativePath,
  isForbiddenSharePath,
  selectShareFolderPath,
  toggleSelectedSharePath,
  unselectShareFolderPath,
} from "./selectPaths";

describe("select paths helpers", () => {
  it("marks generated launcher/game paths as forbidden", () => {
    const forbidden = createForbiddenPathSet("1.21.1", "fabric");

    expect(isForbiddenSharePath("fabric.jar", forbidden)).toBe(true);
    expect(isForbiddenSharePath("1.21.1.json", forbidden)).toBe(true);
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
