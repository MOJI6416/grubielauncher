import { describe, expect, it } from "vitest";
import type { IJarMod, IVersionConf } from "@/types/IVersion";
import {
  moveJarMod,
  setJarModEnabled,
  showsJarModsCard,
  summarizeJarMods,
  withoutJarMod,
} from "./jarMods";

const mod = (file: string, enabled = true): IJarMod => ({
  file,
  name: `${file}.zip`,
  enabled,
});

function conf(id: string, extra: Partial<IVersionConf> = {}): IVersionConf {
  return {
    name: "x",
    loader: { name: "vanilla", mods: [] },
    version: { id, type: "release", url: "", serverManager: false },
    build: 0,
    downloadedVersion: false,
    lastUpdate: new Date(0),
    runArguments: { game: "", jvm: "" },
    image: "",
    ...extra,
  };
}

describe("jar mod list edits", () => {
  const list = [mod("a"), mod("b"), mod("c")];

  it("moves a mod one step and ignores moves past the edges", () => {
    expect(moveJarMod(list, 0, 1).map((item) => item.file)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(moveJarMod(list, 0, -1)).toBe(list);
    expect(moveJarMod(list, 2, 1)).toBe(list);
  });

  it("toggles and removes by file without touching the others", () => {
    expect(setJarModEnabled(list, "b", false)[1].enabled).toBe(false);
    expect(setJarModEnabled(list, "b", false)[0]).toBe(list[0]);
    expect(withoutJarMod(list, "b").map((item) => item.file)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("summarizeJarMods", () => {
  it("counts enabled mods and reports an active replacement only", () => {
    expect(
      summarizeJarMods(
        conf("b1.7.3", {
          jarMods: [mod("a"), mod("b", false)],
          mainJar: { file: "bta.jar", name: "bta.jar", enabled: false },
        }),
      ),
    ).toEqual({ total: 2, active: 1, replacement: undefined });
  });
});

describe("showsJarModsCard", () => {
  it("shows for Java 8 era versions or when something is already set", () => {
    expect(showsJarModsCard(conf("b1.7.3"))).toBe(true);
    expect(showsJarModsCard(conf("1.12.2"))).toBe(true);
    expect(showsJarModsCard(conf("1.21.1"))).toBe(false);
    expect(
      showsJarModsCard(conf("1.21.1", { jarMods: [mod("a", false)] })),
    ).toBe(true);
  });
});
