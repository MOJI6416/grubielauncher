import {
  FORBIDDEN_VERSION_NAME_SYMBOLS,
  unsupportedNameCharacters,
} from "@/shared/versionName";
import { uniqueInstanceName } from "@renderer/features/instances/instanceName";

export const INSTANCE_NAME_MAX = 32;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type InstanceNameIssue =
  | "empty"
  | "forbidden"
  | "emoji"
  | "control"
  | "dots"
  | "trailing"
  | "reserved"
  | "tooLong"
  | "taken"
  | "folderTaken";

export interface InstanceNameCheck {
  ok: boolean;
  issue: InstanceNameIssue | null;
  characters: string[];
  suggestion: string;
}

export function instanceNameMessage(
  check: InstanceNameCheck,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!check.issue) return "";

  return t(`newInstance.name.${check.issue}`, {
    characters: check.characters.join(" "),
    max: INSTANCE_NAME_MAX,
  });
}

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }

  return false;
}

function forbiddenCharacters(value: string): string[] {
  return FORBIDDEN_VERSION_NAME_SYMBOLS.filter((symbol) =>
    value.includes(symbol),
  );
}

export function sanitizeInstanceName(raw: string): string {
  let value = "";

  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    if (FORBIDDEN_VERSION_NAME_SYMBOLS.includes(char as never)) continue;
    if (unsupportedNameCharacters(char).length > 0) continue;
    value += char;
  }

  value = value.replace(/\s+/g, " ").trim().slice(0, INSTANCE_NAME_MAX);
  value = value.replace(/[. ]+$/, "").trim();

  if (/^\.+$/.test(value)) return "";
  if (WINDOWS_RESERVED.test(value.split(".")[0])) return "";

  return value;
}

export function suggestInstanceName(base: string, taken: string[]): string {
  const sanitized = sanitizeInstanceName(base);
  if (!sanitized) return "";

  return uniqueInstanceName(sanitized, taken);
}

export function checkInstanceName(
  raw: string,
  taken: string[],
  takenFolders: string[] = [],
): InstanceNameCheck {
  const value = raw.trim();
  const suggestion = suggestInstanceName(raw, [...taken, ...takenFolders]);
  const fail = (
    issue: InstanceNameIssue,
    characters: string[] = [],
  ): InstanceNameCheck => ({
    ok: false,
    issue,
    characters,
    suggestion: suggestion === value ? "" : suggestion,
  });

  if (!value) return fail("empty");

  const forbidden = forbiddenCharacters(value);
  if (forbidden.length > 0) return fail("forbidden", forbidden);

  const unsupported = unsupportedNameCharacters(value);
  if (unsupported.length > 0) return fail("emoji", unsupported);

  if (hasControlCharacter(value)) return fail("control");
  if (/^\.+$/.test(value)) return fail("dots");
  if (/[. ]$/.test(value)) return fail("trailing");
  if (WINDOWS_RESERVED.test(value.split(".")[0])) return fail("reserved");
  if (value.length > INSTANCE_NAME_MAX) return fail("tooLong");

  const key = value.toLocaleLowerCase();
  const used = new Set(taken.map((name) => name.trim().toLocaleLowerCase()));
  if (used.has(key)) return fail("taken");

  const usedFolders = new Set(
    takenFolders.map((name) => name.trim().toLocaleLowerCase()),
  );
  if (usedFolders.has(key)) return fail("folderTaken");

  return { ok: true, issue: null, characters: [], suggestion: "" };
}
