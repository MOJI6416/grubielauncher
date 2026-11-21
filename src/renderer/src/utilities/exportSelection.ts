import { WORLDS_FOLDER, type ExportFormat } from "@/shared/instanceExport";

export interface ExportPrefs {
  format: ExportFormat;
  selected: string[];
  known: string[];
}

const STORAGE_PREFIX = "export.selection:";

const OFF_BY_DEFAULT = new Set(["server"]);

const ORDER = [
  "mods",
  "config",
  "defaultconfigs",
  "kubejs",
  "resourcepacks",
  "shaderpacks",
  WORLDS_FOLDER,
  "schematics",
  "options.txt",
  "server",
];

export function worldKey(name: string): string {
  return `${WORLDS_FOLDER}/${name}`;
}

export function isWorldKey(key: string): boolean {
  return key.startsWith(`${WORLDS_FOLDER}/`);
}

export function isOnByDefault(key: string): boolean {
  return !isWorldKey(key) && !OFF_BY_DEFAULT.has(key.toLowerCase());
}

export function sortExportNames(names: string[]): string[] {
  const rank = (name: string) => {
    const index = ORDER.indexOf(name.toLowerCase());
    return index === -1 ? ORDER.length : index;
  };
  return [...names].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function initialSelection(
  keys: readonly string[],
  prefs: ExportPrefs | null,
): Set<string> {
  const known = new Set(prefs?.known ?? []);
  const selected = new Set(prefs?.selected ?? []);
  return new Set(
    keys.filter((key) => (known.has(key) ? selected.has(key) : isOnByDefault(key))),
  );
}

export function selectedTopFolders(selection: ReadonlySet<string>): Set<string> {
  return new Set([...selection].map((key) => key.split("/")[0]));
}

export function normalizeExportPrefs(raw: unknown): ExportPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ExportPrefs>;
  const strings = (list: unknown) =>
    Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];

  return {
    format: value.format === "mrpack" ? "mrpack" : "grubie",
    selected: strings(value.selected),
    known: strings(value.known),
  };
}

export function loadExportPrefs(versionPath: string): ExportPrefs | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${versionPath}`);
    return normalizeExportPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return null;
  }
}

export function saveExportPrefs(versionPath: string, prefs: ExportPrefs): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${versionPath}`, JSON.stringify(prefs));
  } catch {
    return;
  }
}
