import zip from "adm-zip";
import archiver from "archiver";
import fs from "fs-extra";
import path from "path";

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

function validateEntry(entry: zip.IZipEntry): void {
  if (entry.isDirectory) return;

  const size = entry.header.size;
  const compressedSize = entry.header.compressedSize;
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ENTRY_BYTES) {
    throw new Error(`Zip entry exceeds size limit: "${entry.entryName}"`);
  }

  if (size > 0 && compressedSize <= 0) {
    throw new Error(`Invalid compressed zip entry: "${entry.entryName}"`);
  }

  if (compressedSize > 0 && size / compressedSize > MAX_COMPRESSION_RATIO) {
    throw new Error(`Suspicious zip compression ratio: "${entry.entryName}"`);
  }
}

function validateEntries(entries: zip.IZipEntry[]): void {
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error("Zip archive contains too many entries");
  }

  let totalSize = 0;
  for (const entry of entries) {
    validateEntry(entry);
    if (entry.isDirectory) continue;
    totalSize += entry.header.size;
    if (totalSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error("Zip archive exceeds uncompressed size limit");
    }
  }
}

function getSafeExtractPath(
  destinationRoot: string,
  entryName: string,
): string {
  const name = (entryName || "").replace(/\\/g, "/");

  if (!name || name === "." || name === "/") {
    throw new Error(`Invalid zip entry name: "${entryName}"`);
  }

  if (
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /^[a-zA-Z]:/.test(name)
  ) {
    throw new Error(`Unsafe zip entry path (absolute): "${entryName}"`);
  }

  const normalized = path.posix.normalize(name);

  if (normalized.startsWith("..") || normalized.includes("/..")) {
    throw new Error(`Unsafe zip entry path (traversal): "${entryName}"`);
  }

  const root = path.resolve(destinationRoot);
  const target = path.resolve(root, normalized);

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Unsafe zip entry path (escape): "${entryName}"`);
  }

  return target;
}

export async function openArchive(zipPath: string) {
  const stats = await fs.stat(zipPath);
  if (!stats.isFile() || stats.size > MAX_ARCHIVE_BYTES) {
    throw new Error("Zip archive exceeds compressed size limit");
  }

  const archive = new zip(await fs.readFile(zipPath));
  validateEntries(archive.getEntries());
  return archive;
}

export function readEntryData(entry: zip.IZipEntry): Promise<Buffer> {
  validateEntry(entry);
  return new Promise((resolve, reject) => {
    try {
      entry.getDataAsync((data, err) => {
        if (err) reject(new Error(err));
        else if (data.length > MAX_ENTRY_BYTES || data.length !== entry.header.size) {
          reject(new Error(`Invalid decompressed zip entry size: "${entry.entryName}"`));
        } else resolve(data);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function extractEntries(
  entries: zip.IZipEntry[],
  resolveTargetPath: (entryName: string) => string,
): Promise<void> {
  validateEntries(entries);
  const targets = new Map<string, zip.IZipEntry>();
  const directories: string[] = [];

  for (const entry of entries) {
    const targetPath = resolveTargetPath(entry.entryName);
    if (entry.isDirectory) {
      directories.push(targetPath);
    } else {
      if (targets.has(targetPath)) {
        throw new Error(`Duplicate zip entry target: "${entry.entryName}"`);
      }
      targets.set(targetPath, entry);
    }
  }

  for (const directory of directories) {
    await fs.ensureDir(directory);
  }

  const jobs = [...targets.entries()];
  let jobIndex = 0;
  // Decompressed entries are Buffers; keep concurrency low to cap peak memory.
  const workerCount = Math.min(2, jobs.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = jobIndex++;
      if (current >= jobs.length) break;

      const [targetPath, entry] = jobs[current];
      const data = await readEntryData(entry);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, data);
    }
  });

  await Promise.all(workers);
}

export async function readJSONFromArchive<T>(
  zipPath: string,
  fileName: string,
) {
  const archive = await openArchive(zipPath);
  const entry = archive.getEntry(fileName);
  if (!entry) return null;

  const text = (await readEntryData(entry)).toString("utf-8");
  return JSON.parse(text) as T;
}

export async function extractFileFromArchive(
  zipPath: string,
  fileName: string,
  destinationPath: string,
) {
  const archive = await openArchive(zipPath);
  const entry = archive.getEntry(fileName);
  if (!entry) return null;

  await fs.ensureDir(destinationPath);

  const outFilePath = path.join(
    destinationPath,
    path.basename(entry.entryName || fileName),
  );
  await fs.writeFile(outFilePath, await readEntryData(entry));

  return path.join(destinationPath);
}

export function getArchiveEntryName(
  filePath: string,
  basePath?: string,
): string {
  if (!basePath) return path.basename(filePath);

  const relative = path.relative(basePath, filePath).replace(/\\/g, "/");
  const normalized = path.posix.normalize(relative);

  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return path.basename(filePath);
  }

  return normalized;
}

export async function createZipArchive(
  files: string[],
  outputPath: string,
  basePath?: string,
): Promise<void> {
  await fs.ensureDir(path.dirname(outputPath));
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    let settled = false;

    const safeResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const safeReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    output.on("close", safeResolve);
    output.on("error", safeReject);

    archive.on("error", safeReject);
    archive.on("warning", (err: any) => {
      if (err?.code === "ENOENT") return;
      safeReject(err);
    });

    archive.pipe(output);
    (async () => {
      for (const file of files) {
        if (await fs.pathExists(file)) {
          const entryName = getArchiveEntryName(file, basePath);
          const stats = await fs.lstat(file);

          if (stats.isDirectory()) {
            archive.directory(file, entryName);
          } else {
            archive.file(file, { name: entryName });
          }
        }
      }

      await archive.finalize();
    })().catch(safeReject);
  });
}

export async function extractZip(
  zipPath: string,
  destination: string,
): Promise<void> {
  const zipFile = await openArchive(zipPath);

  await fs.ensureDir(destination);

  await extractEntries(zipFile.getEntries(), (entryName) =>
    getSafeExtractPath(destination, entryName),
  );
}
