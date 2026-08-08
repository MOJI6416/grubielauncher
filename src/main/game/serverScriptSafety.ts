
export function assertSafeFileSegment(value: string, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._+-]+$/.test(value)) {
    throw new Error(`Unsafe ${label}: ${String(value)}`);
  }
  return value;
}

export function toSafeFileName(value: string, label: string): string {
  const raw = typeof value === "string" ? value : "";
  const name = (raw.split(/[\\/]+/).pop() ?? "").trim();

  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("\0") ||
    /^[A-Za-z]:/.test(name)
  ) {
    throw new Error(`Unsafe ${label}: ${String(value)}`);
  }

  return name;
}

export function assertSafeRelativePath(value: string, label: string): string {
  const normalized = typeof value === "string" ? value.replaceAll("\\", "/") : "";

  if (
    !normalized ||
    !/^[A-Za-z0-9._/-]+$/.test(normalized) ||
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Unsafe ${label}: ${String(value)}`);
  }

  return normalized;
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
