import { describe, expect, it, vi } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";

vi.stubGlobal("window", { api: {} });

const { importUnknownJars, skippedFileNames } = await import("./unknownJarReview");
const { skippedJarKeys, withoutSkipped } = await import(
  "@renderer/features/newInstance/unknownJars"
);

function mod(
  id: string,
  file: string,
  provider: Provider,
  projectType = ProjectType.MOD,
): ILocalProject {
  return {
    title: id === "noname" ? "" : id,
    description: "",
    projectType,
    iconUrl: null,
    url: "",
    provider,
    id,
    version: {
      id: "1",
      dependencies: [],
      files: [{ filename: file, size: 1, sha1: "", url: "", isServer: true }],
    },
  };
}

const mods = [
  mod("sodium", "sodium.jar", Provider.MODRINTH),
  mod("stranger", "stranger-helper.jar", Provider.LOCAL),
  mod("noname", "mystery.jar", Provider.LOCAL),
  mod("pack", "Faithful.zip", Provider.LOCAL, ProjectType.RESOURCEPACK),
];

describe("unknown jars when moving from another launcher", () => {
  it("lists only local jars and marks them unchecked when the catalogs were down", () => {
    expect(importUnknownJars(mods, true)).toEqual([
      { key: "local:stranger", title: "stranger", fileName: "stranger-helper.jar", checked: true },
      { key: "local:noname", title: "mystery.jar", fileName: "mystery.jar", checked: true },
    ]);
    expect(importUnknownJars(mods, false).every((jar) => !jar.checked)).toBe(true);
  });

  it("drops what the player did not tick, from the list and from the copied folder", () => {
    const unknown = importUnknownJars(mods, true);
    const skipped = skippedJarKeys(unknown, new Set(["local:noname"]));
    expect([...skipped]).toEqual(["local:stranger"]);
    expect(withoutSkipped(mods, skipped).map((item) => item.id)).toEqual([
      "sodium",
      "noname",
      "pack",
    ]);
    expect(skippedFileNames(unknown, skipped)).toEqual([
      "stranger-helper.jar",
      "stranger-helper.jar.disabled",
    ]);
  });
});
