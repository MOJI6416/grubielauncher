import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../locales/en.json";
import { SHORTCUT_GROUPS, shortcutKey, shortcutKeys } from "./shortcuts";

const LOCALE = (en as { settings: { interface: Record<string, unknown> } })
  .settings.interface;

function localeGroup(name: string): Record<string, unknown> {
  return (LOCALE[name] ?? {}) as Record<string, unknown>;
}

function lookup(root: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      root,
    );
}

describe("shortcut catalog", () => {
  it("has no duplicated key inside a group", () => {
    for (const group of SHORTCUT_GROUPS) {
      const ids = group.items.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("never leaves a combo empty", () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const item of group.items) {
        expect(item.combos.length).toBeGreaterThan(0);
        for (const combo of item.combos) expect(combo.length).toBeGreaterThan(0);
      }
    }
  });

  it("builds a stable locale key", () => {
    expect(shortcutKey("global", "palette")).toBe("global.palette");
    expect(shortcutKeys()).toContain("logs.nextMatch");
  });

  it("names every group and row in en", () => {
    const groups = localeGroup("shortcutGroups");
    const rows = localeGroup("shortcuts");

    for (const group of SHORTCUT_GROUPS) {
      expect(typeof groups[group.id], group.id).toBe("string");
      for (const item of group.items) {
        const key = shortcutKey(group.id, item.id);
        expect(typeof lookup(rows, key), key).toBe("string");
      }
    }

    expect(typeof groups.voice).toBe("string");
    expect(typeof lookup(rows, "voice.ptt")).toBe("string");
  });

  it("keeps every listed combination present in the renderer source", () => {
    const evidence: Record<string, RegExp[]> = {
      "global.palette": [/event\.code === "KeyK"/],
      "global.paletteActions": [/event\.shiftKey && event\.code === "KeyP"/],
      "global.assistant": [/event\.code === "KeyI"/],
      "global.search": [/event\.code === "KeyF"/],
      "global.account": [/\^\[1-9\]\$/],
      "global.back": [/event\.key === "ArrowLeft"/],
      "global.forward": [/event\.key === "ArrowRight"/],
    };

    const source = [
      "../../shell/Shell.tsx",
      "../../shell/shortcuts.ts",
      "../accounts/AccountSwitcher.tsx",
      "../../screens/settings/SettingsScreen.tsx",
    ]
      .map((file) => readFileSync(resolve(__dirname, file), "utf-8"))
      .join("\n");

    for (const [key, patterns] of Object.entries(evidence)) {
      for (const pattern of patterns) {
        expect(pattern.test(source), key).toBe(true);
      }
    }
  });
});
