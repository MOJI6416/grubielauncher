import axios from "axios";
import { describe, expect, it } from "vitest";
import {
  buildDownloadRequestHeaders,
  canSkipChecksumVerification,
  dedupeDownloadItemsBy,
  describeDownloadFailureHosts,
  isDownloadAbortError,
  isTruncatedDownload,
  isEncodedResponse,
  isNonRetryableDownloadError,
  OPTIONAL_PROJECT_DOWNLOAD_OPTIONS,
  readRangeValidator,
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

  it("only trusts content-length when the body is not re-encoded", () => {
    expect(isEncodedResponse({ "content-length": "10" })).toBe(false);
    expect(isEncodedResponse({ "content-encoding": "identity" })).toBe(false);
    expect(isEncodedResponse({ "content-encoding": "gzip" })).toBe(true);
    expect(isEncodedResponse(undefined)).toBe(false);
  });

  it("prefers the etag over last-modified as a range validator", () => {
    expect(
      readRangeValidator({
        etag: '"abc"',
        "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT",
      }),
    ).toBe('"abc"');
    expect(
      readRangeValidator({ "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT" }),
    ).toBe("Wed, 21 Oct 2015 07:28:00 GMT");
    expect(readRangeValidator({})).toBeNull();
  });

  it("drops duplicated destinations so two tasks never write the same file", () => {
    const items = [
      { url: "a", destination: "libs/a.jar" },
      { url: "b", destination: "libs/a.jar" },
      { url: "c", destination: "libs/c.jar" },
    ];

    expect(dedupeDownloadItemsBy(items, (destination) => destination)).toEqual([
      { url: "a", destination: "libs/a.jar" },
      { url: "c", destination: "libs/c.jar" },
    ]);
  });

  it("asks for identity so Content-Length describes the bytes we write", () => {
    expect(buildDownloadRequestHeaders(0, null)).toEqual({
      "Accept-Encoding": "identity",
    });
  });

  it("still resumes, and only sends If-Range when it has a validator", () => {
    expect(buildDownloadRequestHeaders(1024, 'W/"abc"')).toEqual({
      Range: "bytes=1024-",
      "If-Range": 'W/"abc"',
    });
    expect(buildDownloadRequestHeaders(1024, null)).toEqual({
      Range: "bytes=1024-",
    });
  });

  it("never asks for identity while resuming, so a cache cannot slice a compressed body into the gap", () => {
    expect(buildDownloadRequestHeaders(1, null)["Accept-Encoding"]).toBe(
      undefined,
    );
    expect(buildDownloadRequestHeaders(1, 'W/"abc"')["Accept-Encoding"]).toBe(
      undefined,
    );
  });

  it("calls a download truncated only when bytes are missing, never when there are extra", () => {
    expect(isTruncatedDownload(1401, 1402)).toBe(true);
    expect(isTruncatedDownload(1402, 1402)).toBe(false);
    expect(isTruncatedDownload(2778, 1402)).toBe(false);
    expect(isTruncatedDownload(0, 0)).toBe(false);
  });

  it("names the hosts behind a batch of failures, each one once", () => {
    expect(
      describeDownloadFailureHosts([
        "https://meta.fabricmc.net/v2/versions/loader/26.2/0.19.3/profile/json",
        "https://meta.fabricmc.net/v2/versions/loader/26.2/0.19.2/profile/json",
        "https://cdn.modrinth.com/data/x/y.jar",
      ]),
    ).toBe("https://meta.fabricmc.net, https://cdn.modrinth.com");
  });

  it("drops the path and the query, so a signed url cannot ride along", () => {
    expect(
      describeDownloadFailureHosts([
        "https://files.example.com/pack.zip?X-Amz-Signature=deadbeef&token=secret",
      ]),
    ).toBe("https://files.example.com");
  });

  it("says nothing rather than something wrong when there is no url to read", () => {
    expect(describeDownloadFailureHosts([])).toBe("");
    expect(describeDownloadFailureHosts(["fabric.json", ""])).toBe("");
  });
});
