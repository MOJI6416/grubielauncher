import {
  DependencyType,
  IFabricMod,
  ILocalFileInfo,
  ILocalProject,
  IModpack,
  IProject,
  IVersion,
  IVersionDependency,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import {
  IModpack as CurseForgeModpack,
  FileRelationType,
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
import { Loader } from "@/types/Loader";
import { CurseForge } from "../services/CurseForge";
import { Modrinth } from "../services/Modrinth";
import path from "path";
import fs from "fs-extra";
import toml from "toml";
import { ModManager } from "../services/ModManager";
import { app } from "electron";
import { extractFileFromArchive } from "./archiver";
import { rimraf } from "rimraf";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";
import { parseCurseForgeLoaderId } from "@/shared/loaderVersions";

export function dependencyToLocalProject(dependencies: IVersionDependency[]) {
  const newMods: ILocalProject[] = [];
  for (let index = 0; index < dependencies.length; index++) {
    const dependency = dependencies[index];
    const project = dependency.project;

    if (!project) continue;
    if (!project.versions || project.versions.length === 0) continue;

    const version = project.versions[0];
    newMods.push({
      title: project.title,
      description: project.description,
      projectType: project.projectType,
      iconUrl: project.iconUrl,
      url: project.url,
      provider: project.provider,
      id: project.id,
      version: {
        id: version.id,
        dependencies: [],
        files: version.files,
      },
    });
  }

  return newMods;
}

export async function cfModpackToModpack(
  modpack: CurseForgeModpack,
): Promise<IModpack> {
  const mods = await CurseForge.getMods(
    modpack.files.map((file) => file.projectID),
  );
  const files = await CurseForge.getFiles(
    modpack.files.map((file) => file.fileID),
  );
  const { loader, loaderVersion } = parseCurseForgeLoaderId(
    modpack.minecraft.modLoaders?.[0]?.id,
  );

  const modpackFiles: ILocalProject[] = [];

  for (const f of modpack.files) {
    if (f.required === false) continue;

    const mod = mods.find((m) => m.id == f.projectID);
    if (!mod) continue;

    let file: IFile | null | undefined = files.find(
      (file) => file.id == f.fileID,
    );
    if (!file) {
      file = await CurseForge.getFile(mod.id, f.fileID);
    }

    if (!file) {
      throw new Error(
        `CurseForge file ${f.fileID} for project ${f.projectID} was not found.`,
      );
    }

    const projectType = ModTypeClassIds[mod.classId || 6] as ProjectType;

    modpackFiles.push({
      description: mod.summary,
      iconUrl: mod.logo?.url || "",
      title: mod.name,
      projectType,
      url: mod.links.websiteUrl,
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
              `blocked::${mod.links.websiteUrl}/download/${file.id}`,
            sha1: file.hashes.find((h) => h.algo == 1)?.value || "",
            isServer: file.isServerPack ?? true,
          },
        ],
      },
    });
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
    url: mod.links.websiteUrl,
    description: mod.summary,
    iconUrl: mod.logo?.url || "",
    id: mod.id.toString(),
    projectType: ModTypeClassIds[mod.classId || "mod"] as ProjectType,
    title: mod.name,
    provider: Provider.CURSEFORGE,
    versions: [],
    body: "",
    gallery: mod.screenshots.map((s) => ({
      ...s,
    })),
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
    files: [
      {
        filename:
          projectType != ProjectType.WORLD ? file.fileName : file.fileName,
        size: file.fileLength,
        url: file.downloadUrl || `blocked::${modUrl}/download/${file.id}`,
        isServer: file.isServerPack ?? true,
        sha1: file.hashes.find((h) => h.algo == 1)?.value || "",
      },
    ],
  };
}

export function mrVersionToVersion(
  version: ModrinthVersion,
  isServer: boolean,
  projectType: ProjectType,
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
    files: version.files
      .filter((f) => (version.files.length > 1 ? f.primary : true))
      .map((f) => ({
        filename: f.filename,
        size: f.size,
        isServer,
        url: f.url,
        sha1: f.hashes.sha1,
      })),
  };
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

export function versionDependencyToCfRelationType(
  relationType: DependencyType,
): FileRelationType | null {
  if (relationType == DependencyType.REQUIRED)
    return FileRelationType.RequiredDependency;
  if (relationType == DependencyType.OPTIONAL)
    return FileRelationType.OptionalDependency;
  if (relationType == DependencyType.INCOMPATIBLE)
    return FileRelationType.Incompatible;
  if (relationType == DependencyType.EMBEDDED)
    return FileRelationType.EmbeddedLibrary;

  return null;
}

async function getModIcon(
  modPath: string,
  iconPath: string,
  tempPath: string,
): Promise<string | null> {
  try {
    await extractFileFromArchive(modPath, iconPath, tempPath);
    const extractPath = path.join(tempPath, path.basename(iconPath));
    const base = await fs.readFile(extractPath);
    const base64 = Buffer.from(base).toString("base64");
    const ext = path.extname(iconPath).substring(1);
    return `data:image/${ext};base64,${base64}`;
  } catch {
    return null;
  }
}

export async function checkLocalMod(
  modPath: string,
): Promise<ILocalFileInfo | null> {
  let tempPath = "";

  try {
    const fileSize = (await fs.stat(modPath)).size;
    const sha1 = await getSha1(modPath);

    const fileName = path.basename(modPath);

    if (!fileName) return null;

    tempPath = path.join(
      app.getPath("temp"),
      "grubie-mod-meta",
      `${Date.now()}-${randomUUID()}-${fileName}`,
    );
    await fs.mkdir(tempPath, { recursive: true });

    const parsers = [
      {
        files: ["fabric.mod.json", "quilt.mod.json"],
        parse: async (
          extractedPath: string,
          foundFile: string,
        ): Promise<ILocalFileInfo> => {
          const fabricMod: IFabricMod = await fs.readJSON(
            path.join(extractedPath, foundFile),
          );
          let icon: string | null = null;
          if (fabricMod.icon) {
            icon = await getModIcon(modPath, fabricMod.icon, tempPath);
          }

          return {
            ...fabricMod,
            url: fabricMod.contact?.homepage || "",
            filename: fileName,
            size: fileSize,
            path: modPath,
            sha1,
            icon,
          };
        },
      },
      {
        files: ["META-INF/neoforge.mods.toml", "META-INF/mods.toml"],
        parse: async (
          extractedPath: string,
          foundFile: string,
        ): Promise<ILocalFileInfo> => {
          const modsToml = await parseModsToml(
            path.join(extractedPath, foundFile),
          );
          if (!modsToml) throw new Error("Invalid mods.toml");

          const mod = modsToml.mods[0];

          let icon: string | null = null;
          if (mod.logoFile) {
            icon = await getModIcon(modPath, mod.logoFile, tempPath);
          }

          return {
            description: mod.description,
            filename: fileName,
            size: fileSize,
            id: mod.modId,
            name: mod.displayName,
            path: modPath,
            url: mod.displayURL,
            version: null,
            sha1,
            icon,
          };
        },
      },
      {
        files: ["pack.mcmeta"],
        parse: async (
          extractedPath: string,
          foundFile: string,
        ): Promise<ILocalFileInfo> => {
          const packMcMeta: {
            pack: {
              description: { fallback: string } | string;
            };
          } = await fs.readJSON(path.join(extractedPath, foundFile));

          const description =
            typeof packMcMeta.pack.description === "object"
              ? packMcMeta.pack.description.fallback
              : packMcMeta.pack.description;

          let icon = await getModIcon(modPath, "logo.png", tempPath);
          if (!icon) icon = await getModIcon(modPath, "pack.png", tempPath);

          return {
            description,
            filename: fileName,
            size: fileSize,
            id: fileName,
            name: fileName,
            path: modPath,
            url: "",
            version: null,
            sha1,
            icon,
          };
        },
      },
    ];

    for (const parser of parsers) {
      for (const file of parser.files) {
        const extractedPath = await extractFileFromArchive(
          modPath,
          file,
          tempPath,
        );
        if (extractedPath) {
          try {
            const info = await parser.parse(extractedPath, path.basename(file));
            return info;
          } catch {
            continue;
          }
        }
      }
    }

    return {
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
  } catch {
    return null;
  } finally {
    if (tempPath && (await fs.pathExists(tempPath))) {
      await rimraf(tempPath).catch(() => {});
    }
  }
}

async function parseModsToml(filePath: string): Promise<any> {
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const parsedContent = toml.parse(fileContent);
    return parsedContent;
  } catch {
    return null;
  }
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

  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
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

function getPrismIndexProvider(
  metadata: PrismIndexFile,
): { provider: Provider; projectId: string; versionId: string; url: string } {
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
        const projects = await Modrinth.getProjects(chunk).catch(() => []);
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
        const mods = await CurseForge.getMods(chunk.map(Number)).catch(() => []);
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
      const stats = localPath ? await fs.stat(localPath).catch(() => null) : null;
      const providerInfo = getPrismIndexProvider(metadata);
      const downloadHash =
        metadata.download?.["hash-format"] === "sha1"
          ? metadata.download?.hash || ""
          : "";
      const sha1 = downloadHash || (localPath ? await getSha1(localPath).catch(() => "") : "");

      result.set(filename, {
        description: "",
        iconUrl: null,
        title: metadata.name || filename,
        projectType: ProjectType.MOD,
        url: "",
        provider: providerInfo.provider,
        id: providerInfo.projectId || filename,
        version: {
          id: providerInfo.versionId || metadata["x-prismlauncher-version-number"] || "local",
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
  const loaderVersion = loader === "vanilla" ? undefined : loaderComponent?.version;
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
      pack && selectVersion
        ? await ModManager.getDependencies(
            Provider.MODRINTH,
            pack.id,
            selectVersion.dependencies,
          )
        : [];

    for (const file of mrModpack.files) {
      const downloadUrl = file.downloads[0];
      if (!downloadUrl) continue;

      const folder = getTopLevelFolder(file.path);
      const projectType = folderToProjectType(folder);
      if (!projectType) continue;

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
  const overridesPath = path.join(contentRoot, "overrides");
  if (await fs.pathExists(overridesPath)) {
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
              isServer: true,
            },
          ],
        },
      });
    }
  }

  return {
    ...modpack,
    folderPath: contentRoot,
    image: pack?.iconUrl || modpack.image,
  };
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
        ?.map((f) => `${f.filename}:${f.sha1}:${f.size}`)
        .sort()
        .join("|") ?? "";
    const depSig =
      v?.dependencies
        ?.map((d: any) => `${d.title}:${d.relationType}`)
        .sort()
        .join("|") ?? "";
    return `${m.id}#${m.provider}#${m.projectType}#${v?.id ?? "null"}#${fileSig}#${depSig}`;
  };

  const as = [...comparableA].map(sig).sort();
  const bs = [...comparableB].map(sig).sort();

  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
  return true;
}
