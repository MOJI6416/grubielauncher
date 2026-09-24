import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";
import {
  UPDATE_LOOP_WINDOW_MS,
  UpdateAttempt,
  clearUpdateAttempt,
  isUpdateLoop,
  isVersionBelow,
  readUpdateAttempt,
  writeUpdateAttempt,
} from "./updateLoopGuard";

const now = 1_800_000_000_000;

function attempt(overrides: Partial<UpdateAttempt> = {}): UpdateAttempt {
  return {
    target: "2.0.4",
    from: "2.0.3",
    exe: "C:/Projects/launcher/dist/win-unpacked/Grubie Launcher.exe",
    at: now - 60_000,
    ...overrides,
  };
}

describe("isVersionBelow", () => {
  it("compares release numbers", () => {
    expect(isVersionBelow("2.0.3", "2.0.4")).toBe(true);
    expect(isVersionBelow("2.0.10", "2.0.9")).toBe(false);
    expect(isVersionBelow("2.0.4", "2.0.4")).toBe(false);
    expect(isVersionBelow("1.9", "2.0.0")).toBe(true);
  });
});

describe("isUpdateLoop", () => {
  it("catches the same old copy starting again right after installing", () => {
    expect(
      isUpdateLoop(attempt(), { version: "2.0.3", exe: "anything" }, now),
    ).toBe(true);
  });

  it("is not a loop once the new version is running", () => {
    expect(
      isUpdateLoop(attempt(), { version: "2.0.4", exe: "anything" }, now),
    ).toBe(false);
  });

  it("forgets an old attempt", () => {
    expect(
      isUpdateLoop(
        attempt({ at: now - UPDATE_LOOP_WINDOW_MS - 1 }),
        { version: "2.0.3", exe: "anything" },
        now,
      ),
    ).toBe(false);
  });

  it("ignores an attempt made from another version", () => {
    expect(
      isUpdateLoop(
        attempt({ from: "2.0.2" }),
        { version: "2.0.3", exe: "anything" },
        now,
      ),
    ).toBe(false);
    expect(isUpdateLoop(null, { version: "2.0.3", exe: "x" }, now)).toBe(false);
  });
});

describe("update attempt file", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "gl-update-attempt-"));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it("round-trips and clears", async () => {
    expect(await readUpdateAttempt(dir)).toBeNull();

    await writeUpdateAttempt(dir, attempt());
    expect(await readUpdateAttempt(dir)).toEqual(attempt());

    await clearUpdateAttempt(dir);
    expect(await readUpdateAttempt(dir)).toBeNull();
  });

  it("ignores a damaged file", async () => {
    await fs.writeFile(path.join(dir, "update-attempt.json"), "{ nope");
    expect(await readUpdateAttempt(dir)).toBeNull();
  });
});
