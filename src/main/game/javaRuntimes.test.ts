import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";

const hoisted = vi.hoisted(() => ({
  appData: "",
  systemDirs: [] as string[],
  outputs: new Map<string, string>(),
}));

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

vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  execFile: (
    binary: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const output = hoisted.outputs.get(path.resolve(binary));
    if (output === undefined) callback(new Error("not found"), "", "");
    else callback(null, "", output);
  },
}));

vi.mock("./systemJava", () => ({
  findSystemJava: async () => null,
  systemJavaDirs: () => hoisted.systemDirs,
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

import {
  addCustomJava,
  listJavaRuntimes,
  normalizeRegistry,
  parseJavaProperties,
  probeFromProperties,
  removeCustomJava,
  resolveJava,
  setJavaDefault,
} from "./javaRuntimes";

const WINDOWS = process.platform === "win32";
const MAC = process.platform === "darwin";
const EXT = WINDOWS ? ".exe" : "";
const CLIENT = WINDOWS ? "javaw.exe" : "java";

let root = "";

function properties(home: string, spec: string, vendor: string, vendorVersion = "") {
  return [
    "Property settings:",
    "    file.encoding = UTF-8",
    `    java.home = ${home}`,
    "    java.library.path = /first",
    "        /second",
    "    java.runtime.version = " + (spec === "1.8" ? "1.8.0_402-b06" : `${spec}.0.5+11`),
    `    java.specification.version = ${spec}`,
    `    java.vendor = ${vendor}`,
    ...(vendorVersion ? [`    java.vendor.version = ${vendorVersion}`] : []),
    "    java.vm.name = OpenJDK 64-Bit Server VM",
    "    os.arch = amd64",
    "",
    `openjdk version "${spec}" 2024-10-15`,
  ].join("\n");
}

async function makeJdk(home: string, spec: string, vendor: string, vendorVersion = "") {
  const bin = path.join(home, "bin");
  await fs.ensureDir(bin);
  for (const name of [`java${EXT}`, CLIENT]) {
    await fs.writeFile(path.join(bin, name), "");
    hoisted.outputs.set(
      path.resolve(path.join(bin, name)),
      properties(home, spec, vendor, vendorVersion),
    );
  }
  return home;
}

function managedRoot() {
  return path.join(root, ".grubielauncher", "java");
}

async function makeManaged(dirName: string, spec: string) {
  const dir = path.join(managedRoot(), dirName);
  const home = MAC ? path.join(dir, "Contents", "Home") : dir;
  await makeJdk(home, spec, "Eclipse Adoptium", `Temurin-${spec}.0.5+11`);
  await fs.writeFile(
    path.join(home, "release"),
    `IMPLEMENTOR="Eclipse Adoptium"\nJAVA_VERSION="${spec}.0.5"\nIMPLEMENTOR_VERSION="Temurin-${spec}.0.5+11"\n`,
  );
  return home;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-java-runtimes-"));
  hoisted.appData = root;
  hoisted.outputs.clear();
  hoisted.systemDirs = [path.join(root, "system")];
  await fs.ensureDir(hoisted.systemDirs[0]);
  delete process.env.JAVA_HOME;
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("java properties", () => {
  it("reads home, major, vendor and arch", () => {
    const parsed = parseJavaProperties(
      properties("/opt/zulu21", "21", "Azul Systems, Inc.", "Zulu21.38+21-CA"),
    );

    expect(parsed["java.library.path"]).toBe("/first");
    expect(probeFromProperties(parsed, "/fallback")).toEqual({
      home: path.resolve("/opt/zulu21"),
      major: 21,
      version: "21.0.5+11",
      vendor: "Zulu",
      arch: "amd64",
    });
  });

  it("understands the 1.8 numbering", () => {
    const parsed = parseJavaProperties(
      properties("/opt/jdk8/jre", "1.8", "Oracle Corporation"),
    );

    expect(probeFromProperties(parsed, "/fallback")?.major).toBe(8);
    expect(probeFromProperties({}, "/fallback")).toBeNull();
  });
});

describe("registry file", () => {
  it("drops entries a hand edit could break", () => {
    const registry = normalizeRegistry({
      runtimes: [
        { home: "relative/jdk", source: "custom", major: 21 },
        { home: "/opt/jdk", source: "managed", major: 21 },
        { home: "/opt/jdk21", source: "custom", major: 21, vendor: "Zulu" },
        { home: "/opt/jdk21", source: "system", major: 21 },
      ],
      defaults: { "21": "/opt/jdk21", x: "/opt/jdk" },
    });

    expect(registry.runtimes).toHaveLength(1);
    expect(registry.runtimes[0]).toMatchObject({ source: "custom", major: 21 });
    expect(registry.defaults).toEqual({ "21": "/opt/jdk21" });
  });
});

describe("resolving the Java of an instance", () => {
  it("uses the launcher's own Java when nothing is chosen", async () => {
    const home = await makeManaged("jdk-17.0.5+11-jre", "17");

    const java = await resolveJava({ requiredMajor: 17 });

    expect(java).toMatchObject({
      via: "auto",
      source: "managed",
      major: 17,
      requiredMajor: 17,
      vendor: "Temurin",
    });
    expect(java.client).toBe(path.join(home, "bin", CLIENT));
    expect(java.problem).toBeUndefined();
  });

  it("asks for a download when the launcher's Java is missing", async () => {
    const java = await resolveJava({ requiredMajor: 21, override: { major: 21 } });

    expect(java).toMatchObject({ via: "instance", problem: "not_installed", client: "" });
  });

  it("refuses a Java the user never added, even if it exists", async () => {
    const home = await makeJdk(path.join(root, "loose", "jdk"), "21", "Azul Systems, Inc.");

    const java = await resolveJava({ requiredMajor: 21, override: { home } });

    expect(java).toMatchObject({ problem: "untrusted", client: "", server: "" });
  });

  it("reports a chosen Java that disappeared", async () => {
    const java = await resolveJava({
      requiredMajor: 21,
      override: { home: path.join(root, "gone") },
    });

    expect(java.problem).toBe("missing");
  });

  it("launches a Java the user added by hand", async () => {
    const home = await makeJdk(
      path.join(root, "custom", "graal"),
      "21",
      "GraalVM Community",
      "GraalVM CE 21.0.2+13.1",
    );

    const added = await addCustomJava(path.join(home, "bin", `java${EXT}`));
    expect(added.ok).toBe(true);

    const java = await resolveJava({ requiredMajor: 17, override: { home } });

    expect(java).toMatchObject({
      via: "instance",
      source: "custom",
      major: 21,
      requiredMajor: 17,
      vendor: "GraalVM",
    });
    expect(java.client).toBe(path.join(home, "bin", CLIENT));
    expect(java.server).toBe(path.join(home, "bin", `java${EXT}`));
  });

  it.skipIf(!WINDOWS)("starts a runtime without javaw through java", async () => {
    const home = await makeJdk(path.join(root, "custom", "jlinked"), "21", "Eclipse Adoptium");
    await fs.remove(path.join(home, "bin", CLIENT));
    await addCustomJava(path.join(home, "bin", `java${EXT}`));

    const java = await resolveJava({ requiredMajor: 21, override: { home } });

    expect(java.client).toBe(path.join(home, "bin", `java${EXT}`));
    expect(java.problem).toBeUndefined();
  });

  it("refuses files that are not Java and the launcher's own runtimes", async () => {
    const notJava = path.join(root, "tools", "evil.exe");
    await fs.outputFile(notJava, "");
    const managed = await makeManaged("jdk-21.0.5+11-jre", "21");

    expect(await addCustomJava(notJava)).toEqual({ ok: false, reason: "not_java" });
    expect(await addCustomJava(path.join(managed, "bin", `java${EXT}`))).toEqual({
      ok: false,
      reason: "managed",
    });
  });

  it("follows the global choice for a major and falls back when it breaks", async () => {
    await makeManaged("jdk-21.0.5+11-jre", "21");
    const zulu = await makeJdk(
      path.join(root, "system", "zulu-21"),
      "21",
      "Azul Systems, Inc.",
      "Zulu21.38+21-CA",
    );

    const list = await listJavaRuntimes({ rescan: true });
    expect(list.runtimes.map((runtime) => runtime.source)).toEqual(["managed", "system"]);

    expect(await setJavaDefault(17, zulu)).toBeNull();
    expect(await setJavaDefault(21, zulu)).not.toBeNull();

    const chosen = await resolveJava({ requiredMajor: 21 });
    expect(chosen).toMatchObject({ via: "default", source: "system", vendor: "Zulu" });

    const pinned = await resolveJava({ requiredMajor: 17, override: { major: 21 } });
    expect(pinned).toMatchObject({ via: "instance", source: "system", home: zulu });

    await fs.remove(zulu);
    const fallback = await resolveJava({ requiredMajor: 21 });
    expect(fallback).toMatchObject({ via: "auto", source: "managed" });
  });

  it("forgets the global choice together with the removed Java", async () => {
    const home = await makeJdk(path.join(root, "custom", "corretto"), "17", "Amazon.com Inc.");
    await addCustomJava(path.join(home, "bin", `java${EXT}`));
    await setJavaDefault(17, home);

    const list = await removeCustomJava(home);

    expect(list.defaults).toEqual({});
    expect(list.runtimes.some((runtime) => runtime.home === home)).toBe(false);
  });
});
