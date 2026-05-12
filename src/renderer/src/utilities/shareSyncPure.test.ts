import { describe, expect, it } from "vitest";
import { ProjectType, Provider } from "@/types/ModManager";
import {
  areOtherFilesEqual,
  formatShareDiffParts,
  getShareDiffParts,
  preserveLocalBlockedPaths,
} from "./shareSyncPure";

function localMod(fileOverrides: Record<string, unknown> = {}) {
  return {
    id: "curse-project",
    provider: Provider.CURSEFORGE,
    title: "Curse Project",
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    version: {
      id: "file",
      dependencies: [],
      files: [
        {
          filename: "blocked.jar",
          size: 1,
          sha1: "sha1",
          url: "blocked::https://curseforge.example/file",
          isServer: false,
          ...fileOverrides,
        },
      ],
    },
  } as any;
}

describe("share sync pure helpers", () => {
  it("preserves manually selected blocked mod paths across remote mod updates", () => {
    const currentMods = [localMod({ localPath: "C:/Downloads/blocked.jar" })];
    const nextMods = [localMod()];

    preserveLocalBlockedPaths(currentMods, nextMods);

    expect(nextMods[0].version?.files[0].localPath).toBe(
      "C:/Downloads/blocked.jar",
    );
  });

  it("compares other-file selections by size and path set, not order", () => {
    expect(
      areOtherFilesEqual(
        { paths: ["server/a.txt", "config/b.toml"], size: 50, url: "url-a" },
        { paths: ["config/b.toml", "server/a.txt"], size: 50, url: "url-b" },
      ),
    ).toBe(true);

    expect(
      areOtherFilesEqual(
        { paths: ["server/a.txt"], size: 50, url: "url-a" },
        { paths: ["server/a.txt"], size: 51, url: "url-a" },
      ),
    ).toBe(false);
  });

  it("does not report local options/name differences for downloaded versions", () => {
    expect(
      getShareDiffParts({
        isOwner: false,
        remoteName: "Remote Name",
        currentName: "Local Name",
        remoteImage: "logo",
        currentLogo: "logo",
        modsEqual: true,
        serversEqual: true,
        remoteQuickServer: "",
        currentQuickServer: "",
        remoteRunArguments: { game: "", jvm: "" },
        currentRunArguments: { game: "", jvm: "" },
        remoteOptions: "remote-options",
        currentOptions: "local-options",
        remoteOther: { paths: ["a"], size: 1, url: "remote" },
        currentOther: { paths: ["a"], size: 1, url: "local" },
      }),
    ).toEqual([]);
  });

  it("reports real share update changes for owners", () => {
    expect(
      getShareDiffParts({
        isOwner: true,
        remoteName: "Old Name",
        currentName: "New Name",
        remoteImage: "old-logo",
        currentLogo: "new-logo",
        modsEqual: false,
        serversEqual: false,
        remoteQuickServer: "old.server",
        currentQuickServer: "new.server",
        remoteRunArguments: { game: "--old", jvm: "" },
        currentRunArguments: { game: "--new", jvm: "" },
        remoteOptions: "old-options",
        currentOptions: "new-options",
        remoteOther: { paths: ["old"], size: 1, url: "old" },
        currentOther: { paths: ["new"], size: 2, url: "new" },
      }),
    ).toEqual([
      "name",
      "logo",
      "mods",
      "servers",
      "arguments",
      "options",
      "other",
    ]);
  });

  it("keeps the legacy diff string format used by existing UI", () => {
    expect(formatShareDiffParts(["mods", "servers"])).toBe("mods, servers, ");
    expect(formatShareDiffParts([])).toBe("");
  });
});
