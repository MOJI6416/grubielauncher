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
