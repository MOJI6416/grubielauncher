const MAX_LENGTH = 32;

export function uniqueInstanceName(base: string, taken: string[]): string {
  const trimmed = base.trim().slice(0, MAX_LENGTH).trim();
  if (!trimmed) return trimmed;

  const used = new Set(taken.map((name) => name.trim().toLocaleLowerCase()));
  if (!used.has(trimmed.toLocaleLowerCase())) return trimmed;

  for (let index = 2; index < 1000; index++) {
    const suffix = ` (${index})`;
    const head = trimmed.slice(0, MAX_LENGTH - suffix.length).trim();
    const candidate = `${head}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }

  return trimmed;
}
