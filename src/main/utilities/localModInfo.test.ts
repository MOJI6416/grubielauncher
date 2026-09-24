import { describe, expect, it } from "vitest";
import {
  fromFabricManifest,
  fromModsToml,
  fromQuiltManifest,
  packDescription,
} from "./localModInfo";

describe("fromFabricManifest", () => {
  it("reads the usual fields", () => {
    expect(
      fromFabricManifest(
        {
          id: "sodium",
          name: "Sodium",
          description: "Fast",
          version: "0.6.0",
          contact: { homepage: "https://example.com" },
          icon: "assets/sodium/icon.png",
        },
        "sodium.jar",
      ),
    ).toEqual({
      id: "sodium",
      name: "Sodium",
      description: "Fast",
      url: "https://example.com",
      version: "0.6.0",
      icon: "assets/sodium/icon.png",
    });
  });

  it("never leaves the name or description undefined", () => {
    const meta = fromFabricManifest({ id: "nameless" }, "nameless-1.0.jar");

    expect(meta?.name).toBe("nameless");
    expect(meta?.description).toBe("");
  });

  it("falls back to the file name when the id is missing too", () => {
    const meta = fromFabricManifest({}, "broken.jar");

    expect(meta?.id).toBe("broken.jar");
    expect(meta?.name).toBe("broken.jar");
  });

  it("picks the largest icon from a size map", () => {
    const meta = fromFabricManifest(
      { id: "x", icon: { "16": "small.png", "128": "large.png" } },
      "x.jar",
    );

    expect(meta?.icon).toBe("large.png");
  });

  it("ignores values of the wrong type", () => {
    const meta = fromFabricManifest(
      { id: 42, name: ["bad"], description: { text: "no" } },
      "typed.jar",
    );

    expect(meta?.id).toBe("typed.jar");
    expect(meta?.name).toBe("typed.jar");
    expect(meta?.description).toBe("");
  });

  it("returns null without a manifest", () => {
    expect(fromFabricManifest(null, "a.jar")).toBeNull();
  });
});

describe("fromQuiltManifest", () => {
  it("reads the nested quilt layout", () => {
    const meta = fromQuiltManifest(
      {
        quilt_loader: {
          id: "qsl",
          version: "1.0",
          metadata: { name: "QSL", description: "Library", icon: "icon.png" },
        },
      },
      "qsl.jar",
    );

    expect(meta).toMatchObject({
      id: "qsl",
      name: "QSL",
      description: "Library",
      version: "1.0",
      icon: "icon.png",
    });
  });
});

describe("fromModsToml", () => {
  it("reads the first mod", () => {
    const meta = fromModsToml(
      {
        mods: [
          {
            modId: "illegalitems",
            displayName: "IllegalItems",
            description: "Crafts the uncraftable",
            logoFile: "logo.png",
          },
        ],
      },
      "items.jar",
    );

    expect(meta).toMatchObject({
      id: "illegalitems",
      name: "IllegalItems",
      description: "Crafts the uncraftable",
      icon: "logo.png",
      version: null,
    });
  });

  it("uses the mod id when the display name is missing", () => {
    const meta = fromModsToml({ mods: [{ modId: "bare" }] }, "bare.jar");

    expect(meta?.name).toBe("bare");
    expect(meta?.description).toBe("");
  });

  it("reads the logo declared outside the mod table", () => {
    const meta = fromModsToml(
      { logoFile: "top.png", mods: [{ modId: "x" }] },
      "x.jar",
    );

    expect(meta?.icon).toBe("top.png");
  });

  it("returns null when there is no mod table", () => {
    expect(fromModsToml({ modLoader: "javafml" }, "x.jar")).toBeNull();
  });
});

describe("packDescription", () => {
  it("reads plain, fallback and text-component descriptions", () => {
    expect(packDescription({ description: " Faithful " })).toBe("Faithful");
    expect(packDescription({ description: { fallback: "Legacy" } })).toBe(
      "Legacy",
    );
    expect(
      packDescription({
        description: [{ text: "Fresh " }, { text: "Animations", extra: ["!"] }],
      }),
    ).toBe("Fresh Animations!");
  });

  it("returns an empty string for anything else", () => {
    expect(packDescription({ description: 5 })).toBe("");
    expect(packDescription(null)).toBe("");
  });
});
