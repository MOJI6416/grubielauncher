export function findOrphanFolders(
  directories: string[] | undefined | null,
  knownNames: string[] | undefined | null,
): string[] {
  const known = new Set(
    (knownNames ?? []).map((name) => name.trim().toLowerCase()),
  );

  return Array.from(
    new Set(
      (directories ?? [])
        .map((name) => name.trim())
        .filter((name) => name && !known.has(name.toLowerCase())),
    ),
  ).sort((a, b) => a.localeCompare(b));
}
