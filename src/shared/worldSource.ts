import {
  ILocalFile,
  ILocalProject,
  IVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";

export const WORLD_SOURCE_FILE = ".grubie-source.json";

export interface IWorldSource {
  provider: "curseforge";
  projectId: string;
  fileId: string;
  filename: string;
  title: string;
  url: string;
  iconUrl: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseWorldSource(value: unknown): IWorldSource | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.provider !== "curseforge") return null;

  const projectId = text(record.projectId);
  const fileId = text(record.fileId);
  const filename = text(record.filename);
  if (!projectId || !fileId || !filename) return null;

  return {
    provider: "curseforge",
    projectId,
    fileId,
    filename,
    title: text(record.title) ?? filename,
    url: text(record.url) ?? "",
    iconUrl: text(record.iconUrl),
  };
}

export function worldSourceOf(
  project: Pick<ILocalProject, "provider" | "id" | "title" | "url" | "iconUrl">,
  versionId: string | undefined,
  file: Pick<ILocalFile, "filename"> | undefined,
): IWorldSource | null {
  if (project.provider !== Provider.CURSEFORGE || !versionId || !file?.filename) {
    return null;
  }
  return parseWorldSource({
    provider: "curseforge",
    projectId: project.id,
    fileId: versionId,
    filename: file.filename,
    title: project.title,
    url: project.url,
    iconUrl: project.iconUrl,
  });
}

export function sourceKey(source: Pick<IWorldSource, "projectId" | "fileId">) {
  return `${source.projectId}:${source.fileId}`;
}

export function linkedWorldEntry(
  source: IWorldSource,
  version: IVersion,
): ILocalProject | null {
  const file = version.files.find(
    (item) =>
      item.url &&
      !item.url.startsWith("blocked::") &&
      /\.zip$/i.test(item.filename ?? ""),
  );
  if (!file) return null;

  return {
    title: source.title,
    description: "",
    projectType: ProjectType.WORLD,
    iconUrl: source.iconUrl,
    url: source.url,
    provider: Provider.CURSEFORGE,
    id: source.projectId,
    version: {
      id: version.id,
      files: [{ ...file, isServer: true, isClient: true }],
      dependencies: [],
    },
  };
}

export interface PublishedWorld {
  folder: string;
  source: IWorldSource | null;
}

export interface WorldPublishPlan {
  links: { folder: string; entry: ILocalProject }[];
  archiveFolders: string[];
}

export function planWorldPublish(
  worlds: readonly PublishedWorld[],
  available: ReadonlyMap<string, IVersion | null>,
): WorldPublishPlan {
  const links: WorldPublishPlan["links"] = [];
  const archiveFolders: string[] = [];
  const linked = new Set<string>();

  for (const world of worlds) {
    const key = world.source ? sourceKey(world.source) : null;
    const version = key ? available.get(key) : null;
    const entry =
      world.source && version && key && !linked.has(key)
        ? linkedWorldEntry(world.source, version)
        : null;

    if (entry && key) {
      linked.add(key);
      links.push({ folder: world.folder, entry });
    } else {
      archiveFolders.push(world.folder);
    }
  }

  return { links, archiveFolders };
}
