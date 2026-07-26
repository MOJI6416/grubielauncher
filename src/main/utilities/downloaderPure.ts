import axios from "axios";

export type DownloadFilesOptions = {
  throwOnFailure?: boolean;
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
