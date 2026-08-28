import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import path from "path";

const hoisted = vi.hoisted(() => {
  const root = process.env.TEMP || process.env.TMPDIR || "/tmp";
  return { base: `${root}/grubie-world-import-${process.pid}-${Date.now()}` };
});

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.base },
  shell: { trashItem: async () => undefined },
}));

import { extractWorldArchive, importWorldArchive } from "./worlds";

const versionPath = path.join(hoisted.base, "versions", "Pack");
const savesPath = path.join(versionPath, "saves");
const zipPath = path.join(hoisted.base, "world.zip");

beforeEach(async () => {
  await fs.remove(savesPath);
  await fs.ensureDir(savesPath);
  await fs.remove(zipPath);
});

afterAll(async () => {
  await fs.remove(hoisted.base).catch(() => undefined);
});

function writeArchive(entries: Record<string, string>) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content));
  }
  zip.writeZip(zipPath);
}

describe("importWorldArchive", () => {
  it("never writes outside the imported world folder", async () => {
    await fs.outputFile(
      path.join(savesPath, "Precious", "level.dat"),
      "real world",
    );
    await fs.outputFile(
      path.join(savesPath, "Precious", "region", "r.0.0.mca"),
      "real region",
    );

    writeArchive({
      "Imported/level.dat": "new world",
      "Precious/region/r.0.0.mca": "hijacked",
    });

    const result = await importWorldArchive(zipPath, versionPath);
    expect(result.ok).toBe(true);

    expect(
      await fs.readFile(
        path.join(savesPath, "Precious", "region", "r.0.0.mca"),
        "utf-8",
      ),
    ).toBe("real region");
    expect(
      await fs.pathExists(path.join(savesPath, "Imported", "level.dat")),
    ).toBe(true);
  });

  it("does not report success for an archive without a world", async () => {
    writeArchive({ "NotAWorld/readme.txt": "hi" });

    const result = await importWorldArchive(zipPath, versionPath);
    expect(result.ok).toBe(false);
    expect(await fs.pathExists(path.join(savesPath, "NotAWorld"))).toBe(false);
  });
});

describe("extractWorldArchive", () => {
  it("keeps other worlds intact when a pack world archive has extra roots", async () => {
    await fs.outputFile(path.join(savesPath, "Old", "level.dat"), "old world");

    writeArchive({
      "PackWorld/level.dat": "pack world",
      "Old/region/r.0.0.mca": "hijacked",
    });

    await extractWorldArchive(zipPath, savesPath);

    expect(
      await fs.pathExists(path.join(savesPath, "Old", "region", "r.0.0.mca")),
    ).toBe(false);
  });
});
