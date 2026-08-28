import { describe, expect, it } from "vitest";
import {
  DiffProject,
  diffModpackProjects,
  diffTotals,
  isEmptyDiff,
  projectKey,
} from "./modpackDiff";

function project(
  id: string,
  title: string,
  version: string | null,
  options: { provider?: string; filename?: string } = {},
): DiffProject {
  return {
    id,
    title,
    provider: options.provider ?? "modrinth",
    projectType: "mod",
    version: version
      ? {
          id: version,
          files: options.filename ? [{ filename: options.filename }] : [],
        }
      : null,
  };
}

describe("projectKey", () => {
  it("combines provider and id so ids never collide across providers", () => {
    expect(projectKey(project("1", "A", "v1"))).toBe("modrinth:1");
    expect(projectKey(project("1", "A", "v1", { provider: "curseforge" }))).toBe(
      "curseforge:1",
    );
  });
});

describe("diffModpackProjects", () => {
  it("splits projects into added, removed, updated and unchanged", () => {
    const current = [
      project("keep", "Keep", "v1"),
      project("bump", "Bump", "v1"),
      project("gone", "Gone", "v3"),
    ];
    const next = [
      project("keep", "Keep", "v1"),
      project("bump", "Bump", "v2"),
      project("fresh", "Fresh", "v9"),
    ];

    const diff = diffModpackProjects(current, next);

    expect(diff.unchanged).toBe(1);
    expect(diff.added.map((entry) => entry.title)).toEqual(["Fresh"]);
    expect(diff.removed.map((entry) => entry.title)).toEqual(["Gone"]);
    expect(diff.updated).toEqual([
      {
        key: "modrinth:bump",
        title: "Bump",
        projectType: "mod",
        fromVersion: "v1",
        toVersion: "v2",
      },
    ]);
    expect(diffTotals(diff)).toBe(3);
  });

  it("prefers the file name over the version id as a label", () => {
    const diff = diffModpackProjects(
      [project("a", "A", "abc", { filename: "mod-1.0.jar" })],
      [project("a", "A", "def", { filename: "mod-2.0.jar" })],
    );

    expect(diff.updated[0]).toMatchObject({
      fromVersion: "mod-1.0.jar",
      toVersion: "mod-2.0.jar",
    });
  });

  it("treats the same project from a different provider as add plus remove", () => {
    const diff = diffModpackProjects(
      [project("1", "Sodium", "v1")],
      [project("1", "Sodium", "v1", { provider: "curseforge" })],
    );

    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(diff.updated).toHaveLength(0);
    expect(diff.unchanged).toBe(0);
  });

  it("handles projects without a version", () => {
    const diff = diffModpackProjects(
      [project("a", "A", null)],
      [project("a", "A", "v1")],
    );

    expect(diff.updated[0]).toMatchObject({ fromVersion: "", toVersion: "v1" });
  });

  it("reports an empty diff when both sides match", () => {
    const list = [project("a", "A", "v1"), project("b", "B", "v2")];
    const diff = diffModpackProjects(list, [...list]);

    expect(isEmptyDiff(diff)).toBe(true);
    expect(diff.unchanged).toBe(2);
  });

  it("sorts each bucket by title", () => {
    const diff = diffModpackProjects(
      [],
      [project("z", "Zebra", "v1"), project("a", "Apple", "v1")],
    );

    expect(diff.added.map((entry) => entry.title)).toEqual(["Apple", "Zebra"]);
  });
});
