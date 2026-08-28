import { describe, expect, it } from "vitest";
import type { IVersion } from "@/types/IVersion";
import {
  countVersionKinds,
  filterVersionEntries,
  formatReleaseDate,
  pickDefaultVersion,
  toVersionEntries,
  versionAgeYears,
  versionKind,
} from "./versionCatalog";

function version(id: string, type: string, releaseTime?: string): IVersion {
  return {
    id,
    type,
    url: `https://example.invalid/${id}.json`,
    serverManager: true,
    ...(releaseTime ? { releaseTime } : {}),
  } as IVersion;
}

const catalog = [
  version("1.21.4", "release", "2024-12-03T10:12:57+00:00"),
  version("24w44a", "snapshot", "2024-10-30T13:22:07+00:00"),
  version("1.21.3", "release", "2024-10-23T12:28:15+00:00"),
  version("b1.7.3", "old_beta", "2011-07-08T10:00:00+00:00"),
];

describe("versionKind", () => {
  it("maps manifest types to three buckets", () => {
    expect(versionKind("release")).toBe("release");
    expect(versionKind("snapshot")).toBe("snapshot");
    expect(versionKind("old_beta")).toBe("old");
    expect(versionKind("old_alpha")).toBe("old");
    expect(versionKind(undefined)).toBe("release");
  });
});

describe("toVersionEntries", () => {
  it("keeps the release date the manifest carries", () => {
    const entries = toVersionEntries(catalog);

    expect(entries[0].releaseTime).toBe("2024-12-03T10:12:57+00:00");
    expect(entries[0].kind).toBe("release");
  });

  it("tolerates versions saved without a release date", () => {
    const entries = toVersionEntries([version("1.16.5", "release")]);

    expect(entries[0].releaseTime).toBeNull();
  });
});

describe("filterVersionEntries", () => {
  const entries = toVersionEntries(catalog);

  it("hides kinds that are switched off", () => {
    const result = filterVersionEntries(entries, {
      query: "",
      kinds: ["release"],
    });

    expect(result.map((entry) => entry.id)).toEqual(["1.21.4", "1.21.3"]);
  });

  it("searches by version id", () => {
    const result = filterVersionEntries(entries, {
      query: "21.3",
      kinds: ["release", "snapshot", "old"],
    });

    expect(result.map((entry) => entry.id)).toEqual(["1.21.3"]);
  });

  it("ignores case and surrounding spaces in the query", () => {
    const result = filterVersionEntries(entries, {
      query: "  24W44  ",
      kinds: ["release", "snapshot", "old"],
    });

    expect(result.map((entry) => entry.id)).toEqual(["24w44a"]);
  });
});

describe("countVersionKinds", () => {
  it("counts every bucket", () => {
    expect(countVersionKinds(toVersionEntries(catalog))).toEqual({
      release: 2,
      snapshot: 1,
      old: 1,
    });
  });
});

describe("pickDefaultVersion", () => {
  const entries = toVersionEntries(catalog);

  it("prefers the newest release over a newer snapshot", () => {
    expect(pickDefaultVersion(entries)?.id).toBe("1.21.4");
  });

  it("keeps the requested version when it is still in the list", () => {
    expect(pickDefaultVersion(entries, "24w44a")?.id).toBe("24w44a");
  });

  it("falls back to the first entry when there is no release", () => {
    const snapshots = toVersionEntries([version("24w44a", "snapshot")]);

    expect(pickDefaultVersion(snapshots, "1.21.4")?.id).toBe("24w44a");
  });

  it("returns nothing for an empty catalog", () => {
    expect(pickDefaultVersion([], "1.21.4")).toBeUndefined();
  });
});

describe("formatReleaseDate", () => {
  it("returns an empty string when there is no usable date", () => {
    expect(formatReleaseDate(null, "en")).toBe("");
    expect(formatReleaseDate("not a date", "en")).toBe("");
  });

  it("formats a real date", () => {
    expect(formatReleaseDate("2024-12-03T10:12:57+00:00", "en")).toContain(
      "2024",
    );
  });
});

describe("versionAgeYears", () => {
  it("measures how old a version is", () => {
    const now = Date.parse("2024-12-03T10:12:57+00:00");

    expect(versionAgeYears("2024-12-03T10:12:57+00:00", now)).toBe(0);
    expect(
      Math.round(versionAgeYears("2011-07-08T10:00:00+00:00", now) ?? 0),
    ).toBe(13);
    expect(versionAgeYears(null, now)).toBeNull();
  });
});
