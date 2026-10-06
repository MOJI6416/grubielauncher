import path from "path";
import fs from "fs-extra";
import { createHash, randomUUID } from "crypto";
import AdmZip from "adm-zip";
import type { IJarMod, IVersionConf } from "@/types/IVersion";
import type { DownloadItem } from "@/types/Downloader";
import { isTrustedDownloadUrl } from "../utilities/trustedHosts";
import { assertSafeFileSegment } from "./serverScriptSafety";
import { openArchive, readEntryData } from "../utilities/archiver";
import { JAR_MOD_EXTENSIONS } from "@/shared/jarMods";
import { BTA_VANILLA_JAR, shipsOwnClientJar } from "@/shared/btaLoader";

export const JAR_MODS_FOLDER = "jarmods";
export const PATCHED_JAR_FOLDER = path.join("storage", "patched-jar");

const SIGNATURE_ENTRY =
  /^META-INF\/(?:[^/]+\.(?:SF|RSA|DSA|EC)|MANIFEST\.MF)$/i;

const pendingBuilds = new Map<string, Promise<void>>();

function missingJarModError(name: string) {
  return Object.assign(new Error(`Jar mod file is missing: ${name}`), {
    code: "ENOENT",
  });
}

function invalidJarModError(name: string) {
  return new Error(`Invalid zip archive: ${name}`);
}

export function jarModRelativePath(file: string): string {
  return path.join(
    JAR_MODS_FOLDER,
    assertSafeFileSegment(file, "jar mod file"),
  );
}

export function normalizeEntryName(name: string): string | null {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").includes("..")) return null;
  return normalized;
}

export function skipsBaseEntry(name: string): boolean {
  return name.toUpperCase().startsWith("META-INF/");
}

export function skipsModEntry(name: string): boolean {
  return SIGNATURE_ENTRY.test(name);
}

export function gameJarInputs(conf: IVersionConf): {
  base: string;
  mods: string[];
  names: Map<string, string>;
} {
  const names = new Map<string, string>();
  const named = (mod: IJarMod) => {
    const relative = jarModRelativePath(mod.file);
    names.set(relative, mod.name || mod.file);
    return relative;
  };

  const versionJar = `${assertSafeFileSegment(conf.version.id, "version id")}.jar`;
  const overlaysVanilla = shipsOwnClientJar(conf.loader.name);
  if (overlaysVanilla) names.set(BTA_VANILLA_JAR, "Minecraft b1.7.3");

  const base = conf.mainJar?.enabled
    ? named(conf.mainJar)
    : overlaysVanilla
      ? BTA_VANILLA_JAR
      : versionJar;
  const mods = [
    ...(overlaysVanilla ? [versionJar] : []),
    ...(conf.jarMods ?? []).filter((mod) => mod.enabled).map(named),
  ];

  return { base, mods, names };
}

async function describeInputs(
  versionPath: string,
  inputs: string[],
  names: Map<string, string>,
) {
  const parts: string[] = [];

  for (const relative of inputs) {
    const stats = await fs
      .stat(path.join(versionPath, relative))
      .catch(() => null);
    if (!stats?.isFile())
      throw missingJarModError(names.get(relative) ?? relative);
    parts.push(
      `${relative.replace(/\\/g, "/")}|${stats.size}|${stats.mtimeMs}`,
    );
  }

  return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
}

async function appendArchive(
  output: AdmZip,
  source: string,
  added: Set<string>,
  skip: (name: string) => boolean,
) {
  const archive = await openArchive(source).catch(() => {
    throw invalidJarModError(path.basename(source));
  });

  for (const entry of archive.getEntries()) {
    const name = normalizeEntryName(entry.entryName);
    if (!name || added.has(name) || skip(name)) continue;

    added.add(name);
    output.addFile(
      name,
      entry.isDirectory ? Buffer.alloc(0) : await readEntryData(entry),
    );
  }
}

export async function buildPatchedJar(
  base: string,
  mods: string[],
  target: string,
): Promise<void> {
  const output = new AdmZip();
  const added = new Set<string>();

  for (const mod of [...mods].reverse()) {
    await appendArchive(output, mod, added, skipsModEntry);
  }
  await appendArchive(output, base, added, skipsBaseEntry);

  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.ensureDir(path.dirname(target));
  try {
    await output.writeZipPromise(temporary, { overwrite: true });
    await fs.move(temporary, target, { overwrite: true });
  } finally {
    await fs.remove(temporary).catch(() => {});
  }
}

export async function prepareGameJar(
  versionPath: string,
  conf: IVersionConf,
): Promise<string> {
  const { base, mods, names } = gameJarInputs(conf);
  const patchedFolder = path.join(versionPath, PATCHED_JAR_FOLDER);

  if (mods.length === 0) {
    await fs.remove(patchedFolder).catch(() => {});
    return base;
  }

  const fingerprint = await describeInputs(versionPath, [base, ...mods], names);
  const fileName = `${fingerprint}.jar`;
  const relative = path.join(PATCHED_JAR_FOLDER, fileName);
  const target = path.join(versionPath, relative);

  if (!(await fs.pathExists(target))) {
    let build = pendingBuilds.get(target);
    if (!build) {
      build = buildPatchedJar(
        path.join(versionPath, base),
        mods.map((mod) => path.join(versionPath, mod)),
        target,
      ).finally(() => pendingBuilds.delete(target));
      pendingBuilds.set(target, build);
    }
    await build;
  }

  for (const stale of await fs.readdir(patchedFolder).catch(() => [])) {
    if (stale !== fileName && !stale.endsWith(".tmp")) {
      await fs.remove(path.join(patchedFolder, stale)).catch(() => {});
    }
  }

  return relative;
}

export async function importJarMods(
  versionPath: string,
  sources: string[],
): Promise<IJarMod[]> {
  const folder = path.join(versionPath, JAR_MODS_FOLDER);
  await fs.ensureDir(folder);

  const imported: IJarMod[] = [];
  for (const source of sources) {
    const extension = path.extname(source).slice(1).toLowerCase();
    if (!JAR_MOD_EXTENSIONS.includes(extension)) {
      throw invalidJarModError(path.basename(source));
    }

    await openArchive(source).catch(() => {
      throw invalidJarModError(path.basename(source));
    });

    const file = `${randomUUID()}.${extension}`;
    await fs.copy(source, path.join(folder, file), { overwrite: false });
    imported.push({ file, name: path.basename(source), enabled: true });
  }

  return imported;
}

export async function removeJarModFile(
  versionPath: string,
  file: string,
): Promise<void> {
  await fs.remove(path.join(versionPath, jarModRelativePath(file)));
}

function publishedJarMods(conf: Pick<IVersionConf, "jarMods" | "mainJar">) {
  return [...(conf.jarMods ?? []), ...(conf.mainJar ? [conf.mainJar] : [])];
}

export async function jarModDownloads(
  versionPath: string,
  conf: Pick<IVersionConf, "jarMods" | "mainJar">,
): Promise<DownloadItem[]> {
  const items: DownloadItem[] = [];

  for (const mod of publishedJarMods(conf)) {
    if (!mod.url || !isTrustedDownloadUrl(mod.url)) continue;
    const destination = path.join(versionPath, jarModRelativePath(mod.file));
    if (await fs.pathExists(destination)) continue;

    items.push({
      url: mod.url,
      destination,
      sha1: mod.sha1,
      size: mod.size,
      group: "jarmods",
    });
  }

  return items;
}

export async function removeUnusedJarModFiles(
  versionPath: string,
  conf: Pick<IVersionConf, "jarMods" | "mainJar">,
): Promise<void> {
  const used = new Set(publishedJarMods(conf).map((mod) => mod.file));
  for (const file of await listJarModFiles(versionPath)) {
    if (!used.has(file)) await removeJarModFile(versionPath, file);
  }
}

export async function listJarModFiles(versionPath: string): Promise<string[]> {
  const entries = await fs
    .readdir(path.join(versionPath, JAR_MODS_FOLDER), { withFileTypes: true })
    .catch(() => []);
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}
