import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { decodeUtf8Strict } from "./langFiles";

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
