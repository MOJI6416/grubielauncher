import { createHash } from "crypto";
import fs from "fs-extra";
import path from "path";
import {
  createZipArchive,
  readEntryData,
  withArchive,
  type ArchiveExtraEntry,
} from "../../utilities/archiver";

const TRIM_VERSION = 1;
const ALWAYS_KEPT = ["minecraft", "realms"];
const LANG_JSON = /^assets\/[^/]+\/lang\/[^/]+\.json$/i;
const RICH_TEXT_NAMESPACE = "owo";

export interface PackTrim {
  id: string;
  keep: ReadonlySet<string>;
  richText: boolean;
}

export interface TrimResult {
  files: number;
  dropped: number;
  cleaned: number;
}

export function packTrim(namespaces: readonly string[]): PackTrim {
  const keep = new Set([
    ...ALWAYS_KEPT,
    ...namespaces.map((namespace) => namespace.toLowerCase()),
  ]);
  const richText = keep.has(RICH_TEXT_NAMESPACE);
  const id = createHash("sha1")
    .update(`${TRIM_VERSION}\n${richText ? 1 : 0}\n${[...keep].sort().join("\n")}`)
    .digest("hex");
  return { id, keep, richText };
}

export function cleanLangJson(data: Buffer, richText: boolean): Buffer | null {
  const text = data.toString("utf8");
  const bare = text.replace(/^\uFEFF/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bare);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const entries = Object.entries(parsed as Record<string, unknown>);
  const strings = entries.filter(([, value]) => typeof value === "string");
  if (richText || strings.length === entries.length) {
    return bare.length === text.length ? data : Buffer.from(bare, "utf8");
  }
  return Buffer.from(JSON.stringify(Object.fromEntries(strings), null, 2), "utf8");
}

function keptEntry(name: string, trim: PackTrim): boolean {
  const parts = name.split("/");
  if (parts[0] !== "assets" || parts.length < 3) return true;
  return trim.keep.has(parts[1].toLowerCase());
}

export async function writeTrimmedPack(
  source: string,
  target: string,
  trim: PackTrim,
): Promise<TrimResult> {
  const files: ArchiveExtraEntry[] = [];
  let dropped = 0;
  let cleaned = 0;
  await withArchive(source, async (archive) => {
    for (const entry of archive.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName.replace(/\\/g, "/");
      if (!keptEntry(name, trim)) continue;
      const data = await readEntryData(entry);
      if (!LANG_JSON.test(name)) {
        files.push({ name, data });
        continue;
      }
      const lang = cleanLangJson(data, trim.richText);
      if (!lang) {
        dropped++;
        continue;
      }
      if (lang !== data) cleaned++;
      files.push({ name, data: lang });
    }
  });

  const temp = path.join(path.dirname(source), `${path.basename(target)}.tmp`);
  await createZipArchive([], temp, undefined, 6, undefined, files);
  await fs.ensureDir(path.dirname(target));
  await fs.move(temp, target, { overwrite: true });
  return { files: files.length, dropped, cleaned };
}
