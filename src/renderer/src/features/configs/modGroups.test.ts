import { describe, expect, it } from "vitest";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import type { ConfigEntry } from "./configFiles";
import { configCandidates, groupConfigs, modIdentities } from "./modGroups";

function mod(id: string, title: string, filename: string): ILocalProject {
  return {
    id,
    title,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: `${id}.png`,
    url: "",
    provider: Provider.MODRINTH,
    version: {
      id: "1",
      files: [{ filename, size: 1, sha1: "", url: "", isServer: false }],
      dependencies: [],
    },
  } as ILocalProject;
}

function entry(relative: string): ConfigEntry {
  const index = relative.lastIndexOf("/");
  return {
    relative,
    base: "/config",
    folder: index === -1 ? "" : relative.slice(0, index),
    name: index === -1 ? relative : relative.slice(index + 1),
  };
}

describe("configCandidates", () => {
  it("tries the folder and the longest name prefixes first", () => {
    expect(configCandidates("jei/jei-client.ini")).toEqual([
      "jei",
      "jeiclient",
    ]);
    expect(configCandidates("sodium-extra-options.json")).toEqual([
      "sodiumextraoptions",
      "sodiumextra",
      "sodium",
    ]);
    expect(configCandidates("defaultconfigs/create-server.toml")).toEqual([
      "createserver",
      "create",
    ]);
  });
});

describe("groupConfigs", () => {
  const mods = [
    mod("jei", "Just Enough Items", "jei-1.21.1.jar"),
    mod("sodium", "Sodium", "sodium-0.6.jar"),
    mod("sodium-extra", "Sodium Extra", "sodium-extra-0.6.jar"),
    mod("ae2", "Applied Energistics 2", "appliedenergistics2.jar"),
  ];
  const identities = modIdentities(mods, {
    "jei-1.21.1.jar": { provides: ["jei"], requires: [] },
    "sodium-0.6.jar": { provides: ["sodium"], requires: [] },
    "sodium-extra-0.6.jar": { provides: ["sodium-extra"], requires: [] },
    "appliedenergistics2.jar": { provides: ["ae2"], requires: [] },
  });

  it("puts configs under the mod that owns them", () => {
    const groups = groupConfigs(
      [
        entry("jei/jei-client.ini"),
        entry("sodium-options.json"),
        entry("sodium-extra-options.json"),
        entry("ae2-client.json"),
        entry("random-file.json"),
      ],
      identities,
      "Other",
    );

    expect(
      groups.map((group) => [
        group.title,
        group.entries.map((item) => item.relative),
      ]),
    ).toEqual([
      ["Applied Energistics 2", ["ae2-client.json"]],
      ["Just Enough Items", ["jei/jei-client.ini"]],
      ["Sodium", ["sodium-options.json"]],
      ["Sodium Extra", ["sodium-extra-options.json"]],
      ["Other", ["random-file.json"]],
    ]);
    expect(groups[0].iconUrl).toBe("ae2.png");
  });

  it("reads jar ids by the lowercased file name the scanner returns", () => {
    const [identity] = modIdentities(
      [mod("cataclysm", "L_Ender's Cataclysm", "L_Enders_Cataclysm-2.6.jar.disabled")],
      { "l_enders_cataclysm-2.6.jar": { provides: ["cataclysm"], requires: [] } },
    );
    expect(identity.ids).toContain("cataclysm");
    expect(
      groupConfigs([entry("cataclysm-common.toml")], [identity], "Other")[0].title,
    ).toBe("L_Ender's Cataclysm");
  });

  it("ignores loader ids so they do not swallow unrelated files", () => {
    const loader = modIdentities(
      [mod("fabric-api", "Fabric API", "fabric-api.jar")],
      {
        "fabric-api.jar": { provides: ["fabric-api", "fabric"], requires: [] },
      },
    );
    expect(loader).toEqual([]);
  });
});
