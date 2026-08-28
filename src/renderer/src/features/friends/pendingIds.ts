export function keepPendingIds(
  ids: string[],
  known: Iterable<string>,
): string[] {
  if (ids.length === 0) return ids;

  const alive = known instanceof Set ? known : new Set(known);
  if (ids.every((id) => alive.has(id))) return ids;

  return ids.filter((id) => alive.has(id));
}
