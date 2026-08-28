import {
  DependencyType,
  IFabricMod,
  ILocalFileInfo,
  ILocalProject,
  IModpack,
  IModpackExtraFile,
  IProject,
  IVersion,
  IVersionDependency,
  ProjectType,
  Provider,
  VersionReleaseType,
} from "@/types/ModManager";
import {
  IModpack as CurseForgeModpack,
  FileRelationType,
  FileReleaseType,
  IFile,
  IMod,
  ModLoaderType,
  ModTypeClassIds,
} from "@/types/CurseForge";
import {
  IResultProject,
  IModpack as ModrinthModpack,
  IProject as IModrinthProject,
  IVersion as ModrinthVersion,
} from "@/types/Modrinth";
import { ServerCore } from "@/types/Server";
import { getFilesRecursively, getSha1 } from "./files";
import { getLauncherPaths } from "./other";
import { Loader } from "@/types/Loader";
import { CurseForge } from "../services/CurseForge";
import { Modrinth } from "../services/Modrinth";
import path from "path";
import fs from "fs-extra";
import toml from "toml";
import axios from "axios";
import pLimit from "p-limit";
import { ModManager } from "../services/ModManager";
import { app } from "electron";
import { createHash, randomUUID } from "crypto";
import { pathToFileURL } from "url";
import { parseCurseForgeLoaderId } from "@/shared/loaderVersions";
import { resolveDownloadCandidates } from "./mirrors";
import {
  getDownloadSource,
  getMojangReachable,
  isMirrorDisabled,
} from "./mirrorState";

const FORGE_CDN_HOSTS = [
  "https://edge.forgecdn.net",
  "https://mediafilez.forgecdn.net",
];

export function buildForgeCdnUrls(fileId: number, fileName: string): string[] {
  if (!Number.isFinite(fileId) || fileId <= 0 || !fileName) return [];

  const dir = Math.floor(fileId / 1000);
  const sub = fileId % 1000;
  const encoded = encodeURIComponent(fileName);

  return FORGE_CDN_HOSTS.map(
    (host) => `${host}/files/${dir}/${sub}/${encoded}`,
  );
}

const cfCdnUrlCache = new Map<string, Promise<string | null>>();
const cfCdnResolveLimit = pLimit(6);

export async function resolveCurseForgeCdnUrl(
  fileId: number,
  fileName: string,
): Promise<string | null> {
  const cacheKey = `${fileId}:${fileName}`;
  const cached = cfCdnUrlCache.get(cacheKey);
  if (cached) return cached;

  const pending = cfCdnResolveLimit(() =>
    headForgeCdnCandidates(fileId, fileName),
  );
  cfCdnUrlCache.set(cacheKey, pending);

  const resolved = await pending;
  if (!resolved) cfCdnUrlCache.delete(cacheKey);

  return resolved;
}

async function headForgeCdnCandidates(
  fileId: number,
  fileName: string,
): Promise<string | null> {
  const candidates = buildForgeCdnUrls(fileId, fileName).flatMap((url) =>
    resolveDownloadCandidates(
      url,
      getDownloadSource(),
      getMojangReachable(),
      isMirrorDisabled(),
    ),
  );

  for (const url of Array.from(new Set(candidates))) {
    try {
      const response = await axios.head(url, {
        timeout: 6000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      if (response.status >= 200 && response.status < 300) return url;
    } catch {
      continue;
    }
  }

  return null;
}

export function classIdToProjectType(
  classId: number | null | undefined,
): ProjectType | null {
  switch (classId) {
    case ModTypeClassIds.mod:
      return ProjectType.MOD;
    case ModTypeClassIds.resourcepack:
      return ProjectType.RESOURCEPACK;
    case ModTypeClassIds.shader:
      return ProjectType.SHADER;
    case ModTypeClassIds.modpack:
      return ProjectType.MODPACK;
    case ModTypeClassIds.plugin:
      return ProjectType.PLUGIN;
    case ModTypeClassIds.world:
      return ProjectType.WORLD;
    case ModTypeClassIds.datapack:
      return ProjectType.DATAPACK;
    default:
      return null;
  }
}

export async function cfModpackToModpack(
  modpack: CurseForgeModpack,
): Promise<IModpack> {
  const mods =
    (await CurseForge.getMods(modpack.files.map((file) => file.projectID))) ??
    [];
  const files = await CurseForge.getFiles(
    modpack.files.map((file) => file.fileID),
  );
  const { loader, loaderVersion } = parseCurseForgeLoaderId(
    modpack.minecraft.modLoaders?.[0]?.id,
  );

  if (modpack.files.length > 0 && mods.length === 0) {
    throw new Error(
      "CurseForge returned no project metadata for this modpack. Try again later.",
    );
  }

  const modpackFiles: ILocalProject[] = [];
  const missingProjects: number[] = [];

  const filesById = new Map<number, IFile>();
  for (const file of files) filesById.set(file.id, file);

  const pendingFileIds = new Map<number, number>();
  for (const f of modpack.files) {
    if (f.required === false) continue;
    if (filesById.has(f.fileID) || pendingFileIds.has(f.fileID)) continue;
    if (!mods.some((m) => m.id == f.projectID)) continue;
    pendingFileIds.set(f.fileID, f.projectID);
  }

  if (pendingFileIds.size > 0) {
    const limit = pLimit(6);
    const fetched = await Promise.all(
      [...pendingFileIds].map(([fileId, projectId]) =>
        limit(async () => ({
          fileId,
          file: await CurseForge.getFile(projectId, fileId),
        })),
      ),
    );

    for (const { fileId, file } of fetched) {
      if (file) filesById.set(fileId, file);
    }
  }

  for (const f of modpack.files) {
    if (f.required === false) continue;

    const mod = mods.find((m) => m.id == f.projectID);
    if (!mod) {
      missingProjects.push(f.projectID);
      continue;
    }

    const file: IFile | null | undefined = filesById.get(f.fileID);

    if (!file) {
      throw new Error(
        `CurseForge file ${f.fileID} for project ${f.projectID} was not found.`,
      );
    }

    const mappedProjectType = classIdToProjectType(mod.classId);
    if (!mappedProjectType) {
      console.warn(
        `[modpack] unknown CurseForge classId ${mod.classId} for ${mod.name}, treating as mod`,
      );
    }
    const projectType = mappedProjectType ?? ProjectType.MOD;
    const websiteUrl = mod.links?.websiteUrl ?? "";

    modpackFiles.push({
      description: mod.summary,
      iconUrl: mod.logo?.url || "",
      title: mod.name,
      projectType,
      url: websiteUrl,
      provider: Provider.CURSEFORGE,
      id: mod.id.toString(),
      version: {
        id: file.id.toString(),
        dependencies: [],
        files: [
          {
            filename:
              projectType != ProjectType.WORLD ? file.fileName : file.fileName,
            size: file.fileLength,
            url:
              file.downloadUrl ||
              `blocked::${websiteUrl}/download/${file.id}`,
            sha1: file.hashes.find((h) => h.algo == 1)?.value || "",
            isServer: true,
            isClient: true,
          },
        ],
      },
    });
  }

  if (missingProjects.length > 0) {
    throw new Error(
      `CurseForge did not return ${missingProjects.length} of ${modpack.files.length} projects for this modpack. Try again later.`,
    );
  }

  return {
    name: modpack.name,
    version: modpack.minecraft.version,
    loader,
    loaderVersion,
    mods: modpackFiles,
    folderPath: "",
    image: undefined,
  };
}

export async function mrModpackToModpack(
  modpack: ModrinthModpack,
): Promise<IModpack> {
  const depObj =
    modpack.dependencies &&
    typeof modpack.dependencies === "object" &&
    !Array.isArray(modpack.dependencies)
      ? modpack.dependencies
      : null;

  function getLoaderName(): Loader | null {
    const loaders = ["forge", "neoforge", "fabric-loader", "quilt-loader"];

    const found = depObj ? loaders.find((loader) => loader in depObj) : null;
    return (found?.replace("-loader", "") as Loader) || null;
  }

  const rawLoaderKey = depObj
    ? ["forge", "neoforge", "fabric-loader", "quilt-loader"].find(
        (loader) => loader in depObj,
      )
    : null;
  const loaderVersion = rawLoaderKey ? depObj?.[rawLoaderKey] : undefined;

  return {
    name: modpack.name,
    folderPath: "",
    image: undefined,
    version: modpack.dependencies["minecraft"],
    loader: getLoaderName() || undefined,
    loaderVersion,
    mods: [],
    versionId: modpack.versionId,
  };
}

export function loaderToCfLoader(loader: Loader | ServerCore): ModLoaderType {
  if (loader == "fabric") return ModLoaderType.Fabric;
  if (loader == "forge") return ModLoaderType.Forge;
  if (loader == "neoforge") return ModLoaderType.NeoForge;
  if (loader == "quilt") return ModLoaderType.Quilt;

  return ModLoaderType.Any;
}

export function cfModToProject(mod: IMod): IProject {
  return {
    url: mod.links?.websiteUrl ?? "",
    description: mod.summary,
    iconUrl: mod.logo?.url || "",
    id: mod.id.toString(),
    projectType: classIdToProjectType(mod.classId) ?? ProjectType.MOD,
    title: mod.name,
    provider: Provider.CURSEFORGE,
    versions: [],
    body: "",
    gallery: (mod.screenshots ?? []).map((s) => ({
      ...s,
    })),
    stats: {
      downloads: mod.downloadCount,
      follows: mod.thumbsUpCount,
      dateCreated: mod.dateCreated,
      dateModified: mod.dateModified,
    },
  };
}

export function mrIsResultProject(project: any): project is IResultProject {
  return (project as IResultProject).project_id !== undefined;
}

export function mrProjectToProject(
  project: IResultProject | IModrinthProject,
  projectType: ProjectType,
): IProject {
  let body = "";

  if ("body" in project) {
    body = project.body;
  }

  const gallery: IProject["gallery"] = [];

  if ("gallery" in project && Array.isArray(project.gallery)) {
    for (const image of project.gallery) {
      if (typeof image === "string") {
        gallery.push({ url: image, description: "", title: "" });
      } else if (image && typeof image === "object" && "url" in image) {
        gallery.push({
          url: (image as any).raw_url || (image as any).url,
          description: (image as any).description || "",
          title: (image as any).title || "",
        });
      }
    }
  }

  const raw = project as any;

  return {
    url: `https://modrinth.com/${(project as any).project_type}/${(project as any).slug}`,
    description: (project as any).description,
    iconUrl: (project as any).icon_url,
    id: mrIsResultProject(project)
      ? (project as any).project_id
      : (project as any).id,
    projectType,
    title: (project as any).title,
    provider: Provider.MODRINTH,
    versions: [],
    body,
    gallery,
    stats: {
      downloads: raw.downloads,
      follows: raw.follows ?? raw.followers,
      dateCreated: raw.date_created ?? raw.published,
      dateModified: raw.date_modified ?? raw.updated,
    },
  };
}

export function cfFileToVersion(
  file: IFile,
  projectType: ProjectType,
  modUrl: string,
): IVersion {
  return {
    id: file.id.toString(),
    name:
      projectType != ProjectType.MODPACK
        ? file.displayName
        : `${file.displayName} for ${file.gameVersions.slice(0, 2).join(" / ")}`,
    dependencies: file.dependencies
      .map((d) => {
        const relation = cfRelationTypeToVersionDependency(d.relationType);

        if (!relation) return;

        return {
          projectId: d.modId.toString(),
          versionId: null,
          project: null,
          relationType: relation,
        };
      })
      .filter((d) => d !== undefined) as IVersionDependency[],
    downloads: file.downloadCount,
    releaseType: cfReleaseTypeToReleaseType(file.releaseType),
    datePublished: file.fileDate,
    gameVersions: (file.gameVersions || []).filter((v) => /^\d/.test(v)),
    files: [
      {
        filename:
          projectType != ProjectType.WORLD ? file.fileName : file.fileName,
        size: file.fileLength,
        url: file.downloadUrl || `blocked::${modUrl}/download/${file.id}`,
        isServer: true,
        sha1: file.hashes.find((h) => h.algo == 1)?.value || "",
      },
    ],
  };
}

function cfReleaseTypeToReleaseType(
  releaseType: FileReleaseType | undefined,
): VersionReleaseType | undefined {
  if (releaseType == FileReleaseType.Release) return "release";
  if (releaseType == FileReleaseType.Beta) return "beta";
  if (releaseType == FileReleaseType.Alpha) return "alpha";
  return undefined;
}

export function mrVersionToVersion(
  version: ModrinthVersion,
  isServer: boolean,
  projectType: ProjectType,
  isClient: boolean = true,
): IVersion {
  return {
    id: version.id,
    versionNumber: version.version_number,
    name:
      projectType != ProjectType.MODPACK
        ? version.name
        : `${version.name} / ${version.loaders[0]}`,
    dependencies: version.dependencies
      .map((d) => {
        if (d.project_id == null) return;
        return {
          projectId: d.project_id,
          versionId: d.version_id,
          project: null,
          relationType: d.dependency_type as DependencyType,
        };
      })
      .filter((d) => d !== undefined) as IVersionDependency[],
    downloads: version.downloads,
    releaseType: version.version_type as VersionReleaseType,
    datePublished: version.date_published,
    gameVersions: version.game_versions,
    changelog: version.changelog || undefined,
    files: version.files
      .filter((f) => (version.files.length > 1 ? f.primary : true))
      .map((f) => ({
        filename: f.filename,
        size: f.size,
        isServer,
        isClient,
        url: f.url,
        sha1: f.hashes.sha1,
      })),
  };
}

export function sortVersionsByDate(versions: IVersion[]): IVersion[] {
  return versions
    .map((version, index) => ({ version, index }))
    .sort((a, b) => {
      const aTime = Date.parse(a.version.datePublished ?? "");
      const bTime = Date.parse(b.version.datePublished ?? "");
      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);

      if (aValid && bValid && aTime !== bTime) return bTime - aTime;
      if (aValid !== bValid) return aValid ? -1 : 1;

      return a.index - b.index;
    })
    .map((entry) => entry.version);
}

export function cfRelationTypeToVersionDependency(
  relationType: FileRelationType,
): DependencyType | null {
  if (relationType == FileRelationType.RequiredDependency)
    return DependencyType.REQUIRED;
  if (relationType == FileRelationType.OptionalDependency)
    return DependencyType.OPTIONAL;
  if (relationType == FileRelationType.Incompatible)
    return DependencyType.INCOMPATIBLE;
  if (relationType == FileRelationType.EmbeddedLibrary)
    return DependencyType.EMBEDDED;

  return null;
}

export async function cacheModIcon(
  data: Buffer,
  extension: string,
): Promise<string | null> {
  const { cache } = getLauncherPaths();
  if (!cache) return null;

  const ext = extension.toLowerCase() || ".png";
  const hash = createHash("sha1").update(data).digest("hex");
  const iconsDir = path.join(cache, "mod-icons");
  const cachedPath = path.join(iconsDir, `${hash}${ext}`);

  if (!(await fs.pathExists(cachedPath))) {
    await fs.ensureDir(iconsDir);
    await fs.writeFile(cachedPath, data);
  }

  return toModIconUrl(cachedPath);
}

export function toModIconUrl(filePath: string): string {
  return `app://media/?p=${encodeURIComponent(filePath)}`;
}

const MOD_META_CACHE_LIMIT = 1000;
const modMetaCache = new Map<string, ILocalFileInfo>();

function rememberModMeta(key: string, info: ILocalFileInfo) {
  if (modMetaCache.size >= MOD_META_CACHE_LIMIT) {
    const oldest = modMetaCache.keys().next().value;
    if (oldest !== undefined) modMetaCache.delete(oldest);
  }

  modMetaCache.set(key, info);
}

function packKindFromEntries(entryNames: string[]): ProjectType {
  const normalized = entryNames.map((name) => name.split("\\").join("/"));

  if (normalized.some((name) => name.startsWith("shaders/"))) {
    return ProjectType.SHADER;
  }
  if (normalized.some((name) => name.startsWith("assets/"))) {
    return ProjectType.RESOURCEPACK;
  }
  if (normalized.some((name) => name.startsWith("data/"))) {
    return ProjectType.DATAPACK;
  }

  return ProjectType.RESOURCEPACK;
}

function isWorldArchive(entryNames: string[]): boolean {
  return entryNames.some((entryName) => {
    const parts = entryName.split("\\").join("/").split("/").filter(Boolean);
    if (parts.length !== 1 && parts.length !== 2) return false;
    return parts[parts.length - 1].toLowerCase() === "level.dat";
  });
}

async function readLocalModInfo(
  modPath: string,
  fileName: string,
  fileSize: number,
  sha1: string,
): Promise<ILocalFileInfo | null> {
  const fallback: ILocalFileInfo = {
    kind: null,
    description: "",
    filename: fileName,
    size: fileSize,
    id: fileName,
    name: fileName,
    path: modPath,
    url: "",
    version: null,
    sha1,
    icon: null,
  };

  const { openArchive, readEntryData } = await import("./archiver");
  const archive = await openArchive(modPath).catch(() => null);
  if (!archive) return null;

  const readEntry = async (entryName: string): Promise<Buffer | null> => {
    const entry = archive.getEntry(entryName);
    if (!entry) return null;
    return await readEntryData(entry).catch(() => null);
  };

  const readJsonEntry = async (entryName: string): Promise<any> => {
    const data = await readEntry(entryName);
    if (!data) return null;

    try {
      return JSON.parse(data.toString("utf-8"));
    } catch {
      return null;
    }
  };

  const readIconEntry = async (
    entryName: string | undefined | null,
  ): Promise<string | null> => {
    if (!entryName) return null;
    const data = await readEntry(entryName);
    if (!data) return null;

    return await cacheModIcon(data, path.extname(entryName)).catch(() => null);
  };

  for (const entryName of ["fabric.mod.json", "quilt.mod.json"]) {
    const fabricMod: IFabricMod | null = await readJsonEntry(entryName);
    if (!fabricMod) continue;

    return {
      ...fabricMod,
      kind: ProjectType.MOD,
      url: fabricMod.contact?.homepage || "",
      filename: fileName,
      size: fileSize,
      path: modPath,
      sha1,
      icon: await readIconEntry(fabricMod.icon),
    };
  }

  for (const entryName of [
    "META-INF/neoforge.mods.toml",
    "META-INF/mods.toml",
  ]) {
    const data = await readEntry(entryName);
    if (!data) continue;

    const modsToml = parseModsTomlText(data.toString("utf-8"));
    const mod = modsToml?.mods?.[0];
    if (!mod) continue;

    return {
      kind: ProjectType.MOD,
      description: mod.description,
      filename: fileName,
      size: fileSize,
      id: mod.modId,
      name: mod.displayName,
      path: modPath,
      url: mod.displayURL,
      version: null,
      sha1,
      icon: await readIconEntry(mod.logoFile),
    };
  }

  const packMcMeta: {
    pack: { description: { fallback: string } | string };
  } | null = await readJsonEntry("pack.mcmeta");

  if (packMcMeta?.pack) {
    const description =
      typeof packMcMeta.pack.description === "object"
        ? packMcMeta.pack.description.fallback
        : packMcMeta.pack.description;

    return {
      ...fallback,
      kind: packKindFromEntries(
        archive.getEntries().map((entry) => entry.entryName),
      ),
      description,
      icon:
        (await readIconEntry("logo.png")) ?? (await readIconEntry("pack.png")),
    };
  }

  if (isWorldArchive(archive.getEntries().map((entry) => entry.entryName))) {
    return { ...fallback, kind: ProjectType.WORLD };
  }

  return fallback;
}

export async function checkLocalMod(
  modPath: string,
): Promise<ILocalFileInfo | null> {
  try {
    const fileName = path.basename(modPath);
    if (!fileName) return null;

    const stats = await fs.stat(modPath);
    const cacheKey = `${path.resolve(modPath)}|${stats.mtimeMs}|${stats.size}`;

    const cached = modMetaCache.get(cacheKey);
    if (cached) return cached;

    const info = await readLocalModInfo(
      modPath,
      fileName,
      stats.size,
      await getSha1(modPath),
    );
    if (!info) return null;

    rememberModMeta(cacheKey, info);

    return info;
  } catch {
    return null;
  }
}

function parseModsTomlText(content: string): any {
  try {
    return toml.parse(content);
  } catch {
    return null;
  }
}

async function parseModsToml(filePath: string): Promise<any> {
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    return parseModsTomlText(fileContent);
  } catch {
    return null;
  }
}

export type ModEnvironment = "client" | "server" | "both";

function forgeTomlEnvironment(parsed: any): ModEnvironment | null {
  if (!parsed || typeof parsed !== "object") return null;

  const scopes = [parsed, ...(Array.isArray(parsed.mods) ? parsed.mods : [])];
  for (const scope of scopes) {
    if (scope?.clientSideOnly === true) return "client";
    if (scope?.serverSideOnly === true) return "server";
  }

  const deps = parsed.dependencies;
  if (deps && typeof deps === "object") {
    for (const depList of Object.values(deps)) {
      if (!Array.isArray(depList)) continue;
      for (const dep of depList) {
        if (String(dep?.modId ?? "").toLowerCase() !== "minecraft") continue;
        const side = String(dep?.side ?? "").toUpperCase();
        if (side === "CLIENT") return "client";
        if (side === "SERVER") return "server";
      }
    }
  }

  return "both";
}

const PROVIDED_MOD_IDS = new Set([
  "minecraft",
  "java",
  "fabricloader",
  "forge",
  "neoforge",
  "quilt_loader",
  "quilt_base",
]);

function isProvidedModId(id: string): boolean {
  return PROVIDED_MOD_IDS.has(id.toLowerCase());
}

function fabricDepIds(depends: unknown): string[] {
  if (!depends || typeof depends !== "object") return [];
  return Object.keys(depends).filter((id) => id && !isProvidedModId(id));
}

function quiltDepIds(depends: unknown): string[] {
  if (!Array.isArray(depends)) return [];
  const ids: string[] = [];
  for (const dep of depends) {
    if (dep && typeof dep === "object" && dep.optional === true) continue;
    const id =
      typeof dep === "string"
        ? dep
        : typeof dep?.id === "string"
          ? dep.id
          : null;
    if (id && !isProvidedModId(id)) ids.push(id);
  }
  return ids;
}

function forgeDepIds(dependencies: unknown): string[] {
  if (!dependencies || typeof dependencies !== "object") return [];
  const ids: string[] = [];
  for (const depList of Object.values(
    dependencies as Record<string, unknown>,
  )) {
    if (!Array.isArray(depList)) continue;
    for (const dep of depList) {
      // Forge (mods.toml) marks optional deps with `mandatory=false`; NeoForge
      // uses `type` = required/optional/incompatible/discouraged. Only hard
      // ("required") deps count — incompatible deps must never be treated as
      // dependencies, or the mod gets pruned when its conflict is excluded.
      if (dep?.mandatory === false) continue;
      const type = String(dep?.type ?? "").toLowerCase();
      if (
        type === "optional" ||
        type === "incompatible" ||
        type === "discouraged"
      ) {
        continue;
      }
      const id = String(dep?.modId ?? "").trim();
      if (id && !isProvidedModId(id)) ids.push(id);
    }
  }
  return ids;
}

export interface ModDescriptor {
  environment: ModEnvironment | null;
  modId: string | null;
  hardDeps: string[];
}

const MOD_DESCRIPTOR_CACHE_LIMIT = 1000;
const modDescriptorCache = new Map<string, ModDescriptor>();

function rememberModDescriptor(key: string, descriptor: ModDescriptor) {
  if (modDescriptorCache.size >= MOD_DESCRIPTOR_CACHE_LIMIT) {
    const oldest = modDescriptorCache.keys().next().value;
    if (oldest !== undefined) modDescriptorCache.delete(oldest);
  }

  modDescriptorCache.set(key, descriptor);
}

export async function getModDescriptor(
  jarPath: string,
): Promise<ModDescriptor> {
  const stats = await fs.stat(jarPath).catch(() => null);
  const cacheKey = stats
    ? `${path.resolve(jarPath)}|${stats.mtimeMs}|${stats.size}`
    : null;

  if (cacheKey) {
    const cached = modDescriptorCache.get(cacheKey);
    if (cached) return { ...cached, hardDeps: [...cached.hardDeps] };
  }

  const descriptor = await readModDescriptor(jarPath);
  if (cacheKey) rememberModDescriptor(cacheKey, descriptor);

  return { ...descriptor, hardDeps: [...descriptor.hardDeps] };
}

async function readModDescriptor(jarPath: string): Promise<ModDescriptor> {
  let tempPath = "";
  const descriptor: ModDescriptor = {
    environment: null,
    modId: null,
    hardDeps: [],
  };

  try {
    tempPath = path.join(
      getLauncherPaths().cache,
      "mod-env",
      `${Date.now()}-${randomUUID()}`,
    );
    await fs.mkdir(tempPath, { recursive: true });

    for (const manifest of ["fabric.mod.json", "quilt.mod.json"]) {
            const { extractFileFromArchive } = await import("./archiver");
            const extractedPath = await extractFileFromArchive(
        jarPath,
        manifest,
        tempPath,
      );
      if (!extractedPath) continue;

      const data = await fs
        .readJSON(path.join(extractedPath, manifest))
        .catch(() => null);
      if (!data) continue;

      if (manifest === "fabric.mod.json") {
        const env = data.environment;
        descriptor.environment =
          env === "client" ? "client" : env === "server" ? "server" : "both";
        if (typeof data.id === "string") descriptor.modId = data.id;
        descriptor.hardDeps = fabricDepIds(data.depends);
      } else {
        const quilt = data.quilt_loader;
        const env =
          quilt?.minecraft?.environment ?? data.minecraft?.environment;
        descriptor.environment =
          env === "client"
            ? "client"
            : env === "server" || env === "dedicated_server"
              ? "server"
              : "both";
        if (typeof quilt?.id === "string") descriptor.modId = quilt.id;
        descriptor.hardDeps = quiltDepIds(quilt?.depends);
      }

      return descriptor;
    }

    for (const manifest of [
      "META-INF/neoforge.mods.toml",
      "META-INF/mods.toml",
    ]) {
            const { extractFileFromArchive } = await import("./archiver");
            const extractedPath = await extractFileFromArchive(
        jarPath,
        manifest,
        tempPath,
      );
      if (!extractedPath) continue;

      const parsed = await parseModsToml(
        path.join(extractedPath, path.basename(manifest)),
      );
      if (!parsed) continue;

      descriptor.environment = forgeTomlEnvironment(parsed);
      if (Array.isArray(parsed.mods) && parsed.mods[0]?.modId) {
        descriptor.modId = String(parsed.mods[0].modId);
      }
      descriptor.hardDeps = forgeDepIds(parsed.dependencies);
      return descriptor;
    }

    return descriptor;
  } catch {
    return descriptor;
  } finally {
    if (tempPath && (await fs.pathExists(tempPath))) {
      await fs.remove(tempPath).catch(() => {});
    }
  }
}

export async function getModEnvironment(
  jarPath: string,
): Promise<ModEnvironment | null> {
  return (await getModDescriptor(jarPath)).environment;
}

export interface ServerModNode {
  key: string;
  modId: string | null;
  hardDeps: string[];
  onServer: boolean;
}

export function computeServerModExclusions(
  nodes: ServerModNode[],
): Set<string> {
  const excludedIds = new Set<string>();
  for (const node of nodes) {
    if (!node.onServer && node.modId) {
      excludedIds.add(node.modId.toLowerCase());
    }
  }

  const excludedKeys = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (!node.onServer || excludedKeys.has(node.key)) continue;

      const dependsOnExcluded = node.hardDeps.some((dep) =>
        excludedIds.has(dep.toLowerCase()),
      );
      if (dependsOnExcluded) {
        excludedKeys.add(node.key);
        if (node.modId) excludedIds.add(node.modId.toLowerCase());
        changed = true;
      }
    }
  }

  return excludedKeys;
}

function extractModrinthIds(
  url: string,
): { modId: string; versionId: string } | null {
  const match = url.match(/data\/([^/]+)\/versions\/([^/]+)/);
  return match ? { modId: match[1], versionId: match[2] } : null;
}

function getTopLevelFolder(relativeFile: string) {
  return relativeFile.replace(/\\/g, "/").split("/")[0];
}

function createFallbackProjectFromModrinthFile(
  file: ModrinthModpack["files"][number],
  projectType: ProjectType,
  downloadUrl: string,
): ILocalProject {
  const ids = extractModrinthIds(downloadUrl);
  const filename = path.basename(file.path);

  return {
    description: "",
    iconUrl: "",
    title: filename,
    projectType,
    url: "",
    provider: ids ? Provider.MODRINTH : Provider.OTHER,
    id: ids?.modId || file.hashes.sha1 || filename,
    version: {
      id: ids?.versionId || file.hashes.sha1 || "remote",
      dependencies: [],
      files: [
        {
          filename,
          size: file.fileSize,
          url: downloadUrl,
          sha1: file.hashes.sha1,
          isServer: file.env?.server ? file.env.server !== "unsupported" : true,
          isClient: file.env?.client ? file.env.client !== "unsupported" : true,
        },
      ],
    },
  };
}

function addModrinthManifestFiles(
  modpack: IModpack,
  mrModpack: ModrinthModpack,
) {
  for (const file of mrModpack.files) {
    const downloadUrl = file.downloads[0];
    if (!downloadUrl) continue;

    const folder = getTopLevelFolder(file.path);
    const projectType = folderToProjectType(folder);
    if (!projectType) continue;

    modpack.mods.push(
      createFallbackProjectFromModrinthFile(file, projectType, downloadUrl),
    );
  }
}

type ForeignModpackProvider = "prism";

interface MultiMcPackComponent {
  uid?: string;
  version?: string;
  cachedName?: string;
}

interface MultiMcPack {
  components?: MultiMcPackComponent[];
}

type PrismIndexFile = {
  filename?: string;
  name?: string;
  side?: string;
  "x-prismlauncher-version-number"?: string;
  download?: {
    hash?: string;
    "hash-format"?: string;
    url?: string;
  };
  update?: {
    modrinth?: {
      "mod-id"?: string;
      version?: string;
    };
    curseforge?: {
      "project-id"?: string | number;
      "file-id"?: string | number;
    };
  };
};

function parseKeyValueConfig(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) result[key] = value;
  }

  return result;
}

function normalizeImportedLoader(value: unknown): Loader | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = value.toLowerCase().replace(/[_\s-]+/g, "");
  if (normalized.includes("neoforge")) return "neoforge";
  if (normalized.includes("forge")) return "forge";
  if (normalized.includes("fabric")) return "fabric";
  if (normalized.includes("quilt")) return "quilt";
  if (normalized.includes("vanilla")) return "vanilla";

  return undefined;
}

async function findFileInRootOrOneChild(root: string, fileName: string) {
  const rootCandidate = path.join(root, fileName);
  if (await fs.pathExists(rootCandidate)) return rootCandidate;

  const entries = await fs
    .readdir(root, { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const candidate = path.join(root, entry.name, fileName);
    if (await fs.pathExists(candidate)) return candidate;
  }

  return null;
}

async function findExistingGameRoot(instanceRoot: string) {
  const candidates = [
    path.join(instanceRoot, ".minecraft"),
    path.join(instanceRoot, "minecraft"),
    instanceRoot,
  ];

  for (const candidate of candidates) {
    const hasGameContent = await Promise.all(
      ["mods", "resourcepacks", "shaderpacks", "datapacks", "config"].map(
        (folder) => fs.pathExists(path.join(candidate, folder)),
      ),
    );

    if (hasGameContent.some(Boolean)) return candidate;
  }

  return instanceRoot;
}

async function findPrismIconPath(
  instanceRoot: string,
  gameRoot: string,
  instanceCfg: Record<string, string>,
) {
  const candidates = [
    path.join(gameRoot, "icon.png"),
    path.join(gameRoot, "icon.jpg"),
    path.join(gameRoot, "icon.jpeg"),
    path.join(gameRoot, "icon.webp"),
  ];

  const iconKey = instanceCfg.iconKey?.trim();
  if (iconKey && iconKey !== "default") {
    for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".svg", ""]) {
      candidates.push(path.join(instanceRoot, `${iconKey}${ext}`));
    }
  }

  candidates.push(
    path.join(instanceRoot, "profileImage"),
    path.join(instanceRoot, "icon.png"),
    path.join(instanceRoot, "logo.png"),
    path.join(instanceRoot, "pack.png"),
  );

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }

  return undefined;
}

function toStringId(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function getPrismIndexProvider(metadata: PrismIndexFile): {
  provider: Provider;
  projectId: string;
  versionId: string;
  url: string;
} {
  const modrinth = metadata.update?.modrinth;
  const curseforge = metadata.update?.curseforge;

  if (modrinth) {
    return {
      provider: Provider.MODRINTH,
      projectId: toStringId(modrinth["mod-id"]),
      versionId: toStringId(modrinth.version),
      url: metadata.download?.url || "",
    };
  }

  if (curseforge) {
    return {
      provider: Provider.CURSEFORGE,
      projectId: toStringId(curseforge["project-id"]),
      versionId: toStringId(curseforge["file-id"]),
      url: metadata.download?.url || "",
    };
  }

  return {
    provider: Provider.LOCAL,
    projectId: "",
    versionId: "",
    url: metadata.download?.url || "",
  };
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function applyProjectMetadata(
  project: ILocalProject,
  metadata: IProject,
): ILocalProject {
  return {
    ...project,
    title: metadata.title || project.title,
    description: metadata.description || project.description,
    iconUrl: metadata.iconUrl || project.iconUrl,
    url: metadata.url || project.url,
    projectType: metadata.projectType || project.projectType,
  };
}

async function enrichPrismIndexedProjects(
  projects: Map<string, ILocalProject>,
) {
  const values = [...projects.values()];
  const modrinthIds = uniqueValues(
    values
      .filter((project) => project.provider === Provider.MODRINTH)
      .map((project) => project.id),
  );
  const curseForgeIds = uniqueValues(
    values
      .filter((project) => project.provider === Provider.CURSEFORGE)
      .map((project) => project.id),
  );

  const [modrinthProjects, curseForgeMods] = await Promise.all([
    (async () => {
      const result: IProject[] = [];
      for (const chunk of chunkArray(modrinthIds, 100)) {
        const projects =
          (await Modrinth.getProjects(chunk).catch(() => [])) ?? [];
        result.push(
          ...projects.map((project) =>
            mrProjectToProject(project, project.project_type as ProjectType),
          ),
        );
      }
      return result;
    })(),
    (async () => {
      const result: IProject[] = [];
      for (const chunk of chunkArray(curseForgeIds, 100)) {
        const mods =
          (await CurseForge.getMods(chunk.map(Number)).catch(() => [])) ?? [];
        result.push(...mods.map(cfModToProject));
      }
      return result;
    })(),
  ]);

  const metadataByProviderAndId = new Map<string, IProject>();
  for (const project of [...modrinthProjects, ...curseForgeMods]) {
    metadataByProviderAndId.set(`${project.provider}:${project.id}`, project);
  }

  for (const [filename, project] of projects) {
    const metadata = metadataByProviderAndId.get(
      `${project.provider}:${project.id}`,
    );
    if (!metadata) continue;

    projects.set(filename, applyProjectMetadata(project, metadata));
  }
}

async function readPrismModIndexProjects(
  instanceRoot: string,
  gameRoot: string,
) {
  const indexPath = path.join(gameRoot, "mods", ".index");
  const result = new Map<string, ILocalProject>();

  if (!(await fs.pathExists(indexPath))) return result;

  const entries = await fs.readdir(indexPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".pw.toml")) continue;

    try {
      const metadata = toml.parse(
        await fs.readFile(path.join(indexPath, entry.name), "utf-8"),
      ) as PrismIndexFile;
      const filename = metadata.filename?.trim();
      if (!filename) continue;

      const originalPath = path.join(gameRoot, "mods", filename);
      const copiedPath = path.join(instanceRoot, "overrides", "mods", filename);
      const localPath = (await fs.pathExists(copiedPath))
        ? copiedPath
        : (await fs.pathExists(originalPath))
          ? originalPath
          : "";
      const stats = localPath
        ? await fs.stat(localPath).catch(() => null)
        : null;
      const providerInfo = getPrismIndexProvider(metadata);
      const downloadHash =
        metadata.download?.["hash-format"] === "sha1"
          ? metadata.download?.hash || ""
          : "";
      const sha1 =
        downloadHash ||
        (localPath ? await getSha1(localPath).catch(() => "") : "");

      result.set(filename, {
        description: "",
        iconUrl: null,
        title: metadata.name || filename,
        projectType: ProjectType.MOD,
        url: "",
        provider: providerInfo.provider,
        id: providerInfo.projectId || filename,
        version: {
          id:
            providerInfo.versionId ||
            metadata["x-prismlauncher-version-number"] ||
            "local",
          dependencies: [],
          files: [
            {
              filename,
              size: stats?.size || 0,
              url: providerInfo.url,
              localPath: localPath || undefined,
              sha1,
              isServer: metadata.side !== "client",
            },
          ],
        },
      });
    } catch {
      continue;
    }
  }

  await enrichPrismIndexedProjects(result);

  return result;
}

async function copyForeignInstanceOverrides(
  instanceRoot: string,
  gameRoot: string,
) {
  const overridesPath = path.join(instanceRoot, "overrides");
  if (await fs.pathExists(overridesPath)) return;

  const entriesToCopy = [
    "mods",
    "resourcepacks",
    "shaderpacks",
    "datapacks",
    "config",
    "defaultconfigs",
    "kubejs",
    "scripts",
    "saves",
    "options.txt",
    "servers.dat",
  ];

  let copied = false;
  for (const entry of entriesToCopy) {
    const source = path.join(gameRoot, entry);
    if (!(await fs.pathExists(source))) continue;

    await fs.copy(source, path.join(overridesPath, entry));
    copied = true;
  }

  if (!copied) {
    await fs.ensureDir(overridesPath);
  }
}

async function prismModpackToModpack(
  mmcPackPath: string,
): Promise<IModpack | null> {
  const instanceRoot = path.dirname(mmcPackPath);
  const pack = (await fs.readJSON(mmcPackPath, "utf-8")) as MultiMcPack;
  const components = Array.isArray(pack.components) ? pack.components : [];

  const minecraftComponent = components.find(
    (component) => component.uid === "net.minecraft",
  );
  const loaderComponent = components.find((component) => {
    const uid = component.uid?.toLowerCase() || "";
    return (
      uid.includes("forge") ||
      uid.includes("fabric-loader") ||
      uid.includes("quilt-loader")
    );
  });

  const loader = normalizeImportedLoader(loaderComponent?.uid) || "vanilla";
  const loaderVersion =
    loader === "vanilla" ? undefined : loaderComponent?.version;
  const minecraftVersion = minecraftComponent?.version;

  if (!minecraftVersion) return null;

  const instanceCfgPath = path.join(instanceRoot, "instance.cfg");
  const instanceCfg = (await fs.pathExists(instanceCfgPath))
    ? parseKeyValueConfig(await fs.readFile(instanceCfgPath, "utf-8"))
    : {};

  const gameRoot = await findExistingGameRoot(instanceRoot);
  await copyForeignInstanceOverrides(instanceRoot, gameRoot);
  const image = await findPrismIconPath(instanceRoot, gameRoot, instanceCfg);
  const indexedMods = await readPrismModIndexProjects(instanceRoot, gameRoot);

  const baseModpack: IModpack = {
    name:
      instanceCfg.name ||
      instanceCfg.ManagedPackName ||
      path.basename(instanceRoot),
    version: minecraftVersion,
    loader,
    loaderVersion,
    mods: [...indexedMods.values()],
    folderPath: "",
    image,
  };

  const flameManifestPath = await findFileInRootOrOneChild(
    instanceRoot,
    "manifest.json",
  );
  const modrinthManifestPath = await findFileInRootOrOneChild(
    instanceRoot,
    "modrinth.index.json",
  );

  if (indexedMods.size > 0) {
    return baseModpack;
  }

  if (flameManifestPath) {
    try {
      const flameModpack = await cfModpackToModpack(
        await fs.readJSON(flameManifestPath, "utf-8"),
      );
      baseModpack.mods = flameModpack.mods;
    } catch {
      baseModpack.mods = [];
    }
  } else if (modrinthManifestPath) {
    const mrModpack = (await fs.readJSON(
      modrinthManifestPath,
      "utf-8",
    )) as ModrinthModpack;
    addModrinthManifestFiles(baseModpack, mrModpack);
    baseModpack.versionId = mrModpack.versionId;
  }

  return baseModpack;
}

export async function checkModpack(
  modpackPath: string,
  pack?: IProject,
  selectVersion?: IVersion,
): Promise<IModpack | null> {
  const tempPath = app.getPath("temp");

  if (!tempPath) return null;

  let confPath = "";
  let provider: Provider | null = null;
  let foreignProvider: ForeignModpackProvider | null = null;
  try {
    const cfPath = await findFileInRootOrOneChild(modpackPath, "manifest.json");
    const mrPath = await findFileInRootOrOneChild(
      modpackPath,
      "modrinth.index.json",
    );
    const prismPath = await findFileInRootOrOneChild(
      modpackPath,
      "mmc-pack.json",
    );

    if (prismPath) {
      confPath = prismPath;
      foreignProvider = "prism";
    } else if (cfPath) {
      confPath = cfPath;
      provider = Provider.CURSEFORGE;
    } else if (mrPath) {
      confPath = mrPath;
      provider = Provider.MODRINTH;
    }

    if (!confPath || (!provider && !foreignProvider)) {
      return null;
    }
  } catch {
    return null;
  }

  const conf = await fs.readJSON(confPath, "utf-8");

  let modpack: IModpack | null = null;
  const extraFiles: IModpackExtraFile[] = [];
  if (provider == Provider.CURSEFORGE) {
    const cfModpack: CurseForgeModpack = conf;
    modpack = await cfModpackToModpack(cfModpack);
  } else if (provider == Provider.MODRINTH) {
    const mrModpack: ModrinthModpack = conf;
    modpack = await mrModpackToModpack(mrModpack);

    if (!modpack) return null;

    if (!pack) {
      const searchData = await ModManager.search(
        modpack.name,
        Provider.MODRINTH,
        {
          projectType: ProjectType.MODPACK,
          loader: modpack.loader,
          version: modpack.version,
          filter: [],
          sort: "",
        },
        {
          offset: 0,
          limit: 1,
        },
      );

      pack = searchData.projects[0];

      if (pack) {
        const versions = await ModManager.getVersions(
          Provider.MODRINTH,
          pack.id,
          {
            loader: modpack.loader,
            version: modpack.version,
            projectType: ProjectType.MODPACK,
            modUrl: "",
          },
        );

        const normalize = (value?: string | null) =>
          (value || "").replace(/^v/i, "").trim();
        const packVersionId = modpack.versionId;
        selectVersion = versions.find(
          (v) =>
            v.id == packVersionId ||
            (!!v.versionNumber &&
              normalize(v.versionNumber) == normalize(packVersionId)),
        );
      }
    }

    const dependensies =
      (pack && selectVersion
        ? await ModManager.getDependencies(
            Provider.MODRINTH,
            pack.id,
            selectVersion.dependencies,
          )
        : []) ?? [];

    for (const file of mrModpack.files) {
      const downloadUrl = file.downloads[0];
      if (!downloadUrl) continue;

      const folder = getTopLevelFolder(file.path);
      const projectType = folderToProjectType(folder);
      if (!projectType) {
        extraFiles.push({
          path: file.path,
          url: downloadUrl,
          sha1: file.hashes.sha1,
          size: file.fileSize,
          isClient: file.env?.client ? file.env.client !== "unsupported" : true,
          isServer: file.env?.server ? file.env.server !== "unsupported" : true,
        });
        continue;
      }

      const ids = extractModrinthIds(downloadUrl);
      if (!ids) {
        modpack.mods.push(
          createFallbackProjectFromModrinthFile(file, projectType, downloadUrl),
        );
        continue;
      }

      const { modId, versionId } = ids;

      const dependency = dependensies.find(
        (d) => d.projectId == modId && d.versionId == versionId,
      );
      if (!dependency) {
        modpack.mods.push(
          createFallbackProjectFromModrinthFile(file, projectType, downloadUrl),
        );
        continue;
      }

      const mod = dependency.project;
      if (!mod) {
        modpack.mods.push(
          createFallbackProjectFromModrinthFile(file, projectType, downloadUrl),
        );
        continue;
      }

      modpack.mods.push({
        description: mod.description,
        iconUrl: mod.iconUrl,
        title: mod.title,
        projectType,
        url: mod.url,
        provider: Provider.MODRINTH,
        id: mod.id,
        version: {
          id: versionId,
          dependencies: [],
          files: [
            {
              filename: path.basename(file.path),
              size: file.fileSize,
              url: downloadUrl,
              sha1: file.hashes.sha1,
              isServer: file.env?.server
                ? file.env.server !== "unsupported"
                : true,
              isClient: file.env?.client
                ? file.env.client !== "unsupported"
                : true,
            },
          ],
        },
      });
    }
  } else if (foreignProvider == "prism") {
    modpack = await prismModpackToModpack(confPath);
  }

  if (!modpack) return null;

  const contentRoot = confPath ? path.dirname(confPath) : modpackPath;
  await scanOverrideMods(path.join(contentRoot, "overrides"), modpack, false);
  await scanOverrideMods(
    path.join(contentRoot, "client-overrides"),
    modpack,
    true,
  );

  return {
    ...modpack,
    folderPath: contentRoot,
    image: pack?.iconUrl || modpack.image,
    extraFiles: extraFiles.length ? extraFiles : modpack.extraFiles,
  };
}

async function scanOverrideMods(
  overridesPath: string,
  modpack: IModpack,
  clientOnly: boolean,
) {
  if (!(await fs.pathExists(overridesPath))) return;

  const targetFolders = ["mods", "resourcepacks", "shaderpacks", "datapacks"];
  const files = await getFilesRecursively(overridesPath, null, targetFolders);

  for (const relativeFile of files) {
    const folder = getTopLevelFolder(relativeFile);

    if (!targetFolders.includes(folder)) continue;

    const fileName = path.basename(relativeFile);
    if (!fileName) continue;

    const alreadyTracked = modpack.mods.some((mod) =>
      mod.version?.files.some((file) => file.filename === fileName),
    );
    if (alreadyTracked) continue;
    if (relativeFile.replace(/\\/g, "/").startsWith("mods/.index/")) continue;

    const projectType = folderToProjectType(folder);
    if (!projectType) continue;

    const absoluteFilePath = path.join(overridesPath, relativeFile);

    const info = await checkLocalMod(absoluteFilePath);

    let isServer = true;
    let isClient = true;
    if (projectType === ProjectType.MOD) {
      if (clientOnly) {
        isServer = false;
      } else {
        const environment = await getModEnvironment(absoluteFilePath);
        isServer = environment !== "client";
        isClient = environment !== "server";
      }
    }

    modpack.mods.push({
      description: info?.description || "",
      iconUrl: info?.icon || "",
      title: info?.name || fileName,
      projectType,
      url: "",
      provider: Provider.LOCAL,
      id: info?.id || fileName,
      version: {
        id: info?.version || "local",
        dependencies: [],
        files: [
          {
            filename: fileName,
            size: info?.size || 0,
            url: pathToFileURL(absoluteFilePath).href,
            localPath: absoluteFilePath,
            sha1: info?.sha1 || "",
            isServer,
            isClient,
          },
        ],
      },
    });
  }
}

export function projetTypeToFolder(type: ProjectType): string {
  switch (type) {
    case ProjectType.MOD:
      return "mods";
    case ProjectType.MODPACK:
      return "modpacks";
    case ProjectType.PLUGIN:
      return "plugins";
    case ProjectType.RESOURCEPACK:
      return "resourcepacks";
    case ProjectType.SHADER:
      return "shaderpacks";
    case ProjectType.WORLD:
      return "saves";
    case ProjectType.DATAPACK:
      return path.join("storage", "datapacks");
    default:
      return "";
  }
}

export function folderToProjectType(folder: string): ProjectType | null {
  switch (folder) {
    case "mods":
      return ProjectType.MOD;
    case "modpacks":
      return ProjectType.MODPACK;
    case "plugins":
      return ProjectType.PLUGIN;
    case "resourcepacks":
      return ProjectType.RESOURCEPACK;
    case "shaderpacks":
      return ProjectType.SHADER;
    case "saves":
      return ProjectType.WORLD;
    case "datapacks":
      return ProjectType.DATAPACK;
    default:
      return null;
  }
}

export function compareMods(a: ILocalProject[], b: ILocalProject[]): boolean {
  const comparableA = a.filter((mod) => mod.projectType !== ProjectType.PLUGIN);
  const comparableB = b.filter((mod) => mod.projectType !== ProjectType.PLUGIN);

  if (comparableA.length !== comparableB.length) return false;

  const sig = (m: ILocalProject) => {
    const v = m.version;
    const fileSig =
      v?.files
        ?.map(
          (f) =>
            `${f.filename}:${f.sha1}:${f.size}:${f.disabled === true ? 1 : 0}`,
        )
        .sort()
        .join("|") ?? "";
    const depSig =
      v?.dependencies
        ?.map((d: any) => `${d.projectId}:${d.relationType}`)
        .sort()
        .join("|") ?? "";
    return `${m.id}#${m.provider}#${m.projectType}#${v?.id ?? "null"}#${fileSig}#${depSig}`;
  };

  const as = [...comparableA].map(sig).sort();
  const bs = [...comparableB].map(sig).sort();

  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
  return true;
}

const DATA_URL_ICON = /^data:image\/([a-z0-9+.-]+);base64,(.+)$/i;

export async function migrateInlineModIcons(
  mods: ILocalProject[],
): Promise<boolean> {
  let changed = false;

  for (const mod of mods) {
    const match =
      typeof mod.iconUrl === "string" ? mod.iconUrl.match(DATA_URL_ICON) : null;
    if (!match) continue;

    try {
      const extension = match[1].toLowerCase() === "jpeg" ? ".jpg" : `.${match[1].toLowerCase()}`;
      const cached = await cacheModIcon(
        Buffer.from(match[2], "base64"),
        extension,
      );
      if (!cached) continue;

      mod.iconUrl = cached;
      changed = true;
    } catch {
      continue;
    }
  }

  return changed;
}
