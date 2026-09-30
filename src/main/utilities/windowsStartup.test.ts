import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {} }));

import {
  sameWindowsExecutable,
  selectInstalledLauncher,
} from "./windowsStartup";
import { UpdateAttempt } from "./updateLoopGuard";

const now = 1_800_000_000_000;
const unpacked = {
  exe: "C:\\Projects\\launcher\\dist\\win-unpacked\\Grubie Launcher.exe",
  version: "2.0.5",
};
const installed = {
  exe: "C:\\Users\\Player\\AppData\\Local\\Programs\\grubie-launcher\\Grubie Launcher.exe",
  version: "2.0.6.0",
};
const attempt: UpdateAttempt = {
  from: unpacked.version,
  target: "2.0.6",
  exe: unpacked.exe,
  at: now - 60_000,
};

describe("installed launcher recovery", () => {
  it("redirects the old unpacked autostart copy to the installed update", () => {
    expect(
      selectInstalledLauncher([installed], unpacked, true, attempt, now),
    ).toEqual(installed);
  });

  it("migrates a hidden start even when the installed version is equal", () => {
    expect(
      selectInstalledLauncher(
        [installed],
        { ...unpacked, version: "2.0.6" },
        true,
        null,
        now,
      ),
    ).toEqual(installed);
  });

  it("preserves a manually opened equal-version development package", () => {
    expect(
      selectInstalledLauncher(
        [installed],
        { ...unpacked, version: "2.0.6" },
        false,
        null,
        now,
      ),
    ).toBeUndefined();
  });

  it("finds the installed update for a manual launch caught in a loop", () => {
    expect(
      selectInstalledLauncher([installed], unpacked, false, attempt, now),
    ).toEqual(installed);
  });

  it("never downgrades or forwards a loop to another old copy", () => {
    expect(
      selectInstalledLauncher(
        [{ ...installed, version: "2.0.4" }],
        unpacked,
        true,
        null,
        now,
      ),
    ).toBeUndefined();
    expect(
      selectInstalledLauncher(
        [{ ...installed, version: "2.0.5" }],
        unpacked,
        true,
        attempt,
        now,
      ),
    ).toBeUndefined();
  });

  it("selects the newest valid registered copy and ignores unrelated paths", () => {
    expect(
      selectInstalledLauncher(
        [
          { ...installed, version: "2.0.10.0" },
          installed,
          { exe: "C:\\malformed\\other.exe", version: "9.0.0" },
          { ...installed, exe: "Grubie Launcher.exe", version: "9.0.0" },
          { ...installed, version: "unknown" },
        ],
        unpacked,
        true,
        null,
        now,
      )?.version,
    ).toBe("2.0.10.0");
  });

  it("does not relaunch the same file with different path casing or separators", () => {
    expect(
      sameWindowsExecutable(
        installed.exe.toUpperCase().replaceAll("\\", "/"),
        installed.exe,
      ),
    ).toBe(true);
    expect(
      selectInstalledLauncher(
        [installed],
        { ...installed, exe: installed.exe.toUpperCase() },
        true,
        attempt,
        now,
      ),
    ).toBeUndefined();
  });
});
