import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";

const hoisted = vi.hoisted(() => ({ appData: "" }));

vi.mock("electron", () => ({
  app: {
    on: vi.fn(),
    getPath: () => hoisted.appData,
    getVersion: () => "2.0.0",
    isReady: () => true,
    whenReady: async () => undefined,
  },
  shell: { trashItem: async () => undefined },
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: null,
  setRunningServersProbe: vi.fn(),
}));

vi.mock("./systemJava", () => ({
  findSystemJava: async () => null,
  systemJavaDirs: () => [],
}));

import { startServer } from "./Server";

const POSIX = process.platform !== "win32";
let root = "";

async function makeServer(java: unknown) {
  const serverPath = path.join(root, "versions", "Pack", "server");
  await fs.ensureDir(serverPath);
  await fs.writeJSON(path.join(serverPath, "conf.json"), {
    core: "vanilla",
    javaMajorVersion: 21,
    memory: 2048,
    java,
  });
  const javaCommand = path.join(
    root,
    ".grubielauncher",
    "java",
    "jdk-21.0.5+11",
    "bin",
    POSIX ? "java" : "java.exe",
  );
  await fs.outputFile(javaCommand, "");
  await fs.writeFile(
    path.join(serverPath, POSIX ? "run.sh" : "run.bat"),
    `"${javaCommand}" -Xmx2048M -jar vanilla.jar nogui\n`,
  );
  return serverPath;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-server-java-"));
  hoisted.appData = root;
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("starting a server with a Java chosen by hand", () => {
  it("refuses instead of falling back to the run script's Java", async () => {
    const serverPath = await makeServer({ home: path.join(root, "gone", "jdk") });

    expect(await startServer(serverPath)).toEqual({
      ok: false,
      error: "server_java_unavailable",
    });
  });

  it("refuses a pinned Java major that is not installed", async () => {
    const serverPath = await makeServer({ major: 17 });

    expect(await startServer(serverPath)).toEqual({
      ok: false,
      error: "server_java_unavailable",
    });
  });
});
