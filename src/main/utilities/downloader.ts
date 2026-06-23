import axios from "axios";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import pLimit from "p-limit";
import {
  DownloadItem,
  DownloaderFailureItem,
  DownloaderFailuresInfo,
} from "@/types/Downloader";
import * as tar from "tar";
import { mainWindow } from "../windows/mainWindow";
import {
  DownloadFilesOptions,
  isDownloadAbortError,
  shouldReportDownloadFailures,
  shouldThrowDownloadFailures,
} from "./downloaderPure";

let downloadsPaused = false;
let pauseWaiters: Array<() => void> = [];

export function pauseDownloads(): void {
  downloadsPaused = true;
}

export function resumeDownloads(): void {
  downloadsPaused = false;
  const waiters = pauseWaiters;
  pauseWaiters = [];
  for (const release of waiters) release();
}

async function awaitWhilePaused(isAborted: () => boolean): Promise<void> {
  while (downloadsPaused && !isAborted()) {
    await new Promise<void>((resolve) => {
      pauseWaiters.push(resolve);
    });
  }
}

export interface DownloaderInfo {
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progressPercent: number;
  currentGroup?: string;
  currentFileName?: string;
  downloadSpeed?: number;
  estimatedTimeRemaining?: number;
  totalBytes: number;
  downloadedBytes: number;
}

type DownloadFailure = {
  item: DownloadItem;
  error: string;
};

export class Downloader {
  private limit = pLimit(6);
  private totalBytes = 0;
  private downloadedBytes = 0;
  private startTime = 0;
  private speedSamples: number[] = [];
  private lastSpeedUpdate = 0;
  private lastSpeedBytes = 0;
  private fileCompletionTimes: number[] = [];
  private abortController: AbortController | null = null;
  private isSilent = false;

  constructor(limit = 6) {
    this.limit = pLimit(limit);
  }

  cancelDownload = () => {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    resumeDownloads();
  };

  downloadFiles = async (
    items: DownloadItem[],
    signal?: AbortSignal,
    options: DownloadFilesOptions = {},
  ): Promise<void> => {
    const shouldThrowOnFailure = shouldThrowDownloadFailures(options);
    this.isSilent =
      items.length > 0 && items.every((item) => item.options?.silent === true);

    if (items.length === 0) {
      this.sendInfo(null);
      this.isSilent = false;
      return;
    }

    this.abortController = new AbortController();
    const throwIfAborted = () => {
      if (signal?.aborted || this.abortController?.signal.aborted) {
        throw new Error("AbortError");
      }
    };
    const onAbort = () => {
      this.cancelDownload();
    };

    if (signal?.aborted) {
      this.cancelDownload();
      throw new Error("AbortError");
    }

    signal?.addEventListener("abort", onAbort);

    this.startTime = Date.now();
    this.lastSpeedUpdate = this.startTime;
    this.lastSpeedBytes = 0;
    this.downloadedBytes = 0;
    this.speedSamples = [];
    this.fileCompletionTimes = [];
    this.totalBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);

    const totalItems = items.length;
    let completedItems = 0;
    let failedItems = 0;
    let wasCancelled = false;
    const failures: DownloadFailure[] = [];

    try {
      const groups = this.sortByGroup(items);

      for (const group of groups) {
        throwIfAborted();
        const groupName = group[0].group;

        const promises = group.map((item) => {
          const { destination, sha1, checksum, checksumType, size = 0 } = item;
          const fileName = `[${groupName}] ${path.basename(
            destination || item.url || groupName,
          )}`;
          const expectedChecksum = checksum || sha1 || "";
          const expectedChecksumType = checksum
            ? (checksumType ?? "sha256")
            : ("sha1" as const);

          return this.limit(async () => {
            await awaitWhilePaused(
              () =>
                Boolean(signal?.aborted) ||
                Boolean(this.abortController?.signal.aborted),
            );
            const fileStartTime = Date.now();

            try {
              throwIfAborted();

              if (!this.validateItem(item)) {
                const error = "Invalid download item.";
                console.error(error, item);
                failures.push({ item, error });
                failedItems++;
                this.sendInfo(
                  this.createInfo(
                    totalItems,
                    completedItems,
                    failedItems,
                    fileName,
                    groupName,
                  ),
                );
                return;
              }

              const fileMatches = await this.fileExistsAndMatches(
                destination,
                expectedChecksum,
                expectedChecksumType,
                size,
              );
              if (fileMatches) {
                throwIfAborted();
                completedItems++;
                this.downloadedBytes += size;

                this.sendInfo(
                  this.createInfo(
                    totalItems,
                    completedItems,
                    failedItems,
                    fileName,
                    groupName,
                  ),
                );
                this.updateTaskbarProgress(completedItems, totalItems);
                return;
              }

              this.ensureDirectoryExists(destination);
              throwIfAborted();

              this.sendInfo(
                this.createInfo(
                  totalItems,
                  completedItems,
                  failedItems,
                  fileName,
                  groupName,
                ),
              );

              await this.downloadFile(item, 3, () => {
                this.sendInfo(
                  this.createInfo(
                    totalItems,
                    completedItems,
                    failedItems,
                    fileName,
                    groupName,
                  ),
                );
              });
              throwIfAborted();

              if (expectedChecksum) {
                const actualChecksum = await this.getFileHash(
                  destination,
                  expectedChecksumType,
                );
                if (
                  actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()
                ) {
                  await fs.remove(destination).catch(() => {});
                  throw new Error(
                    `Checksum mismatch for ${fileName} (expected ${expectedChecksumType})`,
                  );
                }
              }

              if (item.options?.extract) {
                await this.extractFile(
                  destination,
                  item.options.extractFolder || path.dirname(destination),
                  item.options.extractDelete ?? true,
                );
              }
              throwIfAborted();

              completedItems++;

              const fileTime = Date.now() - fileStartTime;
              this.fileCompletionTimes.push(fileTime);
              if (this.fileCompletionTimes.length > 10) {
                this.fileCompletionTimes.shift();
              }

              this.sendInfo(
                this.createInfo(
                  totalItems,
                  completedItems,
                  failedItems,
                  fileName,
                  groupName,
                ),
              );
              this.updateTaskbarProgress(completedItems, totalItems);
            } catch (err) {
              if (isDownloadAbortError(err) || signal?.aborted) {
                wasCancelled = true;
                throw err;
              }

              const errorMessage =
                err instanceof Error ? err.message : String(err);

              console.error(`Download error ${item.url}:`, err);
              failures.push({ item, error: errorMessage });
              failedItems++;
              this.sendInfo(
                this.createInfo(
                  totalItems,
                  completedItems,
                  failedItems,
                  fileName,
                  groupName,
                ),
              );
            }
          });
        });

        await Promise.all(promises);
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      this.sendInfo(null);
      this.clearTaskbarProgress();
      this.abortController = null;

      if (failures.length === 0) {
        this.isSilent = false;
      }
    }

    if (wasCancelled || signal?.aborted) {
      this.isSilent = false;
      throw new Error("AbortError");
    }

    if (
      shouldReportDownloadFailures(
        failures.length,
        wasCancelled,
        signal?.aborted,
      )
    ) {
      this.sendFailures(
        this.createFailuresInfo(
          totalItems,
          completedItems,
          failedItems,
          failures,
        ),
      );
      this.isSilent = false;

      if (shouldThrowOnFailure) {
        throw new Error(
          `Failed to download ${failures.length} file(s): ${failures
            .map((failure) =>
              path.basename(failure.item.destination || failure.item.url),
            )
            .join(", ")}`,
        );
      }
    }
  };

  private createFailuresInfo = (
    totalItems: number,
    completedItems: number,
    failedItems: number,
    failures: DownloadFailure[],
  ): DownloaderFailuresInfo => {
    return {
      totalItems,
      completedItems,
      failedItems,
      failures: failures.map((failure): DownloaderFailureItem => {
        const destination = failure.item.destination || "";

        return {
          fileName: path.basename(destination || failure.item.url),
          destination,
          url: failure.item.url,
          group: failure.item.group,
          error: failure.error,
        };
      }),
    };
  };

  private createInfo = (
    totalItems: number,
    completedItems: number,
    failedItems: number,
    currentFileName?: string,
    currentGroup?: string,
  ): DownloaderInfo => {
    const progressPercent =
      this.totalBytes > 0
        ? Math.floor((this.downloadedBytes / this.totalBytes) * 100)
        : Math.floor((completedItems / totalItems) * 100);

    const now = Date.now();
    const timeSinceLastUpdate = (now - this.lastSpeedUpdate) / 1000;

    let downloadSpeed = 0;
    let estimatedTimeRemaining = 0;

    if (timeSinceLastUpdate >= 1) {
      const bytesSinceLastUpdate = this.downloadedBytes - this.lastSpeedBytes;
      const currentSpeed = bytesSinceLastUpdate / timeSinceLastUpdate;

      this.speedSamples.push(currentSpeed);
      if (this.speedSamples.length > 5) {
        this.speedSamples.shift();
      }

      downloadSpeed =
        this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length;

      this.lastSpeedUpdate = now;
      this.lastSpeedBytes = this.downloadedBytes;
    } else if (this.speedSamples.length > 0) {
      downloadSpeed =
        this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length;
    }

    if (downloadSpeed > 0 && this.totalBytes > 0) {
      const remainingBytes = this.totalBytes - this.downloadedBytes;
      estimatedTimeRemaining = remainingBytes / downloadSpeed;
    }

    return {
      totalItems,
      completedItems,
      failedItems,
      progressPercent,
      currentGroup,
      currentFileName,
      downloadSpeed: Math.round(downloadSpeed),
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
      totalBytes: this.totalBytes,
      downloadedBytes: this.downloadedBytes,
    };
  };

  private updateTaskbarProgress = (completed: number, total: number) => {
    if (this.isSilent) return;
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      mainWindow.webContents.isDestroyed()
    )
      return;

    const progress = completed / total;
    try {
      mainWindow.setProgressBar(progress);
    } catch {}
  };

  private clearTaskbarProgress = () => {
    if (this.isSilent) return;
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      mainWindow.webContents.isDestroyed()
    )
      return;

    try {
      mainWindow.setProgressBar(-1);
    } catch {}
  };

  private sendInfo = (info: DownloaderInfo | null) => {
    if (this.isSilent) return;
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      mainWindow.webContents.isDestroyed()
    )
      return;

    try {
      mainWindow.webContents.send("downloaderInfo", info);
    } catch {}
  };

  private sendFailures = (info: DownloaderFailuresInfo) => {
    if (this.isSilent) return;
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      mainWindow.webContents.isDestroyed()
    )
      return;

    try {
      mainWindow.webContents.send("downloaderFailures", info);
    } catch {}
  };

  private validateItem = (item: DownloadItem): boolean => {
    if (!item.url || typeof item.url !== "string" || item.url.trim() === "") {
      return false;
    }
    if (
      !item.destination ||
      typeof item.destination !== "string" ||
      item.destination.trim() === ""
    ) {
      return false;
    }
    if (!item.group || typeof item.group !== "string") {
      return false;
    }
    return true;
  };

  private downloadFile = async (
    item: DownloadItem,
    maxRetries = 3,
    onProgress?: () => void,
  ): Promise<void> => {
    const { url, destination } = item;

    if (!url) return;
    if (url.startsWith("blocked::")) {
      throw new Error("Manual download required");
    }

    if (url.startsWith("file://")) {
      const localFilePath = fileURLToPath(url);
      this.ensureDirectoryExists(destination);
      const stats = await fs.stat(localFilePath);
      await fs.copy(localFilePath, destination, { overwrite: true });
      this.downloadedBytes += stats.size;
      if (!item.size) {
        this.totalBytes += stats.size;
      }
      return;
    }

    let attempts = 0;
    let lastError: Error | null = null;

    let countedExistingBytes = 0;
    let addedToTotalBytes = 0;

    while (attempts < maxRetries) {
      let writer: fs.WriteStream | null = null;
      let downloadedChunksBytes = 0;
      let fileSizeFromServer = 0;
      let startByte = 0;

      try {
        if (fs.pathExistsSync(destination) && attempts > 0) {
          const stats = await fs.stat(destination);
          startByte = stats.size;
          writer = fs.createWriteStream(destination, { flags: "a" });
        } else {
          startByte = 0;
          writer = fs.createWriteStream(destination);
        }

        if (startByte > countedExistingBytes) {
          this.downloadedBytes += startByte - countedExistingBytes;
          countedExistingBytes = startByte;
        }

        const makeRequest = async (rangeStart: number) => {
          const headers: Record<string, string> = {};
          if (rangeStart > 0) {
            headers["Range"] = `bytes=${rangeStart}-`;
          }

          return axios.get(url, {
            responseType: "stream",
            timeout: 30000,
            headers,
            signal: this.abortController?.signal,
          });
        };

        let response = await makeRequest(startByte);

        if (startByte > 0 && response.status !== 206) {
          try {
            response.data.destroy();
          } catch {}

          try {
            writer.destroy();
          } catch {}

          await fs.truncate(destination, 0);
          this.downloadedBytes -= countedExistingBytes;
          countedExistingBytes = 0;

          startByte = 0;
          writer = fs.createWriteStream(destination);

          response = await makeRequest(0);
        }

        const contentLength = response.headers["content-length"];
        fileSizeFromServer =
          typeof contentLength === "string" || typeof contentLength === "number"
            ? parseInt(String(contentLength), 10)
            : 0;

        if (!item.size && fileSizeFromServer > 0) {
          const totalForThisFile =
            response.status === 206
              ? startByte + fileSizeFromServer
              : fileSizeFromServer;
          if (totalForThisFile > addedToTotalBytes) {
            this.totalBytes += totalForThisFile - addedToTotalBytes;
            addedToTotalBytes = totalForThisFile;
          }
        }

        let lastProgressUpdate = Date.now();
        const PROGRESS_UPDATE_INTERVAL = 100;

        const signal = this.abortController?.signal;

        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            if (signal && onAbort) {
              try {
                signal.removeEventListener("abort", onAbort);
              } catch {}
            }
          };

          const onAbort = () => {
            try {
              response.data.destroy();
            } catch {}
            try {
              writer?.destroy();
            } catch {}
            cleanup();
            reject(new Error("AbortError"));
          };

          if (signal) {
            try {
              signal.addEventListener("abort", onAbort);
            } catch {}
          }

          response.data.on("data", (chunk: Buffer) => {
            downloadedChunksBytes += chunk.length;
            this.downloadedBytes += chunk.length;

            const now = Date.now();
            if (
              onProgress &&
              now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL
            ) {
              onProgress();
              lastProgressUpdate = now;
            }
          });

          response.data.pipe(writer!);
          writer!.on("finish", () => {
            cleanup();
            resolve();
          });
          writer!.on("error", (e) => {
            cleanup();
            reject(e);
          });
          response.data.on("error", (e: any) => {
            cleanup();
            reject(e);
          });
        });

        return;
      } catch (error) {
        lastError = error as Error;

        if (axios.isCancel(error) || lastError.message === "AbortError") {
          throw lastError;
        }

        attempts++;

        this.downloadedBytes -= downloadedChunksBytes;

        if (writer) {
          try {
            writer.destroy();
          } catch {}
        }

        if (attempts >= maxRetries) {
          if (fs.pathExistsSync(destination)) {
            try {
              await fs.remove(destination);
            } catch (e) {
              console.error(
                `Failed to remove corrupted file ${destination}:`,
                e,
              );
            }
          }

          if (!item.size && addedToTotalBytes > 0) {
            this.totalBytes -= addedToTotalBytes;
          }

          throw lastError;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempts) * 1000),
        );
      }
    }
  };

  private sortByGroup = (items: DownloadItem[]): DownloadItem[][] => {
    const groups: Record<string, DownloadItem[]> = {};
    items.forEach((item) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return Object.values(groups);
  };

  private getFileHash = async (
    filePath: string,
    algorithm: "sha1" | "sha256",
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);

      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => {
        stream.destroy();
        reject(err);
      });
    });
  };

  private fileExistsAndMatches = async (
    filePath: string,
    checksum: string,
    checksumType: "sha1" | "sha256",
    size: number,
  ): Promise<boolean> => {
    const actualPath = fs.pathExistsSync(filePath)
      ? filePath
      : fs.pathExistsSync(`${filePath}.disabled`)
        ? `${filePath}.disabled`
        : null;

    if (!actualPath) return false;

    try {
      if (size) {
        const stats = await fs.stat(actualPath);
        if (stats.size !== size) return false;
      }

      if (checksum) {
        const currentChecksum = await this.getFileHash(
          actualPath,
          checksumType,
        );
        if (currentChecksum.toLowerCase() !== checksum.toLowerCase())
          return false;
      }

      return true;
    } catch (err) {
      console.error(`File verification error ${actualPath}:`, err);
      return false;
    }
  };

  private directoryCreationCache = new Set<string>();

  private ensureDirectoryExists = (filePath: string): void => {
    const dir = path.dirname(filePath);

    if (this.directoryCreationCache.has(dir)) {
      return;
    }

    if (!fs.pathExistsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.directoryCreationCache.add(dir);
  };

  private getSafeExtractPath(
    destinationRoot: string,
    entryName: string,
  ): string {
    const name = (entryName || "").replace(/\\/g, "/");

    if (!name || name === "." || name === "/") {
      throw new Error(`Invalid archive entry name: "${entryName}"`);
    }

    if (
      name.startsWith("/") ||
      name.startsWith("\\") ||
      /^[a-zA-Z]:/.test(name)
    ) {
      throw new Error(`Unsafe archive entry path (absolute): "${entryName}"`);
    }

    const normalized = path.posix.normalize(name);

    if (normalized.startsWith("..") || normalized.includes("/..")) {
      throw new Error(`Unsafe archive entry path (traversal): "${entryName}"`);
    }

    const root = path.resolve(destinationRoot);
    const target = path.resolve(root, normalized);

    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Unsafe archive entry path (escape): "${entryName}"`);
    }

    return target;
  }

  private extractZipSafe = async (
    filePath: string,
    targetPath: string,
  ): Promise<void> => {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    await fs.ensureDir(targetPath);

    for (const entry of entries) {
      const entryName = entry.entryName;
      const outPath = this.getSafeExtractPath(targetPath, entryName);

      if ((entry as any).isDirectory) {
        await fs.ensureDir(outPath);
        continue;
      }

      await fs.ensureDir(path.dirname(outPath));
      await fs.writeFile(outPath, entry.getData());
    }
  };

  private extractTarSafe = async (
    filePath: string,
    targetPath: string,
  ): Promise<void> => {
    await fs.ensureDir(targetPath);

    await tar.x({
      file: filePath,
      cwd: targetPath,
      filter: (p: string, entry: any) => {
        const safePath = this.getSafeExtractPath(targetPath, p);

        const type = entry?.type as string | undefined;
        const linkpath = entry?.linkpath as string | undefined;

        if (type === "Link" || type === "SymbolicLink") {
          if (!linkpath) return false;

          const lp = linkpath.replace(/\\/g, "/");
          if (
            lp.startsWith("/") ||
            lp.startsWith("\\") ||
            /^[a-zA-Z]:/.test(lp)
          ) {
            throw new Error(`Unsafe tar linkpath (absolute): "${linkpath}"`);
          }

          const lpn = path.posix.normalize(lp);
          if (lpn.startsWith("..") || lpn.includes("/..")) {
            throw new Error(`Unsafe tar linkpath (traversal): "${linkpath}"`);
          }
        }

        return !!safePath;
      },
    });
  };

  private extractFile = async (
    filePath: string,
    targetPath: string,
    isDelete: boolean,
  ): Promise<void> => {
    const ext = path.extname(filePath).toLowerCase();

    try {
      await fs.ensureDir(targetPath);

      if (ext === ".zip" || ext === ".jar" || ext === ".mrpack") {
        await this.extractZipSafe(filePath, targetPath);
      } else if (ext === ".gz" || ext === ".tgz") {
        await this.extractTarSafe(filePath, targetPath);
      } else {
        throw new Error(`Unsupported archive format: ${ext}`);
      }

      if (isDelete) {
        await fs.remove(filePath);
      }
    } catch (err) {
      console.error(`Extraction error ${filePath}:`, err);
      throw err;
    }
  };
}
