import axios from "axios";

export type DownloadFilesOptions = {
  throwOnFailure?: boolean;
  verifyChecksums?: boolean;
};

export const OPTIONAL_PROJECT_DOWNLOAD_OPTIONS: DownloadFilesOptions = {
  throwOnFailure: false,
};

export function shouldThrowDownloadFailures(
  options: DownloadFilesOptions = {},
) {
  return options.throwOnFailure ?? true;
}

export function isDownloadAbortError(error: unknown) {
  if (axios.isCancel(error)) return true;
  if (!(error instanceof Error)) return false;

  return error.name === "AbortError" || error.message === "AbortError";
}

export function shouldReportDownloadFailures(
  failuresCount: number,
  wasCancelled: boolean,
  signalAborted?: boolean,
) {
  return failuresCount > 0 && !wasCancelled && !signalAborted;
}

const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 410, 451]);

export function isNonRetryableDownloadError(error: unknown) {
  if (!axios.isAxiosError(error)) return false;

  const status = error.response?.status;
  return typeof status === "number" && NON_RETRYABLE_STATUS_CODES.has(status);
}

export function canSkipChecksumVerification(
  fileName: string,
  checksum: string,
  checksumType: "sha1" | "sha256",
  size: number,
) {
  if (checksumType !== "sha1" || !checksum || size <= 0) return false;

  return fileName.toLowerCase() === checksum.toLowerCase();
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") return null;

  const value = (headers as Record<string, unknown>)[name];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  return null;
}

export function isEncodedResponse(headers: unknown): boolean {
  const encoding = headerValue(headers, "content-encoding")
    ?.trim()
    .toLowerCase();

  return Boolean(encoding) && encoding !== "identity";
}

export function readRangeValidator(headers: unknown): string | null {
  const etag = headerValue(headers, "etag")?.trim();
  if (etag) return etag;

  const lastModified = headerValue(headers, "last-modified")?.trim();
  if (lastModified) return lastModified;

  return null;
}

export function dedupeDownloadItemsBy<T extends { destination?: string }>(
  items: T[],
  normalize: (destination: string) => string,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const destination = item.destination;
    if (!destination) {
      result.push(item);
      continue;
    }

    const key = normalize(destination);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}
