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
  packFiles: string[];
  incompatibleFiles: string[];
  locale: string | null;
}

export interface OptionsResult {
  text: string;
  changed: boolean;
}

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
  const incompatibleOurs = new Set(options.incompatibleFiles);
  const nextIncompatible = [
    ...incompatible.filter((entry) => !isManagedEntry(entry)),
    ...ours.filter((entry) => incompatibleOurs.has(entryFileName(entry))),
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

type FormatRange = [number, number];

function formatValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value) && typeof value[0] === "number") {
    const minor = typeof value[1] === "number" ? value[1] : 0;
    return value[0] + minor / 1000;
  }
  return null;
}

function supportedRange(value: unknown): FormatRange | null {
  const single = formatValue(value);
  if (single !== null && !Array.isArray(value)) return [single, single];
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return [value[0], value[1]];
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const range = value as { min_inclusive?: unknown; max_inclusive?: unknown };
    if (
      typeof range.min_inclusive === "number" &&
      typeof range.max_inclusive === "number"
    ) {
      return [range.min_inclusive, range.max_inclusive];
    }
  }
  return null;
}

export function gameResourceFormat(
  versionJson: unknown,
  mcVersion: string,
): number | null {
  const legacy = legacyPackFormat(mcVersion);
  if (legacy !== null) return legacy;
  const packVersion = (versionJson as { pack_version?: unknown } | null)
    ?.pack_version;
  if (typeof packVersion === "number") return packVersion;
  if (packVersion && typeof packVersion === "object") {
    const fields = packVersion as Record<string, unknown>;
    if (typeof fields.resource === "number") return fields.resource;
    if (typeof fields.resource_major === "number") {
      const minor =
        typeof fields.resource_minor === "number" ? fields.resource_minor : 0;
      return fields.resource_major + minor / 1000;
    }
  }
  return null;
}

export function packSupportsGame(
  mcmeta: unknown,
  gameFormat: number,
  mcVersion: string,
): boolean {
  const pack = (mcmeta as { pack?: Record<string, unknown> } | null)?.pack;
  if (!pack || typeof pack !== "object") return false;
  const declared = formatValue(pack.pack_format);
  if (legacyPackFormat(mcVersion) !== null) return declared === gameFormat;

  const min = formatValue(pack.min_format);
  const max = formatValue(pack.max_format);
  const range: FormatRange | null =
    gameFormat >= 65 && min !== null && max !== null
      ? [min, max]
      : (supportedRange(pack.supported_formats) ??
        (declared !== null ? [declared, declared] : null));
  if (!range) return false;
  return gameFormat >= range[0] && gameFormat <= range[1];
}

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
