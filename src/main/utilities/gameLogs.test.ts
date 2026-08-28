import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import zlib from "zlib";

const root = path.join(os.tmpdir(), `grubie-gamelogs-${Date.now()}`);

vi.mock("electron", () => ({
  app: {
    getPath: (key: string) =>
      key === "appData" ? root : path.join(root, key),
    getAppPath: () => root,
  },
}));

const { readGameLog } = await import("./gameLogs");

const versionPath = path.join(root, ".grubielauncher", "versions", "Pack");
const logsDir = path.join(versionPath, "logs");

function longLog(lines: number): string {
  const body: string[] = [];
  for (let index = 0; index < lines; index += 1) {
    body.push(
      `[12:00:00] [Render thread/INFO] line ${index} ${"x".repeat(200)}`,
    );
  }
  return body.join("\n") + "\n";
}

describe("readGameLog", () => {
  beforeAll(async () => {
    await fs.ensureDir(logsDir);
    await fs.writeFile(
      path.join(logsDir, "small.log.gz"),
      zlib.gzipSync(Buffer.from("first line\nsecond line\n")),
    );
    await fs.writeFile(
      path.join(logsDir, "huge.log.gz"),
      zlib.gzipSync(Buffer.from(longLog(60_000))),
    );
  });

  afterAll(async () => {
    await fs.remove(root);
  });

  it("returns an archived log whole when it fits", async () => {
    const content = await readGameLog(versionPath, "small.log.gz", "archive");

    expect(content?.text).toBe("first line\nsecond line\n");
    expect(content?.truncated).toBe(false);
  });

  it("keeps the tail of an oversized archived log instead of failing", async () => {
    const content = await readGameLog(versionPath, "huge.log.gz", "archive");

    expect(content).not.toBeNull();
    expect(content?.truncated).toBe(true);
    expect(content?.text.length).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(content?.text.startsWith("[12:00:00]")).toBe(true);
    expect(content?.text.trimEnd().endsWith("x".repeat(200))).toBe(true);
    expect(content?.text).toContain("line 59999");
  });
});
