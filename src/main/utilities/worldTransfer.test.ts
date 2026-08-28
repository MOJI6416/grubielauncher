import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { createZipArchive, extractZip } from "./archiver";

function entryNames(zipPath: string): string[] {
  return new AdmZip(zipPath)
    .getEntries()
    .map((entry) => String(entry.entryName).replace(/\\/g, "/"))
    .filter((name) => !name.endsWith("/"));
}

describe("world export and import", () => {
  it("packs a world under a single root folder and unpacks it back", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-world-"));
    const world = path.join(root, "saves", "Тестовый мир");

    await fs.ensureDir(path.join(world, "region"));
    await fs.writeFile(path.join(world, "level.dat"), "level");
    await fs.writeFile(path.join(world, "region", "r.0.0.mca"), "region");

    const zipPath = path.join(root, "Тестовый мир.zip");
    await createZipArchive([world], zipPath, path.dirname(world), 6);

    const names = entryNames(zipPath);

    expect(names.sort()).toEqual([
      "Тестовый мир/level.dat",
      "Тестовый мир/region/r.0.0.mca",
    ]);
    expect([...new Set(names.map((name) => name.split("/")[0]))]).toEqual([
      "Тестовый мир",
    ]);

    const target = path.join(root, "restored");
    await extractZip(zipPath, target);

    expect(
      await fs.readFile(
        path.join(target, "Тестовый мир", "region", "r.0.0.mca"),
        "utf-8",
      ),
    ).toBe("region");

    await fs.remove(root);
  });
});
