import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeLogFontSize,
  normalizeSettings,
  normalizeSoundVolume,
} from "./Settings";

describe("normalizeSettings", () => {
  it("keeps current behaviour for files written before the interface options", () => {
    const settings = normalizeSettings({ lang: "ru" });

    expect(settings).toMatchObject({
      uiScale: 1,
      logFontSize: 11,
      motion: "system",
      ambientTint: true,
      backgroundGrain: true,
      highContrast: false,
      soundVolume: 40,
      gameWindow: "minimize",
      restoreAfterGame: true,
      startScreen: "home",
      sidebarCollapsed: false,
      instancesView: "list",
    });
  });

  it("accepts every supported choice", () => {
    const settings = normalizeSettings({
      motion: "off",
      gameWindow: "tray",
      startScreen: "lastInstance",
      instancesView: "compact",
      sidebarCollapsed: true,
      highContrast: true,
    });

    expect(settings.motion).toBe("off");
    expect(settings.gameWindow).toBe("tray");
    expect(settings.startScreen).toBe("lastInstance");
    expect(settings.instancesView).toBe("compact");
    expect(settings.sidebarCollapsed).toBe(true);
    expect(settings.highContrast).toBe(true);
  });

  it("falls back to defaults for unknown values", () => {
    const settings = normalizeSettings({
      motion: "fast",
      gameWindow: "close",
      startScreen: "skins",
      instancesView: "table",
      sidebarCollapsed: "yes",
    } as never);

    expect(settings.motion).toBe(DEFAULT_SETTINGS.motion);
    expect(settings.gameWindow).toBe(DEFAULT_SETTINGS.gameWindow);
    expect(settings.startScreen).toBe(DEFAULT_SETTINGS.startScreen);
    expect(settings.instancesView).toBe(DEFAULT_SETTINGS.instancesView);
    expect(settings.sidebarCollapsed).toBe(false);
  });
});

describe("normalizeSoundVolume", () => {
  it("snaps to 5% steps inside 0–100", () => {
    expect(normalizeSoundVolume(42)).toBe(40);
    expect(normalizeSoundVolume(43)).toBe(45);
    expect(normalizeSoundVolume(140)).toBe(100);
    expect(normalizeSoundVolume(-5)).toBe(0);
  });

  it("uses the old fixed level when the value is missing", () => {
    expect(normalizeSoundVolume(undefined)).toBe(40);
    expect(normalizeSoundVolume("loud")).toBe(40);
  });
});

describe("normalizeLogFontSize", () => {
  it("only allows the offered sizes", () => {
    expect(normalizeLogFontSize(14)).toBe(14);
    expect(normalizeLogFontSize(15)).toBe(11);
  });
});
