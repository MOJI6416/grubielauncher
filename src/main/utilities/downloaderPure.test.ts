import axios from "axios";
import { describe, expect, it } from "vitest";
import {
  canSkipChecksumVerification,
  isDownloadAbortError,
  isNonRetryableDownloadError,
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

  it("does not retry responses that will never succeed", () => {
    const withStatus = (status: number) =>
      new axios.AxiosError(
        "failed",
        undefined,
        undefined,
        undefined,
        { status } as never,
      );

    expect(isNonRetryableDownloadError(withStatus(404))).toBe(true);
    expect(isNonRetryableDownloadError(withStatus(403))).toBe(true);
    expect(isNonRetryableDownloadError(withStatus(500))).toBe(false);
    expect(isNonRetryableDownloadError(withStatus(429))).toBe(false);
    expect(isNonRetryableDownloadError(new Error("socket hang up"))).toBe(false);
  });

  it("skips hashing assets whose file name already is the sha1", () => {
    const sha1 = "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567";

    expect(canSkipChecksumVerification(sha1, sha1, "sha1", 128)).toBe(true);
    expect(canSkipChecksumVerification(sha1.toUpperCase(), sha1, "sha1", 128)).toBe(
      true,
    );
    expect(canSkipChecksumVerification("client.jar", sha1, "sha1", 128)).toBe(
      false,
    );
    expect(canSkipChecksumVerification(sha1, sha1, "sha256", 128)).toBe(false);
    expect(canSkipChecksumVerification(sha1, sha1, "sha1", 0)).toBe(false);
  });
});
