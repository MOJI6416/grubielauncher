import { describe, expect, it } from "vitest";
import { DownloaderFailureItem } from "@/types/Downloader";
import {
  buildFailureReport,
  countRetryable,
  groupFailures,
  isRetryableCause,
  mergeFailures,
} from "./failureGroups";

function failure(
  fileName: string,
  error: string,
  url: string,
  group = "mods",
): DownloaderFailureItem {
  return { fileName, error, url, group, destination: `/mods/${fileName}` };
}

describe("isRetryableCause", () => {
  it("separates transient causes from user-action causes", () => {
    expect(isRetryableCause("timeout")).toBe(true);
    expect(isRetryableCause("serverError")).toBe(true);
    expect(isRetryableCause("forbidden")).toBe(false);
    expect(isRetryableCause("blockedMod")).toBe(false);
    expect(isRetryableCause("diskFull")).toBe(false);
  });
});

describe("groupFailures", () => {
  it("merges failures that share a code and host", () => {
    const groups = groupFailures([
      failure("a.jar", "Request failed with status code 403", "https://mediafilez.forgecdn.net/a.jar"),
      failure("b.jar", "Request failed with status code 403", "https://mediafilez.forgecdn.net/b.jar"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].cause).toBe("forbidden");
  });

  it("keeps different causes apart", () => {
    const groups = groupFailures([
      failure("a.jar", "Request failed with status code 403", "https://mediafilez.forgecdn.net/a.jar"),
      failure("b.jar", "connect ETIMEDOUT 1.2.3.4:443", "https://cdn.modrinth.com/b.jar"),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("puts non-retryable groups first, then the biggest ones", () => {
    const groups = groupFailures([
      failure("t1.jar", "connect ETIMEDOUT 1.2.3.4:443", "https://cdn.modrinth.com/t1.jar"),
      failure("t2.jar", "connect ETIMEDOUT 1.2.3.4:443", "https://cdn.modrinth.com/t2.jar"),
      failure("t3.jar", "connect ETIMEDOUT 1.2.3.4:443", "https://cdn.modrinth.com/t3.jar"),
      failure("f1.jar", "Request failed with status code 403", "https://mediafilez.forgecdn.net/f1.jar"),
    ]);

    expect(groups[0].retryable).toBe(false);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[1].items).toHaveLength(3);
  });

  it("returns an empty list for no failures", () => {
    expect(groupFailures([])).toEqual([]);
  });
});

describe("mergeFailures", () => {
  const batch = (fileName: string): DownloaderFailureItem =>
    failure(fileName, "connect ETIMEDOUT 1.2.3.4:443", `https://cdn.modrinth.com/${fileName}`);

  it("takes the incoming batch when there is nothing yet", () => {
    const incoming = {
      totalItems: 10,
      completedItems: 9,
      failedItems: 1,
      failures: [batch("a.jar")],
    };

    expect(mergeFailures(null, incoming)).toBe(incoming);
  });

  it("sums batches of one install and keeps the version name", () => {
    const merged = mergeFailures(
      {
        totalItems: 10,
        completedItems: 9,
        failedItems: 1,
        failures: [batch("a.jar")],
        versionName: "Pack",
      },
      {
        totalItems: 5,
        completedItems: 3,
        failedItems: 2,
        failures: [batch("b.jar"), batch("c.jar")],
      },
    );

    expect(merged.totalItems).toBe(15);
    expect(merged.completedItems).toBe(12);
    expect(merged.failedItems).toBe(3);
    expect(merged.versionName).toBe("Pack");
  });

  it("does not count the same file twice", () => {
    const merged = mergeFailures(
      {
        totalItems: 10,
        completedItems: 9,
        failedItems: 1,
        failures: [batch("a.jar")],
      },
      {
        totalItems: 10,
        completedItems: 9,
        failedItems: 1,
        failures: [batch("a.jar")],
      },
    );

    expect(merged.failures).toHaveLength(1);
    expect(merged.failedItems).toBe(1);
  });
});

describe("countRetryable", () => {
  it("counts only files worth retrying", () => {
    const groups = groupFailures([
      failure("t1.jar", "connect ETIMEDOUT 1.2.3.4:443", "https://cdn.modrinth.com/t1.jar"),
      failure("t2.jar", "connect ETIMEDOUT 1.2.3.4:443", "https://cdn.modrinth.com/t2.jar"),
      failure("f1.jar", "Request failed with status code 403", "https://mediafilez.forgecdn.net/f1.jar"),
    ]);

    expect(countRetryable(groups)).toBe(2);
  });
});

describe("buildFailureReport", () => {
  const failures = [
    failure("a.jar", "Request failed with status code 403", "https://mediafilez.forgecdn.net/a.jar"),
    failure("b.jar", "Request failed with status code 403", "https://mediafilez.forgecdn.net/b.jar"),
  ];

  it("includes the version, the counters and every group", () => {
    const report = buildFailureReport(
      {
        versionName: "mojisq modded1",
        totalItems: 340,
        completedItems: 338,
        failedItems: 2,
        failures,
      },
      groupFailures(failures),
    );

    expect(report).toContain("version: mojisq modded1");
    expect(report).toContain("files: 338/340, failed: 2");
    expect(report).toContain("x2");
    expect(report).toContain("mods/a.jar");
    expect(report).toContain("mods/b.jar");
  });

  it("truncates very long groups", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      failure(`m${index}.jar`, "connect ETIMEDOUT 1.2.3.4:443", `https://cdn.modrinth.com/m${index}.jar`),
    );

    const report = buildFailureReport(
      { totalItems: 20, completedItems: 0, failedItems: 20, failures: many },
      groupFailures(many),
    );

    expect(report).toContain("… +8");
  });
});
