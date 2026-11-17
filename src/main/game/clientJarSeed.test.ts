import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import fs from "fs-extra";
import { seedClientJar } from "./clientJarSeed";

function client(content: string) {
  return {
    sha1: createHash("sha1").update(content).digest("hex"),
    size: Buffer.byteLength(content),
  };
}

let versionsPath = "";

beforeEach(async () => {
  versionsPath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "grubie-client-seed-")),
    "versions",
  );
  await fs.ensureDir(versionsPath);
});

afterEach(async () => {
  await fs.remove(path.dirname(versionsPath));
});

describe("seedClientJar", () => {
  it("copies the client jar from another instance of the same version", async () => {
    await fs.outputFile(path.join(versionsPath, "Vanilla", "26.3.jar"), "jar");
    const destination = path.join(versionsPath, "Pack", "26.3.jar");

    expect(await seedClientJar(versionsPath, destination, client("jar"))).toBe(
      true,
    );
    expect(await fs.readFile(destination, "utf-8")).toBe("jar");
  });

  it("skips a jar of the same size whose checksum differs", async () => {
    await fs.outputFile(path.join(versionsPath, "Patched", "26.3.jar"), "jaR");
    const destination = path.join(versionsPath, "Pack", "26.3.jar");

    expect(await seedClientJar(versionsPath, destination, client("jar"))).toBe(
      false,
    );
    expect(await fs.pathExists(destination)).toBe(false);
  });

  it("leaves a jar of the expected size for the downloader to verify", async () => {
    await fs.outputFile(path.join(versionsPath, "Vanilla", "26.3.jar"), "jar");
    const destination = path.join(versionsPath, "Pack", "26.3.jar");
    await fs.outputFile(destination, "old");

    expect(await seedClientJar(versionsPath, destination, client("jar"))).toBe(
      false,
    );
    expect(await fs.readFile(destination, "utf-8")).toBe("old");
  });

  it("does nothing without a checksum to compare against", async () => {
    await fs.outputFile(path.join(versionsPath, "Vanilla", "26.3.jar"), "jar");
    const destination = path.join(versionsPath, "Pack", "26.3.jar");

    expect(
      await seedClientJar(versionsPath, destination, { size: 3 }),
    ).toBe(false);
    expect(await fs.pathExists(destination)).toBe(false);
  });
});
