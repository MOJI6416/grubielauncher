export interface ModContext {
  name: string;
  description?: string;
}

export const CONTEXT_NAME_MAX = 100;
export const CONTEXT_DESCRIPTION_MAX = 300;

export const MOD_METADATA_FILES = [
  "fabric.mod.json",
  "quilt.mod.json",
  "META-INF/neoforge.mods.toml",
  "META-INF/mods.toml",
  "mcmod.info",
] as const;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string" || value.includes("${")) return "";
  const text = value
    .replace(/§[0-9a-fk-or]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function contextOf(name: unknown, description: unknown): ModContext | null {
  const cleanName = clean(name, CONTEXT_NAME_MAX);
  if (!cleanName) return null;
  const cleanDescription = clean(description, CONTEXT_DESCRIPTION_MAX);
  return cleanDescription
    ? { name: cleanName, description: cleanDescription }
    : { name: cleanName };
}

function escapeControlInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (!inString) {
      if (char === '"') inString = true;
      out += char;
    } else if (escaped) {
      escaped = false;
      out += char;
    } else if (char === "\\") {
      escaped = true;
      out += char;
    } else if (char === '"') {
      inString = false;
      out += char;
    } else if (char === "\n") {
      out += "\\n";
    } else if (char === "\r") {
      out += "\\r";
    } else if (char === "\t") {
      out += "\\t";
    } else {
      out += char;
    }
  }
  return out;
}

function lenientJson(text: string): unknown {
  const body = text.replace(/^\uFEFF/, "");
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(
        escapeControlInStrings(
          body.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"),
        ),
      );
    } catch {
      return null;
    }
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function contextFromFabric(text: string): ModContext | null {
  const json = record(lenientJson(text));
  if (!json) return null;
  return contextOf(json.name ?? json.id, json.description);
}

export function contextFromQuilt(text: string): ModContext | null {
  const loader = record(record(lenientJson(text))?.quilt_loader);
  const metadata = record(loader?.metadata);
  return contextOf(metadata?.name ?? loader?.id, metadata?.description);
}

export function contextFromMcmodInfo(text: string): ModContext | null {
  const json = lenientJson(text);
  const list = Array.isArray(json) ? json : record(json)?.modList;
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    const mod = record(item);
    const context = mod
      ? contextOf(mod.name ?? mod.modid, mod.description)
      : null;
    if (context) return context;
  }
  return null;
}

const TOML_BASIC = /^"((?:[^"\\\r\n]|\\.)*)"/;
const TOML_KEY = /^[ \t]*([A-Za-z0-9_-]+)[ \t]*=[ \t]*/gm;
const TOML_HEADER = /^\s*\[/m;
const TOML_MODS = /^\s*\[\[\s*mods\s*\]\]\s*(?:#.*)?$/m;

function tomlString(
  text: string,
  start: number,
): { value: string; end: number } | null {
  for (const quote of ["'''", '"""']) {
    if (!text.startsWith(quote, start)) continue;
    const end = text.indexOf(quote, start + 3);
    if (end < 0) return null;
    const body = text.slice(start + 3, end).replace(/^\r?\n/, "");
    return {
      value: quote === "'''" ? body : body.replace(/\\\r?\n\s*/g, ""),
      end: end + 3,
    };
  }
  if (text[start] === "'") {
    const end = text.indexOf("'", start + 1);
    return end < 0 ? null : { value: text.slice(start + 1, end), end: end + 1 };
  }
  if (text[start] === '"') {
    const match = TOML_BASIC.exec(text.slice(start));
    if (!match) return null;
    let value = match[1];
    try {
      value = JSON.parse(`"${match[1]}"`) as string;
    } catch {
      value = match[1];
    }
    return { value, end: start + match[0].length };
  }
  return null;
}

export function contextFromModsToml(text: string): ModContext | null {
  const body = text.replace(/^\uFEFF/, "");
  const section = TOML_MODS.exec(body);
  if (!section) return null;
  const from = section.index + section[0].length;
  const next = TOML_HEADER.exec(body.slice(from));
  const limit = next ? from + next.index : body.length;
  const values: Record<string, string> = {};
  const key = new RegExp(TOML_KEY.source, TOML_KEY.flags);
  key.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = key.exec(body)) && match.index < limit) {
    const parsed = tomlString(body, match.index + match[0].length);
    if (!parsed) continue;
    if (!(match[1] in values)) values[match[1]] = parsed.value;
    key.lastIndex = parsed.end;
  }
  return contextOf(values.displayName ?? values.modId, values.description);
}

export function readModContext(
  fileName: string,
  data: Buffer,
): ModContext | null {
  const text = data.toString("utf8");
  switch (fileName) {
    case "fabric.mod.json":
      return contextFromFabric(text);
    case "quilt.mod.json":
      return contextFromQuilt(text);
    case "META-INF/neoforge.mods.toml":
    case "META-INF/mods.toml":
      return contextFromModsToml(text);
    case "mcmod.info":
      return contextFromMcmodInfo(text);
    default:
      return null;
  }
}

export function preferredContext(
  found: ReadonlyMap<string, ModContext>,
): ModContext | null {
  for (const fileName of MOD_METADATA_FILES) {
    const context = found.get(fileName);
    if (context) return context;
  }
  return null;
}
