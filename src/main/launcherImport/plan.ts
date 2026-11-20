import os from "os";
import path from "path";
import fs from "fs-extra";
import pLimit from "p-limit";
import { pathToFileURL } from "url";
import type { ForeignImportPlan, ImportPart } from "@/types/LauncherImport";
import {
  type ILocalIdentifyMatch,
  type ILocalProject,
  type IModpack,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { filterRunArguments, isMemoryArgument } from "@/shared/runArguments";
import { ModManager } from "../services/ModManager";
import { getSha1 } from "../utilities/files";
import {
  checkLocalMod,
  getModEnvironment,
  readPrismInstance,
  resolvePrismRuntime,
  type PrismRuntime,
} from "../utilities/modManager";
import type { ForeignInstance } from "./common";
import { collectCopyItems, totalBytes } from "./content";

const DISABLED = ".disabled";

const CONTENT_FOLDERS: { folder: string; type: ProjectType; part: ImportPart }[] = [
  { folder: "mods", type: ProjectType.MOD, part: "mods" },
  { folder: "resourcepacks", type: ProjectType.RESOURCEPACK, part: "packs" },
  { folder: "shaderpacks", type: ProjectType.SHADER, part: "packs" },
];

const CONTENT_FILE: Record<string, RegExp> = {
  mods: /\.(?:jar|zip|litemod)$/i,
  resourcepacks: /\.zip$/i,
  shaderpacks: /\.zip$/i,
};

interface ContentFile {
  key: string;
  path: string;
  target: string;
  fileName: string;
  disabled: boolean;
  type: ProjectType;
  size: number;
  sha1: string;
}

async function listContentFiles(
  instance: ForeignInstance,
  parts: ReadonlySet<ImportPart>,
): Promise<ContentFile[]> {
  const files: Omit<ContentFile, "sha1">[] = [];
  const sources: { dir: string; folder: string; type: ProjectType; forceDisabled: boolean }[] = [];

  for (const { folder, type, part } of CONTENT_FOLDERS) {
    if (!parts.has(part) || (part === "mods" && instance.skipMods)) continue;
    sources.push({ dir: path.join(instance.gameDir, folder), folder, type, forceDisabled: false });
  }
  if (parts.has("mods") && !instance.skipMods && instance.disabledModsDir) {
    sources.push({
      dir: instance.disabledModsDir,
      folder: "mods",
      type: ProjectType.MOD,
      forceDisabled: true,
    });
  }

  for (const source of sources) {
    const entries = await fs
      .readdir(source.dir, { withFileTypes: true })
      .catch(() => [] as fs.Dirent[]);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const disabled = source.forceDisabled || entry.name.toLowerCase().endsWith(DISABLED);
      const fileName = entry.name.toLowerCase().endsWith(DISABLED)
        ? entry.name.slice(0, -DISABLED.length)
        : entry.name;
      if (!CONTENT_FILE[source.folder].test(fileName)) continue;

      const full = path.join(source.dir, entry.name);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      files.push({
        key: `${source.folder}/${entry.name}`,
        path: full,
        target: path.join(
          instance.gameDir,
          source.folder,
          disabled ? `${fileName}${DISABLED}` : fileName,
        ),
        fileName,
        disabled,
        type: source.type,
        size: stat.size,
      });
    }
  }

  const limit = pLimit(4);
  const hashed = await Promise.all(
    files.map((file) =>
      limit(async () => ({ ...file, sha1: await getSha1(file.path).catch(() => "") })),
    ),
  );

  const seen = new Set<string>();
  return hashed.filter((file) => {
    const key = `${file.type}:${file.fileName.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function identifiedProject(file: ContentFile, match: ILocalIdentifyMatch): ILocalProject | null {
  const catalogFile = match.version.files[0];
  if (!catalogFile) return null;

  return {
    title: match.project.title,
    description: match.project.description,
    projectType: file.type,
    iconUrl: match.project.iconUrl,
    url: match.project.url,
    provider: match.provider,
    id: match.project.id,
    version: {
      id: match.version.id,
      dependencies: [],
      files: [
        {
          filename: file.fileName,
          size: file.size,
          sha1: file.sha1 || catalogFile.sha1,
          url: catalogFile.url,
          isServer: catalogFile.isServer,
          isClient: catalogFile.isClient,
          ...(catalogFile.url.startsWith("blocked::") ? { localPath: file.target } : {}),
          ...(file.disabled ? { disabled: true } : {}),
        },
      ],
    },
    updatedAt: new Date().toISOString(),
  };
}

async function localProject(file: ContentFile, takenIds: Set<string>): Promise<ILocalProject> {
  const info = await checkLocalMod(file.path).catch(() => null);
  let isServer = true;
  let isClient = true;
  if (file.type === ProjectType.MOD) {
    const environment = await getModEnvironment(file.path).catch(() => null);
    isServer = environment !== "client";
    isClient = environment !== "server";
  }

  const preferred = info?.id || file.fileName;
  const id = takenIds.has(`${file.type}:${preferred}`) ? file.fileName : preferred;
  takenIds.add(`${file.type}:${id}`);

  return {
    title: info?.name || file.fileName,
    description: info?.description || "",
    projectType: file.type,
    iconUrl: info?.icon || "",
    url: "",
    provider: Provider.LOCAL,
    id,
    version: {
      id: info?.version || "local",
      dependencies: [],
      files: [
        {
          filename: file.fileName,
          size: file.size,
          sha1: file.sha1,
          url: pathToFileURL(file.target).href,
          localPath: file.target,
          isServer,
          isClient,
          ...(file.disabled ? { disabled: true } : {}),
        },
      ],
    },
  };
}

export async function buildContentList(
  instance: ForeignInstance,
  parts: ReadonlySet<ImportPart>,
  minecraftVersion: string,
): Promise<{ mods: ILocalProject[]; identified: number; checked: boolean }> {
  const files = await listContentFiles(instance, parts);
  if (files.length === 0) return { mods: [], identified: 0, checked: true };

  let checked = true;
  const result = await ModManager.identifyLocalFiles(
    files.map((file) => ({
      key: file.key,
      path: file.path,
      sha1: file.sha1,
      projectType: file.type,
      gameVersion: minecraftVersion,
    })),
  ).catch(() => {
    checked = false;
    return { matches: [] as ILocalIdentifyMatch[], unavailable: [] };
  });
  if (result.unavailable.length > 0) checked = false;

  const matches = new Map(result.matches.map((match) => [match.key, match]));
  const takenProjects = new Set<string>();
  const takenIds = new Set<string>();
  const mods: ILocalProject[] = [];
  let identified = 0;

  for (const file of files) {
    const match = matches.get(file.key);
    const projectKey = match ? `${match.provider}:${match.project.id}` : "";
    const project = match && !takenProjects.has(projectKey) ? identifiedProject(file, match) : null;
    if (project) {
      takenProjects.add(projectKey);
      identified++;
      mods.push(project);
      continue;
    }
    mods.push(await localProject(file, takenIds));
  }

  return { mods, identified, checked };
}

const GC_SELECTOR = /^-XX:\+Use\w*GC$/;

export function importedJvm(args: string[]): { jvmArguments: string; keepOptimizedJvm: boolean } {
  const { safe } = filterRunArguments(args, "jvm");
  const kept = safe.filter((arg) => !isMemoryArgument(arg));
  return {
    jvmArguments: kept.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" "),
    keepOptimizedJvm: !kept.some((arg) => GC_SELECTOR.test(arg)),
  };
}

export function importedMemory(memoryMb: number | undefined): number | undefined {
  if (!memoryMb) return undefined;
  const totalMb = Math.floor(os.totalmem() / (1024 * 1024));
  return Math.min(Math.max(1024, Math.round(memoryMb)), Math.max(1024, totalMb));
}

const ICON_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const MAX_ICON_BYTES = 256 * 1024;

export async function iconDataUrl(instance: ForeignInstance): Promise<string | undefined> {
  if (instance.iconData) return instance.iconData;
  if (!instance.iconPath) return undefined;
  const type = ICON_TYPES[path.extname(instance.iconPath).toLowerCase()];
  if (!type) return undefined;
  try {
    const stat = await fs.stat(instance.iconPath);
    if (!stat.isFile() || stat.size > MAX_ICON_BYTES) return undefined;
    const data = await fs.readFile(instance.iconPath);
    return `data:${type};base64,${data.toString("base64")}`;
  } catch {
    return undefined;
  }
}

async function runtimeOf(instance: ForeignInstance, stagingDir: string): Promise<PrismRuntime> {
  if (instance.prismLayout) {
    const info = await readPrismInstance(instance.instanceDir);
    if (info) {
      return resolvePrismRuntime(info, instance.instanceDir, path.join(stagingDir, "overrides"));
    }
  }
  return {
    version: instance.minecraftVersion,
    loader: instance.loader,
    loaderVersion: instance.loaderVersion,
  };
}

export async function planImport(
  id: string,
  instance: ForeignInstance,
  parts: ReadonlySet<ImportPart>,
  stagingDir: string,
): Promise<ForeignImportPlan> {
  await fs.ensureDir(stagingDir);
  const runtime = await runtimeOf(instance, stagingDir);
  const { mods, identified, checked } = await buildContentList(instance, parts, runtime.version);
  const bytes = totalBytes(await collectCopyItems(instance, parts));
  const jvm = parts.has("memory") ? importedJvm(instance.jvmArgs) : null;

  const modpack: IModpack = {
    name: instance.name,
    ...runtime,
    image: await iconDataUrl(instance),
    folderPath: stagingDir,
    mods,
  };

  return {
    id,
    modpack,
    sourceRoot: instance.gameDir,
    bytes,
    memoryMb: parts.has("memory") ? importedMemory(instance.memoryMb) : undefined,
    jvmArguments: jvm?.jvmArguments ?? "",
    keepOptimizedJvm: jvm?.keepOptimizedJvm ?? true,
    identified,
    catalogChecked: checked,
  };
}
