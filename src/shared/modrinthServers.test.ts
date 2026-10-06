import { describe, expect, it } from "vitest";
import type { ModrinthServerQuery } from "@/types/ModrinthServers";
import {
  buildServerFilters,
  normalizeServerGallery,
  normalizeServerHit,
  sanitizeServerQuery,
  serverSortIndex,
  sortGameVersions,
} from "./modrinthServers";

const BASE =
  "project_types = minecraft_java_server AND minecraft_java_server.ping.data EXISTS";

function query(patch: Partial<ModrinthServerQuery> = {}): ModrinthServerQuery {
  return { query: "", sort: "relevance", offset: 0, limit: 20, ...patch };
}

const MODPACK_HIT = {
  project_id: "OgcNPs6n",
  slug: "aero-server",
  name: "Aero SMP",
  summary: "Create and Create Aeronautics.",
  categories: ["neoforge", "smp", "social"],
  display_categories: ["smp", "technical", "social", "social"],
  follows: 113,
  icon_url: "https://cdn.modrinth.com/icon.webp",
  featured_gallery: "https://cdn.modrinth.com/banner.webp",
  project_loader_fields: {
    game_versions: ["1.21.1"],
    mrpack_loaders: ["neoforge"],
  },
  minecraft_server: { region: "europe", languages: ["en"] },
  minecraft_java_server: {
    address: "play.aerosmp.com",
    content: {
      kind: "modpack",
      version_id: "GDELFL7Y",
      project_id: "OgcNPs6n",
      project_name: "Aero SMP",
      project_icon: "https://cdn.modrinth.com/icon.webp",
    },
    ping: {
      data: {
        latency: { secs: 0, nanos: 518304903 },
        version_name: "Velocity 1.7.2-26.1.2",
        players_online: 18,
        players_max: 300,
      },
    },
    verified_plays_2w: 4518,
  },
  game_versions: ["1.21.1"],
  mrpack_loaders: ["neoforge"],
};

const VANILLA_HIT = {
  project_id: "cnVFO9Pl",
  slug: "minebash",
  name: "MineBash",
  summary: "Survival and tag",
  display_categories: ["social"],
  follows: 1,
  icon_url: null,
  featured_gallery: null,
  game_versions: [],
  minecraft_server: { region: null, languages: ["en", "ru"] },
  minecraft_java_server: {
    address: " mc.bartbash.com ",
    content: {
      kind: "vanilla",
      supported_game_versions: ["1.21", "1.21.11", "1.20.4", "26.1", "1.21.1"],
      recommended_game_version: "1.21.1",
    },
    ping: null,
    verified_plays_2w: 0,
  },
};

describe("buildServerFilters", () => {
  it("always limits to online java servers", () => {
    expect(buildServerFilters(query())).toBe(BASE);
  });

  it("adds kind, version and language", () => {
    expect(
      buildServerFilters(
        query({ kind: "vanilla", gameVersion: "1.21.1", language: "ru" }),
      ),
    ).toBe(
      `${BASE} AND minecraft_java_server.content.kind = vanilla AND (game_versions IN ["1.21.1"] OR minecraft_java_server.content.supported_game_versions IN ["1.21.1"]) AND minecraft_server.languages IN ["ru"]`,
    );
  });

  it("limits compatible servers to vanilla of the instance version", () => {
    expect(
      buildServerFilters(
        query({
          kind: "modpack",
          gameVersion: "1.20.1",
          compatible: { gameVersion: "1.21.1" },
        }),
      ),
    ).toBe(
      `${BASE} AND (minecraft_java_server.content.kind = vanilla AND (game_versions IN ["1.21.1"] OR minecraft_java_server.content.supported_game_versions IN ["1.21.1"]))`,
    );
  });

  it("lets the instance modpack project through as compatible", () => {
    expect(
      buildServerFilters(
        query({
          compatible: { gameVersion: "1.21.1", modpackProjectId: "OgcNPs6n" },
        }),
      ),
    ).toContain(`OR project_id = "OgcNPs6n")`);
  });

  it("drops values that could break the filter expression", () => {
    expect(
      buildServerFilters(
        query({ gameVersion: '1.21"] OR x', language: "r u" }),
      ),
    ).toBe(BASE);
  });
});

describe("sanitizeServerQuery", () => {
  it("clamps paging and rejects unknown values", () => {
    const result = sanitizeServerQuery({
      ...query(),
      sort: "random" as ModrinthServerQuery["sort"],
      kind: "bedrock" as ModrinthServerQuery["kind"],
      offset: -5,
      limit: 500,
    });

    expect(result.sort).toBe("relevance");
    expect(result.kind).toBeUndefined();
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(50);
  });

  it("keeps compatibility only with a game version", () => {
    expect(
      sanitizeServerQuery({ ...query(), compatible: { gameVersion: "" } })
        .compatible,
    ).toBeUndefined();
  });
});

describe("serverSortIndex", () => {
  it("maps sorts to Modrinth indexes", () => {
    expect(serverSortIndex("players")).toBe(
      "minecraft_java_server.ping.data.players_online",
    );
    expect(serverSortIndex("newest")).toBe("date_created");
  });
});

describe("normalizeServerHit", () => {
  it("reads a modpack server", () => {
    expect(normalizeServerHit(MODPACK_HIT)).toEqual({
      id: "OgcNPs6n",
      slug: "aero-server",
      name: "Aero SMP",
      summary: "Create and Create Aeronautics.",
      iconUrl: "https://cdn.modrinth.com/icon.webp",
      bannerUrl: "https://cdn.modrinth.com/banner.webp",
      url: "https://modrinth.com/server/aero-server",
      address: "play.aerosmp.com",
      region: "europe",
      languages: ["en"],
      categories: ["smp", "technical", "social"],
      follows: 113,
      verifiedPlays: 4518,
      content: {
        kind: "modpack",
        projectId: "OgcNPs6n",
        versionId: "GDELFL7Y",
        title: "Aero SMP",
        iconUrl: "https://cdn.modrinth.com/icon.webp",
        loaders: ["neoforge"],
        gameVersions: ["1.21.1"],
      },
      ping: {
        playersOnline: 18,
        playersMax: 300,
        latencyMs: 518,
        versionName: "Velocity 1.7.2-26.1.2",
      },
    });
  });

  it("reads a vanilla server with sorted versions and no ping", () => {
    const server = normalizeServerHit(VANILLA_HIT);

    expect(server?.address).toBe("mc.bartbash.com");
    expect(server?.ping).toBeNull();
    expect(server?.region).toBeNull();
    expect(server?.content).toEqual({
      kind: "vanilla",
      gameVersions: ["26.1", "1.21.11", "1.21.1", "1.21", "1.20.4"],
      recommendedVersion: "1.21.1",
    });
  });

  it("skips servers without an address or with unknown content", () => {
    expect(
      normalizeServerHit({
        ...VANILLA_HIT,
        minecraft_java_server: {
          ...VANILLA_HIT.minecraft_java_server,
          address: "",
        },
      }),
    ).toBeNull();
    expect(
      normalizeServerHit({
        ...VANILLA_HIT,
        minecraft_java_server: {
          ...VANILLA_HIT.minecraft_java_server,
          content: { kind: "bedrock" },
        },
      }),
    ).toBeNull();
    expect(normalizeServerHit(null)).toBeNull();
  });
});

describe("sortGameVersions", () => {
  it("puts the newest first and removes duplicates", () => {
    expect(sortGameVersions(["1.8.9", "26.2", "1.21.1", "1.8.9"])).toEqual([
      "26.2",
      "1.21.1",
      "1.8.9",
    ]);
  });
});

describe("normalizeServerGallery", () => {
  it("opens the full image, previews the thumbnail and keeps the featured shot first", () => {
    const gallery = normalizeServerGallery({
      gallery: [
        {
          url: "https://cdn.modrinth.com/a_350.webp",
          raw_url: "https://cdn.modrinth.com/a.png",
          featured: false,
          name: "Spawn",
          description: null,
          ordering: 0,
        },
        {
          url: "https://cdn.modrinth.com/b_350.webp",
          raw_url: "https://cdn.modrinth.com/b.png",
          featured: true,
          name: "Banner",
          description: "Main hall",
          ordering: 3,
        },
      ],
    });

    expect(gallery).toEqual([
      {
        url: "https://cdn.modrinth.com/b.png",
        thumbnail: "https://cdn.modrinth.com/b_350.webp",
        title: "Banner",
        description: "Main hall",
      },
      {
        url: "https://cdn.modrinth.com/a.png",
        thumbnail: "https://cdn.modrinth.com/a_350.webp",
        title: "Spawn",
        description: "",
      },
    ]);
  });

  it("drops entries without a secure image and tolerates a missing gallery", () => {
    expect(normalizeServerGallery(null)).toEqual([]);
    expect(normalizeServerGallery({ gallery: "nope" })).toEqual([]);
    expect(
      normalizeServerGallery({
        gallery: [
          { url: "http://insecure.example/x.png" },
          "https://cdn.modrinth.com/string.png",
          { url: "https://cdn.modrinth.com/only_350.webp" },
        ],
      }),
    ).toEqual([
      {
        url: "https://cdn.modrinth.com/only_350.webp",
        thumbnail: "https://cdn.modrinth.com/only_350.webp",
        title: "",
        description: "",
      },
    ]);
  });
});
