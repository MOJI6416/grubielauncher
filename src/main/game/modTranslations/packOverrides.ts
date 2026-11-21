import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { decodeUtf8Strict } from "./langFiles";
import { isManagedPackFile } from "./optionsTxt";

const FILE = ["config", "resourcepackoverrides.json"];

export interface OverridesFile {
  digest: string;
}

function digestOf(data: string | Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

function closingBracket(text: string, open: number): number {
  let quote: string | null = null;
  for (let index = open + 1; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
    } else if (char === '"') {
      quote = char;
    } else if (char === "]") {
      return index;
    }
  }
  return -1;
}

export function addDefaultPacks(text: string, entries: string[]): string {
  const field = /"default_packs"\s*:\s*\[/.exec(text);
  if (!field) return text;
  const open = field.index + field[0].length - 1;
  const close = closingBracket(text, open);
  if (close < 0) return text;
  const inside = text.slice(open + 1, close);
  const missing = entries.filter((entry) => !inside.includes(JSON.stringify(entry)));
  if (missing.length === 0) return text;
  const indent = /\n([ \t]+)"/.exec(inside)?.[1] ?? "  ";
  const trimmed = inside.replace(/\s+$/, "");
  const separator = trimmed.trim() ? "," : "";
  const added = missing.map((entry) => `\n${indent}${JSON.stringify(entry)}`).join(",");
  const tail = inside.slice(trimmed.length) || "\n";
  return `${text.slice(0, open + 1)}${trimmed}${separator}${added}${tail}${text.slice(close)}`;
}

function backupPath(storage: string): string {
  return path.join(storage, "resourcepackoverrides.json");
}

export async function applyPackOverrides(
  versionPath: string,
  storage: string,
  packFiles: string[],
  previous: OverridesFile | null,
): Promise<OverridesFile | null> {
  const target = path.join(versionPath, ...FILE);
  const raw = await fs.readFile(target).catch(() => null);
  if (!raw) return null;
  const current = decodeUtf8Strict(raw);
  if (current === null) return null;
  const ours = previous?.digest === digestOf(raw);
  const original = ours
    ? await fs.readFile(backupPath(storage), "utf8").catch(() => null)
    : current;
  if (original === null) return null;
  const next = addDefaultPacks(original, packFiles.map((file) => `file/${file}`));
  if (next === original) {
    if (ours) {
      await fs.copy(backupPath(storage), target, { overwrite: true });
      await fs.remove(backupPath(storage)).catch(() => undefined);
    }
    return null;
  }
  if (!ours) {
    await fs.ensureDir(storage);
    await fs.writeFile(backupPath(storage), raw);
  }
  if (next !== current) {
    await fs.writeFile(`${target}.grubie-tmp`, next, "utf8");
    await fs.move(`${target}.grubie-tmp`, target, { overwrite: true });
  }
  return { digest: digestOf(next) };
}

export async function restorePackOverrides(
  versionPath: string,
  storage: string,
  previous: OverridesFile | null,
): Promise<void> {
  if (!previous) return;
  const target = path.join(versionPath, ...FILE);
  const raw = await fs.readFile(target).catch(() => null);
  if (raw && digestOf(raw) === previous.digest && (await fs.pathExists(backupPath(storage)))) {
    await fs.copy(backupPath(storage), target, { overwrite: true });
  }
  await fs.remove(backupPath(storage)).catch(() => undefined);
}

const DEFAULT_OPTIONS_FILE = ["config", "defaultoptions-common.toml"];

interface TomlItem {
  start: number;
  end: number;
  value: string;
}

function tomlPackList(text: string): TomlItem[] | null {
  const field = /^[ \t]*defaultResourcePacks[ \t]*=[ \t]*\[/m.exec(text);
  if (!field) return null;
  const items: TomlItem[] = [];
  let index = field.index + field[0].length;
  while (index < text.length) {
    const char = text[index];
    if (char === "]") return items;
    if (char === "#") {
      while (index < text.length && text[index] !== "\n") index++;
      continue;
    }
    if (char !== '"' && char !== "'") {
      index++;
      continue;
    }
    let end = index + 1;
    while (end < text.length && text[end] !== char) {
      if (text[end] === "\n") return null;
      end += char === '"' && text[end] === "\\" ? 2 : 1;
    }
    if (end >= text.length) return null;
    const raw = text.slice(index, end + 1);
    let value: string;
    try {
      value = char === '"' ? (JSON.parse(raw) as string) : raw.slice(1, -1);
    } catch {
      return null;
    }
    items.push({ start: index, end: end + 1, value });
    index = end + 1;
  }
  return null;
}

function isOurEntry(value: string): boolean {
  return isManagedPackFile(value.replace(/^file\//, ""));
}

function separatorAt(text: string, items: TomlItem[], index: number): string {
  const at = Math.min(Math.max(index, 1), items.length - 1);
  const between = at > 0 ? text.slice(items[at - 1].end, items[at].start) : "";
  return between.includes(",") && !between.includes("#") ? between : ", ";
}

export function removeTomlPacks(text: string): string {
  let current = text;
  for (;;) {
    const items = tomlPackList(current);
    const index = items?.findIndex((item) => isOurEntry(item.value)) ?? -1;
    if (!items || index < 0) return current;
    const item = items[index];
    const [from, to] =
      index > 0
        ? [items[index - 1].end, item.end]
        : index + 1 < items.length
          ? [item.start, items[index + 1].start]
          : [item.start, item.end];
    current = current.slice(0, from) + current.slice(to);
  }
}

export function addTomlPacks(text: string, entries: string[]): string {
  const items = tomlPackList(text);
  if (!items || items.length === 0) return text;
  const missing = entries.filter((entry) => !items.some((item) => item.value === entry));
  if (missing.length === 0) return text;
  const quoted = missing.map((entry) => JSON.stringify(entry));
  const firstFile = items.findIndex((item) => item.value.startsWith("file/"));
  if (firstFile < 0) {
    const last = items[items.length - 1];
    const separator = separatorAt(text, items, items.length - 1);
    return `${text.slice(0, last.end)}${separator}${quoted.join(separator)}${text.slice(last.end)}`;
  }
  const at = items[firstFile].start;
  const separator = separatorAt(text, items, firstFile);
  return `${text.slice(0, at)}${quoted.join(separator)}${separator}${text.slice(at)}`;
}

async function rewriteDefaultOptions(
  versionPath: string,
  change: (text: string) => string,
): Promise<void> {
  const target = path.join(versionPath, ...DEFAULT_OPTIONS_FILE);
  const raw = await fs.readFile(target).catch(() => null);
  if (!raw) return;
  const current = decodeUtf8Strict(raw);
  if (current === null) return;
  const next = change(current);
  if (next === current) return;
  await fs.writeFile(`${target}.grubie-tmp`, next, "utf8");
  await fs.move(`${target}.grubie-tmp`, target, { overwrite: true });
}

export function applyDefaultOptionsPacks(versionPath: string, entries: string[]): Promise<void> {
  return rewriteDefaultOptions(versionPath, (text) => addTomlPacks(removeTomlPacks(text), entries));
}

export function restoreDefaultOptionsPacks(versionPath: string): Promise<void> {
  return rewriteDefaultOptions(versionPath, removeTomlPacks);
}
