import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { getTotalSizes } from "./files";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-sizes-"));
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("getTotalSizes", () => {
  it("adds up files and folders", async () => {
    await fs.ensureDir(path.join(root, "saves", "world"));
    await fs.writeFile(path.join(root, "saves", "world", "level.dat"), "12345");
    await fs.writeFile(path.join(root, "options.txt"), "12");

    expect(await getTotalSizes([root])).toBe(7);
  });

  it("ignores a path that is simply not there", async () => {
    await fs.writeFile(path.join(root, "options.txt"), "12");

    expect(await getTotalSizes([root, path.join(root, "gone.txt")])).toBe(2);
  });
});
