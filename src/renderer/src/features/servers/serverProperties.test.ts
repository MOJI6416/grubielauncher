import { describe, expect, it } from "vitest";
import { IServerSettings } from "@/types/Server";
import {
  ServerDraft,
  changedFields,
  clampNumber,
  formatUptime,
  isDraftDirty,
  normalizeDraft,
} from "./serverProperties";

const settings: IServerSettings = {
  maxPlayers: 20,
  gameMode: "survival",
  difficulty: "normal",
  whitelist: false,
  onlineMode: true,
  pvp: true,
  enableCommandBlock: false,
  allowFlight: false,
  spawnAnimals: true,
  spawnMonsters: true,
  spawnNpcs: true,
  allowNether: true,
  forceGamemode: false,
  spawnProtection: 16,
  requireResourcePack: false,
  resourcePack: "",
  resourcePackPrompt: "",
  motd: "A Minecraft Server",
  serverIp: "",
  serverPort: 25565,
};

const draft = (patch: Partial<ServerDraft> = {}): ServerDraft => ({
  settings: { ...settings },
  memory: 4096,
  aikarFlags: false,
  ...patch,
});

describe("clampNumber", () => {
  it("keeps the value inside the range and rounds it", () => {
    expect(clampNumber(10.4, 0, 100)).toBe(10);
    expect(clampNumber(-5, 0, 100)).toBe(0);
    expect(clampNumber(500, 0, 100)).toBe(100);
    expect(clampNumber(Number.NaN, 7, 100)).toBe(7);
  });
});

describe("normalizeDraft", () => {
  it("clamps the port, the player limit and the spawn protection", () => {
    const normalized = normalizeDraft(
      draft({
        settings: {
          ...settings,
          serverPort: 99999,
          maxPlayers: 0,
          spawnProtection: -4,
        },
      }),
    );

    expect(normalized.settings.serverPort).toBe(65535);
    expect(normalized.settings.maxPlayers).toBe(1);
    expect(normalized.settings.spawnProtection).toBe(0);
  });

  it("drops the resource pack when it is not required", () => {
    const normalized = normalizeDraft(
      draft({
        settings: {
          ...settings,
          requireResourcePack: false,
          resourcePack: "https://example.net/pack.zip",
          resourcePackPrompt: "please",
        },
      }),
    );

    expect(normalized.settings.resourcePack).toBe("");
    expect(normalized.settings.resourcePackPrompt).toBe("");
  });
});

describe("changedFields", () => {
  it("sees no change for an identical draft", () => {
    expect(changedFields(draft(), draft())).toEqual([]);
    expect(isDraftDirty(draft(), draft())).toBe(false);
  });

  it("lists memory, flags and property changes", () => {
    const next = draft({
      memory: 6144,
      aikarFlags: true,
      settings: { ...settings, motd: "hi", difficulty: "hard" },
    });

    expect(changedFields(next, draft()).sort()).toEqual([
      "aikarFlags",
      "difficulty",
      "memory",
      "motd",
    ]);
    expect(isDraftDirty(next, draft())).toBe(true);
  });

  it("ignores a resource pack url that is switched off on both sides", () => {
    const next = draft({
      settings: {
        ...settings,
        requireResourcePack: false,
        resourcePack: "https://example.net/pack.zip",
      },
    });

    expect(isDraftDirty(next, draft())).toBe(false);
  });
});

describe("formatUptime", () => {
  it("formats minutes and hours", () => {
    expect(formatUptime(0)).toBe("00:00");
    expect(formatUptime(65_000)).toBe("01:05");
    expect(formatUptime(3_725_000)).toBe("1:02:05");
    expect(formatUptime(-10)).toBe("00:00");
  });
});
