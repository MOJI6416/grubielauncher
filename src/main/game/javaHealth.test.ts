import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";

const hoisted = vi.hoisted(() => ({ appData: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => hoisted.appData,
    getVersion: () => "2.0.0",
    isReady: () => true,
    whenReady: async () => undefined,
    on: () => undefined,
  },
  shell: { trashItem: async () => undefined },
}));

vi.mock("../utilities/downloader", () => ({
  Downloader: class {
    async downloadFiles() {
      return null;
    }
    cancelDownload() {
      return undefined;
    }
  },
}));

import { Java } from "./Java";

let root = "";

const MARKER = ".grubie-java-verified";

function javaDir(release: string) {
  return path.join(root, ".grubielauncher", "java", release);
}

async function makeJavaRoot(release: string, binaryContent: string) {
  const dir = javaDir(release);
  await fs.ensureDir(path.join(dir, "bin"));
  await fs.writeFile(path.join(dir, "bin", "javaw.exe"), binaryContent);
  await fs.writeFile(path.join(dir, "bin", "java.exe"), binaryContent);
  return dir;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-java-"));
  hoisted.appData = root;
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("java health", () => {
  it("does not blow up on a binary the system refuses to start", async () => {
    await makeJavaRoot("jdk-19.0.1+9-jre", "this is not an executable");

    const java = new Java(19);
    await expect(java.init()).resolves.toBeUndefined();
    expect(java.javaPath).toBe("");
  });

  it("re-checks a runtime that changed after it was verified", async () => {
    const dir = await makeJavaRoot("jdk-20.0.1+9-jre", "this is not an executable");
    await fs.writeFile(path.join(dir, MARKER), "");

    const later = Date.now() + 5000;
    await fs.utimes(path.join(dir, "bin", "javaw.exe"), later / 1000, later / 1000);

    const java = new Java(20);
    await java.init();

    expect(java.javaPath).toBe("");
    expect(await fs.pathExists(path.join(dir, MARKER))).toBe(false);
  });

  it("stops trusting a cached runtime whose binaries disappeared", async () => {
    const dir = await makeJavaRoot("jdk-23.0.1+9-jre", "this is not an executable");
    await fs.writeFile(path.join(dir, MARKER), "");

    const java = new Java(23);
    await java.init();
    expect(java.javaPath).toBe(path.join(dir, "bin", "javaw.exe"));

    await fs.remove(path.join(dir, "bin", "javaw.exe"));
    await fs.remove(path.join(dir, "bin", "java.exe"));

    const again = new Java(23);
    await again.init();
    expect(again.javaPath).toBe("");
  });

  it("trusts a marker that is newer than the runtime it verified", async () => {
    const dir = await makeJavaRoot("jdk-22.0.1+9-jre", "this is not an executable");
    await fs.writeFile(path.join(dir, MARKER), "");

    const java = new Java(22);
    await java.init();

    expect(java.javaPath).toBe(path.join(dir, "bin", "javaw.exe"));
  });
});
