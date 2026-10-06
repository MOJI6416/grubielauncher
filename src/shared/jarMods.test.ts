import { describe, expect, it } from "vitest";
import {
  applyJarModSet,
  countJarMods,
  jarModSetOf,
  jarModsSignature,
} from "./jarMods";

const bta = { file: "a.jar", name: "BTA", enabled: true };
const main = { file: "m.jar", name: "minecraft.jar", enabled: true };

describe("jar mod sets", () => {
  it("counts jar mods and the replacement jar", () => {
    expect(countJarMods({ jarMods: [bta], mainJar: main })).toBe(2);
    expect(countJarMods(undefined)).toBe(0);
  });

  it("compares by file and switch, not by where the copy lives", () => {
    const local = { jarMods: [bta] };
    const published = {
      jarMods: [
        { ...bta, url: "https://cdn.grubielauncher.com/x.jar", sha1: "s" },
      ],
    };

    expect(jarModsSignature(local)).toBe(jarModsSignature(published));
    expect(jarModsSignature(local)).not.toBe(
      jarModsSignature({ jarMods: [{ ...bta, enabled: false }] }),
    );
    expect(jarModsSignature(local)).not.toBe(
      jarModsSignature({ jarMods: [bta], mainJar: main }),
    );
  });

  it("applies a set and clears what it does not carry", () => {
    const conf: { jarMods?: (typeof bta)[]; mainJar?: typeof main } = {
      jarMods: [bta],
      mainJar: main,
    };

    applyJarModSet(conf, { mods: [], main: null });
    expect(conf).toEqual({});

    applyJarModSet(conf, jarModSetOf({ jarMods: [bta], mainJar: main }));
    expect(conf).toEqual({ jarMods: [bta], mainJar: main });
  });
});
