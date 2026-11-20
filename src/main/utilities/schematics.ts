import fs from "fs-extra";
import path from "path";
import {
  ISchematicBlock,
  ISchematicDetails,
  ISchematicFile,
  SchematicFolder,
  SchematicFormat,
  SchematicInspectResult,
  SchematicTransferResult,
} from "@/types/Schematic";
import { NbtCompound, inflateNbt, readNbtTree } from "./nbtTree";
import { AIR_BLOCKS, blockBaseId, materialOf } from "@/shared/blockState";
import { openSchematicSource } from "./schematicFormats";

export { blockBaseId };
export {
  countPackedIndices,
  countVarintIndices,
  detectSchematicFormat,
} from "./schematicFormats";
export { legacyBlockState } from "./schematicLegacy";

export const SCHEMATIC_ROOTS: { folder: SchematicFolder; segments: string[] }[] =
  [
    { folder: "schematics", segments: ["schematics"] },
    { folder: "worldedit", segments: ["config", "worldedit", "schematics"] },
  ];

const EXTENSIONS: Record<string, SchematicFormat> = {
  ".litematic": "litematic",
  ".schem": "sponge",
  ".schematic": "mcedit",
  ".nbt": "structure",
};

const MAX_DEPTH = 4;
const MAX_FILES = 2000;
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_INFLATED_BYTES = 512 * 1024 * 1024;
const MAX_COUNTED_CELLS = 64 * 1024 * 1024;
const MAX_LISTED_BLOCKS = 4096;

export function schematicFormatOf(fileName: string): SchematicFormat | null {
  return EXTENSIONS[path.extname(fileName).toLowerCase()] ?? null;
}

function withoutExtension(fileName: string): string {
  const extension = path.extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

export function summarizeStates(
  states: readonly string[],
  counts: ArrayLike<number>,
): { blockCount: number; blockTypes: number; blocks: ISchematicBlock[] } {
  let blockCount = 0;
  const materials = new Map<string, number>();

  states.forEach((state, index) => {
    const count = counts[index] ?? 0;
    if (count <= 0 || AIR_BLOCKS.has(blockBaseId(state))) return;
    blockCount += count;
    const { id, factor } = materialOf(state);
    if (factor <= 0) return;
    materials.set(id, (materials.get(id) ?? 0) + count * factor);
  });

  const blocks = [...materials]
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));

  return {
    blockCount,
    blockTypes: blocks.length,
    blocks: blocks.slice(0, MAX_LISTED_BLOCKS),
  };
}

export function parseSchematicNbt(root: NbtCompound): ISchematicDetails | null {
  const source = openSchematicSource(root);
  if (!source) return null;
  const details = source.details;
  if (source.cells > MAX_COUNTED_CELLS) return details;
  Object.assign(details, summarizeStates(source.palette, source.histogram()));
  return details;
}

export async function parseSchematicBuffer(
  data: Buffer,
): Promise<ISchematicDetails | null> {
  const inflated = await inflateNbt(data, MAX_INFLATED_BYTES);
  return parseSchematicNbt(readNbtTree(inflated).value);
}

const inspectCache = new Map<
  string,
  { size: number; mtimeMs: number; result: SchematicInspectResult }
>();
const INSPECT_CACHE_LIMIT = 64;

export async function inspectSchematic(
  filePath: string,
): Promise<SchematicInspectResult> {
  const resolved = path.resolve(filePath);
  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats?.isFile()) return { ok: false, error: "missing" };
  if (stats.size > MAX_FILE_BYTES) return { ok: false, error: "tooLarge" };

  const cached = inspectCache.get(resolved);
  if (cached && cached.size === stats.size && cached.mtimeMs === stats.mtimeMs) {
    return cached.result;
  }

  let result: SchematicInspectResult;
  try {
    const details = await parseSchematicBuffer(await fs.readFile(resolved));
    result = details
      ? { ok: true, details }
      : { ok: false, error: "unreadable" };
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof RangeError ? "tooLarge" : "unreadable",
    };
    if (!(error instanceof RangeError)) {
      console.warn("[schematics] cannot read", resolved, error);
    }
  }

  if (inspectCache.size >= INSPECT_CACHE_LIMIT) {
    const oldest = inspectCache.keys().next().value;
    if (oldest !== undefined) inspectCache.delete(oldest);
  }
  inspectCache.set(resolved, {
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    result,
  });

  return result;
}

async function walk(
  directory: string,
  relative: string[],
  depth: number,
  visit: (fullPath: string, relative: string[], stats: fs.Stats) => void,
  budget: { left: number },
): Promise<void> {
  if (depth > MAX_DEPTH || budget.left <= 0) return;

  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (budget.left <= 0) return;
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath, [...relative, entry.name], depth + 1, visit, budget);
      continue;
    }

    if (!entry.isFile() || !schematicFormatOf(entry.name)) continue;
    const stats = await fs.stat(fullPath).catch(() => null);
    if (!stats?.isFile()) continue;
    budget.left -= 1;
    visit(fullPath, [...relative, entry.name], stats);
  }
}

export async function listSchematics(
  versionPath: string,
): Promise<ISchematicFile[]> {
  const root = path.resolve(versionPath);
  const files: ISchematicFile[] = [];
  const budget = { left: MAX_FILES };

  for (const { folder, segments } of SCHEMATIC_ROOTS) {
    await walk(
      path.join(root, ...segments),
      segments,
      0,
      (fullPath, relative, stats) => {
        const fileName = relative[relative.length - 1];
        files.push({
          path: fullPath,
          relativePath: relative.join("/"),
          fileName,
          name: withoutExtension(fileName),
          folder,
          format: schematicFormatOf(fileName) ?? "structure",
          size: stats.size,
          modifiedAt: Math.round(stats.mtimeMs),
        });
      },
      budget,
    );
  }

  return files.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

export function safeSchematicSegments(relativePath: string): string[] | null {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  if (!schematicFormatOf(segments[segments.length - 1] ?? "")) return null;

  const inRoot = SCHEMATIC_ROOTS.some(
    ({ segments: prefix }) =>
      segments.length > prefix.length &&
      prefix.every(
        (part, index) => segments[index].toLowerCase() === part.toLowerCase(),
      ),
  );
  return inRoot ? segments : null;
}

async function freeTarget(directory: string, fileName: string): Promise<string> {
  const extension = path.extname(fileName);
  const base = withoutExtension(fileName);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = path.join(
      directory,
      attempt === 0 ? fileName : `${base} (${attempt + 1})${extension}`,
    );
    if (!(await fs.pathExists(candidate))) return candidate;
  }

  return path.join(directory, `${base}-${Date.now()}${extension}`);
}

export async function transferSchematic(
  sourceVersionPath: string,
  relativePath: string,
  targetVersionPath: string,
  mode: "copy" | "move",
): Promise<SchematicTransferResult> {
  const segments = safeSchematicSegments(relativePath);
  if (!segments) return { ok: false, error: "invalidPath" };

  const sourceRoot = path.resolve(sourceVersionPath);
  const targetRoot = path.resolve(targetVersionPath);
  if (sourceRoot.toLowerCase() === targetRoot.toLowerCase()) {
    return { ok: false, error: "sameInstance" };
  }

  const source = path.join(sourceRoot, ...segments);
  if (!(await fs.pathExists(source))) return { ok: false, error: "missing" };

  try {
    const directory = path.join(targetRoot, ...segments.slice(0, -1));
    await fs.ensureDir(directory);
    const target = await freeTarget(directory, segments[segments.length - 1]);

    if (mode === "move") await fs.move(source, target, { overwrite: false });
    else await fs.copy(source, target, { overwrite: false, errorOnExist: true });

    return {
      ok: true,
      path: target,
      relativePath: path.relative(targetRoot, target).split(path.sep).join("/"),
    };
  } catch (error) {
    console.error("[schematics] transfer failed:", error);
    return { ok: false, error: "failed" };
  }
}
