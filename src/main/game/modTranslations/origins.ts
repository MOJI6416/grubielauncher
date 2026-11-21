import type { LangEntries } from "./unitHash";

export const ORIGIN_FILE = /^data\/([^/]+)\/(origins|powers|origin_layers)\/(.+)\.json$/;
const ORIGIN_KIND: Record<string, string> = {
  origins: "origin",
  powers: "power",
  origin_layers: "layer",
};
const KEY_LIKE = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/;

export function originKeysAreText(mcVersion: string): boolean {
  return !/^1\.(?:2[1-9]|[3-9]\d)|^\d{2}\./.test(mcVersion);
}

export function originEntries(
  name: string,
  text: string,
  keysAreText: boolean,
): LangEntries {
  const match = ORIGIN_FILE.exec(name);
  if (!match) return {};
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return {};
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const [, namespace, folder, file] = match;
  const kind = ORIGIN_KIND[folder];
  const fields = kind === "layer" ? ["name"] : ["name", "description"];
  const entries: LangEntries = {};
  for (const field of fields) {
    const value = (json as Record<string, unknown>)[field];
    if (typeof value !== "string" || !value.trim() || KEY_LIKE.test(value.trim())) continue;
    const key = keysAreText
      ? value
      : `${kind}.${namespace}.${file.replace(/\//g, ".")}.${field}`;
    entries[key] = value;
  }
  return entries;
}
