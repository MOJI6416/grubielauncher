import { describe, expect, it } from "vitest";
import {
  isInstanceRunning,
  nextInstanceNumber,
  resolveLaunchBlock,
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
