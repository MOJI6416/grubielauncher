import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adoptIntoStore,
  collectStoreGarbage,
  dedupeContent,
  detachHardLink,
  getContentStoreStats,
  hashFile,
  isContentFile,
  linkFromStore,
  resetContentStoreCaches,
  storePath,
  type ContentStoreRoots,
} from "./contentStore";

let root = "";
let roots: ContentStoreRoots;

const MOD = Buffer.alloc(64 * 1024, 7);
const OTHER = Buffer.alloc(32 * 1024, 3);

async function put(instance: string, folder: string, name: string, data: Buffer) {
  const file = path.join(roots.versions, instance, folder, name);
  await fs.outputFile(file, data);
  return file;
}

async function links(file: string) {
  return (await fs.stat(file)).nlink;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-store-"));
  roots = {
    versions: path.join(root, "versions"),
    store: path.join(root, "content-store"),
  };
  resetContentStoreCaches();
});

afterEach(async () => {
  await fs.remove(root);
});

describe("content store", () => {
  it("only takes mod, resource pack and shader archives directly inside an instance", () => {
    const file = (...parts: string[]) => path.join(roots.versions, ...parts);

    expect(isContentFile(file("Pack", "mods", "sodium.jar"), roots)).toBe(true);
    expect(isContentFile(file("Pack", "mods", "sodium.jar.disabled"), roots)).toBe(true);
    expect(isContentFile(file("Pack", "resourcepacks", "faithful.zip"), roots)).toBe(true);
    expect(isContentFile(file("Pack", "shaderpacks", "bsl.zip"), roots)).toBe(true);
    expect(isContentFile(file("Pack", "shaderpacks", "bsl.zip.txt"), roots)).toBe(false);
    expect(isContentFile(file("Pack", "mods", "config.toml"), roots)).toBe(false);
    expect(isContentFile(file("Pack", "server", "mods", "sodium.jar"), roots)).toBe(false);
    expect(isContentFile(file("Pack", "config", "sodium.jar"), roots)).toBe(false);
    expect(isContentFile(path.join(root, "elsewhere", "mods", "sodium.jar"), roots)).toBe(false);
  });

  it("links a second copy of the same file to the stored one", async () => {
    const first = await put("A", "mods", "mod.jar", MOD);
    const second = await put("B", "mods", "mod.jar", MOD);

    await expect(adoptIntoStore(first, undefined, roots)).resolves.toBe(0);
    await expect(adoptIntoStore(second, undefined, roots)).resolves.toBe(MOD.length);

    expect((await fs.stat(first)).ino).toBe((await fs.stat(second)).ino);
    expect(await links(first)).toBe(3);
    await expect(fs.readFile(second)).resolves.toEqual(MOD);
  });

  it("places a stored file into a new instance instead of downloading it", async () => {
    const first = await put("A", "mods", "mod.jar", MOD);
    await adoptIntoStore(first, undefined, roots);
    const sha1 = await hashFile(first);
    const target = path.join(roots.versions, "C", "mods", "mod.jar");

    await expect(linkFromStore(target, sha1, MOD.length + 1, roots)).resolves.toBe(false);
    await expect(linkFromStore(target, sha1, MOD.length, roots)).resolves.toBe(true);
    await expect(fs.readFile(target)).resolves.toEqual(MOD);
    expect(await links(first)).toBe(3);
  });

  it("drops a stored file whose content no longer matches its hash", async () => {
    const first = await put("A", "mods", "mod.jar", MOD);
    await adoptIntoStore(first, undefined, roots);
    const sha1 = await hashFile(first);
    resetContentStoreCaches();
    await fs.writeFile(storePath(sha1, roots), OTHER);

    const target = path.join(roots.versions, "C", "mods", "mod.jar");
    await expect(linkFromStore(target, sha1, OTHER.length, roots)).resolves.toBe(false);
    await expect(fs.pathExists(storePath(sha1, roots))).resolves.toBe(false);
    await expect(fs.pathExists(target)).resolves.toBe(false);
  });

  it("dedupes existing instances and reports the space it saved", async () => {
    const files = [
      await put("A", "mods", "mod.jar", MOD),
      await put("B", "mods", "mod.jar.disabled", MOD),
      await put("C", "mods", "mod.jar", MOD),
      await put("C", "resourcepacks", "pack.zip", OTHER),
    ];
    const settings = await put("A", "shaderpacks", "bsl.zip.txt", MOD);

    const before = await getContentStoreStats(roots);
    expect(before.saved).toBe(0);
    expect(before.potential).toBe(2 * MOD.length);
    expect(before.duplicates).toBe(2);

    const result = await dedupeContent(roots);
    expect(result).toEqual({ freed: 2 * MOD.length, linked: 2, unsupported: false });
    expect(await links(files[0])).toBe(4);
    expect(await links(files[3])).toBe(2);
    expect(await links(settings)).toBe(1);

    const after = await getContentStoreStats(roots);
    expect(after.saved).toBe(2 * MOD.length);
    expect(after.potential).toBe(0);

    await expect(dedupeContent(roots)).resolves.toEqual({
      freed: 0,
      linked: 0,
      unsupported: false,
    });
  });

  it("frees stored files that no instance uses any more", async () => {
    const file = await put("A", "mods", "mod.jar", MOD);
    await adoptIntoStore(file, undefined, roots);
    const stored = storePath(await hashFile(file), roots);
    await fs.remove(path.join(roots.versions, "A"));

    expect((await getContentStoreStats(roots)).orphanBytes).toBe(MOD.length);
    await expect(collectStoreGarbage(roots)).resolves.toBe(MOD.length);
    await expect(fs.pathExists(stored)).resolves.toBe(false);
  });

  it("detaches a linked file before it is overwritten so other instances keep theirs", async () => {
    const first = await put("A", "mods", "mod.jar", MOD);
    const second = await put("B", "mods", "mod.jar", MOD);
    await dedupeContent(roots);

    await detachHardLink(second);
    await fs.writeFile(second, OTHER);

    await expect(fs.readFile(first)).resolves.toEqual(MOD);
    await expect(fs.readFile(second)).resolves.toEqual(OTHER);
  });
});
