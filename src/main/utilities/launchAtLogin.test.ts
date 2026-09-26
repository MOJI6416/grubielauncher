import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => process.env.TEMP || "/tmp"),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn(),
  },
}));

import {
  HIDDEN_START_FLAG,
  getLaunchAtLogin,
  linuxAutostartEntry,
  setLaunchAtLogin,
} from "./launchAtLogin";

describe("linuxAutostartEntry", () => {
  it("starts the AppImage hidden in the tray", () => {
    const entry = linuxAutostartEntry("/home/steve/Apps/Grubie Launcher.AppImage");

    expect(entry).toContain("[Desktop Entry]");
    expect(entry).toContain(
      `Exec="/home/steve/Apps/Grubie Launcher.AppImage" ${HIDDEN_START_FLAG}`,
    );
    expect(entry.endsWith("\n")).toBe(true);
  });

  it("escapes quotes in the path", () => {
    expect(linuxAutostartEntry('/opt/a"b/app')).toContain('Exec="/opt/a\\"b/app"');
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
