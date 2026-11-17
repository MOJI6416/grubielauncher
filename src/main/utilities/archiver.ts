import archiver from "archiver";
import fs from "fs-extra";
import { close, open, read } from "fs";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import yauzl from "yauzl";
import type {
  Entry,
  Options as ZipOptions,
  ZipFile,
  ZipFileOptions,
} from "yauzl";
import { inflateRawSync } from "zlib";
import { getSafeExtractPath } from "./archivePaths";
import { detachHardLink } from "./contentStore";

export { getSafeExtractPath };

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const MIN_RATIO_CHECK_BYTES = 4 * 1024 * 1024;
const EXTRACT_CONCURRENCY = 8;
const READ_AHEAD_BYTES = 64 * 1024;
const STREAM_CHUNK_BYTES = 512 * 1024;
const INLINE_ENTRY_BYTES = 1024 * 1024;

const ZIP_OPTIONS: ZipOptions = {
  lazyEntries: true,
  autoClose: false,
  decodeStrings: false,
  validateEntrySizes: true,
};

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

interface DirectoryLimits {
  maxEntryBytes: number;
  maxTotalUncompressedBytes: number;
  allowEncrypted?: boolean;
}

export interface ZipArchiveEntry {
  readonly entryName: string;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly compressedSize: number;
}

export interface ZipArchive {
  getEntries(): readonly ZipArchiveEntry[];
  getEntry(name: string): ZipArchiveEntry | null;
  close(): void;
}

const entrySources = new WeakMap<
  ZipArchiveEntry,
  { zipFile: ZipFile; entry: Entry }
>();

class RangeReader extends yauzl.RandomAccessReader {
  private window: Buffer;
  private windowStart = 0;

  constructor(
    private readonly fd: number | null,
    private readonly size: number,
    data?: Buffer,
  ) {
    super();
    this.window = data ?? Buffer.alloc(0);
  }

  private cached(start: number, end: number): Buffer | null {
    const offset = start - this.windowStart;
    if (offset < 0 || end - this.windowStart > this.window.length) return null;
    return this.window.subarray(offset, end - this.windowStart);
  }

  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
    callback: (error: Error | null, bytesRead?: number) => void,
  ): void {
    const hit = this.cached(position, position + length);
    if (hit || this.fd === null) {
      process.nextTick(callback, null, hit ? hit.copy(buffer, offset) : 0);
      return;
    }

    const chunk = Buffer.allocUnsafe(
      Math.max(length, Math.min(READ_AHEAD_BYTES, this.size - position)),
    );
    read(this.fd, chunk, 0, chunk.length, position, (error, bytesRead) => {
      if (error) {
        callback(error);
        return;
      }
      this.window = chunk.subarray(0, bytesRead);
      this.windowStart = position;
      callback(null, this.window.copy(buffer, offset, 0, length));
    });
  }

  _readStreamForRange(start: number, end: number): Readable {
    const hit = this.cached(start, end);
    if (hit || this.fd === null) {
      return Readable.from(hit ? [hit] : [], { objectMode: false });
    }

    const fd = this.fd;
    let position = start;
    return new Readable({
      highWaterMark: READ_AHEAD_BYTES,
      read() {
        const length = Math.min(STREAM_CHUNK_BYTES, end - position);
        if (length <= 0) {
          this.push(null);
          return;
        }
        const chunk = Buffer.allocUnsafe(length);
        read(fd, chunk, 0, length, position, (error, bytesRead) => {
          if (error) {
            this.destroy(error);
            return;
          }
          if (bytesRead === 0) {
            this.push(null);
            return;
          }
          position += bytesRead;
          this.push(chunk.subarray(0, bytesRead));
          if (position >= end) this.push(null);
        });
      },
    });
  }

  close(callback: (error: Error | null) => void): void {
    if (this.fd === null) process.nextTick(callback, null);
    else close(this.fd, callback);
  }
}

function fromReader(reader: RangeReader, size: number): Promise<ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.fromRandomAccessReader(reader, size, ZIP_OPTIONS, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? new Error("Cannot open zip archive"));
      else resolve(zipFile);
    }),
  );
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

async function assertArchiveFile(zipPath: string, maxArchiveBytes: number) {
  const stats = await fs.stat(zipPath);
  if (!stats.isFile() || stats.size > maxArchiveBytes) {
    throw new Error("Zip archive exceeds compressed size limit");
  }
}

async function openZipFile(zipPath: string): Promise<ZipFile> {
  const fd = await new Promise<number>((resolve, reject) =>
    open(zipPath, "r", (error, value) => (error ? reject(error) : resolve(value))),
  );

  try {
    const { size } = await fs.fstat(fd);
    return await fromReader(new RangeReader(fd, size), size);
  } catch (error) {
    close(fd, () => {});
    throw error;
  }
}

async function toArchive(
  zipFile: ZipFile,
  limits: DirectoryLimits,
): Promise<ZipArchive> {
  let records: ZipDirectoryRecord[];
  try {
    records = await readZipDirectory(zipFile, limits);
  } catch (error) {
    zipFile.close();
    throw error;
  }

  const entries: ZipArchiveEntry[] = [];
  const byName = new Map<string, ZipArchiveEntry>();

  for (const { entry, info } of records) {
    const item: ZipArchiveEntry = {
      entryName: info.name,
      isDirectory: info.isDirectory,
      size: info.size,
      compressedSize: info.compressedSize,
    };
    entrySources.set(item, { zipFile, entry });
    entries.push(item);
    if (!byName.has(item.entryName)) byName.set(item.entryName, item);
  }

  return {
    getEntries: () => entries,
    getEntry: (name) => byName.get(name) ?? null,
    close: () => zipFile.close(),
  };
}

function archiveLimits(limits?: ArchiveLimits): DirectoryLimits {
  return {
    maxEntryBytes: MAX_ENTRY_BYTES,
    maxTotalUncompressedBytes:
      limits?.maxTotalUncompressedBytes ?? MAX_TOTAL_UNCOMPRESSED_BYTES,
    allowEncrypted: true,
  };
}

export async function openArchive(
  zipPath: string,
  limits?: ArchiveLimits,
): Promise<ZipArchive> {
  await assertArchiveFile(zipPath, limits?.maxArchiveBytes ?? MAX_ARCHIVE_BYTES);
  return toArchive(await openZipFile(zipPath), archiveLimits(limits));
}

export async function openArchiveBuffer(
  data: Buffer,
  limits?: ArchiveLimits,
): Promise<ZipArchive> {
  if (data.length > (limits?.maxArchiveBytes ?? MAX_ARCHIVE_BYTES)) {
    throw new Error("Zip archive exceeds compressed size limit");
  }

  const zipFile = await fromReader(
    new RangeReader(null, data.length, data),
    data.length,
  );
  return toArchive(zipFile, archiveLimits(limits));
}

export async function withArchive<T>(
  zipPath: string,
  use: (archive: ZipArchive) => Promise<T> | T,
  limits?: ArchiveLimits,
): Promise<T> {
  const archive = await openArchive(zipPath, limits);
  try {
    return await use(archive);
  } finally {
    archive.close();
  }
}

export async function readEntryData(entry: ZipArchiveEntry): Promise<Buffer> {
  if (entry.isDirectory) return Buffer.alloc(0);
  assertEntrySizes(
    entry.entryName,
    entry.size,
    entry.compressedSize,
    MAX_ENTRY_BYTES,
  );

  const source = entrySources.get(entry);
  if (!source) throw new Error(`Unknown zip entry: "${entry.entryName}"`);
  if (source.entry.isEncrypted()) {
    throw new Error("Encrypted zip entries are not supported");
  }

  const method = source.entry.compressionMethod;
  const inline = entry.size <= INLINE_ENTRY_BYTES && (method === 0 || method === 8);
  const stream = await openEntryStream(source.zipFile, source.entry, inline);
  const raw = await collectStream(stream, inline ? entry.compressedSize : entry.size);
  const data =
    inline && method === 8
      ? inflateRawSync(raw, { maxOutputLength: Math.max(1, entry.size) })
      : raw;

  if (data.length !== entry.size) {
    throw new Error(`Invalid decompressed zip entry size: "${entry.entryName}"`);
  }
  return data;
}

async function collectStream(stream: Readable, size: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stream) {
    const part = chunk as Buffer;
    length += part.length;
    if (length > size) break;
    chunks.push(part);
  }
  return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, Math.min(length, size));
}

export async function readArchiveEntry(
  zipPath: string,
  name: string,
  limits?: ArchiveLimits,
): Promise<Buffer | null> {
  return withArchive(
    zipPath,
    (archive) => {
      const entry = archive.getEntry(name);
      return entry ? readEntryData(entry) : null;
    },
    limits,
  );
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

function openEntryStream(
  zipFile: ZipFile,
  entry: Entry,
  raw = false,
): Promise<Readable> {
  const options = (raw ? { decodeFileData: false } : {}) as ZipFileOptions;
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, options, (error, stream) => {
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

function streamLimits(limits: StreamArchiveLimits): DirectoryLimits {
  return {
    maxEntryBytes: limits.maxTotalUncompressedBytes,
    maxTotalUncompressedBytes: limits.maxTotalUncompressedBytes,
  };
}

async function readZipDirectory(
  zipFile: ZipFile,
  limits: DirectoryLimits,
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
    if (entry.isEncrypted() && !limits.allowEncrypted) {
      throw new Error("Encrypted zip entries are not supported");
    }

    const info = toEntryInfo(entry);

    if (!info.isDirectory) {
      assertEntrySizes(
        info.name,
        info.size,
        info.compressedSize,
        limits.maxEntryBytes,
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
    return (await readZipDirectory(zipFile, streamLimits(limits))).map(
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

    for (const { entry, info } of await readZipDirectory(zipFile, streamLimits(limits))) {
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
          await detachHardLink(job.target);
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

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function readZipEntries(
  zipPath: string,
  names: ReadonlySet<string>,
  limits: StreamArchiveLimits,
): Promise<Map<string, Buffer>> {
  await assertArchiveFile(zipPath, limits.maxArchiveBytes);
  const zipFile = await openZipFile(zipPath);

  try {
    const found = new Map<string, Buffer>();
    for (const { entry, info } of await readZipDirectory(zipFile, streamLimits(limits))) {
      if (info.isDirectory || !names.has(info.name) || found.has(info.name)) {
        continue;
      }
      found.set(
        info.name,
        await streamToBuffer(await openEntryStream(zipFile, entry)),
      );
    }
    return found;
  } finally {
    zipFile.close();
  }
}

export async function readJSONFromArchive<T>(
  zipPath: string,
  fileName: string,
) {
  const data = await readArchiveEntry(zipPath, fileName);
  return data ? (JSON.parse(data.toString("utf-8")) as T) : null;
}

export async function extractFileFromArchive(
  zipPath: string,
  fileName: string,
  destinationPath: string,
) {
  const data = await readArchiveEntry(zipPath, fileName);
  if (!data) return null;

  await fs.ensureDir(destinationPath);
  await fs.writeFile(
    path.join(destinationPath, path.basename(fileName)),
    data,
  );

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
      archive.abort();
      if (output.closed) {
        reject(err);
        return;
      }
      output.once("close", () => reject(err));
      output.destroy();
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
