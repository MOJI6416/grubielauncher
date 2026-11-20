import { describe, expect, it } from "vitest";
import {
  DependencyType,
  ProjectType,
  Provider,
  type ILocalDependency,
  type ILocalProject,
} from "@/types/ModManager";
import { bisectCandidates, fileDependencies } from "./bisectInputs";
import {
  answerSession,
  canUndo,
  compareModVersions,
  conflictExtras,
  draftBisectSession,
  pickKeeper,
  sessionStep,
  undoSession,
} from "./bisectSession";

function mod(
  id: string,
  file: string,
  dependencies: ILocalDependency[] = [],
  provider = Provider.MODRINTH,
): ILocalProject {
  return {
    title: id.toUpperCase(),
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider,
    id,
    version: {
      id: "1",
      dependencies,
      files: [{ filename: file, size: 1, sha1: "", url: "", isServer: true }],
    },
  };
}

describe("bisect inputs", () => {
  it("lists enabled jars, names them after their mods and keeps foreign files", () => {
    const candidates = bisectCandidates(
      ["zeta.jar", "alpha.jar", "off.jar.disabled", "foreign-1.2.jar", "notes.txt"],
      [mod("alpha", "alpha.jar"), mod("zeta", "zeta.jar"), mod("off", "off.jar")],
    );
    expect(candidates.map((item) => [item.file, item.label, item.entryKey])).toEqual([
      ["alpha.jar", "ALPHA", "modrinth:alpha"],
      ["foreign-1.2.jar", "foreign-1.2", null],
      ["zeta.jar", "ZETA", "modrinth:zeta"],
    ]);
  });

  it("tells copies of one mod apart by their file", () => {
    const candidates = bisectCandidates(
      ["tacz-1.jar", "tacz-2.jar"],
      [mod("tacz", "tacz-1.jar", [], Provider.LOCAL), mod("tacz", "tacz-2.jar", [], Provider.LOCAL)],
    );
    expect(candidates.map((item) => item.label)).toEqual([
      "TACZ (tacz-1.jar)",
      "TACZ (tacz-2.jar)",
    ]);
  });

  it("links files through jar metadata and catalog dependencies", () => {
    const deps = fileDependencies(
      ["addon.jar", "api.jar", "Bundle.jar", "loose.jar", "catalog-user.jar"],
      [
        mod("api", "api.jar"),
        mod("user", "catalog-user.jar", [
          { title: "API", projectId: "api", relationType: DependencyType.REQUIRED },
        ]),
      ],
      {
        "addon.jar": { provides: ["addon"], requires: ["api", "mixinextras"] },
        "api.jar": { provides: ["api"], requires: [] },
        "bundle.jar": {
          provides: ["bundle", "mixinextras"],
          requires: [],
          embedded: ["mixinextras"],
        },
        "loose.jar": { provides: ["loose"], requires: ["missing"] },
      },
    );
    expect(deps).toEqual({
      "addon.jar": ["api.jar", "Bundle.jar"],
      "catalog-user.jar": ["api.jar"],
    });
  });
});

describe("keeping one copy", () => {
  it("compares mod versions like a player would", () => {
    expect(compareModVersions("1.1.4", "1.0.30")).toBeGreaterThan(0);
    expect(compareModVersions("1.20.1-2.0", "1.20.1-10.0")).toBeLessThan(0);
    expect(compareModVersions("1.0", "1.0.1")).toBeLessThan(0);
    expect(compareModVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("keeps the newest version unless the player picked one", () => {
    const files = [
      { fileName: "tacz-1.0.3.jar", title: "TaCZ", version: "1.0.3", size: 1, modifiedAt: 30 },
      { fileName: "tacz-1.1.4.jar", title: "TaCZ", version: "1.1.4", size: 1, modifiedAt: 10 },
      { fileName: "tacz-old.jar", title: "TaCZ", version: "", size: 1, modifiedAt: 99 },
    ];
    expect(pickKeeper(files)).toBe("tacz-1.1.4.jar");
    expect(conflictExtras([{ modId: "tacz", files }])).toEqual([
      "tacz-1.0.3.jar",
      "tacz-old.jar",
    ]);
    expect(
      conflictExtras([{ modId: "tacz", files }], { tacz: "tacz-1.0.3.jar" }),
    ).toEqual(["tacz-1.1.4.jar", "tacz-old.jar"]);
  });
});

describe("a session", () => {
  const base = {
    candidates: ["a.jar", "b.jar", "c.jar", "d.jar", "tacz-1.jar", "tacz-2.jar"],
    kept: ["d.jar"],
    dependencies: { "b.jar": ["a.jar"] },
    labels: {},
    now: "2026-11-20T10:00:00.000Z",
  };

  it("tries the duplicate copies first and stops when that fixes it", () => {
    let session = draftBisectSession({ ...base, extras: ["tacz-1.jar"] });
    expect(session.plan.order).not.toContain("tacz-1.jar");
    expect(sessionStep(session)).toEqual({ kind: "duplicates", extras: ["tacz-1.jar"] });
    expect(session.applied).not.toContain("tacz-1.jar");
    expect(session.applied).toContain("tacz-2.jar");

    session = answerSession(session, false);
    expect(sessionStep(session)).toEqual({
      kind: "duplicatesFound",
      extras: ["tacz-1.jar"],
    });
  });

  it("moves on to halves when the copies were not the cause and can step back", () => {
    let session = draftBisectSession({ ...base, extras: ["tacz-1.jar"] });
    session = answerSession(session, true);
    const step = sessionStep(session);
    expect(step.kind).toBe("test");
    expect(session.applied).toContain("d.jar");
    expect(session.applied).not.toContain("tacz-1.jar");
    if (step.kind === "test")
      expect(new Set(session.applied)).toEqual(new Set(["d.jar", ...step.enabled]));

    const answered = answerSession(session, false, "2026-11-20T10:05:00.000Z");
    expect(answered.answers).toHaveLength(1);
    expect(answered.answers[0].at).toBe("2026-11-20T10:05:00.000Z");
    expect(canUndo(answered)).toBe(true);

    const back = undoSession(answered);
    expect(back.answers).toHaveLength(0);
    expect(back.applied).toEqual(session.applied);
    expect(undoSession(undoSession(back)).extrasAnswer).toBeNull();
  });

  it("starts straight with halves when there are no copies", () => {
    const session = draftBisectSession({ ...base, extras: [] });
    expect(sessionStep(session).kind).toBe("test");
    expect(canUndo(session)).toBe(false);
  });
});
