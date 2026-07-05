
export function assertSafeFileSegment(value: string, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._+-]+$/.test(value)) {
    throw new Error(`Unsafe ${label}: ${String(value)}`);
  }
  return value;
}

export function toArgfilePath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function validateServerMemory(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error(`Invalid server memory value: ${String(value)}`);
  }
  return Math.floor(raw);
}
