import path from "path";
import fs from "fs-extra";
import {
  FOREIGN_LAUNCHERS,
  type ForeignInstanceSummary,
  type LauncherScanResult,
} from "@/types/LauncherImport";
import {
  type ForeignInstance,
  countContent,
  foreignInstanceId,
  isDirectory,
  listDirectories,
  parseProperties,
  readJsonFile,
  readTextFile,
} from "./common";
import { scanAtLauncherRoot } from "./formats/atlauncher";
import { scanCurseForgeRoot } from "./formats/curseforge";
import { carbonRuntimeRoot, scanGdCarbonRoot, scanGdLegacyRoot } from "./formats/gdlauncher";
import { isMmcRoot, scanMmcRoot } from "./formats/mmc";
import { scanModrinthRoot } from "./formats/modrinth";
import { type RootOwner, scanMinecraftRoot } from "./formats/vanilla";
import {
  type LocateEnv,
  type RootCandidate,
  curseForgeRootOverride,
  legacyOwner,
  minecraftCandidates,
  staticCandidates,
  tlauncherOwner,
} from "./locate";
import { iconDataUrl } from "./plan";

const registry = new Map<string, ForeignInstance>();
const manualCandidates: RootCandidate[] = [];

export function foreignInstanceById(id: string): ForeignInstance | undefined {
  return registry.get(id);
}

function isInside(child: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(child));
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function scanCandidate(candidate: RootCandidate): Promise<ForeignInstance[]> {
  switch (candidate.kind) {
    case "mmc":
      if (!candidate.instancesDir && !(await isMmcRoot(candidate.root, candidate.launcher))) {
        return [];
      }
      return scanMmcRoot(candidate.root, candidate.launcher, candidate.instancesDir);
    case "atlauncher":
      return scanAtLauncherRoot(candidate.root);
    case "gdlegacy":
      return scanGdLegacyRoot(candidate.root);
    case "gdcarbon":
      return scanGdCarbonRoot(
        candidate.runtime ? candidate.root : await carbonRuntimeRoot(candidate.root),
      );
    case "curseforge":
      return scanCurseForgeRoot(candidate.root, candidate.instancesDir);
    case "modrinth":
      return (await fs.pathExists(path.join(candidate.root, "app.db")))
        ? scanModrinthRoot(candidate.root)
        : [];
    case "minecraft":
      return scanMinecraftRoot(candidate.root, candidate.owners);
  }
}

function candidateKey(candidate: RootCandidate): string {
  const extra =
    candidate.kind === "mmc"
      ? `${candidate.launcher}|${candidate.instancesDir ?? ""}`
      : candidate.kind === "curseforge"
        ? (candidate.instancesDir ?? "")
        : "";
  return `${candidate.kind}\0${path.resolve(candidate.root).toLowerCase()}\0${extra.toLowerCase()}`;
}

async function summarize(id: string, instance: ForeignInstance): Promise<ForeignInstanceSummary> {
  return {
    id,
    launcher: instance.launcher,
    name: instance.name,
    minecraftVersion: instance.minecraftVersion,
    loader: instance.loader,
    loaderVersion: instance.loaderVersion,
    counts: await countContent(instance),
    memoryMb: instance.memoryMb,
    hasJvmArgs: instance.jvmArgs.length > 0,
    lastPlayed: instance.lastPlayed,
    icon: await iconDataUrl(instance),
    sharedGameDir: instance.sharedGameDir,
  };
}

function launcherOrder(summary: ForeignInstanceSummary): number {
  return FOREIGN_LAUNCHERS.indexOf(summary.launcher);
}

export async function scanCandidates(
  candidates: RootCandidate[],
  excludeRoot?: string,
): Promise<LauncherScanResult> {
  const unique = new Map<string, RootCandidate>();
  for (const candidate of candidates) {
    if (excludeRoot && isInside(candidate.root, excludeRoot)) continue;
    unique.set(candidateKey(candidate), candidate);
  }

  registry.clear();
  const summaries: ForeignInstanceSummary[] = [];
  const roots: LauncherScanResult["roots"] = [];

  for (const candidate of unique.values()) {
    const instances = await scanCandidate(candidate).catch(() => [] as ForeignInstance[]);
    for (const instance of instances) {
      if (excludeRoot && isInside(instance.gameDir, excludeRoot)) continue;
      const id = foreignInstanceId(instance);
      if (registry.has(id)) continue;
      registry.set(id, instance);
      summaries.push(await summarize(id, instance));
      if (!roots.some((root) => root.launcher === instance.launcher && root.root === instance.root)) {
        roots.push({ launcher: instance.launcher, root: instance.root });
      }
    }
  }

  summaries.sort(
    (a, b) =>
      launcherOrder(a) - launcherOrder(b) ||
      (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) ||
      a.name.localeCompare(b.name),
  );

  return { instances: summaries, roots };
}

export async function scanLaunchers(env: LocateEnv, excludeRoot?: string): Promise<LauncherScanResult> {
  const candidates: RootCandidate[] = [...staticCandidates(env)];
  const curseForgeRoot = await curseForgeRootOverride(env).catch(() => undefined);
  if (curseForgeRoot) candidates.push({ kind: "curseforge", root: curseForgeRoot });
  candidates.push(...(await minecraftCandidates(env)), ...manualCandidates);
  return scanCandidates(candidates, excludeRoot);
}

async function childrenWith(folder: string, file: string): Promise<boolean> {
  for (const child of (await listDirectories(folder)).slice(0, 200)) {
    if (await fs.pathExists(path.join(folder, child, file))) return true;
  }
  return false;
}

async function minecraftOwners(folder: string): Promise<RootOwner[]> {
  const owners: RootOwner[] = [];
  for (const name of ["tl.properties", "legacy.properties"]) {
    const text = await readTextFile(path.join(folder, name));
    if (text !== null) owners.push(legacyOwner(parseProperties(text), folder));
  }
  for (const versionId of (await listDirectories(path.join(folder, "versions"))).slice(0, 500)) {
    if (await fs.pathExists(path.join(folder, "versions", versionId, "TLauncherAdditional.json"))) {
      owners.push(tlauncherOwner({}, folder));
      break;
    }
  }
  owners.push({ launcher: "official" });
  return owners;
}

export async function detectFolder(folder: string): Promise<RootCandidate[]> {
  const found: RootCandidate[] = [];
  const has = (...parts: string[]) => fs.pathExists(path.join(folder, ...parts));

  if (await isMmcRoot(folder, "prism")) found.push({ kind: "mmc", launcher: "prism", root: folder });
  if (await isMmcRoot(folder, "multimc")) found.push({ kind: "mmc", launcher: "multimc", root: folder });
  if (await has("configs", "ATLauncher.json")) found.push({ kind: "atlauncher", root: folder });
  if (await has("app.db")) found.push({ kind: "modrinth", root: folder });
  if (await childrenWith(path.join(folder, "Instances"), "minecraftinstance.json")) {
    found.push({ kind: "curseforge", root: folder });
  }
  if ((await has("runtime_path_override")) || (await has("data", "instances"))) {
    found.push({ kind: "gdcarbon", root: folder });
  }
  if (await isDirectory(path.join(folder, "versions"))) {
    found.push({ kind: "minecraft", root: folder, owners: await minecraftOwners(folder) });
  }

  const instancesDir = path.join(folder, "instances");
  if (found.length === 0 && (await isDirectory(instancesDir))) {
    if (await childrenWith(instancesDir, "mmc-pack.json")) {
      found.push({ kind: "mmc", launcher: "prism", root: folder, instancesDir });
    } else if (await childrenWith(instancesDir, "config.json")) {
      found.push({ kind: "gdlegacy", root: folder });
    } else if (await childrenWith(instancesDir, "instance.json")) {
      found.push({ kind: "atlauncher", root: folder }, { kind: "gdcarbon", root: folder, runtime: true });
    }
  }

  if (found.length === 0) {
    if (await childrenWith(folder, "mmc-pack.json")) {
      found.push({ kind: "mmc", launcher: "prism", root: path.dirname(folder), instancesDir: folder });
    } else if (await childrenWith(folder, "minecraftinstance.json")) {
      found.push({ kind: "curseforge", root: path.dirname(folder), instancesDir: folder });
    } else if (await has("mmc-pack.json")) {
      const parent = path.dirname(folder);
      found.push({ kind: "mmc", launcher: "prism", root: path.dirname(parent), instancesDir: parent });
    } else if (await has("minecraftinstance.json")) {
      const parent = path.dirname(folder);
      found.push({ kind: "curseforge", root: path.dirname(parent), instancesDir: parent });
    } else if (await readJsonFile(path.join(folder, "instance.json"))) {
      const parent = path.dirname(folder);
      found.push({ kind: "atlauncher", root: path.dirname(parent) });
    }
  }

  return found;
}

export async function scanWithFolder(
  folder: string,
  env: LocateEnv,
  excludeRoot?: string,
): Promise<{ result: LauncherScanResult; added: number }> {
  const detected = await detectFolder(folder);
  const keys = new Set(manualCandidates.map(candidateKey));
  for (const candidate of detected) {
    if (!keys.has(candidateKey(candidate))) manualCandidates.push(candidate);
  }
  const before = new Set(registry.keys());
  const result = await scanLaunchers(env, excludeRoot);
  const added = result.instances.filter((instance) => !before.has(instance.id)).length;
  return { result, added: detected.length === 0 ? 0 : added };
}
