import { afterEach, describe, expect, it } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import {
  loadServerSnapshots,
  parseServerSnapshot,
  pickServerSnapshots,
} from "./serverStats";
import { isTrackedServerAddress } from "@/shared/companion";

const UUID = "1b2c3d4e-0000-4000-8000-000000000001";

function snapshot(server: string, time: string, stone: number, uuid = UUID) {
  return {
    format: 1,
    server,
    player: { uuid, name: "Steve" },
    minecraft: "1.21.1",
    time,
    stats: {
      "minecraft:mined": { "minecraft:stone": stone, "minecraft:dirt": -3 },
      "minecraft:custom": { "minecraft:play_time": 1200 },
    },
    advancements: {},
  };
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.remove(dir)));
});

describe("server statistics snapshots", () => {
  it("skips Play together addresses and loopback", () => {
    expect(isTrackedServerAddress("mc.example.com")).toBe(true);
    expect(isTrackedServerAddress("MC.Example.com:25566")).toBe(true);
    expect(isTrackedServerAddress("127.0.0.1:41000")).toBe(false);
    expect(isTrackedServerAddress("localhost")).toBe(false);
    expect(isTrackedServerAddress("[::1]:25565")).toBe(false);
    expect(isTrackedServerAddress("amber-fox.join.grubielauncher.com")).toBe(false);
    expect(isTrackedServerAddress("jt-abc--amber-fox.join.grubielauncher.com:25565")).toBe(false);
  });

  it("parses only the companion format", () => {
    const parsed = parseServerSnapshot(snapshot("MC.example.com:25565", "2026-11-20T10:00:00Z", 5));
    expect(parsed).toMatchObject({
      server: "mc.example.com",
      uuid: "1b2c3d4e000040008000000000000001",
      data: {
        stats: {
          "minecraft:mined": { "minecraft:stone": 5 },
          "minecraft:custom": { "minecraft:play_time": 1200 },
        },
      },
    });
    expect(parseServerSnapshot({ ...snapshot("a", "2026", 1), format: 2 })).toBeNull();
    expect(parseServerSnapshot({ ...snapshot("a", "bad date", 1) })).toBeNull();
    expect(parseServerSnapshot(null)).toBeNull();
  });

  it("keeps the latest snapshot per server and player", () => {
    const picked = pickServerSnapshots(
      [
        parseServerSnapshot(snapshot("mc.example.com", "2026-11-20T10:00:00Z", 5))!,
        parseServerSnapshot(snapshot("mc.example.com:25565", "2026-11-20T11:00:00Z", 9))!,
        parseServerSnapshot(snapshot("play.other.net", "2026-11-20T09:00:00Z", 2))!,
        parseServerSnapshot(snapshot("127.0.0.1:5000", "2026-11-20T09:00:00Z", 100))!,
        parseServerSnapshot(
          snapshot("mc.example.com", "2026-11-20T12:00:00Z", 50, "ffffffff-0000-4000-8000-000000000001"),
        )!,
      ],
      [UUID],
    );
    expect(picked.map((entry) => [entry.server, entry.data.stats["minecraft:mined"]["minecraft:stone"]]).sort()).toEqual([
      ["mc.example.com", 9],
      ["play.other.net", 2],
    ]);
  });

  it("reads the folder and reports unreadable files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "server-stats-"));
    dirs.push(dir);
    expect(await loadServerSnapshots(path.join(dir, "missing"), [UUID])).toEqual({
      snapshots: [],
      partial: false,
    });

    await fs.writeJson(path.join(dir, "a.json"), snapshot("mc.example.com", "2026-11-20T10:00:00Z", 5));
    await fs.writeFile(path.join(dir, "b.json"), "{broken");
    await fs.writeFile(path.join(dir, "c.tmp"), "ignored");
    const result = await loadServerSnapshots(dir, [UUID]);
    expect(result.partial).toBe(true);
    expect(result.snapshots).toHaveLength(1);
  });
});
