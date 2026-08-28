import { describe, expect, it } from "vitest";
import {
  DependencyType,
  ILocalProject,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import type { IUpdateVerdict, IUpdateVersion } from "@/types/Updates";
import { UPDATE_CHECK_MAX_ITEMS } from "@/types/Updates";
import {
  buildUpdateItems,
  chunkUpdateItems,
  readUpdateVerdicts,
  toModVersion,
} from "./updateQuery";

const SHA1 = "0f4a890d07402280686a518579fa9fa02309e315";

function localMod(overrides: Partial<ILocalProject> = {}): ILocalProject {
  return {
    id: "AANobbMI",
    provider: Provider.MODRINTH,
    title: "Sodium",
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    version: {
      id: "v1",
      dependencies: [],
      files: [
        {
          filename: "sodium.jar",
          size: 1,
          sha1: SHA1,
          url: "https://example.test/sodium.jar",
          isServer: true,
        },
      ],
    },
    ...overrides,
  };
}

function remoteVersion(
  overrides: Partial<IUpdateVersion> = {},
): IUpdateVersion {
  return {
    id: "v2",
    name: "Sodium 0.6",
    dependencies: [],
    downloads: 10,
    files: [
      {
        filename: "sodium-0.6.jar",
        size: 2,
        sha1: SHA1,
        url: "https://example.test/sodium-0.6.jar",
        isServer: true,
      },
    ],
    ...overrides,
  };
}

describe("buildUpdateItems", () => {
  it("keeps only remote providers and carries what is installed", () => {
    const items = buildUpdateItems([
      localMod(),
      localMod({ id: "306612", provider: Provider.CURSEFORGE }),
      localMod({ id: "local-1", provider: Provider.LOCAL }),
      localMod({ id: "other-1", provider: Provider.OTHER }),
    ]);

    expect(items).toEqual([
      {
        provider: Provider.MODRINTH,
        id: "AANobbMI",
        projectType: ProjectType.MOD,
        versionId: "v1",
        hash: SHA1,
      },
      {
        provider: Provider.CURSEFORGE,
        id: "306612",
        projectType: ProjectType.MOD,
        versionId: "v1",
        hash: SHA1,
      },
    ]);
  });

  it("asks once for a project that appears twice", () => {
    const items = buildUpdateItems([localMod(), localMod()]);
    expect(items).toHaveLength(1);
  });

  it("keeps distinct project types apart by id, not by tab", () => {
    const items = buildUpdateItems([
      localMod(),
      localMod({ id: "shader-1", projectType: ProjectType.SHADER }),
    ]);

    expect(items.map((item) => item.projectType)).toEqual([
      ProjectType.MOD,
      ProjectType.SHADER,
    ]);
  });

  it("omits a hash that is not a sha1 digest", () => {
    const items = buildUpdateItems([
      localMod({
        version: {
          id: "v1",
          dependencies: [],
          files: [
            {
              filename: "mod.jar",
              size: 1,
              sha1: "",
              url: "",
              isServer: true,
            },
          ],
        },
      }),
    ]);

    expect(items[0].hash).toBeUndefined();
    expect(items[0].versionId).toBe("v1");
  });

  it("omits versionId for a project with no installed file", () => {
    const items = buildUpdateItems([localMod({ version: null })]);

    expect(items[0].versionId).toBeUndefined();
    expect(items[0].hash).toBeUndefined();
  });

  it("drops entries without an id", () => {
    expect(buildUpdateItems([localMod({ id: "" })])).toEqual([]);
  });
});

describe("chunkUpdateItems", () => {
  it("splits at the request ceiling, not at an upstream batch size", () => {
    const items = buildUpdateItems(
      Array.from({ length: UPDATE_CHECK_MAX_ITEMS + 7 }, (_, index) =>
        localMod({ id: `id-${index}` }),
      ),
    );

    const chunks = chunkUpdateItems(items);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(UPDATE_CHECK_MAX_ITEMS);
    expect(chunks[1]).toHaveLength(7);
  });

  it("never exceeds the ceiling even when asked to", () => {
    const items = buildUpdateItems(
      Array.from({ length: 600 }, (_, index) => localMod({ id: `id-${index}` })),
    );

    expect(chunkUpdateItems(items, 5000)[0]).toHaveLength(
      UPDATE_CHECK_MAX_ITEMS,
    );
  });

  it("returns nothing for an empty library", () => {
    expect(chunkUpdateItems([])).toEqual([]);
  });
});

describe("toModVersion", () => {
  it("maps the wire version onto the installed-mod shape", () => {
    const version = toModVersion(
      remoteVersion({
        versionNumber: "0.6.0",
        releaseType: "release",
        datePublished: "2026-01-01T00:00:00Z",
        gameVersions: ["26.2"],
        changelog: "notes",
        dependencies: [
          {
            projectId: "dep",
            versionId: null,
            relationType: DependencyType.REQUIRED,
          },
        ],
      }),
    );

    expect(version.id).toBe("v2");
    expect(version.versionNumber).toBe("0.6.0");
    expect(version.changelog).toBe("notes");
    expect(version.files[0].filename).toBe("sodium-0.6.jar");
    expect(version.dependencies).toEqual([
      {
        projectId: "dep",
        versionId: null,
        project: null,
        relationType: DependencyType.REQUIRED,
      },
    ]);
  });

  it("drops a relation the launcher has no meaning for", () => {
    const version = toModVersion(
      remoteVersion({
        dependencies: [
          { projectId: "dep", versionId: null, relationType: "tool" },
        ],
      }),
    );

    expect(version.dependencies).toEqual([]);
  });
});

describe("readUpdateVerdicts", () => {
  const requested = buildUpdateItems([
    localMod(),
    localMod({ id: "306612", provider: Provider.CURSEFORGE }),
  ]);

  it("keeps the verdicts the server sent", () => {
    const verdicts: IUpdateVerdict[] = [
      {
        provider: Provider.MODRINTH,
        id: "AANobbMI",
        status: "update",
        latest: remoteVersion(),
      },
      {
        provider: Provider.CURSEFORGE,
        id: "306612",
        status: "unavailable",
      },
    ];

    const outcomes = readUpdateVerdicts(requested, verdicts);

    expect(outcomes.get("modrinth:AANobbMI")?.status).toBe("update");
    expect(outcomes.get("modrinth:AANobbMI")?.latest?.id).toBe("v2");
    expect(outcomes.get("curseforge:306612")).toEqual({
      status: "unavailable",
      latest: null,
    });
  });

  it("reports unknown, not 'no update', when the check itself failed", () => {
    const outcomes = readUpdateVerdicts(requested, null);

    expect([...outcomes.values()].map((state) => state.status)).toEqual([
      "unknown",
      "unknown",
    ]);
  });

  it("leaves an item the answer skipped as unknown", () => {
    const outcomes = readUpdateVerdicts(requested, [
      {
        provider: Provider.MODRINTH,
        id: "AANobbMI",
        status: "current",
        latest: remoteVersion({ id: "v1" }),
      },
    ]);

    expect(outcomes.get("modrinth:AANobbMI")?.status).toBe("current");
    expect(outcomes.get("curseforge:306612")?.status).toBe("unknown");
  });

  it("does not promise an update it cannot deliver a file for", () => {
    const outcomes = readUpdateVerdicts(requested, [
      { provider: Provider.MODRINTH, id: "AANobbMI", status: "update" },
    ]);

    expect(outcomes.get("modrinth:AANobbMI")).toEqual({
      status: "unknown",
      latest: null,
    });
  });

  it("ignores a verdict for something that was never asked about", () => {
    const outcomes = readUpdateVerdicts(requested, [
      { provider: Provider.MODRINTH, id: "stranger", status: "update" },
    ]);

    expect(outcomes.has("modrinth:stranger")).toBe(false);
    expect(outcomes.size).toBe(2);
  });
});
