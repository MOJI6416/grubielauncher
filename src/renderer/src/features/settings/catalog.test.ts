import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type TSettings } from "@/types/Settings";
import en from "../../../locales/en.json";
import ru from "../../../locales/ru.json";
import uk from "../../../locales/uk.json";
import {
  SETTINGS_ENTRIES,
  SETTINGS_SECTIONS,
  changedCountBySection,
  changedEntryIds,
  defaultsPatch,
  entrySection,
  isKeyChanged,
  isSettingsSection,
  sectionEntryIds,
} from "./catalog";

const settings = (patch: Partial<TSettings>): TSettings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe("catalog coverage", () => {
  it("surfaces every persisted settings key exactly once", () => {
    const covered = SETTINGS_ENTRIES.flatMap((entry) => entry.keys);

    expect([...covered].sort()).toEqual(
      (Object.keys(DEFAULT_SETTINGS) as (keyof TSettings)[]).sort(),
    );
    expect(new Set(covered).size).toBe(covered.length);
  });

  it("places every entry into a known section", () => {
    for (const entry of SETTINGS_ENTRIES) {
      expect(SETTINGS_SECTIONS).toContain(entry.section);
      expect(entrySection(entry.id)).toBe(entry.section);
    }
  });

  it("lists entries per section in catalog order", () => {
    expect(sectionEntryIds("game")).toEqual([
      "memory",
      "optimizedJvm",
      "highPriority",
      "autoWorldBackup",
      "worldBackupKeep",
    ]);
  });
});

describe("isSettingsSection", () => {
  it("accepts known sections only", () => {
    expect(isSettingsSection("storage")).toBe(true);
    expect(isSettingsSection("nope")).toBe(false);
    expect(isSettingsSection(undefined)).toBe(false);
  });
});

describe("isKeyChanged", () => {
  it("compares against the shipped defaults", () => {
    expect(isKeyChanged(settings({}), "xmx")).toBe(false);
    expect(isKeyChanged(settings({ xmx: 4096 }), "xmx")).toBe(true);
  });

  it("compares object values structurally", () => {
    const bind = { type: "key" as const, code: 42, label: "F" };

    expect(isKeyChanged(settings({ voicePttBind: bind }), "voicePttBind")).toBe(
      true,
    );
    expect(isKeyChanged(settings({ voicePttBind: null }), "voicePttBind")).toBe(
      false,
    );
  });
});

describe("changedEntryIds", () => {
  it("is empty on a fresh install", () => {
    expect(changedEntryIds(settings({}))).toEqual([]);
  });

  it("never treats the interface language as a deviation", () => {
    const current = settings({ lang: "ru" });

    expect(changedEntryIds(current)).toEqual([]);
    expect(defaultsPatch(current, ["language"])).toEqual({});
  });

  it("collapses multi-key entries into one id", () => {
    expect(
      changedEntryIds(settings({ voicePtt: true, voicePttBind: null })),
    ).toEqual(["voicePtt"]);
  });

  it("counts changes per section", () => {
    const counts = changedCountBySection(
      settings({ xmx: 8192, optimizedJvm: false, devMode: true }),
    );

    expect(counts.game).toBe(2);
    expect(counts.privacy).toBe(1);
    expect(counts.storage).toBe(0);
  });
});

describe("defaultsPatch", () => {
  it("only touches keys that actually differ", () => {
    const current = settings({ xmx: 8192, devMode: true });

    expect(defaultsPatch(current, ["memory", "optimizedJvm"])).toEqual({
      xmx: DEFAULT_SETTINGS.xmx,
    });
  });

  it("resets every key of a multi-key entry", () => {
    const current = settings({
      voicePtt: true,
      voicePttBind: { type: "key", code: 42, label: "F" },
    });

    expect(defaultsPatch(current, ["voicePtt"])).toEqual({
      voicePtt: false,
      voicePttBind: null,
    });
  });

  it("returns an empty patch when nothing changed", () => {
    expect(defaultsPatch(settings({}), ["memory", "devMode"])).toEqual({});
  });
});

describe("search index strings", () => {
  const bundles = { en, ru, uk } as Record<
    string,
    { settings: { index: Record<string, Record<string, string>> } }
  >;

  it("gives every settings row a title, description and keywords in every locale", () => {
    const missing: string[] = [];

    for (const [language, bundle] of Object.entries(bundles)) {
      for (const entry of SETTINGS_ENTRIES) {
        const row = bundle.settings.index[entry.id];

        for (const field of ["title", "description", "keywords"]) {
          if (typeof row?.[field] === "string" && row[field] !== "") continue;
          missing.push(`${language}: settings.index.${entry.id}.${field}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
