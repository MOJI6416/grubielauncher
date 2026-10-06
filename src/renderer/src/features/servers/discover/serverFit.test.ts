import { describe, expect, it } from "vitest";
import type { IVersionConf } from "@/types/IVersion";
import type {
  ModrinthServer,
  ModrinthServerContent,
} from "@/types/ModrinthServers";
import { Provider } from "@/types/ModManager";
import {
  fitInstanceOf,
  serverEntryOf,
  serverFit,
  serverVersionPreference,
  summarizeVersions,
} from "./serverFit";

function server(content: ModrinthServerContent): ModrinthServer {
  return {
    id: "srv",
    slug: "srv",
    name: "Server",
    summary: "",
    iconUrl: null,
    bannerUrl: null,
    url: "https://modrinth.com/server/srv",
    address: "mc.example.com",
    region: null,
    languages: [],
    categories: [],
    follows: 0,
    verifiedPlays: 0,
    content,
    ping: null,
  };
}

const VANILLA = server({
  kind: "vanilla",
  gameVersions: ["1.21.4", "1.21.1", "1.20.1"],
  recommendedVersion: "1.21.1",
});

const MODPACK = server({
  kind: "modpack",
  projectId: "pack",
  versionId: "v2",
  title: "Pack",
  iconUrl: null,
  loaders: ["fabric"],
  gameVersions: ["1.21.1"],
});

describe("serverFit", () => {
  it("accepts a vanilla server that supports the instance version", () => {
    expect(serverFit(VANILLA, { gameVersion: "1.21.1" })).toBe("ready");
    expect(serverFit(VANILLA, { gameVersion: "1.19.2" })).toBe("otherVersion");
  });

  it("treats a vanilla server without listed versions as joinable", () => {
    expect(
      serverFit(
        server({ kind: "vanilla", gameVersions: [], recommendedVersion: null }),
        { gameVersion: "1.8.9" },
      ),
    ).toBe("ready");
  });

  it("requires the server modpack and its exact version", () => {
    expect(serverFit(MODPACK, { gameVersion: "1.21.1" })).toBe("needsPack");
    expect(
      serverFit(MODPACK, {
        gameVersion: "1.21.1",
        modpackProjectId: "pack",
        modpackVersionId: "v1",
      }),
    ).toBe("packVersion");
    expect(
      serverFit(MODPACK, {
        gameVersion: "1.21.1",
        modpackProjectId: "pack",
        modpackVersionId: "v2",
      }),
    ).toBe("ready");
  });
});

describe("fitInstanceOf", () => {
  it("uses only a Modrinth modpack source", () => {
    const conf = {
      version: { id: "1.21.1" },
      modpack: {
        provider: Provider.CURSEFORGE,
        projectId: "123",
        versionId: "456",
      },
    } as unknown as IVersionConf;

    expect(fitInstanceOf(conf)).toEqual({
      gameVersion: "1.21.1",
      modpackProjectId: undefined,
      modpackVersionId: undefined,
    });

    expect(
      fitInstanceOf({
        ...conf,
        modpack: { ...conf.modpack!, provider: Provider.MODRINTH },
      }),
    ).toEqual({
      gameVersion: "1.21.1",
      modpackProjectId: "123",
      modpackVersionId: "456",
    });
  });
});

describe("serverVersionPreference", () => {
  it("puts the recommended version first", () => {
    expect(serverVersionPreference(VANILLA.content)).toEqual([
      "1.21.1",
      "1.21.4",
      "1.20.1",
    ]);
  });
});

describe("summarizeVersions", () => {
  it("lists a few versions and shortens long lists to a range", () => {
    expect(summarizeVersions(["1.21.1", "1.20.1"])).toBe("1.21.1, 1.20.1");
    expect(summarizeVersions(["26.2", "1.21.1", "1.20.1", "1.8.9"])).toBe(
      "1.8.9 – 26.2",
    );
  });
});

describe("serverEntryOf", () => {
  it("makes a server list entry with an NBT-safe name", () => {
    expect(
      serverEntryOf({ ...VANILLA, name: " Cobble 🐉 SMP " + "x".repeat(80) }),
    ).toEqual({
      name: ("Cobble  SMP " + "x".repeat(80)).slice(0, 64),
      ip: "mc.example.com",
      acceptTextures: null,
    });
    expect(serverEntryOf({ ...VANILLA, name: "🐉" }).name).toBe(
      "mc.example.com",
    );
  });
});
