import { notSupportedPaths } from "./file";

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
