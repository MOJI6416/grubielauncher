import { describe, expect, it } from "vitest";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import { applyClientSides, clientSideSuspects } from "./clientSides";

function mod(
  id: string,
  isClient: boolean | undefined,
  overrides: Partial<ILocalProject> = {},
): ILocalProject {
  return {
    title: id,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.MODRINTH,
    id,
    version: {
      id: `${id}-v`,
      dependencies: [],
      files: [
        {
          filename: `${id}.jar`,
          size: 1,
          url: "",
          sha1: "",
          isServer: true,
          ...(isClient === undefined ? {} : { isClient }),
        },
      ],
    },
    ...overrides,
  };
}

describe("clientSideSuspects", () => {
  it("asks only about Modrinth mods kept off the client", () => {
    const mods = [
      mod("lostcities", false),
      mod("sodium", true),
      mod("legacy", undefined),
      mod("cf", false, { provider: Provider.CURSEFORGE }),
      mod("pack", false, { projectType: ProjectType.RESOURCEPACK }),
    ];

    expect(clientSideSuspects(mods)).toEqual(["lostcities"]);
  });
});

describe("applyClientSides", () => {
  it("puts a server_only mod back on the client and keeps a dedicated one off", () => {
    const lostCities = mod("lostcities", false);
    const dedicated = mod("dedicated", false);

    const repaired = applyClientSides([lostCities, dedicated], {
      lostcities: true,
      dedicated: false,
    });

    expect(repaired).toBe(1);
    expect(lostCities.version?.files[0].isClient).toBe(true);
    expect(dedicated.version?.files[0].isClient).toBe(false);
  });

  it("changes nothing for a project Modrinth did not answer about", () => {
    const unknown = mod("gone", false);

    expect(applyClientSides([unknown], {})).toBe(0);
    expect(unknown.version?.files[0].isClient).toBe(false);
  });
});
