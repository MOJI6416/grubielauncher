import axios from "axios";
import { describe, expect, it } from "vitest";
import {
  isDownloadAbortError,
  OPTIONAL_PROJECT_DOWNLOAD_OPTIONS,
  shouldReportDownloadFailures,
  shouldThrowDownloadFailures,
} from "./downloaderPure";

describe("downloader pure helpers", () => {
  it("detects AbortError by message, name, and axios cancellation", () => {
    const abortByMessage = new Error("AbortError");
    const abortByName = new Error("cancelled");
    abortByName.name = "AbortError";
    const axiosCancel = new axios.CanceledError("cancelled");

    expect(isDownloadAbortError(abortByMessage)).toBe(true);
    expect(isDownloadAbortError(abortByName)).toBe(true);
    expect(isDownloadAbortError(axiosCancel)).toBe(true);
    expect(isDownloadAbortError(new Error("Network error"))).toBe(false);
  });

  it("does not report download failures when the operation was cancelled", () => {
    expect(shouldReportDownloadFailures(1, false, false)).toBe(true);
    expect(shouldReportDownloadFailures(1, true, false)).toBe(false);
    expect(shouldReportDownloadFailures(1, false, true)).toBe(false);
    expect(shouldReportDownloadFailures(0, false, false)).toBe(false);
  });

  it("throws on download failures by default but allows best-effort downloads", () => {
    expect(shouldThrowDownloadFailures()).toBe(true);
    expect(shouldThrowDownloadFailures({ throwOnFailure: true })).toBe(true);
    expect(shouldThrowDownloadFailures({ throwOnFailure: false })).toBe(false);
  });

  it("keeps optional project downloads best-effort", () => {
    expect(OPTIONAL_PROJECT_DOWNLOAD_OPTIONS.throwOnFailure).toBe(false);
  });
});
