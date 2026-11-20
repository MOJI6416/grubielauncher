import { describe, expect, it } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import type { AppliedPack } from "./state";
import {
  jarCandidates,
  presenceItems,
  skippedJarFiles,
  skippedJarKeys,
  unknownJarsOf,
  withoutSkipped,
} from "./unknownJars";

const join = async (...parts: string[]) => parts.join("/");

function mod(
  provider: Provider,
  id: string,
  file: Partial<NonNullable<ILocalProject["version"]>["files"][number]>,
  projectType = ProjectType.MOD,
): ILocalProject {
  return {
    title: id,
    description: "",
    projectType,
    iconUrl: null,
    url: "",
    provider,
    id,
    version: {
      id: "1",
      dependencies: [],
      files: [
        {
          filename: `${id}.jar`,
          size: 1,
          url: "",
          sha1: "",
          isServer: true,
          isClient: true,
          ...file,
        },
      ],
    },
  } as ILocalProject;
}

const zipPack: AppliedPack = { kind: "file", title: "Pack", isOwner: true };
const glPack: AppliedPack = {
  kind: "file",
  title: "Pack",
  isOwner: true,
  importData: {
    path: "/tmp/pack",
    conf: {} as never,
    servers: [],
    options: "",
  },
};

const overrideJar = mod(Provider.LOCAL, "helper", {
  localPath: "/tmp/zip/overrides/mods/helper.jar",
  url: "file:///tmp/zip/overrides/mods/helper.jar",
  sha1: "a".repeat(40),
});
const githubJar = mod(Provider.OTHER, "addon", {
  url: "https://github.com/x/y/releases/download/1/addon.jar",
  sha1: "b".repeat(40),
});
const sharedJar = mod(Provider.LOCAL, "shared", {
  url: "https://cdn.grubielauncher.com/modpacks/c/mods/shared.jar",
  sha1: "c".repeat(40),
});
const catalogMod = mod(Provider.MODRINTH, "sodium", {
  url: "https://cdn.modrinth.com/data/AANobbMI/versions/1/sodium.jar",
});
const localPack = mod(Provider.LOCAL, "textures", {}, ProjectType.RESOURCEPACK);

describe("unknown jars of an imported pack", () => {
  it("checks only mods that do not come from CurseForge or Modrinth", () => {
    expect(
      jarCandidates([
        overrideJar,
        githubJar,
        sharedJar,
        catalogMod,
        localPack,
      ]).map((item) => item.id),
    ).toEqual(["helper", "addon", "shared"]);
  });

  it("hands the lookup a file to read or a link to fetch", async () => {
    expect(
      await presenceItems([overrideJar, githubJar, sharedJar], zipPack, join),
    ).toEqual([
      {
        key: "local:helper",
        sha1: "a".repeat(40),
        path: "/tmp/zip/overrides/mods/helper.jar",
      },
      {
        key: "other:addon",
        sha1: "b".repeat(40),
        url: "https://github.com/x/y/releases/download/1/addon.jar",
      },
      {
        key: "local:shared",
        sha1: "c".repeat(40),
        url: "https://cdn.grubielauncher.com/modpacks/c/mods/shared.jar",
      },
    ]);

    const exported = mod(Provider.LOCAL, "kept", { disabled: true });
    expect(await presenceItems([exported], glPack, join)).toEqual([
      { key: "local:kept", path: "/tmp/pack/mods/kept.jar.disabled" },
    ]);
  });

  it("skips every unknown jar unless the player ticks it", () => {
    const unknown = unknownJarsOf({
      unknown: ["local:helper"],
      unchecked: ["other:addon"],
    });

    expect(unknown).toEqual([
      { key: "local:helper", checked: true },
      { key: "other:addon", checked: false },
    ]);
    const skipped = skippedJarKeys(unknown, new Set(["other:addon"]));
    expect([...skipped]).toEqual(["local:helper"]);
    expect(
      withoutSkipped([overrideJar, githubJar, catalogMod], skipped).map(
        (item) => item.id,
      ),
    ).toEqual(["addon", "sodium"]);
  });

  it("names the files to take out of the unpacked pack", async () => {
    const skipped = new Set(["local:helper", "local:kept"]);

    expect(
      await skippedJarFiles([overrideJar], skipped, zipPack, join),
    ).toEqual([
      "/tmp/zip/overrides/mods/helper.jar",
      "/tmp/zip/overrides/mods/helper.jar.disabled",
    ]);
    expect(
      await skippedJarFiles(
        [mod(Provider.LOCAL, "kept", {})],
        skipped,
        glPack,
        join,
      ),
    ).toEqual(["/tmp/pack/mods/kept.jar", "/tmp/pack/mods/kept.jar.disabled"]);
    expect(
      await skippedJarFiles(
        [sharedJar],
        new Set(["local:shared"]),
        zipPack,
        join,
      ),
    ).toEqual([]);
  });
});
