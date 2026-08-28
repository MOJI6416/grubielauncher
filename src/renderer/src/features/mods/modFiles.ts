import { ProjectType } from "@/types/ModManager";

const api = window.api;

const folderNames = new Map<ProjectType, Promise<string>>();
const listings = new Map<string, Promise<Set<string>>>();

function listingKey(versionPath: string, folderName: string): string {
  return `${versionPath}|${folderName}`;
}

export function folderNameForType(projectType: ProjectType): Promise<string> {
  const cached = folderNames.get(projectType);
  if (cached) return cached;

  const pending = api.modManager.ptToFolder(projectType);
  folderNames.set(projectType, pending);
  return pending;
}

export async function listModFiles(
  versionPath: string,
  projectType: ProjectType,
): Promise<Set<string>> {
  const folderName = await folderNameForType(projectType);
  const key = listingKey(versionPath, folderName);

  const cached = listings.get(key);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const folderPath = await api.path.join(versionPath, folderName);
      const entries = await api.fs.readdir(folderPath);
      return new Set(entries);
    } catch {
      return new Set<string>();
    }
  })();

  listings.set(key, pending);
  return pending;
}

export function forgetAllModFiles(versionPath: string): void {
  const prefix = `${versionPath}|`;
  for (const key of [...listings.keys()]) {
    if (key.startsWith(prefix)) listings.delete(key);
  }
}

export async function forgetModFiles(
  versionPath: string,
  projectType: ProjectType,
): Promise<void> {
  const folderName = await folderNameForType(projectType);
  listings.delete(listingKey(versionPath, folderName));
}
