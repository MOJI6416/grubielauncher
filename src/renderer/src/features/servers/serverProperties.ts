import { IServerSettings } from "@/types/Server";

export interface ServerDraft {
  settings: IServerSettings;
  memory: number;
  aikarFlags: boolean;
}

export const GAME_MODES = ["survival", "creative", "adventure", "spectator"];
export const DIFFICULTIES = ["peaceful", "easy", "normal", "hard"];

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeDraft(draft: ServerDraft): ServerDraft {
  const requireResourcePack = draft.settings.requireResourcePack;

  return {
    memory: clampNumber(draft.memory, 512, 65536),
    aikarFlags: draft.aikarFlags,
    settings: {
      ...draft.settings,
      maxPlayers: clampNumber(draft.settings.maxPlayers, 1, 2000),
      serverPort: clampNumber(draft.settings.serverPort, 1, 65535),
      spawnProtection: clampNumber(draft.settings.spawnProtection, 0, 29999984),
      resourcePack: requireResourcePack ? draft.settings.resourcePack : "",
      resourcePackPrompt: requireResourcePack
        ? draft.settings.resourcePackPrompt
        : "",
    },
  };
}

const SETTING_KEYS: (keyof IServerSettings)[] = [
  "maxPlayers",
  "gameMode",
  "difficulty",
  "whitelist",
  "onlineMode",
  "pvp",
  "enableCommandBlock",
  "allowFlight",
  "spawnAnimals",
  "spawnMonsters",
  "spawnNpcs",
  "allowNether",
  "forceGamemode",
  "spawnProtection",
  "requireResourcePack",
  "resourcePack",
  "resourcePackPrompt",
  "motd",
  "serverIp",
  "serverPort",
];

export function changedFields(
  draft: ServerDraft,
  baseline: ServerDraft,
): string[] {
  const next = normalizeDraft(draft);
  const previous = normalizeDraft(baseline);
  const changed: string[] = [];

  if (next.memory !== previous.memory) changed.push("memory");
  if (next.aikarFlags !== previous.aikarFlags) changed.push("aikarFlags");

  for (const key of SETTING_KEYS) {
    if (next.settings[key] !== previous.settings[key]) changed.push(key);
  }

  return changed;
}

export function isDraftDirty(
  draft: ServerDraft,
  baseline: ServerDraft,
): boolean {
  return changedFields(draft, baseline).length > 0;
}

export function formatUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
