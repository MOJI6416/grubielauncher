import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type TSettings } from "@/types/Settings";
import {
  SYNCED_SETTING_KEYS,
  applyRemoteSettings,
  initialStamps,
  normalizeStamps,
  settingsPushPayload,
  stampChanges,
} from "./settingsSync";

function settings(patch: Partial<TSettings> = {}): TSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe("synced settings", () => {
  it("never carries what is bound to this computer", () => {
    for (const key of [
      "xmx",
      "optimizedJvm",
      "highPriority",
      "gpuPreference",
      "gameMode",
      "mangoHud",
      "wrapperCommand",
      "launchEnv",
      "preLaunchCommand",
      "postExitCommand",
      "downloadLimit",
      "downloadSource",
      "uiScale",
      "closeToTray",
      "voicePttBind",
      "voiceGateThreshold",
      "voiceOverlayDisplay",
      "directConnect",
      "crashTelemetry",
      "usageStats",
      "aiLogAnalysis",
      "agentChatSync",
      "accountSync",
      "streamerMode",
      "devMode",
    ]) {
      expect(SYNCED_SETTING_KEYS as readonly string[]).not.toContain(key);
    }
  });

  it("stamps only the synced fields that really changed", () => {
    const before = settings();
    const after = settings({ accent: "cyan", xmx: 8192, interface: { ...before.interface } });

    expect(stampChanges(before, after, {}, 500)).toEqual({ accent: 500 });
    expect(stampChanges(before, settings({ xmx: 8192 }), {}, 500)).toBeNull();
  });

  it("keeps stamps moving forward when the clock goes back", () => {
    const stamps = stampChanges(settings(), settings({ motion: "off" }), { motion: 900 }, 500);
    expect(stamps?.motion).toBe(901);
  });

  it("stamps a first sync's changed fields with one moment", () => {
    expect(initialStamps(settings({ lang: "ru", accent: "cyan" }), 42)).toEqual({
      lang: 42,
      accent: 42,
    });
  });

  it("pushes only fields that were changed at some point", () => {
    const local = settings({ lang: "uk", accent: "cyan", xmx: 4096 });
    expect(settingsPushPayload(local, { lang: 10 })).toEqual({
      values: { lang: "uk" },
      stamps: { lang: 10 },
    });
  });
});

describe("applyRemoteSettings", () => {
  it("takes each field the account changed later, and keeps the rest", () => {
    const local = settings({ lang: "ru", accent: "cyan", motion: "off" });
    const { patch, stamps } = applyRemoteSettings(
      local,
      { lang: 100, accent: 300 },
      {
        values: { lang: "uk", accent: "violet", motion: "on" },
        stamps: { lang: 200, accent: 250, motion: 50 },
      },
    );

    expect(patch).toEqual({ lang: "uk", motion: "on" });
    expect(stamps).toEqual({ lang: 200, accent: 300, motion: 50 });
  });

  it("merges two launchers that changed different fields", () => {
    const laptop = settings({ sounds: false });
    const laptopStamps = { sounds: 10 };
    const account = {
      values: { sounds: false, startScreen: "news" },
      stamps: { sounds: 10, startScreen: 20 },
    };

    const { patch } = applyRemoteSettings(laptop, laptopStamps, account);
    expect(patch).toEqual({ startScreen: "news" });
  });

  it("adopts a newer stamp without a patch when the value is the same", () => {
    const { patch, stamps } = applyRemoteSettings(
      settings({ accent: "cyan" }),
      { accent: 1 },
      { values: { accent: "cyan" }, stamps: { accent: 5 } },
    );
    expect(patch).toEqual({});
    expect(stamps.accent).toBe(5);
  });

  it("runs remote values through the same normalization as the file", () => {
    const { patch } = applyRemoteSettings(
      settings(),
      {},
      {
        values: { soundVolume: 63, worldBackupKeep: "lots", interface: { hidden: ["a", "a"] } },
        stamps: { soundVolume: 1, worldBackupKeep: 1, interface: 1 },
      },
    );

    expect(patch.soundVolume).toBe(65);
    expect(patch.interface?.hidden).toEqual(["a"]);
    expect(patch).not.toHaveProperty("worldBackupKeep");
  });

  it("ignores fields it does not sync, even when the account holds them", () => {
    const { patch } = applyRemoteSettings(
      settings(),
      {},
      { values: { xmx: 16384, uiScale: 150 }, stamps: { xmx: 9, uiScale: 9 } },
    );
    expect(patch).toEqual({});
  });

  it("keeps the language when the account holds none", () => {
    const { patch } = applyRemoteSettings(
      settings({ lang: "pl" }),
      {},
      { values: { accent: "cyan" }, stamps: { accent: 3 } },
    );
    expect(patch).toEqual({ accent: "cyan" });
  });

  it("round-trips through the stamps file", () => {
    expect(normalizeStamps({ lang: 5.5, xmx: 3, accent: -1, motion: "x" })).toEqual({ lang: 5 });
    expect(normalizeStamps(null)).toEqual({});
  });
});
