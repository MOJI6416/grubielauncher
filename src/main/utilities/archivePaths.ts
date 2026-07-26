import path from "path";

export function getSafeExtractPath(
  destinationRoot: string,
  entryName: string,
): string {
  const name = (entryName || "").replace(/\\/g, "/");

  if (!name || name === "." || name === "/") {
    throw new Error(`Invalid zip entry name: "${entryName}"`);
  }

  if (
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /^[a-zA-Z]:/.test(name)
  ) {
    throw new Error(`Unsafe zip entry path (absolute): "${entryName}"`);
  }

  const normalized = path.posix.normalize(name);

  if (normalized.startsWith("..") || normalized.includes("/..")) {
    throw new Error(`Unsafe zip entry path (traversal): "${entryName}"`);
  }

  const root = path.resolve(destinationRoot);
  const target = path.resolve(root, normalized);

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Unsafe zip entry path (escape): "${entryName}"`);
  }

  return target;
}
