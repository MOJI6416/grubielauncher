import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GameOutputLog,
  findGameOutputFiles,
  gameOutputPaths,
} from "./gameOutputLog";

const roots: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grubie-game-output-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const versionPath = path.join("C:", "data", "versions", "NOW That's What I Call Minecraft");
const fixedNow = () => new Date(2026, 9, 16, 16, 12, 45, 977);

describe("GameOutputLog", () => {
  it("writes every line with its stream and hides session tokens", async () => {
    const dir = tempDir();
    const log = GameOutputLog.open({
      dir,
      versionPath,
      instance: 0,
      header: { versionName: "NOW", launch: "31e5b6" },
      now: fixedNow,
    });

    log?.line("out", "Starting up SoundSystem...");
    log?.line("err", "(Session ID is token:abcdef123456:0123)");
    await log?.close({ code: 0 });

    const text = fs.readFileSync(gameOutputPaths(dir, versionPath, 0).current, "utf8");
    const lines = text.trimEnd().split("\n");

    expect(lines[0]).toMatch(/^# start \{"versionName":"NOW","launch":"31e5b6","startedAt":/);
    expect(lines[1]).toBe("16:12:45.977 out Starting up SoundSystem...");
    expect(lines[2]).toContain("16:12:45.977 err (Session ID is token:<secret>");
    expect(text).not.toContain("abcdef123456");
    expect(lines[3]).toMatch(/^# exit \{"code":0,"endedAt":/);
  });

  it("keeps the previous launch next to the new one", async () => {
    const dir = tempDir();
    const first = GameOutputLog.open({ dir, versionPath, instance: 0, header: {} });
    first?.line("out", "first launch");
    await first?.close({ code: 0 });

    const second = GameOutputLog.open({ dir, versionPath, instance: 0, header: {} });
    second?.line("out", "second launch");
    await second?.close({ code: 1 });

    const files = gameOutputPaths(dir, versionPath, 0);
    expect(fs.readFileSync(files.current, "utf8")).toContain("second launch");
    expect(fs.readFileSync(files.previous, "utf8")).toContain("first launch");

    const found = await findGameOutputFiles(dir, versionPath);
    expect(found.map((file) => file.previous).sort()).toEqual([false, true]);
    expect(await findGameOutputFiles(dir, path.join("C:", "data", "versions", "Other"))).toEqual([]);
  });

  it("keeps the start and the end of a very long output", async () => {
    const dir = tempDir();
    const log = GameOutputLog.open({ dir, versionPath, instance: 2, header: {} });
    const filler = "x".repeat(1000);

    for (let index = 0; index < 12_000; index++) log?.line("out", `${index} ${filler}`);
    log?.line("err", "java.lang.NullPointerException: the crash");
    await log?.close({ code: 0 });

    const text = fs.readFileSync(gameOutputPaths(dir, versionPath, 2).current, "utf8");
    expect(text).toContain(" out 0 x");
    expect(text).toMatch(/# … \d+ lines skipped …/);
    expect(text).toContain("java.lang.NullPointerException: the crash");
    expect(text.length).toBeLessThan(9 * 1024 * 1024);
  });

  it("does nothing without a folder", () => {
    expect(GameOutputLog.open({ dir: null, versionPath, instance: 0, header: {} })).toBeNull();
  });
});
