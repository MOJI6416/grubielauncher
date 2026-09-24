import {
  IAddedLocalProject,
  ILocalFileInfo,
  ILocalProject,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { localTitle } from "./entries";

export const LOCAL_IMPORT_EXTENSIONS = ["jar", "zip", "disabled"];

const IMPORTABLE_NAME = /\.(jar|zip)(\.disabled)?$/i;
const DISABLED_SUFFIX = /\.disabled$/i;

export function isImportableFileName(name: string): boolean {
  return IMPORTABLE_NAME.test(name);
}

export function splitDisabledName(name: string): {
  fileName: string;
  disabled: boolean;
} {
  return DISABLED_SUFFIX.test(name)
    ? { fileName: name.replace(DISABLED_SUFFIX, ""), disabled: true }
    : { fileName: name, disabled: false };
}

function lower(value: string): string {
  return value.toLowerCase();
}

function matchesInfo(
  candidate: {
    title: string;
    id: string;
    sha1s: string[];
  },
  info: ILocalFileInfo,
  infoName: string,
): boolean {
  return (
    lower(candidate.title) === infoName ||
    candidate.id === info.id ||
    candidate.sha1s.includes(info.sha1)
  );
}

export function buildImportEntry({
  info,
  displayName,
  projectType,
  installed,
  collected,
  deletedAt,
  fileUrl,
}: {
  info: ILocalFileInfo;
  displayName: string;
  projectType: ProjectType;
  installed: ILocalProject[];
  collected: IAddedLocalProject[];
  deletedAt: number | null;
  fileUrl: string;
}): IAddedLocalProject {
  const { fileName, disabled } = splitDisabledName(displayName);
  const title =
    !info.name || info.name === info.filename ? fileName : info.name;
  const infoName = lower(title);

  const isDuplicate =
    installed.some((mod) =>
      matchesInfo(
        {
          title: localTitle(mod),
          id: mod.id,
          sha1s: (mod.version?.files ?? []).map((file) => file.sha1),
        },
        info,
        infoName,
      ),
    ) ||
    collected.some(
      (item) =>
        item.status !== "invalid" &&
        matchesInfo(
          {
            title: localTitle(item.project),
            id: item.project.id,
            sha1s: (item.project.versions[0]?.files ?? []).map(
              (file) => file.sha1,
            ),
          },
          info,
          infoName,
        ),
    );

  return {
    project: {
      description: info.description || "",
      iconUrl: info.icon,
      id: info.id || fileName,
      projectType: info.kind ?? projectType,
      provider: Provider.LOCAL,
      title,
      url: info.url || "",
      body: "",
      gallery: [],
      versions: [
        {
          dependencies: [],
          id: info.version || "",
          downloads: -1,
          name: info.version || "",
          files: [
            {
              filename: fileName,
              isServer: true,
              size: info.size,
              url: fileUrl,
              sha1: info.sha1,
              ...(disabled ? { disabled: true } : {}),
            },
          ],
        },
      ],
    },
    status: isDuplicate ? "duplicate" : "valid",
    fileName,
    size: info.size,
    deletedAt,
    disabled,
  };
}

export function buildInvalidEntry({
  displayName,
  projectType,
  deletedAt,
}: {
  displayName: string;
  projectType: ProjectType;
  deletedAt: number | null;
}): IAddedLocalProject {
  const { fileName } = splitDisabledName(displayName);

  return {
    project: {
      description: "",
      iconUrl: null,
      id: "-1",
      projectType,
      provider: Provider.LOCAL,
      title: fileName,
      url: "",
      versions: [],
      body: "",
      gallery: [],
    },
    status: "invalid",
    fileName,
    deletedAt,
  };
}

export function withEnabledFiles(
  entry: IAddedLocalProject,
): IAddedLocalProject {
  if (!entry.disabled) return entry;

  return {
    ...entry,
    disabled: false,
    project: {
      ...entry.project,
      versions: entry.project.versions.map((version) => ({
        ...version,
        files: version.files.map((file) => ({ ...file, disabled: false })),
      })),
    },
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onSettled?: (done: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
      done += 1;
      onSettled?.(done);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, run),
  );

  return results;
}

export function findForeignFiles({
  listing,
  mods,
  pendingRemoved,
  projectType,
  managed,
}: {
  listing: Iterable<string>;
  mods: ILocalProject[];
  pendingRemoved: ILocalProject[];
  projectType: ProjectType;
  managed: string[] | null | undefined;
}): string[] {
  if (!managed) return [];

  const known = new Set(managed.map((name) => splitDisabledName(name).fileName));
  for (const mod of [...mods, ...pendingRemoved]) {
    if (mod.projectType !== projectType) continue;
    for (const file of mod.version?.files ?? []) {
      if (file.filename) known.add(splitDisabledName(file.filename).fileName);
    }
  }

  return [...listing]
    .filter(
      (name) =>
        isImportableFileName(name) &&
        !known.has(splitDisabledName(name).fileName),
    )
    .sort((a, b) => a.localeCompare(b));
}
