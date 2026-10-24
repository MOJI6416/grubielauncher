import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "" },
  nativeImage: {},
  shell: {},
}));

import { macShortcutPlist, pngToIcns } from "./shortcut";

describe("pngToIcns", () => {
  it("wraps the PNG as a single 256px icon", () => {
    const png = Buffer.from("\x89PNG fake body");
    const icns = pngToIcns(png);

    expect(icns.toString("ascii", 0, 4)).toBe("icns");
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    expect(icns.toString("ascii", 8, 12)).toBe("ic08");
    expect(icns.readUInt32BE(12)).toBe(png.length + 8);
    expect(icns.subarray(16).equals(png)).toBe(true);
  });
});

describe("macShortcutPlist", () => {
  it("escapes the instance name and points at the launch script", () => {
    const plist = macShortcutPlist(
      'Tom & "Jerry" <1.20>',
      "com.grubielauncher.shortcut.abc",
      true,
    );

    expect(plist).toContain(
      "<key>CFBundleName</key><string>Tom &amp; &quot;Jerry&quot; &lt;1.20&gt;</string>",
    );
    expect(plist).toContain("<key>CFBundleExecutable</key><string>launch</string>");
    expect(plist).toContain("<key>CFBundleIconFile</key><string>icon</string>");
    expect(plist).toContain("<key>LSUIElement</key><true/>");
  });

  it("leaves out the icon when there is none", () => {
    expect(macShortcutPlist("Vanilla", "id", false)).not.toContain("CFBundleIconFile");
  });
});
