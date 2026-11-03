import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type TSettings } from "@/types/Settings";
import {
  LAYOUT_PRESETS,
  currentPresetValues,
  matchPreset,
  presetValues,
} from "./presets";

const settings = (patch: Partial<TSettings> = {}): TSettings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe("matchPreset", () => {
  it("recognises the shipped settings as the standard preset", () => {
    expect(matchPreset(settings())).toBe("standard");
  });

  it("recognises every preset after it was applied", () => {
    for (const id of LAYOUT_PRESETS) {
      expect(matchPreset(settings(presetValues(id)))).toBe(id);
    }
  });

  it("ignores the order hidden items were added in", () => {
    const minimal = presetValues("minimal");
    const shuffled = settings({
      ...minimal,
      interface: {
        ...minimal.interface,
        hidden: [...minimal.interface.hidden].reverse(),
      },
    });
    expect(matchPreset(shuffled)).toBe("minimal");
  });

  it("reports a custom layout once anything differs", () => {
    expect(
      matchPreset(settings({ ...presetValues("compact"), ambientTint: false })),
    ).toBeNull();
  });

  it("leaves language, scale and sounds out of presets", () => {
    const changed = settings({ lang: "ru", uiScale: 1.25, sounds: false });
    expect(matchPreset(changed)).toBe("standard");
    expect(Object.keys(currentPresetValues(changed)).sort()).toEqual([
      "ambientTint",
      "backgroundGrain",
      "instancesView",
      "interface",
      "sidebarCollapsed",
    ]);
  });
});
