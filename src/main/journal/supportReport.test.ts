import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectAttachments, collectServerAttachments } from "./supportReport";
import { appendServerConsole, resetServerConsole } from "../game/serverConsole";
import { GameOutputLog } from "./gameOutputLog";

vi.mock("../utilities/other", () => ({ getLauncherPaths: () => ({}) }));
vi.mock("../utilities/connectivityTest", () => ({ runConnectivityTests: async () => [] }));
vi.mock("../utilities/runtime", () => ({ gameRuntime: { processes: new Map() } }));
vi.mock("../utilities/accounts", () => ({
  getAccountKey: () => "",
  getSelectedAccount: async () => null,
  readAccountsConfig: async () => null,
}));
vi.mock("../game/javaRuntimes", () => ({
  collectJavaForReport: async () => null,
  resolveJava: async () => null,
}));

const roots: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grubie-report-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("collectAttachments", () => {
  it("adds legacy loader logs and the last two game outputs", async () => {
    const versionPath = path.join(tempDir(), "NOW That's What I Call Minecraft");
    const outputDir = tempDir();
    fs.mkdirSync(path.join(versionPath, "logs"), { recursive: true });
    fs.writeFileSync(path.join(versionPath, "ModLoader.txt"), "SEVERE: Image not found: /gui/airship.png");
    fs.writeFileSync(path.join(versionPath, "logs", "fml-client-latest.log"), "FML log");

    for (const text of ["first launch", "second launch"]) {
      const log = GameOutputLog.open({ dir: outputDir, versionPath, instance: 0, header: {} });
      log?.line("out", text);
      await log?.close({ code: 0 });
    }

    const attachments = await collectAttachments(versionPath, "NOW", outputDir);
    const byName = new Map(attachments.map((item) => [item.name, item.text]));

    expect(byName.get("NOW/ModLoader.txt")).toContain("Image not found");
    expect(byName.get("NOW/logs/fml-client-latest.log")).toBe("FML log");
    expect(byName.get("NOW/game-output.log")).toContain("second launch");
    expect(byName.get("NOW/game-output.prev.log")).toContain("first launch");
  });

  it("works without the launcher log folder", async () => {
    const versionPath = tempDir();
    expect(await collectAttachments(versionPath, "Empty", null)).toEqual([]);
  });
});

describe("collectServerAttachments", () => {
  it("adds the server log, crash report, installer log and console", async () => {
    const serverPath = path.join(tempDir(), "Pack", "server");
    fs.mkdirSync(path.join(serverPath, "logs"), { recursive: true });
    fs.mkdirSync(path.join(serverPath, "crash-reports"), { recursive: true });
    fs.writeFileSync(path.join(serverPath, "logs", "latest.log"), "Preparing spawn area: 42%");
    fs.writeFileSync(path.join(serverPath, "crash-reports", "crash-2026-11-20_21.00.00-server.txt"), "Ticking entity");
    fs.writeFileSync(path.join(serverPath, "neoforge.jar.log"), "Downloading library");

    const lines = resetServerConsole(serverPath);
    appendServerConsole(lines, "Loading 312 mods");
    appendServerConsole(lines, "   ");

    const attachments = await collectServerAttachments(serverPath, "Pack");
    const byName = new Map(attachments.map((item) => [item.name, item.text]));

    expect(byName.get("Pack/server/logs/latest.log")).toContain("spawn area");
    expect(byName.get("Pack/server/crash-reports/crash-2026-11-20_21.00.00-server.txt")).toBe("Ticking entity");
    expect(byName.get("Pack/server/neoforge.jar.log")).toBe("Downloading library");
    expect(byName.get("Pack/server/console.log")).toBe("Loading 312 mods");
  });

  it("returns nothing for a build without a server", async () => {
    expect(await collectServerAttachments(path.join(tempDir(), "server"), "None")).toEqual([]);
  });
});
