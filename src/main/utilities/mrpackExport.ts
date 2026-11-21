import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import type { IVersionConf } from "@/types/IVersion";
import type { MrpackExportResult } from "@/types/ModpackSource";
import { isExcludedInstancePath } from "@/shared/instancePrivacy";
import {
  MRPACK_INDEX,
  buildMrpackIndex,
  isExportEntryShown,
  mrpackDependencies,
  mrpackLinks,
  normalizeExportEntry,
  type MrpackFile,
} from "@/shared/instanceExport";
import { createZipArchive } from "./archiver";

const OVERRIDES = "overrides/";

async function hashFile(filePath: string): Promise<{ sha1: string; sha512: string }> {
  const sha1 = createHash("sha1");
  const sha512 = createHash("sha512");

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .on("data", (chunk) => {
        sha1.update(chunk);
        sha512.update(chunk);
      })
      .on("error", reject)
      .on("end", () => resolve());
  });

  return { sha1: sha1.digest("hex"), sha512: sha512.digest("hex") };
}

export function pickMrpackEntries(entries: string[]): string[] {
  const picked = new Set<string>();
  for (const raw of entries) {
    const entry = normalizeExportEntry(raw);
    if (!entry || entry.split("/").some((part) => part === ".." || part === ".")) continue;
    if (!isExportEntryShown(entry.split("/")[0], "mrpack")) continue;
    if (isExcludedInstancePath(entry)) continue;
    picked.add(entry);
  }
  return [...picked];
}

async function countPackedFiles(
  versionPath: string,
  folder: string,
  linked: ReadonlySet<string>,
): Promise<number> {
  const names = await fs.readdir(path.join(versionPath, folder)).catch(() => [] as string[]);
  let count = 0;
  for (const name of names) {
    if (!/\.(jar|zip)(\.disabled)?$/i.test(name)) continue;
    if (linked.has(`${folder}/${name}`.toLowerCase())) continue;
    count += 1;
  }
  return count;
}

export async function exportMrpack(
  versionPath: string,
  entries: string[],
  outputPath: string,
): Promise<MrpackExportResult> {
  const conf = (await fs.readJSON(path.join(versionPath, "version.json"))) as IVersionConf;
  const dependencies = mrpackDependencies(conf);
  if (!dependencies) {
    throw new Error(`Modrinth packs do not support the ${conf.loader?.name ?? "unknown"} loader`);
  }

  const picked = pickMrpackEntries(entries);
  const folders = new Set(picked.map((entry) => entry.split("/")[0]));

  const files: MrpackFile[] = [];
  const linked = new Set<string>();
  for (const mod of conf.loader?.mods ?? []) {
    for (const link of mrpackLinks(mod)) {
      const key = link.path.toLowerCase();
      if (linked.has(key) || !folders.has(link.path.split("/")[0])) continue;

      const diskPath = path.join(versionPath, ...link.path.split("/"));
      const stats = await fs.stat(diskPath).catch(() => null);
      if (!stats?.isFile()) continue;

      const hashes = await hashFile(diskPath);
      if (link.sha1 && hashes.sha1 !== link.sha1) continue;

      files.push({ path: link.path, hashes, downloads: [link.url], fileSize: stats.size });
      linked.add(key);
    }
  }

  const index = buildMrpackIndex(conf, dependencies, files);

  try {
    await createZipArchive(
      picked.map((entry) => path.join(versionPath, ...entry.split("/"))),
      outputPath,
      versionPath,
      9,
      (name) => isExcludedInstancePath(name) || linked.has(name.toLowerCase()),
      [{ name: MRPACK_INDEX, data: Buffer.from(JSON.stringify(index, null, 2), "utf8") }],
      undefined,
      OVERRIDES,
    );
  } catch (error) {
    await fs.remove(outputPath).catch(() => undefined);
    throw error;
  }

  let packed = 0;
  for (const folder of ["mods", "resourcepacks", "shaderpacks"]) {
    if (folders.has(folder)) packed += await countPackedFiles(versionPath, folder, linked);
  }

  return { linked: files.length, packed };
}
