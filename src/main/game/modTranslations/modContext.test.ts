import { describe, expect, it } from "vitest";
import {
  contextFromFabric,
  contextFromMcmodInfo,
  contextFromModsToml,
  contextFromQuilt,
  preferredContext,
} from "./modContext";

describe("mod context", () => {
  it("reads fabric.mod.json and falls back to the id", () => {
    expect(
      contextFromFabric('{"id":"sodium","name":"Sodium","description":"Fast rendering"}'),
    ).toEqual({ name: "Sodium", description: "Fast rendering" });
    expect(contextFromFabric('{"id":"lib"}')).toEqual({ name: "lib" });
    expect(contextFromFabric("{broken")).toBeNull();
  });

  it("reads quilt.mod.json", () => {
    expect(
      contextFromQuilt(
        '{"quilt_loader":{"id":"q","metadata":{"name":"Quilted","description":"Patches"}}}',
      ),
    ).toEqual({ name: "Quilted", description: "Patches" });
  });

  it("reads the first [[mods]] table of mods.toml in every string form", () => {
    expect(
      contextFromModsToml(
        [
          "[[mods]]",
          "modId='botania'",
          'displayName="Botania \\"Magic\\""',
          'description="""',
          "Flowers \\",
          '   and mana"""',
        ].join("\n"),
      ),
    ).toEqual({ name: 'Botania "Magic"', description: "Flowers and mana" });
    expect(contextFromModsToml('[[mods]]\nmodId="x"\ndescription="${file.desc}"')).toEqual({
      name: "x",
    });
    expect(contextFromModsToml('modLoader="javafml"')).toBeNull();
  });

  it("does not take a key from inside a multi-line description", () => {
    expect(
      contextFromModsToml(
        "[[mods]]\nmodId='a'\ndescription='''Text\ndisplayName = Fake'''\ndisplayName='Real'",
      ),
    ).toEqual({ name: "Real", description: "Text displayName = Fake" });
  });

  it("reads both mcmod.info layouts", () => {
    expect(contextFromMcmodInfo('[{"modid":"ic2","name":"IndustrialCraft 2"}]')).toEqual({
      name: "IndustrialCraft 2",
    });
    expect(
      contextFromMcmodInfo('{"modListVersion":2,"modList":[{"name":"Old","description":"d"}]}'),
    ).toEqual({ name: "Old", description: "d" });
  });

  it("prefers Fabric metadata in a jar built for several loaders", () => {
    expect(
      preferredContext(
        new Map([
          ["META-INF/mods.toml", { name: "Forge side" }],
          ["fabric.mod.json", { name: "Fabric side" }],
        ]),
      ),
    ).toEqual({ name: "Fabric side" });
  });
});
