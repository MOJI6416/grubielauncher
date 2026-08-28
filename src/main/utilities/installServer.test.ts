import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";

const TMP = path.join(
  os.tmpdir(),
  `install-server-${process.pid}-${Date.now()}`,
);

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: false },
  electronApp: {},
  optimizer: {},
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: null,
}));

vi.mock("electron", () => ({
  app: { getPath: () => TMP },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: async () => {} },
}));

const { installServer } = await import("./game");

describe("installServer", () => {
  beforeAll(async () => {
    await fs.ensureDir(TMP);
  });

  afterAll(async () => {
    await fs.remove(TMP);
  });

  it.skipIf(process.platform === "win32")(
    "does not call an installer killed by the system a success",
    async () => {
      const pidFile = path.join(TMP, "installer.pid");
      await fs.remove(pidFile);

      const running = installServer(
        process.execPath,
        [
          "-e",
          "require('fs').writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 10000)",
          pidFile,
        ],
        TMP,
      );

      for (let attempt = 0; attempt < 100; attempt++) {
        const pid = Number.parseInt(
          await fs.readFile(pidFile, "utf-8").catch(() => ""),
          10,
        );
        if (Number.isSafeInteger(pid) && pid > 0) {
          process.kill(pid);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await expect(running).rejects.toThrow(/stopped by/);
    },
  );

  it("still resolves on a clean exit", async () => {
    await expect(
      installServer(process.execPath, ["-e", "process.exit(0)"], TMP),
    ).resolves.toBe(0);
  });

  it("reports the exit code when the installer fails", async () => {
    await expect(
      installServer(process.execPath, ["-e", "process.exit(3)"], TMP),
    ).rejects.toThrow(/exited with code 3/);
  });
});
