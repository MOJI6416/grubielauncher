import { describe, expect, it } from "vitest";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import {
  FAVORITES_SET_ID,
  type IModSetItem,
  isFavorite,
  parseCollectionRef,
  parseSetsFile,
  projectsAsSetItems,
  removeSet,
  saveIntoSets,
  setAsProjects,
  toSetItems,
  toggleFavoriteIn,
} from "./modSets";

function mod(
  id: string,
  provider: Provider = Provider.MODRINTH,
  projectType: ProjectType = ProjectType.MOD,
): ILocalProject {
  return {
    title: `Title ${id}`,
    description: "long text",
    projectType,
    iconUrl: null,
    url: `https://modrinth.com/mod/${id}`,
    provider,
    id,
    version: null,
  };
}

describe("toSetItems", () => {
  it("keeps catalog content once and drops local files, plugins and worlds", () => {
    const items = toSetItems([
      mod("sodium"),
      mod("sodium"),
      mod("238222", Provider.CURSEFORGE),
      mod("faithful", Provider.MODRINTH, ProjectType.RESOURCEPACK),
      mod("mine", Provider.LOCAL),
      mod("essentials", Provider.MODRINTH, ProjectType.PLUGIN),
      mod("map", Provider.MODRINTH, ProjectType.WORLD),
    ]);

    expect(items.map((item) => `${item.provider}:${item.id}:${item.projectType}`)).toEqual([
      "modrinth:sodium:mod",
      "curseforge:238222:mod",
      "modrinth:faithful:resourcepack",
    ]);
    expect(items[0]).not.toHaveProperty("description");
  });
});

describe("saveIntoSets", () => {
  const now = "2026-10-30T10:00:00.000Z";

  it("creates a new set under a trimmed name", () => {
    const { sets, set } = saveIntoSets(
      [],
      "  Оптимизация  ",
      toSetItems([mod("sodium")]),
      now,
      "id-1",
    );

    expect(set).toMatchObject({ id: "id-1", name: "Оптимизация", createdAt: now });
    expect(sets).toEqual([set]);
  });

  it("adds new projects to a set with the same name, whatever the case", () => {
    const first = saveIntoSets([], "Visual", toSetItems([mod("iris")]), now, "id-1");
    const { sets, set } = saveIntoSets(
      first.sets,
      "visual",
      toSetItems([mod("iris"), mod("continuity")]),
      "2026-10-31T10:00:00.000Z",
      "id-2",
    );

    expect(sets).toHaveLength(1);
    expect(set.id).toBe("id-1");
    expect(set.items.map((item) => item.id)).toEqual(["iris", "continuity"]);
    expect(set.updatedAt).toBe("2026-10-31T10:00:00.000Z");
    expect(removeSet(sets, "id-1")).toEqual([]);
  });
});

describe("parseSetsFile", () => {
  it("reads valid sets and skips broken entries", () => {
    expect(
      parseSetsFile({
        version: 1,
        sets: [
          {
            id: "a",
            name: "QoL",
            createdAt: "x",
            updatedAt: "y",
            items: [
              { provider: "modrinth", id: "modmenu", projectType: "mod", title: "Mod Menu" },
              { provider: "local", id: "mine", projectType: "mod" },
              { provider: "curseforge", id: "", projectType: "mod" },
              { provider: "modrinth", id: "x", projectType: "plugin" },
            ],
          },
          { name: "no id" },
          null,
        ],
      }),
    ).toEqual([
      {
        id: "a",
        name: "QoL",
        createdAt: "x",
        updatedAt: "y",
        items: [
          {
            provider: "modrinth",
            id: "modmenu",
            projectType: "mod",
            title: "Mod Menu",
            iconUrl: null,
            url: "",
          },
        ],
      },
    ]);
    expect(parseSetsFile(null)).toEqual([]);
    expect(parseSetsFile({ sets: "nope" })).toEqual([]);
  });
});

describe("setAsProjects", () => {
  it("turns items into projects without a chosen version", () => {
    const { set } = saveIntoSets([], "S", toSetItems([mod("sodium")]), "t", "id");
    expect(setAsProjects(set)).toEqual([
      {
        title: "Title sodium",
        description: "",
        projectType: ProjectType.MOD,
        iconUrl: null,
        url: "https://modrinth.com/mod/sodium",
        provider: Provider.MODRINTH,
        id: "sodium",
        version: null,
      },
    ]);
  });
});

describe("favorites", () => {
  const sodium: IModSetItem = {
    provider: Provider.MODRINTH,
    id: "AANobbMI",
    projectType: ProjectType.MOD,
    title: "Sodium",
    iconUrl: null,
    url: "",
  };

  it("creates the favorites set on the first star and toggles it back", () => {
    const first = toggleFavoriteIn([], sodium, "t1");
    expect(first.favorite).toBe(true);
    expect(isFavorite(first.sets, sodium)).toBe(true);
    expect(first.sets[0].id).toBe(FAVORITES_SET_ID);

    const second = toggleFavoriteIn(first.sets, sodium, "t2");
    expect(second.favorite).toBe(false);
    expect(isFavorite(second.sets, sodium)).toBe(false);
    expect(second.sets).toHaveLength(1);
  });

  it("keeps other sets as they are", () => {
    const other = {
      id: "x",
      name: "Other",
      createdAt: "",
      updatedAt: "",
      items: [sodium],
    };
    const { sets } = toggleFavoriteIn([other], sodium, "t");
    expect(sets.find((set) => set.id === "x")).toBe(other);
  });
});

describe("collections", () => {
  it("reads a collection link or a bare id", () => {
    expect(parseCollectionRef("https://modrinth.com/collection/K2SNA6lZ")).toBe("K2SNA6lZ");
    expect(parseCollectionRef("modrinth.com/collection/K2SNA6lZ")).toBeNull();
    expect(parseCollectionRef("K2SNA6lZ")).toBe("K2SNA6lZ");
    expect(parseCollectionRef("https://modrinth.com/mod/sodium")).toBeNull();
    expect(parseCollectionRef("https://evil.com/collection/K2SNA6lZ")).toBeNull();
  });

  it("keeps only what a set can hold", () => {
    const items = projectsAsSetItems([
      {
        id: "a",
        title: "A",
        description: "",
        projectType: ProjectType.MOD,
        iconUrl: null,
        versions: [],
        provider: Provider.MODRINTH,
        url: "u",
        gallery: [],
        body: "",
      },
      {
        id: "p",
        title: "Pack",
        description: "",
        projectType: ProjectType.MODPACK,
        iconUrl: null,
        versions: [],
        provider: Provider.MODRINTH,
        url: "",
        gallery: [],
        body: "",
      },
    ]);
    expect(items.map((item) => item.id)).toEqual(["a"]);
  });
});
