import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectAttachments } from "./supportReport";
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
