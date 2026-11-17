import {
  isManagedTranslationPack,
  MANAGED_TRANSLATION_PACK_PREFIX,
} from "@/types/ModTranslations";
import { langFormatFor } from "./langFiles";

export const MANAGED_PACK_PREFIX = MANAGED_TRANSLATION_PACK_PREFIX;
export const isManagedPackFile = isManagedTranslationPack;

export function packEntryName(fileName: string, mcVersion: string): string {
  return usesFilePrefix(mcVersion) ? `file/${fileName}` : fileName;
}

function usesFilePrefix(mcVersion: string): boolean {
  return langFormatFor(mcVersion) === "json";
}

function entryFileName(entry: string): string {
  return entry.startsWith("file/") ? entry.slice(5) : entry;
}

function isManagedEntry(entry: string): boolean {
  return isManagedPackFile(entryFileName(entry));
}

function parseList(value: string | undefined): string[] | null {
  if (value === undefined) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

interface OptionLine {
  key: string;
  value: string;
}

function parseOptions(text: string): Array<OptionLine | string> {
  return text.split(/\r?\n/).map((line) => {
    const separator = line.indexOf(":");
    if (separator <= 0) return line;
    return { key: line.slice(0, separator), value: line.slice(separator + 1) };
  });
}

export function readOptionList(text: string, key: string): string[] | null {
  for (const line of parseOptions(text)) {
    if (typeof line !== "string" && line.key === key) return parseList(line.value);
  }
  return [];
}

export interface TranslationOptions {
  mcVersion: string;
  // Our packs in install order, lowest precedence first.
  packFiles: string[];
  // Game locale to switch to when the game still shows English.
  locale: string | null;
}

export interface OptionsResult {
  text: string;
  changed: boolean;
}

// Our packs go directly above the built-in ones (vanilla, the mods' own
// resources) and below every pack the player enabled, in the player's order:
// a texture or translation pack they chose always wins over ours. They are
// also listed as accepted-incompatible, which is how the game itself keeps a
// pack whose pack_format is for another version enabled instead of dropping
// it from the list on load.
export function applyTranslationOptions(
  source: string | null,
  options: TranslationOptions,
): OptionsResult {
  const text = source ?? "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text ? parseOptions(text) : [];
  const find = (key: string) =>
    lines.find(
      (line): line is OptionLine => typeof line !== "string" && line.key === key,
    );

  const packsLine = find("resourcePacks");
  const current = parseList(packsLine?.value);
  const incompatibleLine = find("incompatibleResourcePacks");
  const incompatible = parseList(incompatibleLine?.value);
  if (current === null || incompatible === null) {
    return { text, changed: false };
  }

  const ours = options.packFiles.map((file) =>
    packEntryName(file, options.mcVersion),
  );
  const theirs = current.filter((entry) => !isManagedEntry(entry));
  if (
    usesFilePrefix(options.mcVersion) &&
    !packsLine &&
    !theirs.includes("vanilla")
  ) {
    theirs.unshift("vanilla");
  }

  const firstPlayerPack = usesFilePrefix(options.mcVersion)
    ? theirs.findIndex((entry) => entry.startsWith("file/"))
    : 0;
  const at = firstPlayerPack < 0 ? theirs.length : firstPlayerPack;
  const nextPacks = [...theirs.slice(0, at), ...ours, ...theirs.slice(at)];
  const nextIncompatible = [
    ...incompatible.filter((entry) => !isManagedEntry(entry)),
    ...ours,
  ];

  const set = (key: string, value: string) => {
    const line = find(key);
    if (line) line.value = value;
    else lines.push({ key, value });
  };

  const before = JSON.stringify(lines);
  if (ours.length > 0 || packsLine) set("resourcePacks", JSON.stringify(nextPacks));
  if (ours.length > 0 || incompatibleLine) {
    set("incompatibleResourcePacks", JSON.stringify(nextIncompatible));
  }

  if (options.locale) {
    const langLine = find("lang");
    if (!langLine || /^en_us$/i.test(langLine.value.trim())) {
      set("lang", localeForVersion(options.locale, options.mcVersion));
    }
  }

  if (JSON.stringify(lines) === before) return { text, changed: false };

  const body = lines
    .map((line) => (typeof line === "string" ? line : `${line.key}:${line.value}`))
    .join(eol);
  return { text: body.endsWith(eol) || !body ? body : body + eol, changed: true };
}

function localeForVersion(locale: string, mcVersion: string): string {
  const match = /^1\.(\d+)/.exec(mcVersion);
  if (!match || Number(match[1]) > 10) return locale;
  const [language, country] = locale.split("_");
  return `${language}_${country.toUpperCase()}`;
}

const LEGACY_PACK_FORMATS: Array<[number, number, number]> = [
  [6, 0, 1],
  [9, 0, 2],
  [11, 0, 3],
  [13, 0, 4],
  [15, 0, 5],
  [16, 2, 6],
  [17, 0, 7],
  [18, 0, 8],
  [19, 0, 9],
  [19, 3, 12],
  [19, 4, 13],
  [20, 0, 15],
];

export function legacyPackFormat(mcVersion: string): number | null {
  const match = /^1\.(\d+)(?:\.(\d+))?$/.exec(mcVersion);
  if (!match) return null;
  const minor = Number(match[1]);
  const patch = Number(match[2] ?? 0);
  if (minor > 20 || (minor === 20 && patch > 1)) return null;

  let format: number | null = null;
  for (const [fromMinor, fromPatch, value] of LEGACY_PACK_FORMATS) {
    if (minor > fromMinor || (minor === fromMinor && patch >= fromPatch)) {
      format = value;
    }
  }
  return format;
}

// Up to 1.20.1 only pack_format is read, so it is the version's own number.
// Newer games read supported_formats (1.20.2+) or min/max_format (1.21.9+);
// this is the shape the big community packs ship and it holds for every
// version since.
export function packMcmeta(mcVersion: string, description: string): string {
  const legacy = legacyPackFormat(mcVersion);
  const pack =
    legacy !== null
      ? { pack_format: legacy, description }
      : {
          pack_format: 15,
          supported_formats: [15, 9999],
          min_format: [15, 0],
          max_format: [9999, 0],
          description,
        };
  return JSON.stringify({ pack }, null, 2);
}
