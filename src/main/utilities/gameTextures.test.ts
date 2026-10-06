import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";

const hoisted = vi.hoisted(() => ({ appData: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.appData },
}));

import {
  compareGameVersions,
  findClientJars,
  readGameTextures,
} from "./gameTextures";

const DIRT = "assets/minecraft/textures/block/dirt.png";

let versionsDir = "";

async function addVersion(
  folder: string,
  id: string,
  entries: Record<string, string>,
) {
  const target = path.join(versionsDir, folder);
  await fs.ensureDir(target);
  await fs.writeJSON(path.join(target, `${id}.json`), { id });
  const jar = new AdmZip();
  for (const [name, data] of Object.entries(entries)) {
    jar.addFile(name, Buffer.from(data));
  }
  jar.writeZip(path.join(target, `${id}.jar`));
}

beforeEach(async () => {
  hoisted.appData = await fs.mkdtemp(
    path.join(os.tmpdir(), "grubie-textures-"),
  );
  versionsDir = path.join(
    hoisted.appData,
    ".grubielauncher",
    "minecraft",
    "versions",
  );
});

afterEach(async () => {
  await fs.remove(hoisted.appData);
});

describe("game textures", () => {
  it("orders versions by their numbers", () => {
    expect(compareGameVersions("26.3", "1.21.11")).toBeGreaterThan(0);
    expect(compareGameVersions("1.21.11", "1.21.2")).toBeGreaterThan(0);
    expect(compareGameVersions("1.19.2", "1.19.2")).toBe(0);
  });

  it("finds client jars and skips loader jars", async () => {
    await addVersion("Old", "1.19.2", {});
    await addVersion("Modded", "1.21.1", {});
    await fs.writeFile(path.join(versionsDir, "Modded", "neoforge.jar"), "");
    await fs.writeJSON(path.join(versionsDir, "Modded", "neoforge.json"), {});

    const jars = await findClientJars(versionsDir);
    expect(jars.map((jar) => jar.id)).toEqual(["1.21.1", "1.19.2"]);
  });

  it("reads only the asked textures from the newest jar", async () => {
    await addVersion("Old", "1.19.2", { [DIRT]: "old" });
    await addVersion("New", "26.3", {
      [DIRT]: "new",
      "assets/minecraft/textures/block/stone.png": "stone",
    });

    const result = await readGameTextures([DIRT, "../../secret.png"]);
    expect(result?.version).toBe("26.3");
    expect(Object.keys(result?.files ?? {})).toEqual([DIRT]);
    expect(result?.files[DIRT].toString()).toBe("new");
  });

  it("returns nothing when no game is installed", async () => {
    expect(await readGameTextures([DIRT])).toBeNull();
  });
});
