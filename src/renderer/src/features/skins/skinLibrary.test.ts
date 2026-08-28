import { describe, expect, it } from "vitest";
import { ICape, ISkinEntry } from "@/types/SkinManager";
import {
  buildSkinList,
  canDeleteSkin,
  capeLabel,
  countSkinFilters,
  exportFileName,
  findCape,
  isGeneratedSkinName,
  isSkinApplied,
  matchesSkinFilter,
  matchesSkinQuery,
  pendingSkinChanges,
  pickSelectedSkinId,
  shortSkinLabel,
  toggleFavorite,
} from "./skinLibrary";

function skin(partial: Partial<ISkinEntry> & { id: string }): ISkinEntry {
  return {
    hash: `${partial.id}0000000000000000000000000000000000000`,
    model: "classic",
    name: partial.id,
    url: `file:///skins/${partial.id}.png`,
    ...partial,
  };
}

const notch = skin({ id: "notch", name: "Notch", model: "classic" });
const alex = skin({ id: "alex", name: "Alex", model: "slim", capeId: "migrator" });
const raw = skin({ id: "raw", name: "4b6a0b00cafe", model: "classic" });

const skins = [notch, alex, raw];

describe("isGeneratedSkinName", () => {
  it("recognises hash-derived names", () => {
    expect(isGeneratedSkinName("4b6a0b00cafe")).toBe(true);
    expect(isGeneratedSkinName("4b6a0b00cafe-1a2b3c")).toBe(true);
    expect(isGeneratedSkinName("fac832c3-224c-4f0a-9c11-6d2b0a1e77aa")).toBe(
      true,
    );
  });

  it("keeps human names", () => {
    expect(isGeneratedSkinName("Notch")).toBe(false);
    expect(isGeneratedSkinName("cafe")).toBe(false);
    expect(isGeneratedSkinName("Мой скин")).toBe(false);
    expect(isGeneratedSkinName("moji6416-cfa25e")).toBe(false);
  });

  it("shortens only generated names", () => {
    expect(shortSkinLabel("4b6a0b00cafe")).toBe("4B6A0B00CA");
    expect(shortSkinLabel("Notch")).toBe("Notch");
  });
});

describe("capeLabel", () => {
  const cape = (alias: string): ICape => ({
    id: "c1",
    hash: "abc",
    alias,
    url: "file:///c1.png",
    cape: "",
  });

  it("keeps a readable alias", () => {
    expect(capeLabel(cape("Migrator"), "Плащ")).toBe("Migrator");
  });

  it("falls back when the alias is a hash", () => {
    expect(capeLabel(cape("be05a2d92dd0"), "Плащ")).toBe("Плащ");
    expect(capeLabel(cape("   "), "Плащ")).toBe("Плащ");
  });
});

describe("search and filters", () => {
  it("matches by name and hash prefix", () => {
    expect(matchesSkinQuery(notch, "not")).toBe(true);
    expect(matchesSkinQuery(notch, "NOTCH")).toBe(true);
    expect(matchesSkinQuery(notch, "alex")).toBe(false);
    expect(matchesSkinQuery(notch, "")).toBe(true);
    expect(matchesSkinQuery(notch, "notch00")).toBe(true);
  });

  it("filters by model and cape", () => {
    expect(matchesSkinFilter(alex, "slim")).toBe(true);
    expect(matchesSkinFilter(alex, "classic")).toBe(false);
    expect(matchesSkinFilter(alex, "cape")).toBe(true);
    expect(matchesSkinFilter(notch, "cape")).toBe(false);
    expect(matchesSkinFilter(notch, "all")).toBe(true);
  });

  it("filters by favorites", () => {
    expect(matchesSkinFilter(alex, "favorite", ["alex"])).toBe(true);
    expect(matchesSkinFilter(notch, "favorite", ["alex"])).toBe(false);
    expect(matchesSkinFilter(notch, "favorite")).toBe(false);
  });

  it("counts each filter", () => {
    expect(countSkinFilters(skins, ["raw"])).toEqual({
      all: 3,
      favorite: 1,
      classic: 2,
      slim: 1,
      cape: 1,
    });
  });
});

describe("buildSkinList", () => {
  it("puts the applied skin first", () => {
    const list = buildSkinList({
      skins,
      query: "",
      filter: "all",
      sort: "recent",
      activeSkin: "notch",
    });

    expect(list.map((item) => item.id)).toEqual(["notch", "raw", "alex"]);
  });

  it("sorts the rest newest first", () => {
    const list = buildSkinList({
      skins,
      query: "",
      filter: "all",
      sort: "recent",
    });

    expect(list.map((item) => item.id)).toEqual(["raw", "alex", "notch"]);
  });

  it("sorts by name", () => {
    const list = buildSkinList({
      skins,
      query: "",
      filter: "all",
      sort: "name",
    });

    expect(list.map((item) => item.id)).toEqual(["raw", "alex", "notch"]);
  });

  it("puts favorites right after the applied skin", () => {
    const list = buildSkinList({
      skins,
      query: "",
      filter: "all",
      sort: "recent",
      activeSkin: "raw",
      favorites: ["notch"],
    });

    expect(list.map((item) => item.id)).toEqual(["raw", "notch", "alex"]);
  });

  it("applies query and filter together", () => {
    const list = buildSkinList({
      skins,
      query: "a",
      filter: "slim",
      sort: "recent",
    });

    expect(list.map((item) => item.id)).toEqual(["alex"]);
  });
});

describe("toggleFavorite", () => {
  it("adds and removes without mutating the input", () => {
    const initial = ["alex"];

    expect(toggleFavorite(initial, "notch")).toEqual(["alex", "notch"]);
    expect(toggleFavorite(initial, "alex")).toEqual([]);
    expect(initial).toEqual(["alex"]);
  });
});

describe("pickSelectedSkinId", () => {
  it("keeps a valid selection", () => {
    expect(pickSelectedSkinId(skins, "alex")).toBe("alex");
  });

  it("falls back to the first entry", () => {
    expect(pickSelectedSkinId(skins, "gone")).toBe("notch");
    expect(pickSelectedSkinId([], "gone")).toBeNull();
  });
});

describe("pendingSkinChanges", () => {
  it("reports nothing when the draft equals the applied state", () => {
    const applied = {
      activeSkin: "notch",
      activeModel: "classic",
      activeCape: undefined,
    };

    expect(pendingSkinChanges(applied, { skinId: "notch", model: "classic" })).toEqual(
      [],
    );
    expect(isSkinApplied(applied, { skinId: "notch", model: "classic" })).toBe(true);
  });

  it("reports a skin change", () => {
    expect(
      pendingSkinChanges({ activeSkin: "notch" }, { skinId: "alex" }),
    ).toEqual(["skin"]);
  });

  it("reports a model change on the applied skin", () => {
    expect(
      pendingSkinChanges(
        { activeSkin: "notch", activeModel: "classic" },
        { skinId: "notch", model: "slim" },
      ),
    ).toEqual(["model"]);
  });

  it("does not report a model change on top of a skin change", () => {
    expect(
      pendingSkinChanges(
        { activeSkin: "notch", activeModel: "classic" },
        { skinId: "alex", model: "slim" },
      ),
    ).toEqual(["skin"]);
  });

  it("reports a cape change in both directions", () => {
    expect(
      pendingSkinChanges(
        { activeSkin: "notch", activeCape: "migrator" },
        { skinId: "notch", capeId: undefined },
      ),
    ).toEqual(["cape"]);
    expect(
      pendingSkinChanges(
        { activeSkin: "notch" },
        { skinId: "notch", capeId: "migrator" },
      ),
    ).toEqual(["cape"]);
  });

  it("reports nothing without a draft skin", () => {
    expect(pendingSkinChanges({ activeSkin: "notch" }, {})).toEqual([]);
    expect(isSkinApplied({ activeSkin: "notch" }, {})).toBe(false);
  });
});

describe("canDeleteSkin", () => {
  it("refuses to delete the applied skin", () => {
    expect(canDeleteSkin(notch, { activeSkin: "notch" })).toBe(false);
    expect(canDeleteSkin(alex, { activeSkin: "notch" })).toBe(true);
    expect(canDeleteSkin(null, { activeSkin: "notch" })).toBe(false);
  });
});

describe("findCape", () => {
  const capes: ICape[] = [
    { id: "migrator", hash: "h", alias: "Migrator", url: "u", cape: "" },
  ];

  it("finds by id", () => {
    expect(findCape(capes, "migrator")?.alias).toBe("Migrator");
    expect(findCape(capes, "none")).toBeNull();
    expect(findCape(capes, undefined)).toBeNull();
  });
});

describe("exportFileName", () => {
  it("uses a human name", () => {
    expect(exportFileName("My cool skin", "abcdef0123456789")).toBe(
      "My-cool-skin.png",
    );
  });

  it("strips path separators", () => {
    expect(exportFileName('a/b:c*d?"e<f>g|h', "abcdef0123456789")).toBe(
      "a-b-c-d-e-f-g-h.png",
    );
  });

  it("falls back to the hash for generated names", () => {
    expect(exportFileName("4b6a0b00cafe", "abcdef0123456789")).toBe(
      "abcdef012345.png",
    );
    expect(exportFileName("   ", "abcdef0123456789")).toBe("abcdef012345.png");
  });
});
