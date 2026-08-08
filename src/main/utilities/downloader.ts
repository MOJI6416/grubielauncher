import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import pLimit from "p-limit";
import {
  DownloadItem,
  DownloaderFailureItem,
  DownloaderFailuresInfo,
} from "@/types/Downloader";
import { mainWindow } from "../windows/mainWindow";
import {
  canSkipChecksumVerification,
  dedupeDownloadItemsBy,
  DownloadFilesOptions,
  isDownloadAbortError,
  isEncodedResponse,
  isNonRetryableDownloadError,
  readRangeValidator,
  shouldReportDownloadFailures,
  shouldThrowDownloadFailures,
} from "./downloaderPure";
import { MIRROR_BASE, resolveDownloadCandidates } from "./mirrors";
import {
  getDownloadSource,
  getMojangReachable,
  isMirrorDisabled,
  reportMirrorFailure,
  reportMirrorSuccess,
} from "./mirrorState";
import { getSafeExtractPath, getSafeLinkExtractPath } from "./archivePaths";
import {
  assertExtractablePath,
  assertReadablePath,
  assertWritablePath,
  isExtractablePath,
  isReadablePath,
  isWritablePath,
} from "./safePath";
import { isSafeRemoteUrl } from "./safeUrl";

let downloadsPaused = false;
let pauseWaiters: Array<() => void> = [];
const activeStreams = new Set<NodeJS.ReadableStream>();

export function pauseDownloads(): void {
  downloadsPaused = true;
  for (const stream of activeStreams) {
    try {
      stream.pause();
    } catch {}
  }
}

export function resumeDownloads(): void {
  downloadsPaused = false;
  for (const stream of activeStreams) {
    try {
      stream.resume();
    } catch {}
  }
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

function getExtractMarkerPath(destination: string): string {
  return `${destination}.extracting`;
}

const PART_SUFFIX = ".part";
const STALE_PART_AGE_MS = 60 * 60 * 1000;
const sweptPartDirs = new Set<string>();

function getPartialDownloadPath(destination: string): string {
  return `${destination}${PART_SUFFIX}`;
}

async function sweepStalePartFiles(directory: string): Promise<void> {
  if (sweptPartDirs.has(directory)) return;
  sweptPartDirs.add(directory);

  try {
    const entries = await fs.readdir(directory);
    const now = Date.now();

    await Promise.all(
      entries
        .filter((entry) => entry.endsWith(PART_SUFFIX))
        .map(async (entry) => {
          const target = path.join(directory, entry);
          const stats = await fs.stat(target).catch(() => null);
          if (!stats?.isFile() || now - stats.mtimeMs < STALE_PART_AGE_MS)
            return;
          await fs.remove(target).catch(() => {});
        }),
    );
  } catch {}
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
  private verifyChecksums = false;
  private lastInfoSentAt = 0;
  private pendingInfo: DownloaderInfo | null = null;
  private infoFlushTimer: NodeJS.Timeout | null = null;

  onInfo: ((info: DownloaderInfo | null) => void) | null = null;
  versionName: string | null = null;

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
    rawItems: DownloadItem[],
    signal?: AbortSignal,
    options: DownloadFilesOptions = {},
  ): Promise<DownloaderFailuresInfo | null> => {
    const shouldThrowOnFailure = shouldThrowDownloadFailures(options);
    const items = dedupeDownloadItemsBy(rawItems, (destination) =>
      path.resolve(destination),
    );
    this.verifyChecksums = options.verifyChecksums === true;
    this.isSilent =
      items.length > 0 && items.every((item) => item.options?.silent === true);

    if (items.length === 0) {
      this.sendInfo(null);
      this.isSilent = false;
      return null;
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

              const extractMarkerPath = item.options?.extract
                ? getExtractMarkerPath(destination)
                : null;
              const isExtractPending = extractMarkerPath
                ? await fs.pathExists(extractMarkerPath)
                : false;

              const fileMatches = await this.fileExistsAndMatches(
                destination,
                expectedChecksum,
                expectedChecksumType,
                size,
              );
              if (fileMatches && !isExtractPending) {
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

              if (fileMatches) this.downloadedBytes += size;

              if (!fileMatches) {
                await this.ensureDirectoryExists(destination);
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

                if (extractMarkerPath) {
                  await fs.outputFile(extractMarkerPath, "");
                }

                const downloadedPath = await this.downloadFile(item, 3, () => {
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

                if (downloadedPath && expectedChecksum) {
                  const actualChecksum = await this.getFileHash(
                    downloadedPath,
                    expectedChecksumType,
                  );
                  if (
                    actualChecksum.toLowerCase() !==
                    expectedChecksum.toLowerCase()
                  ) {
                    await fs.remove(downloadedPath).catch(() => {});
                    throw new Error(
                      `Checksum mismatch for ${fileName} (expected ${expectedChecksumType})`,
                    );
                  }
                }

                if (downloadedPath && downloadedPath !== destination) {
                  await fs.move(downloadedPath, destination, {
                    overwrite: true,
                  });
                }
              }

              if (item.options?.extract) {
                await this.extractFile(
                  destination,
                  item.options.extractFolder || path.dirname(destination),
                  item.options.extractDelete ?? true,
                );
              }

              if (extractMarkerPath) {
                await fs.remove(extractMarkerPath).catch(() => {});
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

        const results = await Promise.allSettled(promises);
        const rejected = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        if (rejected) throw rejected.reason;
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
      const failuresInfo = this.createFailuresInfo(
        totalItems,
        completedItems,
        failedItems,
        failures,
      );
      this.sendFailures(failuresInfo);
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

      return failuresInfo;
    }

    return null;
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
      versionName: this.versionName ?? undefined,
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

    if (info === null) {
      if (this.infoFlushTimer) {
        clearTimeout(this.infoFlushTimer);
        this.infoFlushTimer = null;
      }
      this.pendingInfo = null;
      this.lastInfoSentAt = 0;
      this.postInfo(null);
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastInfoSentAt;
    const INFO_INTERVAL_MS = 100;

    if (elapsed >= INFO_INTERVAL_MS) {
      this.lastInfoSentAt = now;
      this.postInfo(info);
      return;
    }

    this.pendingInfo = info;
    if (!this.infoFlushTimer) {
      this.infoFlushTimer = setTimeout(
        () => {
          this.infoFlushTimer = null;
          const pending = this.pendingInfo;
          this.pendingInfo = null;
          if (pending) {
            this.lastInfoSentAt = Date.now();
            this.postInfo(pending);
          }
        },
        Math.max(0, INFO_INTERVAL_MS - elapsed),
      );
    }
  };

  private postInfo = (info: DownloaderInfo | null) => {
    try {
      this.onInfo?.(info);
    } catch {}

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
    if (!isWritablePath(item.destination)) {
      return false;
    }
    if (
      item.options?.extract &&
      !isExtractablePath(
        item.options.extractFolder || path.dirname(item.destination),
      )
    ) {
      return false;
    }

    const url = item.url.trim();
    if (url.startsWith("blocked::")) return true;
    if (url.startsWith("file://")) {
      try {
        return isReadablePath(fileURLToPath(url));
      } catch {
        return false;
      }
    }

    return isSafeRemoteUrl(url);
  };

  private downloadFile = async (
    item: DownloadItem,
    maxRetries = 3,
    onProgress?: () => void,
  ): Promise<string | null> => {
    const { url: originalUrl, destination } = item;

    if (!originalUrl) return null;
    if (originalUrl.startsWith("blocked::")) {
      throw new Error("Manual download required");
    }

    if (originalUrl.startsWith("file://")) {
      const localFilePath = assertReadablePath(
        fileURLToPath(originalUrl),
        "download source",
      );
      assertWritablePath(destination, "download destination");
      await this.ensureDirectoryExists(destination);
      const stats = await fs.stat(localFilePath);
      await fs.copy(localFilePath, destination, { overwrite: true });
      this.downloadedBytes += stats.size;
      if (!item.size) {
        this.totalBytes += stats.size;
      }
      return destination;
    }

    const partialPath = getPartialDownloadPath(destination);
    const candidates = resolveDownloadCandidates(
      originalUrl,
      getDownloadSource(),
      getMojangReachable(),
      isMirrorDisabled(),
    );
    let candidateError: Error | null = null;

    for (
      let candidateIndex = 0;
      candidateIndex < candidates.length;
      candidateIndex++
    ) {
      const url = candidates[candidateIndex];

      let attempts = 0;
      let lastError: Error | null = null;

      let countedExistingBytes = 0;
      let addedToTotalBytes = 0;
      let rangeValidator: string | null = null;

      try {
        while (attempts < maxRetries) {
          let writer: fs.WriteStream | null = null;
          let downloadedChunksBytes = 0;
          let fileSizeFromServer = 0;
          let startByte = 0;

          try {
            const canResumePartial =
              rangeValidator !== null ||
              Boolean(item.checksum) ||
              Boolean(item.sha1);

            if (
              fs.pathExistsSync(partialPath) &&
              attempts > 0 &&
              canResumePartial
            ) {
              const stats = await fs.stat(partialPath);
              startByte = stats.size;
              writer = fs.createWriteStream(partialPath, { flags: "a" });
            } else {
              startByte = 0;
              if (countedExistingBytes > 0) {
                this.downloadedBytes -= countedExistingBytes;
                countedExistingBytes = 0;
              }
              writer = fs.createWriteStream(partialPath);
            }

            if (startByte > countedExistingBytes) {
              this.downloadedBytes += startByte - countedExistingBytes;
              countedExistingBytes = startByte;
            }

            const makeRequest = async (rangeStart: number) => {
              const headers: Record<string, string> = {};
              if (rangeStart > 0) {
                headers["Range"] = `bytes=${rangeStart}-`;
                if (rangeValidator) headers["If-Range"] = rangeValidator;
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

              await fs.truncate(partialPath, 0);
              this.downloadedBytes -= countedExistingBytes;
              countedExistingBytes = 0;

              startByte = 0;
              writer = fs.createWriteStream(partialPath);

              response = await makeRequest(0);
            }

            if (response.status !== 206) {
              rangeValidator = readRangeValidator(response.headers);
            }

            const contentLength = response.headers["content-length"];
            fileSizeFromServer =
              typeof contentLength === "string" ||
              typeof contentLength === "number"
                ? parseInt(String(contentLength), 10)
                : 0;

            const expectedBytes = isEncodedResponse(response.headers)
              ? 0
              : Number.isFinite(fileSizeFromServer) && fileSizeFromServer > 0
                ? startByte + fileSizeFromServer
                : 0;

            const maxBytes = item.options?.maxBytes ?? 0;
            if (maxBytes > 0 && expectedBytes > maxBytes) {
              try {
                response.data.destroy();
              } catch {}
              try {
                writer.destroy();
              } catch {}

              throw new Error(
                `Download too large for ${path.basename(destination)}: ${expectedBytes} > ${maxBytes} bytes`,
              );
            }

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
            const IDLE_TIMEOUT_MS = 30000;

            const signal = this.abortController?.signal;
            const stream = response.data as NodeJS.ReadableStream;

            await new Promise<void>((resolve, reject) => {
              let idleTimer: NodeJS.Timeout | null = null;

              const cleanup = () => {
                activeStreams.delete(stream);
                if (idleTimer) {
                  clearTimeout(idleTimer);
                  idleTimer = null;
                }
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

              const resetIdleTimer = () => {
                if (idleTimer) clearTimeout(idleTimer);
                idleTimer = setTimeout(() => {
                  if (downloadsPaused) {
                    resetIdleTimer();
                    return;
                  }
                  try {
                    response.data.destroy();
                  } catch {}
                  try {
                    writer?.destroy();
                  } catch {}
                  cleanup();
                  reject(new Error(`Download stalled: ${url}`));
                }, IDLE_TIMEOUT_MS);
              };

              if (signal) {
                try {
                  signal.addEventListener("abort", onAbort);
                } catch {}
              }

              activeStreams.add(stream);
              if (downloadsPaused) {
                try {
                  stream.pause();
                } catch {}
              }

              resetIdleTimer();

              response.data.on("data", (chunk: Buffer) => {
                downloadedChunksBytes += chunk.length;
                this.downloadedBytes += chunk.length;
                resetIdleTimer();

                if (
                  maxBytes > 0 &&
                  startByte + downloadedChunksBytes > maxBytes
                ) {
                  try {
                    response.data.destroy();
                  } catch {}
                  try {
                    writer?.destroy();
                  } catch {}
                  cleanup();
                  reject(
                    new Error(
                      `Download too large for ${path.basename(destination)}: exceeded ${maxBytes} bytes`,
                    ),
                  );
                  return;
                }

                if (downloadsPaused) {
                  try {
                    stream.pause();
                  } catch {}
                }

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

            const receivedBytes = startByte + downloadedChunksBytes;
            if (expectedBytes > 0 && receivedBytes !== expectedBytes) {
              throw new Error(
                `Incomplete download for ${path.basename(destination)}: got ${receivedBytes} of ${expectedBytes} bytes`,
              );
            }

            await fs.move(partialPath, destination, { overwrite: true });

            if (url.startsWith(MIRROR_BASE)) reportMirrorSuccess();

            return destination;
          } catch (error) {
            lastError = error as Error;

            if (axios.isCancel(error) || lastError.message === "AbortError") {
              await this.closeWriter(writer);
              await this.removePartialFile(partialPath);
              throw lastError;
            }

            if (isNonRetryableDownloadError(error)) {
              attempts = maxRetries;
            } else {
              attempts++;
            }

            this.downloadedBytes -= downloadedChunksBytes;

            await this.closeWriter(writer);

            if (attempts >= maxRetries) {
              await this.removePartialFile(partialPath);

              if (url.startsWith(MIRROR_BASE)) reportMirrorFailure();

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
        return destination;
      } catch (error) {
        if (
          isDownloadAbortError(error) ||
          this.abortController?.signal.aborted
        ) {
          throw error;
        }
        candidateError = error as Error;
      }
    }

    throw candidateError ?? new Error(`Failed to download ${originalUrl}`);
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

  private statFile = async (filePath: string): Promise<fs.Stats | null> => {
    try {
      return await fs.stat(filePath);
    } catch {
      return null;
    }
  };

  private fileExistsAndMatches = async (
    filePath: string,
    checksum: string,
    checksumType: "sha1" | "sha256",
    size: number,
  ): Promise<boolean> => {
    let actualPath = filePath;
    let stats = await this.statFile(filePath);

    if (!stats) {
      actualPath = `${filePath}.disabled`;
      stats = await this.statFile(actualPath);
    }

    if (!stats) return false;

    try {
      if (size && stats.size !== size) return false;
      if (!size && !checksum && stats.size === 0) return false;

      const skipHash =
        !this.verifyChecksums &&
        canSkipChecksumVerification(
          path.basename(actualPath),
          checksum,
          checksumType,
          size,
        );

      if (checksum && !skipHash) {
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

    fs.mkdirSync(dir, { recursive: true });

    this.directoryCreationCache.add(dir);
    void sweepStalePartFiles(dir);
  };

  private closeWriter = async (
    writer: fs.WriteStream | null,
  ): Promise<void> => {
    if (!writer || writer.closed) return;

    await new Promise<void>((resolve) => {
      writer.once("close", () => resolve());
      try {
        writer.destroy();
      } catch {
        resolve();
      }
    });
  };

  private removePartialFile = async (partialPath: string): Promise<void> => {
    if (!fs.pathExistsSync(partialPath)) return;

    try {
      await fs.remove(partialPath);
    } catch (e) {
      console.error(`Failed to remove partial file ${partialPath}:`, e);
    }
  };

  private extractZipSafe = async (
    filePath: string,
    targetPath: string,
  ): Promise<void> => {
    const { extractEntries, openArchive } = await import("./archiver");
    const zip = await openArchive(filePath);

    await fs.ensureDir(targetPath);

    await extractEntries(zip.getEntries(), (entryName) =>
      getSafeExtractPath(targetPath, entryName),
    );
  };

  private extractTarSafe = async (
    filePath: string,
    targetPath: string,
  ): Promise<void> => {
    await fs.ensureDir(targetPath);

    const tarModule = await import("tar");
    const tar = (tarModule as unknown as { default?: typeof tarModule }).default ?? tarModule;

    let unsafeEntry: string | null = null;

    await tar.x({
      file: filePath,
      cwd: targetPath,
      filter: (p: string, entry: any) => {
        if (unsafeEntry) return false;

        const type = entry?.type as string | undefined;
        const linkpath = entry?.linkpath as string | undefined;

        try {
          getSafeExtractPath(targetPath, p);

          if (type === "Link" || type === "SymbolicLink") {
            getSafeLinkExtractPath(
              targetPath,
              p,
              linkpath || "",
              type === "SymbolicLink",
            );
          }
        } catch (error) {
          unsafeEntry = (error as Error).message;
          return false;
        }

        return true;
      },
    });

    if (unsafeEntry) {
      throw new Error(unsafeEntry);
    }
  };

  private extractFile = async (
    filePath: string,
    targetPath: string,
    isDelete: boolean,
  ): Promise<void> => {
    const ext = path.extname(filePath).toLowerCase();

    try {
      assertExtractablePath(targetPath, "extract folder");
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
