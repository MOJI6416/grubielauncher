import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { pathToFileURL } from "url";
import fs from "fs-extra";

const hoisted = vi.hoisted(() => ({ root: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: (key: string) => {
      const paths: Record<string, string> = {
        appData: "appdata",
        userData: "userdata",
        temp: "temp",
        home: "home",
        downloads: path.join("home", "Downloads"),
      };
      return path.join(hoisted.root, paths[key] ?? "other");
    },
    getAppPath: () => path.join(hoisted.root, "app"),
  },
}));

vi.mock("../windows/mainWindow", () => ({ mainWindow: null }));

import { Downloader } from "./downloader";
import { blessUserSelectedPath } from "./safePath";
import { OPTIONAL_PROJECT_DOWNLOAD_OPTIONS } from "./downloaderPure";

function sha1(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

let modsPath = "";

beforeEach(async () => {
  hoisted.root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-local-src-"));
  modsPath = path.join(
    hoisted.root,
    "appdata",
    ".grubielauncher",
    "minecraft",
    "versions",
    "Pack",
    "mods",
  );
  await fs.ensureDir(modsPath);
});

afterEach(async () => {
  await fs.remove(hoisted.root);
});

describe("Downloader with local file sources", () => {
  it("accepts an already copied local mod even when its source is no longer readable", async () => {
    const content = "mod-bytes";
    const destination = path.join(modsPath, "mod.jar");
    await fs.writeFile(destination, content);

    const source = path.join(hoisted.root, "elsewhere", "mod.jar");

    const failures = await new Downloader(2).downloadFiles([
      {
        url: pathToFileURL(source).href,
        destination,
        group: "mods",
        sha1: sha1(content),
        size: content.length,
      },
    ]);

    expect(failures?.failedItems ?? 0).toBe(0);
  });

  it("explains a local source that is outside the allowed folders", async () => {
    const source = path.join(hoisted.root, "elsewhere", "mod.jar");
    await fs.outputFile(source, "mod-bytes");

    const failures = await new Downloader(2).downloadFiles([
      {
        url: pathToFileURL(source).href,
        destination: path.join(modsPath, "mod.jar"),
        group: "mods",
        sha1: sha1("mod-bytes"),
        size: 9,
      },
    ], undefined, OPTIONAL_PROJECT_DOWNLOAD_OPTIONS);

    expect(failures?.failedItems).toBe(1);
    expect(failures?.failures[0]?.error).toContain("outside allowed roots");
  });

  it("copies a local source the user picked", async () => {
    const content = "picked-mod";
    const source = path.join(hoisted.root, "picked", "mod.jar");
    await fs.outputFile(source, content);
    blessUserSelectedPath(source, "file", "read");

    const destination = path.join(modsPath, "picked.jar");
    const failures = await new Downloader(2).downloadFiles([
      {
        url: pathToFileURL(source).href,
        destination,
        group: "mods",
        sha1: sha1(content),
        size: content.length,
      },
    ]);

    expect(failures?.failedItems ?? 0).toBe(0);
    expect(await fs.readFile(destination, "utf-8")).toBe(content);
  });
});
