import type { IVersionConf } from "@/types/IVersion";
import type { Loader } from "@/types/Loader";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import { canonicalLoaderVersionId } from "./loaderVersions";

export type ExportFormat = "grubie" | "mrpack";

export const WORLDS_FOLDER = "saves";

export const MRPACK_INDEX = "modrinth.index.json";

const MRPACK_LOADERS: Partial<Record<Loader, string>> = {
  fabric: "fabric-loader",
  quilt: "quilt-loader",
  forge: "forge",
  neoforge: "neoforge",
};

const MRPACK_DOWNLOAD_HOSTS = new Set(["cdn.modrinth.com"]);

const MRPACK_HIDDEN_ENTRIES = new Set(["server"]);

export interface MrpackLink {
  path: string;
  url: string;
  sha1: string;
  size: number;
}

export interface MrpackFile {
  path: string;
  hashes: { sha1: string; sha512: string };
  downloads: string[];
  fileSize: number;
}

export interface MrpackIndex {
  formatVersion: 1;
  game: "minecraft";
  versionId: string;
  name: string;
  summary?: string;
  files: MrpackFile[];
  dependencies: Record<string, string>;
}

export function normalizeExportEntry(entry: string): string {
  return entry.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
}

export function isTechnicalExportEntry(name: string): boolean {
  const lower = normalizeExportEntry(name).split("/")[0].toLowerCase();
  return (
    lower === "version.json" ||
    lower === "storage" ||
    lower === "icon.png" ||
    lower.endsWith(".jar") ||
    lower.endsWith(".json")
  );
}

export function isExportEntryShown(name: string, format: ExportFormat): boolean {
  if (isTechnicalExportEntry(name)) return false;
  return format === "grubie" || !MRPACK_HIDDEN_ENTRIES.has(name.toLowerCase());
}

export function projectExportFolder(type: ProjectType): string | null {
  switch (type) {
    case ProjectType.MOD:
      return "mods";
    case ProjectType.RESOURCEPACK:
      return "resourcepacks";
    case ProjectType.SHADER:
      return "shaderpacks";
    case ProjectType.PLUGIN:
      return "server";
    default:
      return null;
  }
}

export function keepSelectedProjects(
  mods: ILocalProject[],
  selected: ReadonlySet<string>,
): ILocalProject[] {
  return mods.filter((mod) => {
    const folder = projectExportFolder(mod.projectType);
    return folder === null || selected.has(folder);
  });
}

export function mrpackDependencies(
  conf: Pick<IVersionConf, "version" | "loader">,
): Record<string, string> | null {
  const minecraft = conf.version?.id;
  if (!minecraft) return null;

  const loader = conf.loader?.name;
  if (!loader || loader === "vanilla") return { minecraft };

  const key = MRPACK_LOADERS[loader];
  const raw = conf.loader.version?.id;
  if (!key || !raw) return null;

  const version = canonicalLoaderVersionId(raw, loader, minecraft);
  return version ? { minecraft, [key]: version } : null;
}

function isModrinthDownload(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && MRPACK_DOWNLOAD_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function mrpackLinks(mod: ILocalProject): MrpackLink[] {
  if (mod.provider !== Provider.MODRINTH) return [];

  const folder = projectExportFolder(mod.projectType);
  if (!folder || MRPACK_HIDDEN_ENTRIES.has(folder)) return [];

  return (mod.version?.files ?? [])
    .filter((file) => !file.disabled && !file.localPath && isModrinthDownload(file.url))
    .filter((file) => file.filename && !/[\\/]/.test(file.filename))
    .map((file) => ({
      path: `${folder}/${file.filename}`,
      url: file.url,
      sha1: file.sha1?.toLowerCase() ?? "",
      size: file.size || 0,
    }));
}

export function buildMrpackIndex(
  conf: Pick<IVersionConf, "name" | "description" | "build">,
  dependencies: Record<string, string>,
  files: MrpackFile[],
): MrpackIndex {
  const summary = conf.description?.trim();
  return {
    formatVersion: 1,
    game: "minecraft",
    versionId: String(conf.build || 1),
    name: conf.name,
    ...(summary ? { summary } : {}),
    files,
    dependencies,
  };
}
