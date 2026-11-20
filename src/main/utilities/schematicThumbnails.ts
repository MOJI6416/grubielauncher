import fs from "fs-extra";
import path from "path";
import { createHash } from "crypto";
import { getLauncherPaths } from "./other";
import { writeAtomically } from "./blockAssets";
import { schematicFormatOf } from "./schematics";

const FOLDER = "schematic-thumbnails";
const VERSION = 1;
const MAX_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function prefixOf(filePath: string): string {
  const resolved = path.resolve(filePath);
  const comparable = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  return createHash("sha1").update(comparable).digest("hex").slice(0, 20);
}

async function thumbnailFile(filePath: string): Promise<{ file: string; prefix: string } | null> {
  if (!schematicFormatOf(filePath)) return null;
  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats?.isFile()) return null;
  const prefix = prefixOf(filePath);
  return {
    prefix,
    file: path.join(
      getLauncherPaths().cache,
      FOLDER,
      `${prefix}-${stats.size}-${Math.round(stats.mtimeMs)}.v${VERSION}.png`,
    ),
  };
}

export async function readSchematicThumbnail(filePath: string): Promise<string | null> {
  const target = await thumbnailFile(filePath);
  if (!target) return null;
  const data = await fs.readFile(target.file).catch(() => null);
  return data ? `data:image/png;base64,${data.toString("base64")}` : null;
}

export async function saveSchematicThumbnail(
  filePath: string,
  png: Uint8Array,
): Promise<boolean> {
  if (png.byteLength > MAX_BYTES) return false;
  const data = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  const target = await thumbnailFile(filePath);
  if (!target) return false;

  const folder = path.dirname(target.file);
  const name = path.basename(target.file);
  for (const entry of await fs.readdir(folder).catch(() => [] as string[])) {
    if (entry.startsWith(`${target.prefix}-`) && entry !== name) {
      await fs.remove(path.join(folder, entry)).catch(() => undefined);
    }
  }
  try {
    await writeAtomically(target.file, data);
  } catch (error) {
    if (!(await fs.pathExists(target.file))) throw error;
  }
  return true;
}
