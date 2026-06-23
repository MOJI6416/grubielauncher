export const FORBIDDEN_VERSION_NAME_SYMBOLS = [
  "\\",
  "/",
  ":",
  "*",
  "?",
  '"',
  "<",
  ">",
  "|",
] as const;

export function isSafeVersionName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 32 || trimmed.includes("\0")) return false;
  if (/^\.+$/.test(trimmed)) return false;
  return !FORBIDDEN_VERSION_NAME_SYMBOLS.some((symbol) =>
    trimmed.includes(symbol),
  );
}

export function assertSafeVersionName(name: unknown): string {
  if (!isSafeVersionName(name)) {
    throw new Error(`Unsafe version name: ${String(name)}`);
  }
  return name.trim();
}
