import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import { execFileSync } from "child_process";

vi.mock("electron", () => ({
  app: { getPath: () => "" },
  BrowserWindow: { getAllWindows: () => [] },
}));

import { isServerRunning, setServerRunning } from "./serverManager";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-server-run-"));
});

afterEach(async () => {
  setServerRunning(root, false);
  await fs.chmod(path.join(root, "world", "session.lock"), 0o666).catch(() => {});
  if (process.platform === "win32") {
    try {
      execFileSync("attrib", ["-R", path.join(root, "world", "session.lock")]);
    } catch {}
  }
  await fs.remove(root).catch(() => {});
});

describe("server running detection", () => {
  it("reports a server the launcher itself started", async () => {
    setServerRunning(root, true);
    expect(await isServerRunning(root)).toBe(true);

    setServerRunning(root, false);
    expect(await isServerRunning(root)).toBe(false);
  });

  it("does not call a read-only world lock a running server", async () => {
    const lockPath = path.join(root, "world", "session.lock");
    await fs.ensureDir(path.dirname(lockPath));
    await fs.writeFile(lockPath, "☃");

    if (process.platform === "win32") {
      execFileSync("attrib", ["+R", lockPath]);
    } else {
      await fs.chmod(lockPath, 0o444);
    }

    await expect(fs.open(lockPath, "r+")).rejects.toThrow();
    expect(await isServerRunning(root)).toBe(false);
  });
});
