import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";

vi.mock("fs-extra", () => ({
  default: {
    outputFile: vi.fn(),
    outputFileSync: vi.fn(),
    pathExistsSync: vi.fn(),
    readFile: vi.fn(),
    readFileSync: vi.fn(),
    removeSync: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => process.env.TEMP || "/tmp"),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn(),
  },
}));

import { app } from "electron";
import {
  HIDDEN_START_FLAG,
  HIDDEN_RELAUNCH_TTL_MS,
  consumeHiddenStart,
  getLaunchAtLogin,
  linuxAutostartEntry,
  refreshLaunchAtLogin,
  setLaunchAtLogin,
} from "./launchAtLogin";

beforeEach(() => vi.clearAllMocks());

describe("linuxAutostartEntry", () => {
  it("starts the AppImage hidden in the tray", () => {
    const entry = linuxAutostartEntry(
      "/home/steve/Apps/Grubie Launcher.AppImage",
    );

    expect(entry).toContain("[Desktop Entry]");
    expect(entry).toContain(
      `Exec="/home/steve/Apps/Grubie Launcher.AppImage" ${HIDDEN_START_FLAG}`,
    );
    expect(entry.endsWith("\n")).toBe(true);
  });

  it("escapes quotes in the path", () => {
    expect(linuxAutostartEntry('/opt/a"b/app')).toContain(
      'Exec="/opt/a\\"b/app"',
    );
  });
});

describe("launch at login in a development build", () => {
  it("reports it as unavailable and changes nothing", async () => {
    await expect(getLaunchAtLogin()).resolves.toEqual({
      supported: false,
      enabled: false,
    });
    await expect(setLaunchAtLogin(true)).resolves.toEqual({
      supported: false,
      enabled: false,
    });
  });
});

describe("refreshLaunchAtLogin on Linux", () => {
  const platform = process.platform;
  const appImage = process.env["APPIMAGE"];

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(app, "isPackaged", {
      value: true,
      configurable: true,
    });
    process.env["APPIMAGE"] = "/home/steve/Apps/grubie-launcher-2.0.8.AppImage";
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: platform });
    Object.defineProperty(app, "isPackaged", {
      value: false,
      configurable: true,
    });
    if (appImage === undefined) delete process.env["APPIMAGE"];
    else process.env["APPIMAGE"] = appImage;
  });

  it("points an enabled entry at the renamed AppImage", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      linuxAutostartEntry(
        "/home/steve/Apps/grubie-launcher-2.0.7.AppImage",
      ) as never,
    );
    await refreshLaunchAtLogin();
    expect(fs.outputFile).toHaveBeenCalledWith(
      expect.stringContaining("grubie-launcher.desktop"),
      linuxAutostartEntry("/home/steve/Apps/grubie-launcher-2.0.8.AppImage"),
    );
  });

  it("leaves a current entry alone and never enables autostart", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      linuxAutostartEntry(
        "/home/steve/Apps/grubie-launcher-2.0.8.AppImage",
      ) as never,
    );
    await refreshLaunchAtLogin();
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT") as never);
    await refreshLaunchAtLogin();
    expect(fs.outputFile).not.toHaveBeenCalled();
  });
});

describe("hidden update relaunch", () => {
  it("consumes a recent marker once", () => {
    vi.mocked(fs.pathExistsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(String(Date.now()));
    expect(consumeHiddenStart([])).toBe(true);
    expect(fs.removeSync).toHaveBeenCalledOnce();
    vi.mocked(fs.pathExistsSync).mockReturnValue(false);
    expect(consumeHiddenStart([])).toBe(false);
  });

  it("clears stale, damaged and future markers without hiding a manual launch", () => {
    vi.mocked(fs.pathExistsSync).mockReturnValue(true);
    for (const value of [
      String(Date.now() - HIDDEN_RELAUNCH_TTL_MS - 1000),
      "broken",
      String(Date.now() + 60_000),
    ]) {
      vi.mocked(fs.readFileSync).mockReturnValue(value);
      expect(consumeHiddenStart([])).toBe(false);
    }
    expect(fs.removeSync).toHaveBeenCalledTimes(3);
  });

  it("keeps explicit autostart hidden even when an old update marker expired", () => {
    vi.mocked(fs.pathExistsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("0");
    expect(consumeHiddenStart([HIDDEN_START_FLAG])).toBe(true);
  });
});
