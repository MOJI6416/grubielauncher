import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "path";

const hoisted = vi.hoisted(() => {
  const root = process.env.TEMP || process.env.TMPDIR || "/tmp";
  return { base: `${root}/grubie-ach-partial-${process.pid}-${Date.now()}` };
});

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.base },
  shell: { trashItem: async () => undefined },
}));

import { loadGlobalAchievementStats } from "./worlds";
import { getOfflineUuidCandidates } from "./offlineUuidMigration";
import { toUUID } from "./other";
import type { ILocalAccount } from "@/types/Account";

const account = {
  nickname: "StandProfile",
  type: "plain",
} as unknown as ILocalAccount;

const uuid = toUUID(getOfflineUuidCandidates(account.nickname).canonical);
const versions = path.join(
  hoisted.base,
  ".grubielauncher",
  "minecraft",
  "versions",
);

function statsFile(version: string, world: string) {
  return path.join(versions, version, "saves", world, "stats", `${uuid}.json`);
}

beforeAll(async () => {
  await fs.outputJSON(statsFile("Good", "World"), {
    stats: { "minecraft:custom": { "minecraft:mob_kills": 7 } },
  });
});

afterAll(async () => {
  await fs.remove(hoisted.base).catch(() => undefined);
});

describe("loadGlobalAchievementStats", () => {
  it("reports a complete read when every world parses", async () => {
    const result = await loadGlobalAchievementStats(account);

    expect(result.stats.mobKills).toBe(7);
    expect(result.partial).toBe(false);
  });

  it("keeps the worlds it could read and admits the rest is missing", async () => {
    await fs.outputFile(statsFile("Broken", "World"), "{ not json");

    const result = await loadGlobalAchievementStats(account);

    expect(result.stats.mobKills).toBe(7);
    expect(result.partial).toBe(true);
  });
});
