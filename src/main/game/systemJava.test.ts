import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const execFile = vi.hoisted(() => vi.fn());
const pathExists = vi.hoisted(() => vi.fn());
const readdir = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({ execFile }));
vi.mock("fs-extra", () => ({
  default: { pathExists, readdir },
  pathExists,
  readdir,
}));

import { findSystemJava } from "./systemJava";

const bin = (root: string) => path.join(path.resolve(root), "bin", "java");

const linux = { os: "linux", arch: "x64" } as never;

function respondWith(map: Record<string, string | null>) {
  execFile.mockImplementation(
    (
      binary: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const output = map[binary];
      if (output === undefined || output === null) {
        callback(new Error("not found"), "", "");
        return;
      }
      callback(null, "", output);
    },
  );
}

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.JAVA_HOME;
});

describe("findSystemJava", () => {
  it("accepts a JAVA_HOME whose major version matches", async () => {
    process.env.JAVA_HOME = "/opt/jdk21";
    pathExists.mockResolvedValue(true);
    readdir.mockResolvedValue([]);
    respondWith({ [bin("/opt/jdk21")]: 'openjdk version "21.0.3" 2024-04-16' });

    const found = await findSystemJava(21, linux);

    expect(found?.root).toBe(path.resolve("/opt/jdk21"));
    expect(found?.server).toBe(bin("/opt/jdk21"));
  });

  it("rejects a runtime of the wrong major version", async () => {
    process.env.JAVA_HOME = "/opt/jdk17";
    pathExists.mockResolvedValue(true);
    readdir.mockResolvedValue([]);
    respondWith({ [bin("/opt/jdk17")]: 'openjdk version "17.0.9"' });

    await expect(findSystemJava(21, linux)).resolves.toBeNull();
  });

  it("reads the legacy 1.8 version string as major 8", async () => {
    process.env.JAVA_HOME = "/opt/jdk8";
    pathExists.mockResolvedValue(true);
    readdir.mockResolvedValue([]);
    respondWith({ [bin("/opt/jdk8")]: 'java version "1.8.0_402"' });

    const found = await findSystemJava(8, linux);

    expect(found?.major).toBe(8);
  });

  it("scans well-known directories when JAVA_HOME is unset", async () => {
    pathExists.mockResolvedValue(true);
    readdir.mockImplementation(async (dir: string) =>
      dir === "/usr/lib/jvm" ? ["temurin-21"] : [],
    );
    respondWith({
      [bin(path.join("/usr/lib/jvm", "temurin-21"))]: 'openjdk version "21.0.1"',
    });

    const found = await findSystemJava(21, linux);

    expect(found?.root).toBe(path.resolve("/usr/lib/jvm/temurin-21"));
  });

  it("falls back to PATH when nothing well-known matches", async () => {
    pathExists.mockResolvedValue(false);
    readdir.mockResolvedValue([]);
    respondWith({ java: 'openjdk version "21.0.5"' });

    const found = await findSystemJava(21, linux);

    expect(found?.server).toBe("java");
    expect(found?.root).toBe("");
  });

  it("returns null when no runtime answers", async () => {
    pathExists.mockResolvedValue(false);
    readdir.mockResolvedValue([]);
    respondWith({});

    await expect(findSystemJava(21, linux)).resolves.toBeNull();
  });
});
