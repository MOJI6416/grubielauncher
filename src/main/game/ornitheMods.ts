import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs-extra";
import type AdmZip from "adm-zip";
import {
  openArchive,
  openArchiveBuffer,
  readEntryData,
} from "../utilities/archiver";
import { Downloader } from "../utilities/downloader";
import { VersionsService } from "../services/Versions";
import { mavenJarPath } from "./profileLoaderManifest";
import {
  ORNITHE_GENERATIONS,
  ORNITHE_MAVEN,
  type OrnitheModsCheck,
  ornitheIntermediaryGeneration,
} from "@/shared/profileLoaders";

const INTERMEDIARY_CLASS = /C_\d{7}/g;
const SAMPLE_LIMIT = 400;
const NESTED_DEPTH = 2;
const MIN_SAMPLE = 5;
const MATCHED_SHARE = 0.6;
const FOREIGN_SHARE = 0.2;

interface ModSample {
  name: string;
  classes: Set<string>;
}

const mappingCache = new Map<string, Promise<Set<string>>>();
const fileGenerationCache = new Map<string, Promise<number | null>>();

function collectClasses(text: string, into: Set<string>, limit = Infinity) {
  for (const match of text.matchAll(INTERMEDIARY_CLASS)) {
    into.add(match[0]);
    if (into.size >= limit) return;
  }
}

async function loadMappingClasses(jarPath: string): Promise<Set<string>> {
  const archive = await openArchive(jarPath);
  const classes = new Set<string>();

  for (const entry of archive.getEntries()) {
    if (entry.isDirectory || !entry.entryName.endsWith(".tiny")) continue;
    collectClasses((await readEntryData(entry)).toString("latin1"), classes);
  }

  return classes;
}

export function readMappingClasses(jarPath: string): Promise<Set<string>> {
  const key = path.resolve(jarPath);
  let cached = mappingCache.get(key);
  if (!cached) {
    cached = loadMappingClasses(jarPath);
    cached.catch(() => mappingCache.delete(key));
    mappingCache.set(key, cached);
  }
  return cached;
}

function modDisplayName(raw: Buffer, fallback: string): string {
  try {
    const name = JSON.parse(raw.toString("utf-8"))?.name;
    return typeof name === "string" && name.trim() ? name.trim() : fallback;
  } catch {
    return fallback;
  }
}

async function collectArchiveClasses(
  archive: AdmZip,
  classes: Set<string>,
  depth: number,
) {
  for (const entry of archive.getEntries()) {
    if (classes.size >= SAMPLE_LIMIT) return;
    if (entry.isDirectory) continue;
    const entryName = entry.entryName;

    if (entryName.endsWith(".jar")) {
      if (depth >= NESTED_DEPTH) continue;
      const nested = await readEntryData(entry)
        .then((data) => openArchiveBuffer(data))
        .catch(() => null);
      if (nested) await collectArchiveClasses(nested, classes, depth + 1);
      continue;
    }

    if (entryName === "fabric.mod.json") continue;
    if (!entryName.endsWith(".class") && !entryName.endsWith(".json")) continue;
    collectClasses(
      (await readEntryData(entry)).toString("latin1"),
      classes,
      SAMPLE_LIMIT,
    );
  }
}

export async function sampleModClasses(jarPath: string): Promise<ModSample> {
  const archive = await openArchive(jarPath);
  const metadata = archive.getEntry("fabric.mod.json");
  const fallback = path.basename(jarPath).replace(/\.jar$/i, "");
  const name = metadata
    ? modDisplayName(await readEntryData(metadata), fallback)
    : fallback;

  const classes = new Set<string>();
  await collectArchiveClasses(archive, classes, 0);
  return { name, classes };
}

function share(classes: Set<string>, mapping: Set<string>): number {
  let known = 0;
  for (const name of classes) if (mapping.has(name)) known++;
  return known / classes.size;
}

export function classifyGeneration(
  classes: Set<string>,
  mappings: ReadonlyMap<number, Set<string>>,
): number | null {
  if (classes.size < MIN_SAMPLE) return null;

  const shares = [...mappings].map(
    ([generation, mapping]) => [generation, share(classes, mapping)] as const,
  );
  const matched = shares.filter(([, value]) => value >= MATCHED_SHARE);
  const foreign = shares.filter(([, value]) => value >= FOREIGN_SHARE);
  return matched.length === 1 && foreign.length === 1 ? matched[0][0] : null;
}

async function sampleMods(modsPath: string): Promise<ModSample[]> {
  const files = await fs.readdir(modsPath).catch((): string[] => []);
  const samples: ModSample[] = [];

  for (const file of files.sort()) {
    if (!file.toLowerCase().endsWith(".jar")) continue;
    const sample = await sampleModClasses(path.join(modsPath, file)).catch(
      () => null,
    );
    if (sample && sample.classes.size >= MIN_SAMPLE) samples.push(sample);
  }

  return samples;
}

export async function ensureOrnitheMapping(
  minecraftVersion: string,
  generation: number,
  librariesPath: string,
): Promise<string | null> {
  const maven = await VersionsService.getOrnitheIntermediary(
    minecraftVersion,
    generation,
  ).catch(() => null);
  const relative = maven ? mavenJarPath(maven) : "";
  if (!relative) return null;

  const destination = path.join(librariesPath, relative);
  if (!(await fs.pathExists(destination))) {
    await new Downloader(1)
      .downloadFiles([
        {
          url: `${ORNITHE_MAVEN}/${relative}`,
          destination,
          group: "libraries",
          options: { silent: true },
        },
      ])
      .catch(() => null);
  }

  return (await fs.pathExists(destination)) ? destination : null;
}

export async function checkOrnitheMods({
  libraries,
  librariesPath,
  modsPath,
  loadMapping,
}: {
  libraries: readonly string[];
  librariesPath: string;
  modsPath: string;
  loadMapping: (generation: number) => Promise<string | null>;
}): Promise<OrnitheModsCheck | null> {
  const generation = ornitheIntermediaryGeneration(libraries);
  if (generation === undefined) return null;

  const library = libraries.find(
    (name) => ornitheIntermediaryGeneration([name]) !== undefined,
  );
  const mappingPath = path.join(librariesPath, mavenJarPath(library ?? ""));
  if (!library || !(await fs.pathExists(mappingPath))) return null;

  const mapping = await readMappingClasses(mappingPath);
  const samples = await sampleMods(modsPath);

  const compatible: string[] = [];
  const suspects: ModSample[] = [];
  for (const sample of samples) {
    const known = share(sample.classes, mapping);
    if (known >= MATCHED_SHARE) compatible.push(sample.name);
    else if (known < FOREIGN_SHARE) suspects.push(sample);
  }

  const result: OrnitheModsCheck = {
    generation,
    target: null,
    mismatched: [],
    compatible,
  };
  if (!suspects.length) return result;

  const other = ORNITHE_GENERATIONS.find((value) => value !== generation);
  const otherPath = other === undefined ? null : await loadMapping(other);
  if (other === undefined || !otherPath) return result;

  const otherMapping = await readMappingClasses(otherPath);
  result.mismatched = suspects
    .filter((sample) => share(sample.classes, otherMapping) >= MATCHED_SHARE)
    .map((sample) => sample.name);
  if (result.mismatched.length) result.target = other;

  return result;
}

async function loadGenerationMappings(
  minecraftVersion: string,
  librariesPath: string,
): Promise<Map<number, Set<string>>> {
  const mappings = new Map<number, Set<string>>();
  for (const generation of ORNITHE_GENERATIONS) {
    const mappingPath = await ensureOrnitheMapping(
      minecraftVersion,
      generation,
      librariesPath,
    );
    if (!mappingPath)
      throw new Error(`Ornithe gen${generation} mapping is unavailable`);
    mappings.set(generation, await readMappingClasses(mappingPath));
  }
  return mappings;
}

async function probeFileGeneration({
  url,
  sha1,
  minecraftVersion,
  librariesPath,
}: {
  url: string;
  sha1?: string;
  minecraftVersion: string;
  librariesPath: string;
}): Promise<number | null> {
  const mappings = await loadGenerationMappings(
    minecraftVersion,
    librariesPath,
  );
  const destination = path.join(
    os.tmpdir(),
    "grubie-ornithe-probe",
    `${randomUUID()}.jar`,
  );

  try {
    await new Downloader(1).downloadFiles([
      {
        url,
        destination,
        sha1,
        group: "mods",
        options: { silent: true },
      },
    ]);
    if (!(await fs.pathExists(destination))) {
      throw new Error(`Mod file was not downloaded: ${url}`);
    }
    const sample = await sampleModClasses(destination);
    return classifyGeneration(sample.classes, mappings);
  } finally {
    await fs.remove(destination).catch(() => {});
  }
}

export function detectFileGeneration(options: {
  url: string;
  sha1?: string;
  minecraftVersion: string;
  librariesPath: string;
}): Promise<number | null> {
  const key = `${options.minecraftVersion}\n${options.sha1 || options.url}`;
  let cached = fileGenerationCache.get(key);
  if (!cached) {
    cached = probeFileGeneration(options);
    cached.catch(() => fileGenerationCache.delete(key));
    fileGenerationCache.set(key, cached);
  }
  return cached;
}
