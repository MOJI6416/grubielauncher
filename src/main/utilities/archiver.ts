import zip from "adm-zip";
import archiver from "archiver";
import fs from "fs-extra";
import path from "path";
import { Transform } from "stream";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import yauzl from "yauzl";
import type { Entry, ZipFile } from "yauzl";
import { getSafeExtractPath } from "./archivePaths";

export { getSafeExtractPath };

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const MIN_RATIO_CHECK_BYTES = 4 * 1024 * 1024;
const EXTRACT_CONCURRENCY = 8;

export interface ArchiveLimits {
  maxArchiveBytes?: number;
  maxTotalUncompressedBytes?: number;
}

export interface StreamArchiveLimits {
  maxArchiveBytes: number;
  maxTotalUncompressedBytes: number;
}

export const LARGE_ARCHIVE_LIMITS: StreamArchiveLimits = {
  maxArchiveBytes: 16 * 1024 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024 * 1024,
};

export interface ZipEntryInfo {
  name: string;
  isDirectory: boolean;
  size: number;
  compressedSize: number;
}

export type ExtractProgressListener = (
  processedBytes: number,
  totalBytes: number,
) => void;

interface ZipDirectoryRecord {
  entry: Entry;
  info: ZipEntryInfo;
}

function assertEntrySizes(
  name: string,
  size: number,
  compressedSize: number,
  maxEntryBytes: number,
): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > maxEntryBytes) {
    throw new Error(`Zip entry exceeds size limit: "${name}"`);
  }

  if (size > 0 && compressedSize <= 0) {
    throw new Error(`Invalid compressed zip entry: "${name}"`);
  }

  if (
    size >= MIN_RATIO_CHECK_BYTES &&
    compressedSize > 0 &&
    size / compressedSize > MAX_COMPRESSION_RATIO
  ) {
    throw new Error(`Suspicious zip compression ratio: "${name}"`);
  }
}

function validateEntry(entry: zip.IZipEntry): void {
  if (entry.isDirectory) return;

  assertEntrySizes(
    entry.entryName,
    entry.header.size,
    entry.header.compressedSize,
    MAX_ENTRY_BYTES,
  );
}

function validateEntries(entries: zip.IZipEntry[], limits?: ArchiveLimits): void {
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error("Zip archive contains too many entries");
  }

  const maxTotal =
    limits?.maxTotalUncompressedBytes ?? MAX_TOTAL_UNCOMPRESSED_BYTES;

  let totalSize = 0;
  for (const entry of entries) {
    validateEntry(entry);
    if (entry.isDirectory) continue;
    totalSize += entry.header.size;
    if (totalSize > maxTotal) {
      throw new Error("Zip archive exceeds uncompressed size limit");
    }
  }
}

async function assertArchiveFile(zipPath: string, maxArchiveBytes: number) {
  const stats = await fs.stat(zipPath);
  if (!stats.isFile() || stats.size > maxArchiveBytes) {
    throw new Error("Zip archive exceeds compressed size limit");
  }
}

export async function openArchive(zipPath: string, limits?: ArchiveLimits) {
  await assertArchiveFile(zipPath, limits?.maxArchiveBytes ?? MAX_ARCHIVE_BYTES);

  const archive = new zip(await fs.readFile(zipPath));
  validateEntries(archive.getEntries(), limits);
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

function openZipFile(zipPath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      zipPath,
      {
        lazyEntries: true,
        autoClose: false,
        decodeStrings: false,
        validateEntrySizes: true,
      },
      (error, zipFile) => {
        if (error || !zipFile) {
          reject(error ?? new Error(`Cannot open zip archive: ${zipPath}`));
        } else {
          resolve(zipFile);
        }
      },
    );
  });
}

function readNextEntry(zipFile: ZipFile): Promise<Entry | null> {
  return new Promise((resolve, reject) => {
    const detach = () => {
      zipFile.off("entry", onEntry);
      zipFile.off("end", onEnd);
      zipFile.off("error", onError);
    };
    const onEntry = (entry: Entry) => {
      detach();
      resolve(entry);
    };
    const onEnd = () => {
      detach();
      resolve(null);
    };
    const onError = (error: Error) => {
      detach();
      reject(error);
    };

    zipFile.on("entry", onEntry);
    zipFile.on("end", onEnd);
    zipFile.on("error", onError);
    zipFile.readEntry();
  });
}

function openEntryStream(zipFile: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error(`Cannot read zip entry: ${entry.fileName}`));
      } else {
        resolve(stream);
      }
    });
  });
}

function toEntryInfo(entry: Entry): ZipEntryInfo {
  const rawName = entry.fileName as unknown as Buffer;
  const lastByte = rawName[rawName.length - 1];

  return {
    name: rawName.toString("utf8").split("\\").join("/"),
    isDirectory: lastByte === 47 || lastByte === 92,
    size: entry.uncompressedSize,
    compressedSize: entry.compressedSize,
  };
}

async function readZipDirectory(
  zipFile: ZipFile,
  limits: StreamArchiveLimits,
): Promise<ZipDirectoryRecord[]> {
  if (zipFile.entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new Error("Zip archive contains too many entries");
  }

  const records: ZipDirectoryRecord[] = [];
  let totalSize = 0;

  for (
    let entry = await readNextEntry(zipFile);
    entry;
    entry = await readNextEntry(zipFile)
  ) {
    if (entry.isEncrypted()) {
      throw new Error("Encrypted zip entries are not supported");
    }

    const info = toEntryInfo(entry);

    if (!info.isDirectory) {
      assertEntrySizes(
        info.name,
        info.size,
        info.compressedSize,
        limits.maxTotalUncompressedBytes,
      );
      totalSize += info.size;
      if (totalSize > limits.maxTotalUncompressedBytes) {
        throw new Error("Zip archive exceeds uncompressed size limit");
      }
    }

    records.push({ entry, info });
  }

  return records;
}

export async function listZipEntries(
  zipPath: string,
  limits: StreamArchiveLimits,
): Promise<ZipEntryInfo[]> {
  await assertArchiveFile(zipPath, limits.maxArchiveBytes);
  const zipFile = await openZipFile(zipPath);

  try {
    return (await readZipDirectory(zipFile, limits)).map(
      (record) => record.info,
    );
  } finally {
    zipFile.close();
  }
}

export async function extractZipEntries(
  zipPath: string,
  resolveTargetPath: (entryName: string) => string | null,
  limits: StreamArchiveLimits,
  onProgress?: ExtractProgressListener,
): Promise<number> {
  await assertArchiveFile(zipPath, limits.maxArchiveBytes);
  const zipFile = await openZipFile(zipPath);

  try {
    const directories = new Set<string>();
    const targets = new Set<string>();
    const jobs: { entry: Entry; target: string; size: number }[] = [];
    let resolved = 0;

    for (const { entry, info } of await readZipDirectory(zipFile, limits)) {
      const target = resolveTargetPath(info.name);
      if (target === null) continue;

      resolved++;

      if (info.isDirectory) {
        directories.add(target);
        continue;
      }

      if (targets.has(target)) {
        throw new Error(`Duplicate zip entry target: "${info.name}"`);
      }

      targets.add(target);
      directories.add(path.dirname(target));
      jobs.push({ entry, target, size: info.size });
    }

    for (const directory of directories) {
      await fs.ensureDir(directory);
    }

    const totalBytes = jobs.reduce((sum, job) => sum + job.size, 0);
    let processedBytes = 0;
    let nextJob = 0;
    let failed = false;

    onProgress?.(0, totalBytes);

    const countBytes = (listener: ExtractProgressListener) =>
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          processedBytes += chunk.length;
          listener(processedBytes, totalBytes);
          callback(null, chunk);
        },
      });

    const worker = async () => {
      while (!failed && nextJob < jobs.length) {
        const job = jobs[nextJob++];

        try {
          const source = await openEntryStream(zipFile, job.entry);
          const destination = fs.createWriteStream(job.target);

          if (onProgress) {
            await pipeline(source, countBytes(onProgress), destination);
          } else {
            await pipeline(source, destination);
          }
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(EXTRACT_CONCURRENCY, jobs.length) }, worker),
    );

    return resolved;
  } finally {
    zipFile.close();
  }
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

export interface ArchiveExtraEntry {
  name: string;
  data: Buffer;
}

export async function createZipArchive(
  files: string[],
  outputPath: string,
  basePath?: string,
  compressionLevel = 9,
  shouldSkipEntry?: (entryName: string) => boolean,
  extraEntries?: readonly ArchiveExtraEntry[],
  onProgress?: (processedBytes: number) => void,
): Promise<void> {
  await fs.ensureDir(path.dirname(outputPath));
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: compressionLevel } });

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

    if (onProgress) {
      archive.on("progress", (progress) =>
        onProgress(progress.fs.processedBytes),
      );
    }

    archive.pipe(output);
    (async () => {
      for (const file of files) {
        if (await fs.pathExists(file)) {
          const entryName = getArchiveEntryName(file, basePath);
          if (shouldSkipEntry?.(entryName)) continue;

          const stats = await fs.lstat(file);

          if (stats.isDirectory()) {
            archive.directory(file, entryName, (data) =>
              shouldSkipEntry?.(
                path.posix.join(entryName, data.name.replace(/\\/g, "/")),
              )
                ? false
                : data,
            );
          } else {
            archive.file(file, { name: entryName });
          }
        }
      }

      for (const extra of extraEntries ?? []) {
        archive.append(extra.data, { name: extra.name });
      }

      await archive.finalize();
    })().catch(safeReject);
  });
}

export async function extractZip(
  zipPath: string,
  destination: string,
  limits?: ArchiveLimits,
  shouldSkipEntry?: (entryName: string) => boolean,
  onProgress?: ExtractProgressListener,
): Promise<void> {
  await fs.ensureDir(destination);

  await extractZipEntries(
    zipPath,
    (entryName) =>
      shouldSkipEntry?.(entryName)
        ? null
        : getSafeExtractPath(destination, entryName),
    {
      maxArchiveBytes:
        limits?.maxArchiveBytes ?? LARGE_ARCHIVE_LIMITS.maxArchiveBytes,
      maxTotalUncompressedBytes:
        limits?.maxTotalUncompressedBytes ??
        LARGE_ARCHIVE_LIMITS.maxTotalUncompressedBytes,
    },
    onProgress,
  );
}
