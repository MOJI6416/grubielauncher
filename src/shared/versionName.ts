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

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const PICTOGRAPHIC_ALLOWED = new Set(["©", "®", "™"]);
const EMOJI_JOINERS = new Set([0x200d, 0x20e3, 0xfe0f, 0xfe0e]);

export function unsupportedNameCharacters(value: string): string[] {
  const found: string[] = [];

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (PICTOGRAPHIC_ALLOWED.has(char)) continue;
    if (code <= 0xffff && !EMOJI_JOINERS.has(code) && !PICTOGRAPHIC.test(char)) {
      continue;
    }
    if (!found.includes(char)) found.push(char);
  }

  return found;
}

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function isSafeVersionName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 32) return false;
  if (hasControlCharacter(trimmed)) return false;
  if (/^\.+$/.test(trimmed)) return false;
  if (/[. ]$/.test(trimmed)) return false;
  if (WINDOWS_RESERVED_NAMES.test(trimmed.split(".")[0])) return false;
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
