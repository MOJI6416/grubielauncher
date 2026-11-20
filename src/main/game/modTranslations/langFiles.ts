import { usesUppercaseLangCode } from "../legacyGame";
import type { LangEntries } from "./unitHash";

export type LangFormat = "json" | "lang";

const LANG_PATH =
  /^assets\/([^/]+)\/lang\/([a-z]{2,3}_[a-z]{2,4})\.(json|lang)$/i;

export interface LangPath {
  namespace: string;
  locale: string;
  format: LangFormat;
}

export function parseLangPath(name: string): LangPath | null {
  const match = LANG_PATH.exec(name.replace(/\\/g, "/"));
  if (!match) return null;
  return {
    namespace: match[1],
    locale: match[2].toLowerCase(),
    format: match[3].toLowerCase() as LangFormat,
  };
}

export function lenientJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(
      text
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/,(\s*[}\]])/g, "$1"),
    );
  }
}

export function parseLangFile(format: LangFormat, data: Buffer): LangEntries {
  const text = data.toString("utf8").replace(/^\uFEFF/, "");
  const entries: LangEntries = {};

  if (format === "json") {
    const parsed = lenientJson(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return entries;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") entries[key] = value;
    }
    return entries;
  }

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    entries[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return entries;
}

export function serializeLangFile(
  format: LangFormat,
  entries: LangEntries,
): Buffer {
  const keys = Object.keys(entries).sort();
  if (format === "json") {
    const sorted: LangEntries = {};
    for (const key of keys) sorted[key] = entries[key];
    return Buffer.from(JSON.stringify(sorted, null, 1), "utf8");
  }
  return Buffer.from(
    keys
      .map((key) => `${key}=${entries[key].replace(/\r?\n/g, "\\n")}`)
      .join("\n") + "\n",
    "utf8",
  );
}

export function langFileName(
  locale: string,
  format: LangFormat,
  mcVersion: string,
): string {
  if (format === "json") return `${locale}.json`;
  const [language, country] = locale.split("_");
  return usesUppercaseLangCode(mcVersion)
    ? `${language}_${country.toUpperCase()}.lang`
    : `${locale}.lang`;
}

export function langFormatFor(mcVersion: string): LangFormat {
  const match = /^1\.(\d+)/.exec(mcVersion);
  return match && Number(match[1]) < 13 ? "lang" : "json";
}
