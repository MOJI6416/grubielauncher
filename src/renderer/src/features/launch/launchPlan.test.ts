import { describe, expect, it } from "vitest";
import {
  isInstanceRunning,
  nextInstanceNumber,
  readModpackCheck,
  resolveLaunchBlock,
  shouldCheckModpack,
} from "./launchPlan";

const ready = {
  installActive: false,
  hasVersion: true,
  hasAccount: true,
  hasSettings: true,
  hasPaths: true,
};

describe("resolveLaunchBlock", () => {
  it("passes when everything is ready", () => {
    expect(resolveLaunchBlock(ready)).toBeNull();
  });

  it("blocks while an install is running", () => {
    expect(resolveLaunchBlock({ ...ready, installActive: true })).toEqual({
      kind: "busy",
      messageKey: "versions.installBusy",
    });
  });

  it("reports a missing instance before a missing account", () => {
    expect(
      resolveLaunchBlock({ ...ready, hasVersion: false, hasAccount: false }),
    ).toEqual({
      kind: "error",
      titleKey: "app.startupNoVersion",
      hintKey: "app.startupNoVersionHint",
    });
  });

  it("reports a missing account", () => {
    expect(resolveLaunchBlock({ ...ready, hasAccount: false })).toEqual({
      kind: "error",
      titleKey: "app.startupNoAccount",
      hintKey: "app.startupNoAccountHint",
    });
  });

  it("blocks a launch when the game files are missing", () => {
    expect(resolveLaunchBlock({ ...ready, isInstalled: false })).toEqual({
      kind: "error",
      titleKey: "versions.state.notInstalled",
      hintKey: "versions.repairHint",
    });
    expect(resolveLaunchBlock({ ...ready, isInstalled: true })).toBeNull();
  });

  it("reports missing paths and settings the same way", () => {
    expect(resolveLaunchBlock({ ...ready, hasPaths: false })).toEqual({
      kind: "error",
      titleKey: "app.startupNoPaths",
      hintKey: "app.startupNoPathsHint",
    });
    expect(resolveLaunchBlock({ ...ready, hasSettings: false })).toEqual({
      kind: "error",
      titleKey: "app.startupNoPaths",
      hintKey: "app.startupNoPathsHint",
    });
  });

  it("checks the install lock before anything else", () => {
    expect(
      resolveLaunchBlock({
        installActive: true,
        hasVersion: false,
        hasAccount: false,
        hasSettings: false,
        hasPaths: false,
      }),
    ).toEqual({ kind: "busy", messageKey: "versions.installBusy" });
  });
});

describe("nextInstanceNumber", () => {
  it("starts at zero when nothing runs", () => {
    expect(nextInstanceNumber([], "Fabulously Optimized")).toBe(0);
  });

  it("ignores stopped instances of the same version", () => {
    expect(
      nextInstanceNumber(
        [{ versionName: "a", instance: 3, status: "stopped" }],
        "a",
      ),
    ).toBe(0);
  });

  it("ignores other versions", () => {
    expect(
      nextInstanceNumber(
        [{ versionName: "b", instance: 5, status: "running" }],
        "a",
      ),
    ).toBe(0);
  });

  it("takes the slot after the highest running instance", () => {
    expect(
      nextInstanceNumber(
        [
          { versionName: "a", instance: 0, status: "running" },
          { versionName: "a", instance: 2, status: "running" },
          { versionName: "a", instance: 4, status: "stopped" },
        ],
        "a",
      ),
    ).toBe(3);
  });
});

describe("isInstanceRunning", () => {
  it("detects a running console for the version", () => {
    expect(
      isInstanceRunning([{ versionName: "a", status: "running" }], "a"),
    ).toBe(true);
    expect(
      isInstanceRunning([{ versionName: "a", status: "error" }], "a"),
    ).toBe(false);
    expect(
      isInstanceRunning([{ versionName: "a", status: "running" }], "b"),
    ).toBe(false);
  });
});

describe("shouldCheckModpack", () => {
  const downloaded = {
    shareCode: "037640008ceea631e15f4e20",
    downloadedVersion: true,
    isNetwork: true,
  };

  it("checks a downloaded pack while the backend answers, without the online socket", () => {
    expect(shouldCheckModpack(downloaded)).toBe(true);
  });

  it("skips the check when the backend is offline", () => {
    expect(shouldCheckModpack({ ...downloaded, isNetwork: false })).toBe(false);
  });

  it("skips the check after the player chose to run without updating", () => {
    expect(shouldCheckModpack({ ...downloaded, skipUpdate: true })).toBe(false);
  });

  it("skips own and unshared instances", () => {
    expect(shouldCheckModpack({ ...downloaded, downloadedVersion: false })).toBe(
      false,
    );
    expect(shouldCheckModpack({ ...downloaded, shareCode: undefined })).toBe(
      false,
    );
  });
});

describe("readModpackCheck", () => {
  it("compares when the server returned the pack", () => {
    expect(readModpackCheck({ status: "success", data: { build: 16 } })).toBe(
      "compare",
    );
  });

  it("forgets the share code when the pack is gone", () => {
    expect(readModpackCheck({ status: "not_found", data: null })).toBe(
      "unpublished",
    );
  });

  it("asks the player when the request failed", () => {
    expect(readModpackCheck({ status: "error", data: null })).toBe("failed");
  });

  it("asks the player when the answer is empty", () => {
    expect(readModpackCheck({ status: "success", data: null })).toBe("failed");
    expect(readModpackCheck(undefined)).toBe("failed");
  });
});
