import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("window", { api: {} });

import { ProjectType, Provider } from "@/types/ModManager";
import { ContentEntry } from "./entries";
import { categoryKeys, splitKeys, staleKeys } from "./useModCategories";

function entry(provider: Provider, id: string): ContentEntry {
  return {
    key: `${provider}:${id}`,
    id,
    provider,
    projectType: ProjectType.MOD,
    title: id,
    description: "",
    iconUrl: null,
    url: "",
    installed: null,
    project: null,
    pendingRemoved: false,
    side: "both",
    size: 0,
    fileName: "",
    markedDisabled: false,
  };
}

describe("mod category cache helpers", () => {
  it("asks only about catalog projects, once each", () => {
    expect(
      categoryKeys([
        entry(Provider.MODRINTH, "AANobbMI"),
        entry(Provider.MODRINTH, "AANobbMI"),
        entry(Provider.CURSEFORGE, "238222"),
        entry(Provider.LOCAL, "mine"),
        entry(Provider.MODRINTH, ""),
      ]),
    ).toEqual(["modrinth:AANobbMI", "curseforge:238222"]);
  });

  it("refreshes what is missing or two weeks old", () => {
    const now = Date.UTC(2026, 9, 30);
    const day = 24 * 60 * 60 * 1000;
    const store = new Map([
      ["modrinth:fresh", { categories: ["utility"], at: now - day }],
      ["modrinth:old", { categories: ["utility"], at: now - 15 * day }],
    ]);

    expect(
      staleKeys(["modrinth:fresh", "modrinth:old", "modrinth:new"], store, now),
    ).toEqual(["modrinth:old", "modrinth:new"]);
  });

  it("splits keys by provider and keeps colons inside ids", () => {
    expect(
      splitKeys(["modrinth:a:b", "curseforge:238222", "local:x", "modrinth:"]),
    ).toEqual({ modrinth: ["a:b"], curseforge: ["238222"] });
  });
});
