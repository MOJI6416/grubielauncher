import {
  NESTED_INSTANCE_ROOTS,
  PRIVATE_INSTANCE_PATHS,
  RUNTIME_INSTANCE_PATHS,
  normalizeInstancePath,
} from "@/shared/instancePrivacy";
import { isWorldsPath } from "@/shared/worldPrivacy";
import { notSupportedPaths } from "./file";

export type BlockedShareReason = "private" | "runtime" | "managed" | "world";

export function createForbiddenPathSet(version: string, loader: string) {
  return new Set(
    notSupportedPaths.map((pathName) =>
      pathName.replace("${version}", version).replace("${loader}", loader),
    ),
  );
}

export function isForbiddenSharePath(
  pathName: string,
  forbiddenPaths: Iterable<string>,
) {
  return Array.from(forbiddenPaths).some(
    (forbiddenPath) =>
      pathName === forbiddenPath || pathName.startsWith(`${forbiddenPath}/`),
  );
}

export function filterSelectableSharePaths(
  paths: string[],
  forbiddenPaths: Iterable<string>,
) {
  return paths.filter(
    (pathName) =>
      pathName &&
      !pathName.startsWith(".") &&
      !isForbiddenSharePath(pathName, forbiddenPaths),
  );
}

export function getShareRelativePath(currentPath: string, entryPath: string) {
  return currentPath ? `${currentPath}/${entryPath}` : entryPath;
}

export function toggleSelectedSharePath(
  selectedPaths: string[],
  pathName: string,
  forbiddenPaths: Iterable<string>,
) {
  if (isForbiddenSharePath(pathName, forbiddenPaths)) return selectedPaths;
  if (selectedPaths.includes(pathName)) {
    return selectedPaths.filter((selectedPath) => selectedPath !== pathName);
  }

  const withoutParentFolders = selectedPaths.filter(
    (selectedPath) => !pathName.startsWith(`${selectedPath}/`),
  );

  return [...withoutParentFolders, pathName];
}

export function selectShareFolderPath(
  selectedPaths: string[],
  folderPath: string,
) {
  return [
    ...selectedPaths.filter(
      (selectedPath) => !selectedPath.startsWith(`${folderPath}/`),
    ).filter(
      (selectedPath) => selectedPath !== folderPath,
    ),
    folderPath,
  ];
}

export function selectSharePaths(
  selectedPaths: string[],
  pathNames: string[],
  forbiddenPaths: Iterable<string>,
) {
  return pathNames.reduce((nextPaths, pathName) => {
    if (isForbiddenSharePath(pathName, forbiddenPaths)) return nextPaths;

    return selectShareFolderPath(nextPaths, pathName);
  }, selectedPaths);
}

export function unselectShareFolderPath(
  selectedPaths: string[],
  folderPath: string,
) {
  return selectedPaths.filter(
    (selectedPath) =>
      selectedPath !== folderPath && !selectedPath.startsWith(`${folderPath}/`),
  );
}

function matchesInstanceList(pathName: string, list: readonly string[]) {
  const normalized = normalizeInstancePath(pathName);
  if (!normalized) return false;

  const hits = (value: string) =>
    list.some((item) => value === item || value.startsWith(`${item}/`));

  if (hits(normalized)) return true;

  const nestedRoot = NESTED_INSTANCE_ROOTS.find((nested) =>
    normalized.startsWith(`${nested}/`),
  );

  return nestedRoot ? hits(normalized.slice(nestedRoot.length + 1)) : false;
}

export function classifyBlockedSharePath(
  pathName: string,
  forbiddenPaths: Iterable<string>,
): BlockedShareReason | null {
  if (!isForbiddenSharePath(pathName, forbiddenPaths)) return null;
  if (isWorldsPath(pathName)) return "world";
  if (matchesInstanceList(pathName, PRIVATE_INSTANCE_PATHS)) return "private";
  if (matchesInstanceList(pathName, RUNTIME_INSTANCE_PATHS)) return "runtime";
  return "managed";
}

export function shareRootLabel(pathFolder: string) {
  const segments = pathFolder.split(/[\\/]+/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : "";
}

export interface ShareTrailItem {
  label: string;
  path: string;
}

export interface ShareTrail {
  collapsed: ShareTrailItem | null;
  items: ShareTrailItem[];
}

export function buildShareTrail(
  segments: string[],
  maxVisible = 2,
): ShareTrail {
  const items = segments.map((label, index) => ({
    label,
    path: segments.slice(0, index + 1).join("/"),
  }));

  if (items.length <= maxVisible) return { collapsed: null, items };

  return {
    collapsed: items[items.length - maxVisible - 1],
    items: items.slice(items.length - maxVisible),
  };
}

export function getShareParentPath(currentPath: string) {
  const segments = currentPath.split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
}

export function countSelectedInsideFolder(
  selectedPaths: string[],
  folderPath: string,
) {
  return selectedPaths.filter((selectedPath) =>
    selectedPath.startsWith(`${folderPath}/`),
  ).length;
}

export function splitSharePath(pathName: string) {
  const index = pathName.lastIndexOf("/");
  if (index < 0) return { folder: "", name: pathName };

  return {
    folder: `${pathName.slice(0, index)}/`,
    name: pathName.slice(index + 1),
  };
}

export function matchesShareQuery(name: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return name.toLowerCase().includes(normalizedQuery);
}
