import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import {
  beginBisect,
  bisectSessionPath,
  finishBisect,
  isJarName,
  listBisectSessions,
  parseBisectSession,
  planRenames,
  readBisectSession,
  restoreTargets,
  saveBisect,
  snapshotFromNames,
} from "./modBisect";
import { MOD_BISECT_VERSION, type ModBisectSession } from "@/types/ModBisect";

let root = "";

async function folderState(): Promise<string[]> {
  return (await fs.readdir(path.join(root, "mods"))).sort();
}

function draft(overrides: Partial<ModBisectSession> = {}): ModBisectSession {
  return {
    version: MOD_BISECT_VERSION,
    startedAt: "",
    snapshot: { enabled: [], disabled: [] },
    plan: {
      order: ["a.jar", "b.jar", "c.jar"],
      kept: ["keep.jar"],
      dependencies: { "b.jar": ["a.jar"] },
    },
    extras: [],
    extrasAnswer: null,
    answers: [],
    labels: { "a.jar": "Alpha" },
    applied: ["keep.jar", "a.jar", "b.jar"],
    ...overrides,
  };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-bisect-"));
  await fs.ensureDir(path.join(root, "mods"));
  for (const name of [
    "a.jar",
    "b.jar",
    "c.jar",
    "keep.jar",
    "off.jar.disabled",
    "notes.txt",
  ])
    await fs.writeFile(path.join(root, "mods", name), name);
});

afterEach(async () => {
  await fs.remove(root);
});

describe("snapshot and renames", () => {
  it("splits enabled and disabled jars and ignores other files", () => {
    expect(
      snapshotFromNames([
        "b.jar",
        "a.jar",
        "x.jar.disabled",
        "readme.txt",
        "a.jar.disabled",
      ]),
    ).toEqual({ enabled: ["a.jar", "b.jar"], disabled: ["x.jar"] });
  });

  it("renames only files whose state differs and skips ambiguous pairs", () => {
    const renames = planRenames(
      ["a.jar", "b.jar.disabled", "c.jar", "c.jar.disabled"],
      new Map([
        ["a.jar", false],
        ["b.jar", true],
        ["c.jar", false],
        ["missing.jar", true],
      ]),
    );
    expect(renames).toEqual([
      { from: "a.jar", to: "a.jar.disabled", file: "a.jar" },
      { from: "b.jar.disabled", to: "b.jar", file: "b.jar" },
    ]);
  });

  it("restores originally disabled files as disabled", () => {
    const targets = restoreTargets(
      { enabled: ["a.jar", "b.jar"], disabled: ["x.jar"] },
      ["b.jar"],
    );
    expect([...targets]).toEqual([
      ["a.jar", true],
      ["b.jar", false],
      ["x.jar", false],
    ]);
  });

  it("refuses names that could leave the mods folder", () => {
    expect(isJarName("good.jar")).toBe(true);
    expect(isJarName("../evil.jar")).toBe(false);
    expect(isJarName("sub/evil.jar")).toBe(false);
    expect(isJarName("C:evil.jar")).toBe(false);
    expect(isJarName("readme.txt")).toBe(false);
  });
});

describe("a bisect session", () => {
  it("snapshots the folder, applies a step and survives a restart", async () => {
    const begun = await beginBisect(root, draft(), false);
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    expect(begun.session.snapshot).toEqual({
      enabled: ["a.jar", "b.jar", "c.jar", "keep.jar"],
      disabled: ["off.jar"],
    });
    expect(await folderState()).toEqual([
      "a.jar",
      "b.jar",
      "c.jar.disabled",
      "keep.jar",
      "notes.txt",
      "off.jar.disabled",
    ]);

    const restarted = await readBisectSession(root);
    expect(restarted?.applied).toEqual(["keep.jar", "a.jar", "b.jar"]);
    expect(restarted?.labels).toEqual({ "a.jar": "Alpha" });
    expect(await listBisectSessions([root, path.join(root, "nope")])).toEqual([
      root,
    ]);

    const saved = await saveBisect(
      root,
      {
        ...restarted!,
        snapshot: { enabled: ["a.jar"], disabled: [] },
        answers: [
          { enabled: ["a.jar", "b.jar"], problem: false, at: "2026-11-20" },
        ],
        applied: ["keep.jar", "c.jar"],
      },
      false,
    );
    expect(saved).toEqual({ ok: true, failed: [] });
    expect(await folderState()).toEqual([
      "a.jar.disabled",
      "b.jar.disabled",
      "c.jar",
      "keep.jar",
      "notes.txt",
      "off.jar.disabled",
    ]);
    expect((await readBisectSession(root))?.snapshot.enabled).toEqual([
      "a.jar",
      "b.jar",
      "c.jar",
      "keep.jar",
    ]);

    expect(await finishBisect(root, [], false)).toEqual({ ok: true, failed: [] });
    expect(await folderState()).toEqual([
      "a.jar",
      "b.jar",
      "c.jar",
      "keep.jar",
      "notes.txt",
      "off.jar.disabled",
    ]);
    expect(await fs.pathExists(bisectSessionPath(root))).toBe(false);
  });

  it("can leave the culprit disabled when it finishes", async () => {
    await beginBisect(root, draft(), false);
    await finishBisect(root, ["c.jar", "../keep.jar", "unknown.jar"], false);
    expect(await folderState()).toEqual([
      "a.jar",
      "b.jar",
      "c.jar.disabled",
      "keep.jar",
      "notes.txt",
      "off.jar.disabled",
    ]);
  });

  it("puts back a file the player switched on during the session", async () => {
    await beginBisect(root, draft(), false);
    await fs.rename(
      path.join(root, "mods", "off.jar.disabled"),
      path.join(root, "mods", "off.jar"),
    );
    await finishBisect(root, [], false);
    expect(await folderState()).toContain("off.jar.disabled");
  });

  it("does nothing while the game is running", async () => {
    expect(await beginBisect(root, draft(), true)).toEqual({
      ok: false,
      reason: "running",
    });
    await beginBisect(root, draft(), false);
    const before = await folderState();
    expect(await saveBisect(root, draft({ applied: [] }), true)).toEqual({
      ok: false,
      reason: "running",
    });
    expect(await finishBisect(root, [], true)).toEqual({
      ok: false,
      reason: "running",
    });
    expect(await folderState()).toEqual(before);
    expect(await readBisectSession(root)).not.toBeNull();
  });

  it("refuses a second session and a plan with files that are not there", async () => {
    expect(
      await beginBisect(
        root,
        draft({ plan: { order: ["ghost.jar"], kept: [], dependencies: {} } }),
        false,
      ),
    ).toEqual({ ok: false, reason: "changed" });
    expect((await beginBisect(root, draft(), false)).ok).toBe(true);
    expect(await beginBisect(root, draft(), false)).toEqual({
      ok: false,
      reason: "exists",
    });
  });

  it("keeps the session when a file cannot be renamed back", async () => {
    await beginBisect(root, draft(), false);
    const rename = fs.rename.bind(fs);
    const spy = vi
      .spyOn(fs, "rename")
      .mockImplementation(((from: string, to: string) =>
        path.basename(from) === "c.jar.disabled"
          ? Promise.reject(new Error("EBUSY"))
          : rename(from, to)) as typeof fs.rename);
    try {
      expect(await finishBisect(root, [], false)).toEqual({
        ok: true,
        failed: ["c.jar"],
      });
      expect(await readBisectSession(root)).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
    expect(await finishBisect(root, [], false)).toEqual({ ok: true, failed: [] });
    expect(await folderState()).toContain("c.jar");
  });

  it("drops a damaged session file instead of trusting it", () => {
    expect(parseBisectSession({ version: 99 })).toBeNull();
    expect(
      parseBisectSession({
        ...draft(),
        plan: { order: ["../x.jar"], kept: [], dependencies: {} },
      }),
    ).toBeNull();
  });
});
