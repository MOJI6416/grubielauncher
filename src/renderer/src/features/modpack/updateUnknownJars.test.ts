import { describe, expect, it, vi } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";

vi.stubGlobal("window", { api: {} });

const {
  skipUnknownJars,
  unknownJarItems,
  updatePresenceItems,
} = await import("./updateUnknownJars");
type Update = Parameters<typeof skipUnknownJars>[0];

function local(id: string, file: string, provider = Provider.LOCAL): ILocalProject {
  return {
    title: id,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider,
    id,
    version: {
      id: "1",
      dependencies: [],
      files: [
        {
          filename: file,
          size: 1,
          sha1: `${id}-sha`,
          url: "",
          localPath: `C:/pack/overrides/mods/${file}`,
          isServer: true,
        },
      ],
    },
  };
}

const keep = local("kept", "kept.jar");
const added = local("helper", "helper.jar");
const fromOld = local("tool", "tool-1.jar");
const toNew = local("tool", "tool-2.jar");
const catalog = local("sodium", "sodium.jar", Provider.MODRINTH);

const update = {
  merge: {
    mods: [keep, added, toNew, catalog],
    added: [added, catalog],
    removed: [],
    updated: [{ from: fromOld, to: toNew }],
    keptPinned: [],
    removedByUser: [],
    own: [],
    unchanged: 1,
  },
} as unknown as Update;

describe("unknown jars on a modpack update", () => {
  it("checks only incoming local jars", () => {
    expect(updatePresenceItems(update)).toEqual([
      {
        key: "local:helper",
        sha1: "helper-sha",
        path: "C:/pack/overrides/mods/helper.jar",
      },
      {
        key: "local:tool",
        sha1: "tool-sha",
        path: "C:/pack/overrides/mods/tool-2.jar",
      },
    ]);
  });

  it("lists the unknown ones with the install choice", () => {
    expect(
      unknownJarItems(
        update,
        [
          { key: "local:helper", checked: true },
          { key: "local:tool", checked: false },
        ],
        new Set(["local:tool"]),
      ).map((item) => [item.key, item.unknown, item.install]),
    ).toEqual([
      ["local:helper", "unknown", false],
      ["local:tool", "unchecked", true],
    ]);
  });

  it("drops a skipped new jar and keeps the old version of a skipped update", () => {
    const next = skipUnknownJars(update, new Set(["local:helper", "local:tool"]));
    expect(next.merge.mods).toEqual([keep, fromOld, catalog]);
    expect(next.merge.added).toEqual([catalog]);
    expect(next.merge.updated).toEqual([]);
    expect(skipUnknownJars(update, new Set())).toBe(update);
  });
});
